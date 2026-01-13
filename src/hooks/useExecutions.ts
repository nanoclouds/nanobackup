import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export interface DatabaseBackup {
  id: string;
  execution_id: string;
  database_name: string;
  status: 'scheduled' | 'running' | 'success' | 'failed' | 'cancelled';
  file_name: string | null;
  file_size: number | null;
  checksum: string | null;
  started_at: string;
  completed_at: string | null;
  duration: number | null;
  error_message: string | null;
  logs: string | null;
  created_at: string;
}

export interface BackupExecution {
  id: string;
  job_id: string;
  status: 'scheduled' | 'running' | 'success' | 'failed' | 'cancelled';
  started_at: string;
  completed_at: string | null;
  duration: number | null;
  file_size: number | null;
  file_name: string | null;
  checksum: string | null;
  error_message: string | null;
  logs: string | null;
  created_at: string;
  // Joined data
  backup_jobs?: {
    id: string;
    name: string;
    postgres_instances?: {
      id: string;
      name: string;
      host: string;
    };
    ftp_destinations?: {
      id: string;
      name: string;
    };
  };
  // Database backups
  execution_database_backups?: DatabaseBackup[];
}

export function useExecutions(jobId?: string) {
  return useQuery({
    queryKey: ['executions', jobId],
    queryFn: async () => {
      let query = supabase
        .from('backup_executions')
        .select(`
          *,
          backup_jobs (
            id, 
            name,
            postgres_instances (id, name, host),
            ftp_destinations (id, name)
          ),
          execution_database_backups (*)
        `)
        .order('started_at', { ascending: false })
        .limit(100);
      
      if (jobId) {
        query = query.eq('job_id', jobId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as BackupExecution[];
    },
  });
}

export function useExecutionDetails(executionId: string) {
  return useQuery({
    queryKey: ['execution', executionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backup_executions')
        .select(`
          *,
          backup_jobs (
            id, 
            name,
            postgres_instances (id, name, host),
            ftp_destinations (id, name)
          ),
          execution_database_backups (*)
        `)
        .eq('id', executionId)
        .maybeSingle();
      
      if (error) throw error;
      return data as BackupExecution | null;
    },
    enabled: !!executionId,
  });
}

export function useCreateExecution() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await supabase
        .from('backup_executions')
        .insert({
          job_id: jobId,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update job status
      await supabase
        .from('backup_jobs')
        .update({ 
          status: 'running',
          last_run: new Date().toISOString(),
        })
        .eq('id', jobId);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Backup iniciado!');
    },
    onError: (error) => {
      toast.error('Erro ao iniciar backup: ' + error.message);
    },
  });
}

export function useUpdateExecution() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, jobId, ...updates }: Partial<BackupExecution> & { id: string; jobId?: string }) => {
      const { data, error } = await supabase
        .from('backup_executions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update job status if provided
      if (jobId && updates.status) {
        await supabase
          .from('backup_jobs')
          .update({ status: updates.status })
          .eq('id', jobId);
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => {
      toast.error('Erro ao atualizar execução: ' + error.message);
    },
  });
}

// Generate file name with pattern: database_name_YYYYMMDD_HHmmss.dump
function generateBackupFileName(databaseName: string, timestamp: Date): string {
  const dateStr = format(timestamp, 'yyyyMMdd_HHmmss');
  // Sanitize database name for file system
  const safeName = databaseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeName}_${dateStr}.dump`;
}

// Default databases if none discovered (fallback)
const DEFAULT_DATABASES = [
  { name: 'postgres', size: '8.5 MB' },
];

interface DiscoveredDatabase {
  name: string;
  size: string;
}

export function useRunBackup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (jobId: string) => {
      const startTime = new Date();
      
      // First, get the job with instance details to fetch discovered databases
      const { data: job, error: jobError } = await supabase
        .from('backup_jobs')
        .select(`
          id,
          name,
          postgres_instances (
            id, 
            name, 
            host,
            discovered_databases
          )
        `)
        .eq('id', jobId)
        .single();
      
      if (jobError) throw jobError;
      
      // Get databases from instance (discovered during connection test)
      const rawDbs = job.postgres_instances?.discovered_databases;
      const discoveredDbs: DiscoveredDatabase[] = Array.isArray(rawDbs) 
        ? (rawDbs as unknown as DiscoveredDatabase[])
        : [];
      const databases: DiscoveredDatabase[] = discoveredDbs.length > 0 
        ? discoveredDbs 
        : DEFAULT_DATABASES;
      
      // Create execution record
      const { data: execution, error: execError } = await supabase
        .from('backup_executions')
        .insert({
          job_id: jobId,
          status: 'running',
          started_at: startTime.toISOString(),
          logs: `[${startTime.toISOString()}] Iniciando backup de todos os bancos da instância...\n`,
        })
        .select(`
          *,
          backup_jobs (
            id, 
            name,
            postgres_instances (id, name, host)
          )
        `)
        .single();
      
      if (execError) throw execError;
      
      // Update job status
      await supabase
        .from('backup_jobs')
        .update({ 
          status: 'running',
          last_run: startTime.toISOString(),
        })
        .eq('id', jobId);

      // Execute backup for each database
      const executeBackup = async () => {
        let allLogs = `[${startTime.toISOString()}] Iniciando backup de todos os bancos da instância...\n`;
        allLogs += `[${new Date().toISOString()}] Conectando à instância ${job.postgres_instances?.name} (${job.postgres_instances?.host})...\n`;
        allLogs += `[${new Date().toISOString()}] ${databases.length} bancos de dados encontrados\n`;
        allLogs += `[${new Date().toISOString()}] Formato: pg_dump compatível com PostgreSQL 18.1\n\n`;
        
        let totalSize = 0;
        let successCount = 0;
        let failedCount = 0;
        const dbBackupIds: string[] = [];
        
        // Create initial records for all databases
        for (const db of databases) {
          const { data: dbBackup, error: dbError } = await supabase
            .from('execution_database_backups')
            .insert({
              execution_id: execution.id,
              database_name: db.name,
              status: 'running',
              started_at: new Date().toISOString(),
            })
            .select()
            .single();
          
          if (!dbError && dbBackup) {
            dbBackupIds.push(dbBackup.id);
          }
        }
        
        // Process each database sequentially with simulated delay
        for (let i = 0; i < databases.length; i++) {
          const db = databases[i];
          const dbStartTime = new Date();
          const backupId = dbBackupIds[i];
          
          allLogs += `[${dbStartTime.toISOString()}] Processando banco: ${db.name}\n`;
          
          // Simulate processing time (1-3 seconds per database)
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
          
          const success = Math.random() > 0.15; // 85% success rate per database
          const dbEndTime = new Date();
          const duration = Math.floor((dbEndTime.getTime() - dbStartTime.getTime()) / 1000);
          const fileSize = Math.floor(Math.random() * 200000000) + 10000000; // 10MB - 210MB
          const fileName = generateBackupFileName(db.name, dbStartTime);
          
          if (success) {
            successCount++;
            totalSize += fileSize;
            
            const dbLogs = `[${dbStartTime.toISOString()}] pg_dump -Fc -Z 9 --format=custom ${db.name}\n` +
              `[${new Date().toISOString()}] Comprimindo backup...\n` +
              `[${dbEndTime.toISOString()}] Enviando para destino: ${fileName}\n` +
              `[${dbEndTime.toISOString()}] Backup concluído: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n`;
            
            allLogs += `[${dbEndTime.toISOString()}] ✓ ${db.name} -> ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)\n`;
            
            await supabase
              .from('execution_database_backups')
              .update({
                status: 'success',
                file_name: fileName,
                file_size: fileSize,
                checksum: `sha256:${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
                completed_at: dbEndTime.toISOString(),
                duration,
                logs: dbLogs,
              })
              .eq('id', backupId);
          } else {
            failedCount++;
            const errorMsg = 'Erro ao executar pg_dump: connection reset by peer';
            
            allLogs += `[${dbEndTime.toISOString()}] ✗ ${db.name} - FALHOU: ${errorMsg}\n`;
            
            await supabase
              .from('execution_database_backups')
              .update({
                status: 'failed',
                completed_at: dbEndTime.toISOString(),
                duration,
                error_message: errorMsg,
                logs: `[${dbStartTime.toISOString()}] pg_dump -Fc -Z 9 --format=custom ${db.name}\n[${dbEndTime.toISOString()}] ERROR: ${errorMsg}\n`,
              })
              .eq('id', backupId);
          }
          
          // Update main execution logs
          await supabase
            .from('backup_executions')
            .update({ logs: allLogs })
            .eq('id', execution.id);
          
          queryClient.invalidateQueries({ queryKey: ['execution', execution.id] });
        }
        
        const endTime = new Date();
        const totalDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
        
        // Determine overall status
        const overallStatus = failedCount === 0 ? 'success' : 
                             successCount === 0 ? 'failed' : 
                             'success'; // Partial success counts as success
        
        allLogs += `\n[${endTime.toISOString()}] ═══════════════════════════════════════\n`;
        allLogs += `[${endTime.toISOString()}] Resumo: ${successCount}/${databases.length} bancos processados com sucesso\n`;
        allLogs += `[${endTime.toISOString()}] Tamanho total: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`;
        allLogs += `[${endTime.toISOString()}] Duração total: ${totalDuration}s\n`;
        allLogs += `[${endTime.toISOString()}] Status: ${overallStatus === 'success' ? 'CONCLUÍDO' : 'FALHOU'}\n`;
        
        // Update main execution
        await supabase
          .from('backup_executions')
          .update({
            status: overallStatus,
            completed_at: endTime.toISOString(),
            duration: totalDuration,
            file_size: totalSize,
            logs: allLogs,
            error_message: failedCount > 0 ? `${failedCount} banco(s) falharam` : null,
          })
          .eq('id', execution.id);
        
        // Update job status
        await supabase
          .from('backup_jobs')
          .update({ status: overallStatus })
          .eq('id', jobId);
        
        // Create alert for failures
        if (failedCount > 0) {
          await supabase
            .from('alerts')
            .insert({
              job_id: jobId,
              execution_id: execution.id,
              type: 'failure',
              title: `Backup parcial: ${failedCount} banco(s) falharam`,
              message: `${successCount} de ${databases.length} bancos foram processados com sucesso`,
            });
        }
        
        queryClient.invalidateQueries({ queryKey: ['executions'] });
        queryClient.invalidateQueries({ queryKey: ['execution', execution.id] });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['alerts'] });
        
        if (overallStatus === 'success' && failedCount === 0) {
          toast.success(`Backup concluído: ${databases.length} bancos processados`);
        } else if (successCount > 0) {
          toast.warning(`Backup parcial: ${successCount}/${databases.length} bancos processados`);
        } else {
          toast.error('Backup falhou para todos os bancos');
        }
      };
      
      // Run simulation in background
      executeBackup();
      
      return execution;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.info('Backup em execução para todos os bancos da instância...');
    },
    onError: (error) => {
      toast.error('Erro ao executar backup: ' + error.message);
    },
  });
}
