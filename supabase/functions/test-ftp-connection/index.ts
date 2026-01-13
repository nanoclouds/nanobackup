import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt } from "../_shared/crypto.ts";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple FTP client for testing
class TestFTPClient {
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
      throw new Error(`Autenticação falhou: ${userResponse}`);
    }
    const passResponse = await this.sendCommand(`PASS ${password}`);
    if (!passResponse.startsWith("230")) {
      throw new Error(`Senha incorreta: ${passResponse}`);
    }
    return true;
  }

  async setPassiveMode(): Promise<{ host: string; port: number }> {
    const response = await this.sendCommand("PASV");
    if (!response.startsWith("227")) {
      throw new Error(`Modo passivo falhou: ${response}`);
    }
    const match = response.match(/\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)/);
    if (!match) {
      throw new Error(`Resposta PASV inválida: ${response}`);
    }
    const host = `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
    const port = parseInt(match[5]) * 256 + parseInt(match[6]);
    return { host, port };
  }

  async checkDirectory(path: string): Promise<boolean> {
    const response = await this.sendCommand(`CWD ${path}`);
    return response.startsWith("250");
  }

  async testWritePermission(path: string): Promise<{ canWrite: boolean; message: string }> {
    // Try to change to the directory first
    const cwdResponse = await this.sendCommand(`CWD ${path}`);
    if (!cwdResponse.startsWith("250")) {
      return { canWrite: false, message: `Diretório não existe ou inacessível: ${path}` };
    }

    // Try to create a test file
    const testFileName = `.lovable_write_test_${Date.now()}`;
    
    try {
      await this.sendCommand("TYPE I");
      const passive = await this.setPassiveMode();
      
      const dataConn = await Deno.connect({
        hostname: passive.host,
        port: passive.port,
      });

      const storResponse = await this.sendCommand(`STOR ${testFileName}`);
      if (!storResponse.startsWith("150") && !storResponse.startsWith("125")) {
        dataConn.close();
        return { canWrite: false, message: `Sem permissão de escrita: ${storResponse}` };
      }

      // Write test data
      await dataConn.write(new TextEncoder().encode("test"));
      dataConn.close();

      const completeResponse = await this.readResponse();
      if (!completeResponse.startsWith("226")) {
        return { canWrite: false, message: `Falha ao escrever arquivo: ${completeResponse}` };
      }

      // Delete the test file
      const deleteResponse = await this.sendCommand(`DELE ${testFileName}`);
      if (!deleteResponse.startsWith("250")) {
        return { canWrite: true, message: `Escrita OK, mas falha ao limpar arquivo de teste` };
      }

      return { canWrite: true, message: `Permissões de escrita verificadas em ${path}` };
    } catch (e) {
      return { canWrite: false, message: `Erro ao testar escrita: ${e instanceof Error ? e.message : 'Erro desconhecido'}` };
    }
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

// Parse PEM private key to verify format
function validateSSHKey(pemKey: string): { valid: boolean; type: string; error?: string } {
  const lines = pemKey.trim().split('\n');
  let keyType = 'unknown';
  let hasBegin = false;
  let hasEnd = false;
  
  for (const line of lines) {
    if (line.includes('BEGIN') && line.includes('PRIVATE KEY')) {
      hasBegin = true;
      if (line.includes('RSA')) keyType = 'RSA';
      else if (line.includes('EC')) keyType = 'ECDSA';
      else if (line.includes('OPENSSH')) keyType = 'OpenSSH';
      else if (line.includes('DSA')) keyType = 'DSA';
      else keyType = 'PEM';
    }
    if (line.includes('END') && line.includes('PRIVATE KEY')) {
      hasEnd = true;
    }
  }
  
  if (!hasBegin || !hasEnd) {
    return { valid: false, type: keyType, error: 'Formato de chave inválido. Deve conter BEGIN e END PRIVATE KEY.' };
  }
  
  return { valid: true, type: keyType };
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

    const { destinationId } = await req.json();
    if (!destinationId) {
      throw new Error("Destination ID is required");
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

    // Decrypt password and SSH key if encrypted
    const password = destination.password ? await decrypt(destination.password) : null;
    const sshKey = destination.ssh_key ? await decrypt(destination.ssh_key) : null;

    const startTime = Date.now();
    let success = false;
    let message = "";
    let details: Record<string, unknown> = {};

    // For SFTP connections
    if (destination.protocol === "sftp") {
      try {
        console.log(`SFTP: Connecting to ${destination.host}:${destination.port}...`);
        
        const conn = await Deno.connect({
          hostname: destination.host,
          port: destination.port,
        });
        
        // Read the SSH banner
        const buffer = new Uint8Array(256);
        const bytesRead = await conn.read(buffer);
        
        if (bytesRead && bytesRead > 0) {
          const banner = new TextDecoder().decode(buffer.subarray(0, bytesRead));
          
          if (banner.startsWith("SSH-")) {
            const serverVersion = banner.split('\n')[0].trim();
            console.log(`SFTP: Server version: ${serverVersion}`);
            
            // Determine auth method
            const authMethod = sshKey ? 'ssh-key' : 'password';
            
            // Validate SSH key if provided
            if (sshKey) {
              const keyValidation = validateSSHKey(sshKey);
              if (!keyValidation.valid) {
                conn.close();
                message = `Chave SSH inválida: ${keyValidation.error}`;
                details = { 
                  serverVersion,
                  authMethod: 'ssh-key',
                  keyValid: false,
                  keyError: keyValidation.error
                };
              } else {
                console.log(`SFTP: SSH key validated (${keyValidation.type})`);
                
                // For SFTP, we can't do a full connection test without a proper SSH library
                // But we can verify the server is responding and the key format is valid
                success = true;
                message = `Servidor SFTP online. Autenticação: Chave SSH (${keyValidation.type})`;
                details = {
                  serverVersion,
                  authMethod: 'ssh-key',
                  keyType: keyValidation.type,
                  keyValid: true,
                  baseDirectory: destination.base_directory,
                  note: 'Verificação de escrita requer conexão SSH completa'
                };
              }
            } else if (password) {
              // Password auth - just verify server is responding
              success = true;
              message = `Servidor SFTP online. Autenticação: Senha`;
              details = {
                serverVersion,
                authMethod: 'password',
                baseDirectory: destination.base_directory,
                note: 'Verificação de escrita requer conexão SSH completa'
              };
            } else {
              message = "Nenhum método de autenticação configurado (senha ou chave SSH)";
              details = { serverVersion, authMethod: 'none' };
            }
            
            conn.close();
          } else {
            conn.close();
            message = "Servidor não respondeu com protocolo SSH válido";
            details = { response: banner.substring(0, 100) };
          }
        } else {
          conn.close();
          message = "Servidor não respondeu";
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
        message = `Falha ao conectar: ${errorMessage}`;
        details = { error: errorMessage };
      }
    } else {
      // FTP/FTPS - full connection test with write permission check
      const ftpClient = new TestFTPClient(destination.host, destination.port);
      
      try {
        console.log(`FTP: Connecting to ${destination.host}:${destination.port}...`);
        const banner = await ftpClient.connect();
        
        if (!banner.startsWith("220")) {
          throw new Error(`Resposta inesperada: ${banner}`);
        }
        
        const serverInfo = banner.substring(4).split('\n')[0];
        console.log(`FTP: Server: ${serverInfo}`);
        details.serverInfo = serverInfo;

        // Login
        console.log(`FTP: Logging in as ${destination.username}...`);
        await ftpClient.login(destination.username, password || "");
        console.log(`FTP: Login successful`);
        details.loginSuccess = true;

        // Test write permission
        console.log(`FTP: Testing write permission on ${destination.base_directory}...`);
        const writeTest = await ftpClient.testWritePermission(destination.base_directory);
        details.writePermission = writeTest.canWrite;
        details.writeMessage = writeTest.message;

        if (writeTest.canWrite) {
          success = true;
          message = `Conexão FTP OK. ${writeTest.message}`;
        } else {
          success = false;
          message = `Conexão FTP OK, mas: ${writeTest.message}`;
        }

        await ftpClient.close();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
        message = `Falha: ${errorMessage}`;
        details.error = errorMessage;
        try { await ftpClient.close(); } catch { /* ignore */ }
      }
    }

    const latency = Date.now() - startTime;

    // Update destination status and write permission
    const writePermission = details.writePermission === true ? true : 
                            details.writePermission === false ? false : null;
    
    await supabaseClient
      .from("ftp_destinations")
      .update({ 
        status: success ? "online" : "offline", 
        last_tested: new Date().toISOString(),
        write_permission: writePermission
      })
      .eq("id", destinationId);

    return new Response(
      JSON.stringify({ 
        success, 
        message, 
        latency,
        protocol: destination.protocol,
        details 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
