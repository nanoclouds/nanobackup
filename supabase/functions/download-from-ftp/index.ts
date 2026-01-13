import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple FTP client for downloading
class FTPDownloadClient {
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
    // Try EPSV first
    let response = await this.sendCommand("EPSV");
    if (response.startsWith("229")) {
      const match = response.match(/\(\|\|\|(\d+)\|\)/);
      if (match) {
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
    return { host: this.host, port };
  }

  async getFileSize(remotePath: string): Promise<number> {
    const response = await this.sendCommand(`SIZE ${remotePath}`);
    if (response.startsWith("213")) {
      return parseInt(response.substring(4).trim());
    }
    return -1;
  }

  async downloadFile(remotePath: string): Promise<Uint8Array> {
    await this.setBinaryMode();
    const passive = await this.setPassiveMode();
    
    console.log(`FTP: Connecting to data channel ${passive.host}:${passive.port}...`);
    const dataConn = await Deno.connect({
      hostname: passive.host,
      port: passive.port,
    });

    const retrResponse = await this.sendCommand(`RETR ${remotePath}`);
    if (!retrResponse.startsWith("150") && !retrResponse.startsWith("125")) {
      dataConn.close();
      throw new Error(`RETR failed: ${retrResponse}`);
    }

    // Read all data from the connection
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    
    while (true) {
      const buffer = new Uint8Array(65536); // 64KB chunks
      const bytesRead = await dataConn.read(buffer);
      if (bytesRead === null) break;
      chunks.push(buffer.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
    
    dataConn.close();

    // Wait for transfer complete
    const completeResponse = await this.readResponse();
    if (!completeResponse.startsWith("226")) {
      console.warn(`Transfer complete response: ${completeResponse}`);
    }

    // Combine all chunks
    const result = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    console.log(`FTP: Downloaded ${totalBytes} bytes`);
    return result;
  }

  async close(): Promise<void> {
    if (this.conn) {
      try {
        await this.sendCommand("QUIT");
      } catch {
        // Ignore
      }
      this.conn.close();
      this.conn = null;
    }
  }
}

// SFTP client for downloading (simplified)
class SFTPDownloadClient {
  private conn: Deno.TcpConn | null = null;
  private host: string;
  private port: number;
  private username: string;
  private password: string | null;
  private privateKey: string | null;

  constructor(
    host: string, 
    port: number, 
    username: string,
    password: string | null = null,
    privateKey: string | null = null
  ) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
    this.privateKey = privateKey;
  }

  async connect(): Promise<string> {
    this.conn = await Deno.connect({
      hostname: this.host,
      port: this.port,
    });

    // Read banner
    const buffer = new Uint8Array(256);
    const bytesRead = await this.conn.read(buffer);
    if (!bytesRead) throw new Error("No response from server");
    
    const banner = new TextDecoder().decode(buffer.subarray(0, bytesRead));
    if (!banner.startsWith('SSH-')) {
      throw new Error(`Invalid SSH server: ${banner}`);
    }
    
    return banner.trim();
  }

  async downloadFile(_remotePath: string): Promise<Uint8Array> {
    // Full SFTP download requires complete SSH protocol implementation
    // For now, we indicate this is not supported in edge functions
    throw new Error("SFTP download requires external SSH client - not yet implemented in edge functions");
  }

  async close(): Promise<void> {
    if (this.conn) {
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

    const { destinationId, remotePath, decompress = false } = await req.json();
    
    if (!destinationId || !remotePath) {
      throw new Error("destinationId and remotePath are required");
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
    let fileData: Uint8Array;
    let originalSize = 0;
    let wasDecompressed = false;

    if (destination.protocol === "ftp" || destination.protocol === "ftps") {
      const ftpClient = new FTPDownloadClient(destination.host, destination.port);
      
      try {
        console.log(`FTP: Connecting to ${destination.host}:${destination.port}...`);
        await ftpClient.connect();
        
        console.log(`FTP: Logging in as ${destination.username}...`);
        await ftpClient.login(destination.username, destination.password || "");
        
        console.log(`FTP: Downloading ${remotePath}...`);
        fileData = await ftpClient.downloadFile(remotePath);
        originalSize = fileData.length;
        
        await ftpClient.close();
      } catch (e) {
        try { await ftpClient.close(); } catch { /* ignore */ }
        throw e;
      }
    } else if (destination.protocol === "sftp") {
      const sftpClient = new SFTPDownloadClient(
        destination.host,
        destination.port,
        destination.username,
        destination.password,
        destination.ssh_key
      );
      
      try {
        await sftpClient.connect();
        fileData = await sftpClient.downloadFile(remotePath);
        originalSize = fileData.length;
        await sftpClient.close();
      } catch (e) {
        try { await sftpClient.close(); } catch { /* ignore */ }
        throw e;
      }
    } else {
      throw new Error(`Unsupported protocol: ${destination.protocol}`);
    }

    // Decompress if requested and file appears to be gzipped
    if (decompress && (remotePath.endsWith('.gz') || remotePath.endsWith('.gzip'))) {
      try {
        console.log(`Decompressing GZIP data (${fileData.length} bytes)...`);
        // Create ArrayBuffer from Uint8Array for compatibility
        const arrayBuffer = fileData.slice().buffer as ArrayBuffer;
        const blob = new Blob([arrayBuffer]);
        const stream = blob.stream();
        const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
        const decompressedBlob = await new Response(decompressedStream).blob();
        fileData = new Uint8Array(await decompressedBlob.arrayBuffer());
        wasDecompressed = true;
        console.log(`Decompressed to ${fileData.length} bytes`);
      } catch (decompressError) {
        console.warn(`Failed to decompress: ${decompressError}`);
        // Continue with compressed data
      }
    }

    const duration = Date.now() - startTime;

    // Calculate checksum - create ArrayBuffer for compatibility
    const hashData = fileData.slice().buffer as ArrayBuffer;
    const hashBuffer = await crypto.subtle.digest("SHA-256", hashData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const checksum = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Determine if content is text or binary
    let isText = false;
    let textContent: string | null = null;
    
    // Check if it looks like text (SQL files, etc.)
    if (remotePath.endsWith('.sql') || remotePath.endsWith('.txt') || wasDecompressed) {
      try {
        textContent = new TextDecoder().decode(fileData);
        // Check if it's valid UTF-8 text
        if (!textContent.includes('\ufffd')) {
          isText = true;
        }
      } catch {
        isText = false;
      }
    }

    // For binary files, encode as base64
    let content: string;
    let encoding: string;
    
    if (isText && textContent) {
      content = textContent;
      encoding = 'text';
    } else {
      // Convert to base64
      let binaryString = '';
      for (let i = 0; i < fileData.length; i++) {
        binaryString += String.fromCharCode(fileData[i]);
      }
      content = btoa(binaryString);
      encoding = 'base64';
    }

    return new Response(
      JSON.stringify({
        success: true,
        content,
        encoding,
        size: fileData.length,
        originalSize: wasDecompressed ? originalSize : undefined,
        wasDecompressed,
        checksum,
        duration,
        remotePath,
        protocol: destination.protocol,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Download error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
