import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt } from "../_shared/crypto.ts";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TriggerBackupRequest {
  jobId: string;
  executionId: string;
  databases?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const externalServerUrl = Deno.env.get('BACKUP_SERVER_URL');
    const externalServerKey = Deno.env.get('BACKUP_SERVER_API_KEY');

    if (!externalServerUrl || !externalServerKey) {
      throw new Error('BACKUP_SERVER_URL e BACKUP_SERVER_API_KEY não configurados');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { jobId, executionId, databases }: TriggerBackupRequest = await req.json();

    console.log(`Triggering external backup for job ${jobId}, execution ${executionId}`);

    // Buscar dados do job
    const { data: job, error: jobError } = await supabase
      .from('backup_jobs')
      .select(`
        *,
        postgres_instances(*),
        ftp_destinations(*)
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job não encontrado: ${jobError?.message}`);
    }

    const instance = job.postgres_instances;
    const destination = job.ftp_destinations;

    if (!instance || !destination) {
      throw new Error('Instância ou destino não encontrado');
    }

    // Decrypt credentials
    const instancePassword = await decrypt(instance.password);
    const destinationPassword = destination.password ? await decrypt(destination.password) : null;
    const destinationSshKey = destination.ssh_key ? await decrypt(destination.ssh_key) : null;

    // Determinar quais bancos fazer backup
    let databasesToBackup = databases || [];
    if (databasesToBackup.length === 0) {
      // Usar bancos descobertos ou o banco principal
      const discovered = instance.discovered_databases as Array<{ name: string }> | null;
      if (discovered && discovered.length > 0) {
        databasesToBackup = discovered.map((d) => d.name);
      } else {
        databasesToBackup = [instance.database];
      }
    }

    // Construir URL de callback
    const callbackUrl = `${supabaseUrl}/functions/v1/backup-callback`;

    // Chamar servidor externo with decrypted credentials
    const response = await fetch(`${externalServerUrl}/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${externalServerKey}`
      },
      body: JSON.stringify({
        jobId,
        executionId,
        callbackUrl,
        database: {
          host: instance.host,
          port: instance.port,
          name: instance.database,
          username: instance.username,
          password: instancePassword,
          sslEnabled: instance.ssl_enabled
        },
        destination: {
          protocol: destination.protocol,
          host: destination.host,
          port: destination.port,
          username: destination.username,
          password: destinationPassword,
          sshKey: destinationSshKey,
          baseDirectory: destination.base_directory
        },
        options: {
          format: job.format,
          compression: job.compression,
          databases: databasesToBackup
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Servidor externo retornou erro: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // Atualizar execução com o ID do backup externo
    await supabase
      .from('backup_executions')
      .update({
        logs: `Backup iniciado no servidor externo. ID: ${result.backupId}\nBancos: ${databasesToBackup.join(', ')}`
      })
      .eq('id', executionId);

    console.log(`External backup triggered successfully: ${result.backupId}`);

    return new Response(
      JSON.stringify({
        success: true,
        backupId: result.backupId,
        databases: databasesToBackup,
        message: 'Backup iniciado no servidor externo'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
