import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple FTP client implementation for Deno
class SimpleFTPClient {
  private conn: Deno.TcpConn | null = null;
  private host: string;
  private port: number;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  private async readResponse(): Promise<string> {
    if (!this.conn) throw new Error("Not connected");
    const buffer = new Uint8Array(4096);
    const bytesRead = await this.conn.read(buffer);
    if (!bytesRead) return "";
    return new TextDecoder().decode(buffer.subarray(0, bytesRead)).trim();
  }

  private async sendCommand(cmd: string): Promise<string> {
    if (!this.conn) throw new Error("Not connected");
    await this.conn.write(new TextEncoder().encode(cmd + "\r\n"));
    return await this.readResponse();
  }

  async connect(): Promise<string> {
    this.conn = await Deno.connect({
      hostname: this.host,
      port: this.port,
    });
    return await this.readResponse();
  }

  async login(username: string, password: string): Promise<boolean> {
    const userResponse = await this.sendCommand(`USER ${username}`);
    if (!userResponse.startsWith("331")) {
      throw new Error(`USER failed: ${userResponse}`);
    }
    const passResponse = await this.sendCommand(`PASS ${password}`);
    if (!passResponse.startsWith("230")) {
      throw new Error(`PASS failed: ${passResponse}`);
    }
    return true;
  }

  async setBinaryMode(): Promise<void> {
    const response = await this.sendCommand("TYPE I");
    if (!response.startsWith("200")) {
      throw new Error(`TYPE I failed: ${response}`);
    }
  }

  async setPassiveMode(): Promise<{ host: string; port: number }> {
    // Try EPSV first (Extended Passive Mode)
    let response = await this.sendCommand("EPSV");
    if (response.startsWith("229")) {
      const match = response.match(/\(\|\|\|(\d+)\|\)/);
      if (match) {
        console.log(`FTP: Using EPSV mode, port ${match[1]}`);
        return { host: this.host, port: parseInt(match[1]) };
      }
    }
    
    // Fallback to PASV
    response = await this.sendCommand("PASV");
    if (!response.startsWith("227")) {
      throw new Error(`PASV failed: ${response}`);
    }
    const match = response.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (!match) {
      throw new Error(`Invalid PASV response: ${response}`);
    }
    const port = parseInt(match[5]) * 256 + parseInt(match[6]);
    console.log(`FTP: Using PASV mode, port ${port}`);
    return { host: this.host, port };
  }

  async downloadFile(remotePath: string): Promise<Uint8Array> {
    await this.setBinaryMode();
    const passive = await this.setPassiveMode();
    
    const dataConn = await Deno.connect({
      hostname: passive.host,
      port: passive.port,
    });

    const retrResponse = await this.sendCommand(`RETR ${remotePath}`);
    if (!retrResponse.startsWith("150") && !retrResponse.startsWith("125")) {
      dataConn.close();
      throw new Error(`RETR failed: ${retrResponse}`);
    }

    // Read all data in chunks
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const buffer = new Uint8Array(65536); // 64KB buffer
    
    while (true) {
      const bytesRead = await dataConn.read(buffer);
      if (!bytesRead) break;
      chunks.push(buffer.slice(0, bytesRead));
      totalSize += bytesRead;
    }
    
    dataConn.close();

    const completeResponse = await this.readResponse();
    if (!completeResponse.startsWith("226")) {
      throw new Error(`Download failed: ${completeResponse}`);
    }

    // Combine all chunks into a single Uint8Array
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  async uploadFile(remotePath: string, data: Uint8Array): Promise<boolean> {
    await this.setBinaryMode();
    const passive = await this.setPassiveMode();
    
    const dataConn = await Deno.connect({
      hostname: passive.host,
      port: passive.port,
    });

    const storResponse = await this.sendCommand(`STOR ${remotePath}`);
    if (!storResponse.startsWith("150") && !storResponse.startsWith("125")) {
      dataConn.close();
      throw new Error(`STOR failed: ${storResponse}`);
    }

    await dataConn.write(data);
    dataConn.close();

    const completeResponse = await this.readResponse();
    if (!completeResponse.startsWith("226")) {
      throw new Error(`Transfer failed: ${completeResponse}`);
    }

    return true;
  }

  async deleteFile(remotePath: string): Promise<boolean> {
    const response = await this.sendCommand(`DELE ${remotePath}`);
    if (!response.startsWith("250")) {
      throw new Error(`DELE failed: ${response}`);
    }
    return true;
  }

  async close(): Promise<void> {
    if (this.conn) {
      try {
        await this.sendCommand("QUIT");
      } catch {
        // Ignore errors on quit
      }
      this.conn.close();
      this.conn = null;
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    
    // Verify user has operator or admin role
    await requireOperatorOrAdmin(
      authHeader,
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { 
      destinationId, 
      sourceFilePath,
      targetFilePath,
      compression = 'gzip',
      deleteOriginal = true
    } = await req.json();
    
    if (!destinationId || !sourceFilePath) {
      throw new Error("destinationId and sourceFilePath are required");
    }

    // Fetch destination details
    const { data: destination, error: destError } = await supabaseClient
      .from("ftp_destinations")
      .select("*")
      .eq("id", destinationId)
      .single();

    if (destError || !destination) {
      throw new Error("Destination not found");
    }

    const startTime = Date.now();
    let success = false;
    let message = "";
    let originalSize = 0;
    let compressedSize = 0;

    // Calculate target path
    const finalPath = targetFilePath || (
      compression === 'gzip' ? `${sourceFilePath}.gz` : 
      compression === 'zstd' ? `${sourceFilePath}.zst` : 
      sourceFilePath
    );

    const ftpClient = new SimpleFTPClient(destination.host, destination.port);
    
    try {
      console.log(`FTP: Connecting to ${destination.host}:${destination.port}...`);
      const banner = await ftpClient.connect();
      console.log(`FTP: Banner: ${banner}`);

      console.log(`FTP: Logging in as ${destination.username}...`);
      await ftpClient.login(destination.username, destination.password || "");

      // Download the file
      console.log(`FTP: Downloading ${sourceFilePath}...`);
      const fileData = await ftpClient.downloadFile(sourceFilePath);
      originalSize = fileData.length;
      console.log(`FTP: Downloaded ${originalSize} bytes`);

      // Compress the file
      let compressedData: Uint8Array;
      
      if (compression === 'gzip') {
        console.log(`Compressing with GZIP...`);
        const blob = new Blob([fileData.buffer as ArrayBuffer]);
        const stream = blob.stream();
        const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
        const compressedBlob = await new Response(compressedStream).blob();
        compressedData = new Uint8Array(await compressedBlob.arrayBuffer());
      } else {
        console.log(`No compression requested, keeping original`);
        compressedData = fileData;
      }
      
      compressedSize = compressedData.length;
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      console.log(`Compression complete: ${originalSize} -> ${compressedSize} bytes (${ratio}% reduction)`);

      // Upload compressed file
      console.log(`FTP: Uploading compressed file to ${finalPath}...`);
      await ftpClient.uploadFile(finalPath, compressedData);

      // Delete original if requested
      if (deleteOriginal && sourceFilePath !== finalPath) {
        console.log(`FTP: Deleting original file ${sourceFilePath}...`);
        try {
          await ftpClient.deleteFile(sourceFilePath);
          console.log(`FTP: Original file deleted`);
        } catch (delErr) {
          console.log(`FTP: Could not delete original file: ${delErr}`);
        }
      }

      success = true;
      message = `Arquivo compactado com sucesso: ${originalSize} -> ${compressedSize} bytes (${ratio}% redução)`;

      await ftpClient.close();
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
      message = `Falha na compactação: ${errorMessage}`;
      console.error(message);
      try { await ftpClient.close(); } catch { /* ignore */ }
    }

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({ 
        success, 
        message, 
        duration,
        sourceFilePath,
        targetFilePath: finalPath,
        originalSize,
        compressedSize,
        compressionRatio: ((1 - compressedSize / originalSize) * 100).toFixed(1),
        compression
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Compression error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
