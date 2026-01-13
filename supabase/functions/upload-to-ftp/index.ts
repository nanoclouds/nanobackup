import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple FTP client implementation for Deno
class SimpleFTPClient {
  private conn: Deno.TcpConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
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
    const response = await this.sendCommand("PASV");
    if (!response.startsWith("227")) {
      throw new Error(`PASV failed: ${response}`);
    }
    // Parse PASV response: 227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)
    const match = response.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (!match) {
      throw new Error(`Invalid PASV response: ${response}`);
    }
    const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
    const port = parseInt(match[5]) * 256 + parseInt(match[6]);
    return { host, port };
  }

  async mkdirRecursive(path: string): Promise<void> {
    const parts = path.split("/").filter(p => p);
    let currentPath = "";
    for (const part of parts) {
      currentPath += "/" + part;
      const response = await this.sendCommand(`MKD ${currentPath}`);
      // 257 = created, 550 = already exists (both are OK)
    }
  }

  async uploadFile(remotePath: string, data: Uint8Array): Promise<boolean> {
    // Ensure directory exists
    const dirPath = remotePath.substring(0, remotePath.lastIndexOf("/"));
    if (dirPath) {
      await this.mkdirRecursive(dirPath);
    }

    await this.setBinaryMode();
    const passive = await this.setPassiveMode();
    
    // Connect to data port
    const dataConn = await Deno.connect({
      hostname: passive.host,
      port: passive.port,
    });

    // Send STOR command
    const storResponse = await this.sendCommand(`STOR ${remotePath}`);
    if (!storResponse.startsWith("150") && !storResponse.startsWith("125")) {
      dataConn.close();
      throw new Error(`STOR failed: ${storResponse}`);
    }

    // Send data
    await dataConn.write(data);
    dataConn.close();

    // Wait for transfer complete
    const completeResponse = await this.readResponse();
    if (!completeResponse.startsWith("226")) {
      throw new Error(`Transfer failed: ${completeResponse}`);
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

// SFTP is more complex and requires SSH - for now we'll use a workaround
// In production, you'd use a proper SFTP library or external service

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { destinationId, fileName, fileContent, remotePath } = await req.json();
    
    if (!destinationId || !fileName) {
      throw new Error("destinationId and fileName are required");
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
    let remoteChecksum = "";
    let uploadedPath = "";

    // Calculate full remote path
    const baseDir = destination.base_directory.endsWith("/") 
      ? destination.base_directory.slice(0, -1) 
      : destination.base_directory;
    uploadedPath = remotePath || `${baseDir}/${fileName}`;

    // For FTP/FTPS
    if (destination.protocol === "ftp" || destination.protocol === "ftps") {
      const ftpClient = new SimpleFTPClient(destination.host, destination.port);
      
      try {
        console.log(`Connecting to FTP server ${destination.host}:${destination.port}...`);
        const banner = await ftpClient.connect();
        console.log(`FTP Banner: ${banner}`);

        console.log(`Logging in as ${destination.username}...`);
        await ftpClient.login(destination.username, destination.password || "");

        // Generate test data if no content provided (for testing)
        const data = fileContent 
          ? new TextEncoder().encode(fileContent)
          : new TextEncoder().encode(`Backup test file created at ${new Date().toISOString()}`);

        console.log(`Uploading to ${uploadedPath}...`);
        await ftpClient.uploadFile(uploadedPath, data);

        // Calculate checksum of uploaded data
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        remoteChecksum = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        success = true;
        message = `Arquivo enviado com sucesso para ${uploadedPath}`;

        await ftpClient.close();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
        message = `Falha no upload FTP: ${errorMessage}`;
        console.error(message);
        try { await ftpClient.close(); } catch { /* ignore */ }
      }
    } else if (destination.protocol === "sftp") {
      // SFTP requires SSH protocol - limited support in Deno without external deps
      // For now, we'll indicate this limitation
      message = "Upload SFTP requer implementação com SSH. Use FTP/FTPS por enquanto.";
      success = false;
    }

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({ 
        success, 
        message, 
        duration,
        remotePath: uploadedPath,
        checksum: remoteChecksum,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Upload error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
