import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";
import { decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SSHBackupRequest {
  jobId: string;
  executionId: string;
  databases?: string[];
}

// Execute SSH command using Deno's subprocess
async function executeSSHCommand(
  host: string,
  port: number,
  username: string,
  password: string,
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Build sshpass command for password authentication
  const sshpassCmd = [
    "sshpass",
    "-p", password,
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=30",
    "-p", port.toString(),
    `${username}@${host}`,
    command
  ];

  console.log(`Executing SSH command on ${host}:${port} as ${username}`);
  console.log(`Command: ${command}`);

  try {
    const process = new Deno.Command("sshpass", {
      args: sshpassCmd.slice(1),
      stdout: "piped",
      stderr: "piped",
    });

    const result = await process.output();
    const decoder = new TextDecoder();
    
    return {
      stdout: decoder.decode(result.stdout),
      stderr: decoder.decode(result.stderr),
      exitCode: result.code,
    };
  } catch (error: unknown) {
    console.error("SSH execution error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`SSH connection failed: ${errorMessage}`);
  }
}

// Generate pg_dump command
function buildPgDumpCommand(
  pgHost: string,
  pgPort: number,
  pgDatabase: string,
  pgUsername: string,
  pgPassword: string,
  sslEnabled: boolean,
  format: string,
  compression: string,
  outputFile: string
): string {
  const sslMode = sslEnabled ? "require" : "disable";
  const formatFlag = format === "custom" ? "-Fc" : "-Fp";
  
  // Build the command with password in PGPASSWORD env var
  let cmd = `PGPASSWORD='${pgPassword}' pg_dump`;
  cmd += ` -h ${pgHost}`;
  cmd += ` -p ${pgPort}`;
  cmd += ` -U ${pgUsername}`;
  cmd += ` ${formatFlag}`;
  cmd += ` --no-owner --no-privileges`;
  
  // Add SSL option if sslMode is require
  if (sslEnabled) {
    cmd += ` --dbname="postgresql://${pgUsername}@${pgHost}:${pgPort}/${pgDatabase}?sslmode=${sslMode}"`;
  } else {
    cmd += ` ${pgDatabase}`;
  }
  
  // Add compression for SQL format
  if (format === "sql" && compression === "gzip") {
    cmd += ` | gzip`;
    outputFile += ".gz";
  } else if (format === "sql" && compression === "zstd") {
    cmd += ` | zstd`;
    outputFile += ".zst";
  }
  
  cmd += ` > ${outputFile}`;
  
  return cmd;
}

// Build FTP/SFTP upload command
function buildUploadCommand(
  protocol: string,
  ftpHost: string,
  ftpPort: number,
  ftpUsername: string,
  ftpPassword: string,
  ftpBaseDir: string,
  localFile: string,
  remoteFileName: string
): string {
  const remotePath = `${ftpBaseDir}/${remoteFileName}`.replace(/\/+/g, '/');
  
  if (protocol === "sftp") {
    // Use sshpass with sftp
    return `sshpass -p '${ftpPassword}' sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -P ${ftpPort} ${ftpUsername}@${ftpHost} <<EOF
cd ${ftpBaseDir}
put ${localFile}
bye
EOF`;
  } else {
    // Use curl for FTP/FTPS
    const ftpUrl = protocol === "ftps" 
      ? `ftps://${ftpHost}:${ftpPort}${remotePath}`
      : `ftp://${ftpHost}:${ftpPort}${remotePath}`;
    
    return `curl -T ${localFile} -u "${ftpUsername}:${ftpPassword}" "${ftpUrl}" --ftp-create-dirs`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    
    await requireOperatorOrAdmin(
      authHeader,
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { jobId, executionId, databases }: SSHBackupRequest = await req.json();
    
    if (!jobId || !executionId) {
      throw new Error("jobId and executionId are required");
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch job with instance and destination
    const { data: job, error: jobError } = await serviceClient
      .from("backup_jobs")
      .select(`
        *,
        instance:postgres_instances(*),
        destination:ftp_destinations(*)
      `)
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobError?.message || "Unknown error"}`);
    }

    const instance = job.instance;
    const destination = job.destination;

    if (!instance) {
      throw new Error("Instance not found for this job");
    }

    if (!destination) {
      throw new Error("Destination not found for this job");
    }

    // Check if SSH is enabled for this instance
    if (!instance.ssh_enabled) {
      throw new Error("SSH backup is not enabled for this instance. Please configure SSH settings first.");
    }

    if (!instance.ssh_host || !instance.ssh_username) {
      throw new Error("SSH host and username are required for SSH backup");
    }

    // Decrypt credentials
    const pgPassword = await decrypt(instance.password);
    const sshPassword = instance.ssh_password ? await decrypt(instance.ssh_password) : "";
    const ftpPassword = destination.password ? await decrypt(destination.password) : "";

    if (!sshPassword && !instance.ssh_private_key) {
      throw new Error("SSH password or private key is required");
    }

    // Determine which databases to backup
    const databasesToBackup = databases && databases.length > 0 
      ? databases 
      : (instance.discovered_databases?.map((db: { name: string }) => db.name) || [instance.database]);

    const logs: string[] = [];
    const startTime = Date.now();
    let totalFileSize = 0;
    let lastFileName = "";

    logs.push(`[${new Date().toISOString()}] Starting SSH backup via ${instance.ssh_host}:${instance.ssh_port || 22}`);
    logs.push(`[${new Date().toISOString()}] Databases to backup: ${databasesToBackup.join(", ")}`);

    // Update execution status to running
    await serviceClient
      .from("backup_executions")
      .update({ 
        status: "running",
        logs: logs.join("\n")
      })
      .eq("id", executionId);

    for (const dbName of databasesToBackup) {
      const dbStartTime = Date.now();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${instance.name.replace(/\s+/g, "_")}_${dbName}_${timestamp}`;
      const extension = job.format === "custom" ? ".dump" : ".sql";
      const localPath = `/tmp/${fileName}${extension}`;
      
      logs.push(`[${new Date().toISOString()}] Backing up database: ${dbName}`);

      // Create database backup record
      const { data: dbBackup, error: dbBackupError } = await serviceClient
        .from("execution_database_backups")
        .insert({
          execution_id: executionId,
          database_name: dbName,
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (dbBackupError) {
        logs.push(`[${new Date().toISOString()}] Warning: Failed to create database backup record: ${dbBackupError.message}`);
      }

      try {
        // Build and execute pg_dump command
        const pgDumpCmd = buildPgDumpCommand(
          instance.host,
          instance.port,
          dbName,
          instance.username,
          pgPassword,
          instance.ssl_enabled,
          job.format,
          job.compression,
          localPath
        );

        logs.push(`[${new Date().toISOString()}] Executing pg_dump...`);
        
        const dumpResult = await executeSSHCommand(
          instance.ssh_host,
          instance.ssh_port || 22,
          instance.ssh_username,
          sshPassword,
          pgDumpCmd
        );

        if (dumpResult.exitCode !== 0) {
          throw new Error(`pg_dump failed: ${dumpResult.stderr}`);
        }

        logs.push(`[${new Date().toISOString()}] pg_dump completed successfully`);

        // Get file size
        const sizeResult = await executeSSHCommand(
          instance.ssh_host,
          instance.ssh_port || 22,
          instance.ssh_username,
          sshPassword,
          `stat -c%s ${localPath} 2>/dev/null || ls -l ${localPath} | awk '{print $5}'`
        );

        const fileSize = parseInt(sizeResult.stdout.trim()) || 0;
        totalFileSize += fileSize;
        logs.push(`[${new Date().toISOString()}] Backup file size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

        // Determine remote file name
        const remoteFileName = job.compression === "gzip" && job.format === "sql" 
          ? `${fileName}${extension}.gz`
          : job.compression === "zstd" && job.format === "sql"
            ? `${fileName}${extension}.zst`
            : `${fileName}${extension}`;
        lastFileName = remoteFileName;

        // Upload to destination
        logs.push(`[${new Date().toISOString()}] Uploading to ${destination.protocol}://${destination.host}...`);
        
        const uploadCmd = buildUploadCommand(
          destination.protocol,
          destination.host,
          destination.port,
          destination.username,
          ftpPassword,
          destination.base_directory,
          localPath,
          remoteFileName
        );

        const uploadResult = await executeSSHCommand(
          instance.ssh_host,
          instance.ssh_port || 22,
          instance.ssh_username,
          sshPassword,
          uploadCmd
        );

        if (uploadResult.exitCode !== 0) {
          throw new Error(`Upload failed: ${uploadResult.stderr}`);
        }

        logs.push(`[${new Date().toISOString()}] Upload completed successfully`);

        // Cleanup local file
        await executeSSHCommand(
          instance.ssh_host,
          instance.ssh_port || 22,
          instance.ssh_username,
          sshPassword,
          `rm -f ${localPath}`
        );

        const dbDuration = Math.round((Date.now() - dbStartTime) / 1000);

        // Update database backup record
        if (dbBackup) {
          await serviceClient
            .from("execution_database_backups")
            .update({
              status: "success",
              completed_at: new Date().toISOString(),
              duration: dbDuration,
              file_name: remoteFileName,
              file_size: fileSize,
              storage_path: `${destination.base_directory}/${remoteFileName}`,
              logs: `pg_dump and upload completed successfully in ${dbDuration}s`,
            })
            .eq("id", dbBackup.id);
        }

        logs.push(`[${new Date().toISOString()}] Database ${dbName} backup completed in ${dbDuration}s`);

      } catch (dbError: unknown) {
        const errorMessage = dbError instanceof Error ? dbError.message : "Unknown error";
        logs.push(`[${new Date().toISOString()}] ERROR backing up ${dbName}: ${errorMessage}`);

        // Update database backup record with error
        if (dbBackup) {
          await serviceClient
            .from("execution_database_backups")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error_message: errorMessage,
              logs: `Error: ${errorMessage}`,
            })
            .eq("id", dbBackup.id);
        }
      }
    }

    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    logs.push(`[${new Date().toISOString()}] SSH backup completed. Total time: ${totalDuration}s`);

    // Check if any database backup failed
    const { data: failedBackups } = await serviceClient
      .from("execution_database_backups")
      .select("id")
      .eq("execution_id", executionId)
      .eq("status", "failed");

    const finalStatus = (failedBackups && failedBackups.length > 0) ? "failed" : "success";

    // Update execution
    await serviceClient
      .from("backup_executions")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        duration: totalDuration,
        file_size: totalFileSize,
        file_name: lastFileName,
        logs: logs.join("\n"),
      })
      .eq("id", executionId);

    // Update job status
    await serviceClient
      .from("backup_jobs")
      .update({
        status: finalStatus,
        last_run: new Date().toISOString(),
      })
      .eq("id", jobId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        status: finalStatus,
        duration: totalDuration,
        fileSize: totalFileSize,
        logs: logs 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("SSH Backup error:", errorMessage);
    
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
