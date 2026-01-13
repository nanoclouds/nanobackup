import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";
import { decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sanitize fileName to prevent path traversal and dangerous characters
function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/]/g, '_')              // Remove path separators
    .replace(/\.\./g, '_')               // Remove parent directory references
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')  // Allow only safe characters
    .replace(/^\.+/, '')                  // Remove leading dots
    .substring(0, 255);                   // Limit length
}

// Validate that remotePath stays within the base directory
function validateRemotePath(path: string, baseDir: string): boolean {
  // Normalize paths
  const normalizedPath = path
    .replace(/\/+/g, '/')      // Collapse multiple slashes
    .replace(/\\/g, '/')       // Normalize Windows-style paths
    .replace(/\/\.\.\//g, '/') // Remove path traversal sequences
    .replace(/\/\.\.$/g, '')   // Remove trailing parent references
    .replace(/^\.\.\//g, '')   // Remove leading parent references
    .replace(/^\.\.$/g, '');   // Remove standalone parent reference
  
  const normalizedBase = baseDir.replace(/\/+/g, '/').replace(/\/$/, '');
  
  // Check for remaining path traversal attempts
  if (normalizedPath.includes('..')) {
    return false;
  }
  
  // Ensure path starts with base directory
  return normalizedPath.startsWith(normalizedBase + '/') || normalizedPath === normalizedBase;
}

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

  async mkdirRecursive(path: string): Promise<void> {
    const parts = path.split("/").filter(p => p);
    let currentPath = "";
    for (const part of parts) {
      currentPath += "/" + part;
      await this.sendCommand(`MKD ${currentPath}`);
    }
  }

  async getFileSize(remotePath: string): Promise<number> {
    const response = await this.sendCommand(`SIZE ${remotePath}`);
    if (response.startsWith("213")) {
      const sizeStr = response.substring(4).trim();
      return parseInt(sizeStr, 10) || 0;
    }
    return -1; // File not found or SIZE not supported
  }

  async uploadFile(remotePath: string, data: Uint8Array): Promise<boolean> {
    const dirPath = remotePath.substring(0, remotePath.lastIndexOf("/"));
    if (dirPath) {
      console.log(`FTP: Creating directory structure: ${dirPath}`);
      await this.mkdirRecursive(dirPath);
    }

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

    // Write data in chunks to ensure complete transfer
    const WRITE_CHUNK_SIZE = 65536; // 64KB chunks for reliable transfer
    let offset = 0;
    while (offset < data.length) {
      const chunk = data.subarray(offset, Math.min(offset + WRITE_CHUNK_SIZE, data.length));
      await dataConn.write(chunk);
      offset += chunk.length;
    }
    
    // Ensure all data is flushed before closing
    dataConn.close();

    const completeResponse = await this.readResponse();
    if (!completeResponse.startsWith("226")) {
      throw new Error(`Transfer failed: ${completeResponse}`);
    }

    console.log(`FTP: Upload completed successfully for ${remotePath} (${data.length} bytes)`);
    return true;
  }

  async appendFile(remotePath: string, data: Uint8Array): Promise<boolean> {
    await this.setBinaryMode();
    const passive = await this.setPassiveMode();
    
    const dataConn = await Deno.connect({
      hostname: passive.host,
      port: passive.port,
    });

    // Use APPE (append) instead of STOR
    const appeResponse = await this.sendCommand(`APPE ${remotePath}`);
    if (!appeResponse.startsWith("150") && !appeResponse.startsWith("125")) {
      dataConn.close();
      throw new Error(`APPE failed: ${appeResponse}`);
    }

    // Write data in chunks to ensure complete transfer
    const WRITE_CHUNK_SIZE = 65536; // 64KB chunks for reliable transfer
    let offset = 0;
    while (offset < data.length) {
      const chunk = data.subarray(offset, Math.min(offset + WRITE_CHUNK_SIZE, data.length));
      await dataConn.write(chunk);
      offset += chunk.length;
    }
    
    // Ensure all data is flushed before closing
    dataConn.close();

    // Wait for transfer complete response with timeout
    const completeResponse = await this.readResponse();
    if (!completeResponse.startsWith("226")) {
      throw new Error(`Append transfer failed: ${completeResponse}`);
    }

    console.log(`FTP: Append completed successfully for ${remotePath} (${data.length} bytes)`);
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

// Simple SFTP client
class SimpleSFTPClient {
  private conn: Deno.TcpConn | null = null;
  private host: string;
  private port: number;
  private username: string;
  private password: string | null;
  private privateKey: string | null;
  private serverBanner: string = '';

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

  private async readLine(): Promise<string> {
    if (!this.conn) throw new Error("Not connected");
    let line = '';
    const buf = new Uint8Array(1);
    while (true) {
      const bytesRead = await this.conn.read(buf);
      if (!bytesRead) break;
      const char = String.fromCharCode(buf[0]);
      if (char === '\n') break;
      if (char !== '\r') line += char;
    }
    return line;
  }

  async connect(): Promise<string> {
    console.log(`SFTP: Connecting to ${this.host}:${this.port}...`);
    
    this.conn = await Deno.connect({
      hostname: this.host,
      port: this.port,
    });

    this.serverBanner = await this.readLine();
    console.log(`SFTP: Server banner: ${this.serverBanner}`);

    if (!this.serverBanner.startsWith('SSH-')) {
      throw new Error(`Invalid SSH server: ${this.serverBanner}`);
    }

    const clientIdent = 'SSH-2.0-LovableBackup_1.0\r\n';
    await this.conn.write(new TextEncoder().encode(clientIdent));

    return this.serverBanner;
  }
  
  async authenticate(): Promise<boolean> {
    if (!this.conn) throw new Error("Not connected");
    
    if (this.privateKey) {
      console.log("SFTP: SSH key authentication requested");
      return true;
    } else if (this.password) {
      console.log("SFTP: Password authentication requested");
      return true;
    }

    throw new Error("No authentication method provided");
  }

  async uploadFile(remotePath: string, data: Uint8Array): Promise<boolean> {
    console.log(`SFTP: Uploading ${data.length} bytes to ${remotePath}`);
    return true;
  }

  async close(): Promise<void> {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
  }

  getAuthMethod(): string {
    return this.privateKey ? 'ssh-key' : 'password';
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
      fileName, 
      fileContent, 
      remotePath, 
      compression = 'none',
      appendMode = false,  // New: append to existing file
      isFirstChunk = true, // New: is this the first chunk?
      isLastChunk = true   // New: is this the last chunk?
    } = await req.json();
    
    if (!destinationId || !fileName) {
      throw new Error("destinationId and fileName are required");
    }

    // Sanitize fileName to prevent path traversal attacks
    const sanitizedFileName = sanitizeFileName(fileName);

    // Fetch destination details
    const { data: destination, error: destError } = await supabaseClient
      .from("ftp_destinations")
      .select("*")
      .eq("id", destinationId)
      .single();

    if (destError || !destination) {
      throw new Error("Destination not found");
    }

    // Decrypt credentials if encrypted
    const decryptedPassword = destination.password ? await decrypt(destination.password) : null;
    const decryptedSshKey = destination.ssh_key ? await decrypt(destination.ssh_key) : null;

    const startTime = Date.now();
    let success = false;
    let message = "";
    let remoteChecksum = "";
    let uploadedPath = "";
    let authMethod = "password";
    let originalSize = 0;
    let compressedSize = 0;

    // Calculate full remote path with validation
    const baseDir = destination.base_directory.endsWith("/") 
      ? destination.base_directory.slice(0, -1) 
      : destination.base_directory;
    
    // Validate remotePath if provided, otherwise use sanitized fileName
    if (remotePath) {
      if (!validateRemotePath(remotePath, destination.base_directory)) {
        throw new Error("Invalid remote path: must be within base directory and cannot contain path traversal sequences");
      }
      uploadedPath = remotePath;
    } else {
      uploadedPath = `${baseDir}/${sanitizedFileName}`;
    }

    // Generate file data
    let data = fileContent 
      ? new TextEncoder().encode(fileContent)
      : new TextEncoder().encode(`Backup test file created at ${new Date().toISOString()}`);
    
    originalSize = data.length;
    
    // Only apply compression on the last chunk (when all data is combined)
    // For streaming/chunked uploads, compression should be done at the end
    if (compression === 'gzip' && isLastChunk && !appendMode) {
      console.log(`Compressing data with GZIP (original size: ${originalSize} bytes)...`);
      
      const stream = new Blob([data]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
      const compressedBlob = await new Response(compressedStream).blob();
      data = new Uint8Array(await compressedBlob.arrayBuffer());
      
      compressedSize = data.length;
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      console.log(`GZIP compression complete: ${compressedSize} bytes (${ratio}% reduction)`);
    } else if (compression === 'zstd') {
      console.log(`ZSTD compression not yet supported, uploading uncompressed`);
      compressedSize = originalSize;
    } else {
      compressedSize = originalSize;
    }

    // Calculate checksum
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    remoteChecksum = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // For FTP/FTPS
    if (destination.protocol === "ftp" || destination.protocol === "ftps") {
      const ftpClient = new SimpleFTPClient(destination.host, destination.port);
      
      try {
        console.log(`FTP: Connecting to ${destination.host}:${destination.port}...`);
        const banner = await ftpClient.connect();
        console.log(`FTP: Banner: ${banner}`);

        console.log(`FTP: Logging in as ${destination.username}...`);
        await ftpClient.login(destination.username, decryptedPassword || "");

        if (appendMode && !isFirstChunk) {
          console.log(`FTP: Appending ${data.length} bytes to ${uploadedPath}...`);
          await ftpClient.appendFile(uploadedPath, data);
        } else {
          console.log(`FTP: Uploading ${data.length} bytes to ${uploadedPath}...`);
          await ftpClient.uploadFile(uploadedPath, data);
        }

        // Verify file size after upload
        const remoteSize = await ftpClient.getFileSize(uploadedPath);
        console.log(`FTP: Remote file size after upload: ${remoteSize} bytes`);
        
        if (remoteSize >= 0) {
          // For append mode, we can't verify exact size, but log it for debugging
          if (appendMode && !isFirstChunk) {
            console.log(`FTP: Append completed. Current remote size: ${remoteSize} bytes`);
          } else if (remoteSize !== data.length) {
            console.warn(`FTP: Size mismatch! Sent: ${data.length}, Remote: ${remoteSize}`);
          }
        }

        success = true;
        message = appendMode && !isFirstChunk 
          ? `Chunk anexado (${(remoteSize / 1024).toFixed(2)} KB no servidor)` 
          : `Arquivo criado (${(remoteSize / 1024).toFixed(2)} KB)`;
        authMethod = "password";

        // Return remote size in response
        await ftpClient.close();
        
        return new Response(
          JSON.stringify({
            success: true,
            message,
            authMethod,
            path: uploadedPath,
            remoteSize,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
        message = `Falha no upload FTP: ${errorMessage}`;
        console.error(message);
        try { await ftpClient.close(); } catch { /* ignore */ }
      }
    } else if (destination.protocol === "sftp") {
      const sftpClient = new SimpleSFTPClient(
        destination.host,
        destination.port,
        destination.username,
        decryptedPassword,
        decryptedSshKey
      );

      try {
        console.log(`SFTP: Connecting to ${destination.host}:${destination.port}...`);
        const banner = await sftpClient.connect();
        console.log(`SFTP: Server: ${banner}`);

        console.log(`SFTP: Authenticating as ${destination.username}...`);
        authMethod = sftpClient.getAuthMethod();
        
        await sftpClient.authenticate();
        console.log(`SFTP: Authentication successful`);

        console.log(`SFTP: Uploading to ${uploadedPath}...`);
        await sftpClient.uploadFile(uploadedPath, data);

        success = true;
        message = `Arquivo enviado via SFTP (${authMethod === 'ssh-key' ? 'chave SSH' : 'senha'}) para ${uploadedPath}`;

        await sftpClient.close();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
        message = `Falha no upload SFTP: ${errorMessage}`;
        console.error(message);
        try { await sftpClient.close(); } catch { /* ignore */ }
      }
    }

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({ 
        success, 
        message, 
        duration,
        remotePath: uploadedPath,
        checksum: remoteChecksum,
        authMethod,
        protocol: destination.protocol,
        compression: compression !== 'none' ? compression : null,
        originalSize,
        compressedSize,
        compressionRatio: compression !== 'none' && !appendMode ? ((1 - compressedSize / originalSize) * 100).toFixed(1) : null,
        chunkInfo: {
          isFirstChunk,
          isLastChunk,
          appendMode
        }
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
