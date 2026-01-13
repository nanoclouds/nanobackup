import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackupCallbackData {
  id: string;
  jobId: string;
  executionId: string;
  status: 'running' | 'success' | 'failed' | 'cancelled';
  phase: string;
  databases: string[];
  currentDatabase: string | null;
  currentDatabaseIndex: number;
  totalDatabases: number;
  progress: number;
  startedAt: string;
  completedAt?: string;
  files: Array<{
    database: string;
    fileName: string;
    remotePath: string;
    size: number;
    checksum: string;
    duration: number;
  }>;
  errors: Array<{
    database?: string;
    error: string;
  }>;
  totalSize: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const expectedApiKey = Deno.env.get('BACKUP_SERVER_API_KEY');

    // Verificar autenticação
    const authHeader = req.headers.get('authorization');
    if (expectedApiKey && authHeader !== `Bearer ${expectedApiKey}`) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const data: BackupCallbackData = await req.json();

    console.log(`Callback received for execution ${data.executionId}: ${data.status} (${data.phase})`);

    // Calcular duração total
    const startedAt = new Date(data.startedAt);
    const completedAt = data.completedAt ? new Date(data.completedAt) : new Date();
    const duration = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000);

    // Construir logs detalhados
    const logLines: string[] = [
      `═══════════════════════════════════════`,
      `Backup via pg_dump nativo`,
      `═══════════════════════════════════════`,
      `Início: ${data.startedAt}`,
      `Status: ${data.status}`,
      `Bancos: ${data.totalDatabases}`,
      ``
    ];

    // Adicionar detalhes de cada arquivo
    for (const file of data.files) {
      logLines.push(`✓ ${file.database}`);
      logLines.push(`  Arquivo: ${file.fileName}`);
      logLines.push(`  Tamanho: ${formatBytes(file.size)}`);
      logLines.push(`  Checksum: ${file.checksum}`);
      logLines.push(`  Duração: ${file.duration}s`);
      logLines.push(``);
    }

    // Adicionar erros se houver
    if (data.errors.length > 0) {
      logLines.push(`══════ ERROS ══════`);
      for (const err of data.errors) {
        logLines.push(`✗ ${err.database || 'Geral'}: ${err.error}`);
      }
      logLines.push(``);
    }

    logLines.push(`═══════════════════════════════════════`);
    logLines.push(`Resumo: ${data.files.length}/${data.totalDatabases} bancos`);
    logLines.push(`Tamanho Total: ${formatBytes(data.totalSize)}`);
    logLines.push(`Duração Total: ${duration}s`);

    const logs = logLines.join('\n');

    // Atualizar backup_executions
    const updateData: Record<string, unknown> = {
      status: data.status === 'success' ? 'success' : data.status === 'cancelled' ? 'cancelled' : 'failed',
      completed_at: data.completedAt || new Date().toISOString(),
      duration,
      file_size: data.totalSize,
      logs
    };

    // Se houve erros, adicionar mensagem de erro
    if (data.errors.length > 0) {
      updateData.error_message = data.errors.map(e => 
        `${e.database || 'Geral'}: ${e.error}`
      ).join('; ');
    }

    // Se houve sucesso com arquivos, pegar o primeiro checksum
    if (data.files.length > 0) {
      updateData.checksum = data.files[0].checksum;
      updateData.file_name = data.files.map(f => f.fileName).join(', ');
    }

    const { error: updateError } = await supabase
      .from('backup_executions')
      .update(updateData)
      .eq('id', data.executionId);

    if (updateError) {
      console.error('Erro ao atualizar execução:', updateError);
    }

    // Criar registros individuais para cada banco
    for (const file of data.files) {
      const { error: dbBackupError } = await supabase
        .from('execution_database_backups')
        .insert({
          execution_id: data.executionId,
          database_name: file.database,
          status: 'success',
          file_name: file.fileName,
          file_size: file.size,
          checksum: file.checksum,
          duration: file.duration,
          storage_path: file.remotePath,
          completed_at: data.completedAt || new Date().toISOString()
        });

      if (dbBackupError) {
        console.error(`Erro ao registrar backup de ${file.database}:`, dbBackupError);
      }
    }

    // Registrar erros também
    for (const err of data.errors) {
      if (err.database) {
        await supabase
          .from('execution_database_backups')
          .insert({
            execution_id: data.executionId,
            database_name: err.database,
            status: 'failed',
            error_message: err.error,
            completed_at: new Date().toISOString()
          });
      }
    }

    // Atualizar job
    await supabase
      .from('backup_jobs')
      .update({
        status: data.status === 'success' ? 'success' : 'failed',
        last_run: new Date().toISOString()
      })
      .eq('id', data.jobId);

    // Criar alerta se houve falha
    if (data.status === 'failed' || data.errors.length > 0) {
      await supabase
        .from('alerts')
        .insert({
          title: data.status === 'failed' ? 'Backup falhou' : 'Backup com erros',
          type: data.status === 'failed' ? 'error' : 'warning',
          message: data.errors.length > 0 
            ? `Erros: ${data.errors.map(e => e.database || 'Geral').join(', ')}`
            : 'Backup falhou completamente',
          job_id: data.jobId,
          execution_id: data.executionId
        });
    }

    console.log(`Callback processed successfully`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Callback error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
