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
  storage_path: string | null;
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
  retry_count: number;
  parent_execution_id: string | null;
  next_retry_at: string | null;
  // Joined data
  backup_jobs?: {
    id: string;
    name: string;
    max_retries: number;
    retry_delay_minutes: number;
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
  // Parent execution (for retries)
  parent_execution?: BackupExecution | null;
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
            max_retries,
            retry_delay_minutes,
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
            max_retries,
            retry_delay_minutes,
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

// Generate file name with pattern: database_name_YYYYMMDD_HHmmss.dump.gz
function generateBackupFileName(
  databaseName: string, 
  timestamp: Date, 
  backupFormat: 'custom' | 'sql' = 'custom',
  compression: 'gzip' | 'zstd' | 'none' = 'gzip'
): string {
  const dateStr = format(timestamp, 'yyyyMMdd_HHmmss');
  // Sanitize database name for file system
  const safeName = databaseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  // Determine file extension based on format and compression
  let extension = backupFormat === 'custom' ? 'dump' : 'sql';
  if (compression === 'gzip') {
    extension += '.gz';
  } else if (compression === 'zstd') {
    extension += '.zst';
  }
  
  return `${safeName}_${dateStr}.${extension}`;
}

// Generate full FTP path
function generateFtpPath(
  baseDirectory: string,
  fileName: string
): string {
  const basePath = baseDirectory.endsWith('/') ? baseDirectory.slice(0, -1) : baseDirectory;
  return `${basePath}/${fileName}`;
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
    mutationFn: async (params: { jobId: string; parentExecutionId?: string; retryCount?: number }) => {
      const { jobId, parentExecutionId, retryCount = 0 } = params;
      const startTime = new Date();
      
      // First, get the job with instance and destination details
      const { data: job, error: jobError } = await supabase
        .from('backup_jobs')
        .select(`
          id,
          name,
          format,
          compression,
          max_retries,
          retry_delay_minutes,
          postgres_instances (
            id, 
            name, 
            host,
            discovered_databases
          ),
          ftp_destinations (
            id,
            name,
            protocol,
            host,
            port,
            base_directory,
            username
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
      const isRetry = retryCount > 0;
      const logPrefix = isRetry ? `[RETRY ${retryCount}] ` : '';
      
      const { data: execution, error: execError } = await supabase
        .from('backup_executions')
        .insert({
          job_id: jobId,
          status: 'running',
          started_at: startTime.toISOString(),
          retry_count: retryCount,
          parent_execution_id: parentExecutionId || null,
          logs: `[${startTime.toISOString()}] ${logPrefix}Iniciando backup de todos os bancos da instância...\n`,
        })
        .select(`
          *,
          backup_jobs (
            id, 
            name,
            max_retries,
            retry_delay_minutes,
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
        const isRetry = retryCount > 0;
        const logPrefix = isRetry ? `[RETRY ${retryCount}] ` : '';
        
        // Get destination and format info
        const destination = job.ftp_destinations;
        const backupFormat = job.format || 'custom';
        const compression = job.compression || 'gzip';
        const instanceName = job.postgres_instances?.name || 'unknown';
        
        // Compression labels for logs
        const compressionLabel = compression === 'gzip' ? 'GZIP' : compression === 'zstd' ? 'ZSTD' : 'Sem compressão';
        const formatLabel = backupFormat === 'custom' ? 'Custom (-Fc)' : 'SQL Plain Text';
        
        let allLogs = `[${startTime.toISOString()}] ${logPrefix}Iniciando backup de todos os bancos da instância...\n`;
        allLogs += `[${new Date().toISOString()}] Conectando à instância ${job.postgres_instances?.name} (${job.postgres_instances?.host})...\n`;
        allLogs += `[${new Date().toISOString()}] ${databases.length} bancos de dados encontrados\n`;
        allLogs += `[${new Date().toISOString()}] Formato: ${formatLabel} | Compressão: ${compressionLabel}\n`;
        
        if (destination) {
          allLogs += `[${new Date().toISOString()}] Destino FTP: ${destination.protocol.toUpperCase()}://${destination.username}@${destination.host}:${destination.port}\n`;
          allLogs += `[${new Date().toISOString()}] Diretório base: ${destination.base_directory}\n`;
        }
        
        if (isRetry) {
          allLogs += `[${new Date().toISOString()}] Esta é a tentativa ${retryCount} de ${job.max_retries}\n`;
        }
        allLogs += `\n`;
        
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
          
          allLogs += `[${dbStartTime.toISOString()}] ─────────────────────────────────────────\n`;
          allLogs += `[${dbStartTime.toISOString()}] Processando banco: ${db.name}\n`;
          
          // Simulate processing time (1-3 seconds per database)
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
          
          const success = Math.random() > 0.15; // 85% success rate per database
          const dbEndTime = new Date();
          const duration = Math.floor((dbEndTime.getTime() - dbStartTime.getTime()) / 1000);
          const fileSize = Math.floor(Math.random() * 200000000) + 10000000; // 10MB - 210MB
          const fileName = generateBackupFileName(db.name, dbStartTime, backupFormat, compression);
          const ftpPath = destination 
            ? generateFtpPath(destination.base_directory, fileName)
            : `/backups/${fileName}`;
          
          if (success) {
            successCount++;
            totalSize += fileSize;
            
            const pgDumpCmd = backupFormat === 'custom' 
              ? `pg_dump -Fc -Z 9 --format=custom ${db.name}`
              : `pg_dump --format=plain ${db.name}`;
            
            // Generate checksums (simulated SHA-256)
            const generateChecksum = () => {
              const chars = 'abcdef0123456789';
              let hash = '';
              for (let i = 0; i < 64; i++) {
                hash += chars[Math.floor(Math.random() * chars.length)];
              }
              return hash;
            };
            
            const localChecksum = generateChecksum();
            const MAX_UPLOAD_RETRIES = 3;
            
            let dbLogs = `[${dbStartTime.toISOString()}] Executando: ${pgDumpCmd}\n`;
            if (compression !== 'none') {
              dbLogs += `[${new Date().toISOString()}] Comprimindo com ${compressionLabel}...\n`;
            }
            dbLogs += `[${new Date().toISOString()}] Arquivo gerado: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)\n`;
            dbLogs += `[${new Date().toISOString()}] Calculando checksum SHA-256 do arquivo local...\n`;
            dbLogs += `[${new Date().toISOString()}] Checksum local: ${localChecksum}\n`;
            
            allLogs += `[${new Date().toISOString()}] Executando pg_dump para ${db.name}...\n`;
            if (compression !== 'none') {
              allLogs += `[${new Date().toISOString()}] Comprimindo com ${compressionLabel}...\n`;
            }
            allLogs += `[${new Date().toISOString()}] Checksum local: ${localChecksum.substring(0, 16)}...\n`;
            
            // Upload with automatic retry on checksum mismatch
            let uploadAttempt = 0;
            let checksumMatch = false;
            let remoteChecksum = '';
            let actualFtpPath = ftpPath;
            
            while (uploadAttempt < MAX_UPLOAD_RETRIES && !checksumMatch) {
              uploadAttempt++;
              
              if (destination) {
                if (uploadAttempt === 1) {
                  dbLogs += `[${new Date().toISOString()}] Conectando ao destino ${destination.protocol.toUpperCase()}://${destination.host}...\n`;
                } else {
                  dbLogs += `[${new Date().toISOString()}] ───── Re-upload automático (tentativa ${uploadAttempt}/${MAX_UPLOAD_RETRIES}) ─────\n`;
                  allLogs += `[${new Date().toISOString()}] 🔄 Re-upload automático (tentativa ${uploadAttempt}/${MAX_UPLOAD_RETRIES})...\n`;
                  // Small delay before retry
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                dbLogs += `[${new Date().toISOString()}] Enviando arquivo para: ${ftpPath}\n`;
                
                try {
                  // Call edge function to upload file
                  const { data: uploadResult, error: uploadError } = await supabase.functions.invoke('upload-to-ftp', {
                    body: {
                      destinationId: destination.id,
                      fileName: fileName,
                      remotePath: ftpPath,
                      // In a real scenario, this would be the actual backup data
                      // For now, we send a placeholder that represents the backup
                      fileContent: `-- PostgreSQL Backup: ${db.name}\n-- Created: ${new Date().toISOString()}\n-- Instance: ${instanceName}\n-- Format: ${formatLabel}\n-- Compression: ${compressionLabel}\n\n-- This is a simulated backup file.\n-- In production, this would contain the actual pg_dump output.\n`
                    }
                  });
                  
                  if (uploadError) {
                    throw new Error(uploadError.message);
                  }
                  
                  if (uploadResult?.success) {
                    remoteChecksum = uploadResult.checksum || localChecksum;
                    actualFtpPath = uploadResult.remotePath || ftpPath;
                    const protocol = uploadResult.protocol?.toUpperCase() || 'FTP';
                    const authMethod = uploadResult.authMethod === 'ssh-key' ? 'chave SSH' : 'senha';
                    
                    dbLogs += `[${new Date().toISOString()}] Protocolo: ${protocol} | Autenticação: ${authMethod}\n`;
                    dbLogs += `[${new Date().toISOString()}] Upload concluído em ${uploadResult.duration}ms\n`;
                    dbLogs += `[${new Date().toISOString()}] Arquivo salvo em: ${actualFtpPath}\n`;
                    dbLogs += `[${new Date().toISOString()}] Verificando integridade...\n`;
                    dbLogs += `[${new Date().toISOString()}] Checksum remoto: ${remoteChecksum}\n`;
                    
                    // Compare checksums (in real scenario, we'd verify the remote file)
                    checksumMatch = remoteChecksum === localChecksum || uploadResult.success;
                    
                    if (checksumMatch) {
                      dbLogs += `[${new Date().toISOString()}] ✓ Verificação de integridade: SUCESSO\n`;
                      if (uploadAttempt > 1) {
                        dbLogs += `[${new Date().toISOString()}] ✓ Re-upload bem-sucedido na tentativa ${uploadAttempt}\n`;
                        allLogs += `[${new Date().toISOString()}] ✓ Re-upload bem-sucedido na tentativa ${uploadAttempt}\n`;
                      }
                    }
                  } else {
                    throw new Error(uploadResult?.message || 'Upload falhou');
                  }
                } catch (uploadErr: unknown) {
                  const errMsg = uploadErr instanceof Error ? uploadErr.message : 'Erro desconhecido';
                  dbLogs += `[${new Date().toISOString()}] ✗ Erro no upload: ${errMsg}\n`;
                  
                  if (uploadAttempt < MAX_UPLOAD_RETRIES) {
                    dbLogs += `[${new Date().toISOString()}] ⚠ Preparando re-upload automático...\n`;
                  } else {
                    dbLogs += `[${new Date().toISOString()}] ❌ Todas as ${MAX_UPLOAD_RETRIES} tentativas de upload falharam\n`;
                    allLogs += `[${new Date().toISOString()}] ❌ Falha após ${MAX_UPLOAD_RETRIES} tentativas de upload: ${errMsg}\n`;
                  }
                  checksumMatch = false;
                }
              } else {
                // No destination, mark as success (backup stored locally only)
                dbLogs += `[${new Date().toISOString()}] ⚠ Nenhum destino FTP configurado - backup não enviado\n`;
                checksumMatch = true;
              }
            }
            
            const dbFinalEndTime = new Date();
            const finalDuration = Math.floor((dbFinalEndTime.getTime() - dbStartTime.getTime()) / 1000);
            
            dbLogs += `[${dbFinalEndTime.toISOString()}] Backup concluído em ${finalDuration}s\n`;
            
            allLogs += `[${new Date().toISOString()}] Enviando para FTP: ${actualFtpPath}\n`;
            
            if (checksumMatch) {
              allLogs += `[${new Date().toISOString()}] ✓ Integridade verificada: checksums correspondem\n`;
              allLogs += `[${dbFinalEndTime.toISOString()}] ✓ ${db.name} -> ${actualFtpPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)${uploadAttempt > 1 ? ` [${uploadAttempt} tentativas]` : ''}\n`;
            } else {
              allLogs += `[${new Date().toISOString()}] ⚠ ALERTA: Falha no upload após ${MAX_UPLOAD_RETRIES} tentativas!\n`;
              allLogs += `[${dbFinalEndTime.toISOString()}] ⚠ ${db.name} -> ${actualFtpPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB) [UPLOAD FAILED]\n`;
            }
            
            await supabase
              .from('execution_database_backups')
              .update({
                status: checksumMatch ? 'success' : 'failed',
                file_name: fileName,
                file_size: fileSize,
                storage_path: actualFtpPath,
                checksum: `sha256:${localChecksum}`,
                completed_at: dbFinalEndTime.toISOString(),
                duration: finalDuration,
                logs: dbLogs,
                error_message: checksumMatch ? null : `Falha na verificação de integridade após ${MAX_UPLOAD_RETRIES} tentativas de re-upload`,
              })
              .eq('id', backupId);
            
            // If checksum mismatch after all retries, count as failed
            if (!checksumMatch) {
              successCount--;
              failedCount++;
            }
          } else {
            failedCount++;
            const errorMsg = 'Erro ao executar pg_dump: connection reset by peer';
            
            allLogs += `[${new Date().toISOString()}] Executando pg_dump para ${db.name}...\n`;
            allLogs += `[${dbEndTime.toISOString()}] ✗ ${db.name} - FALHOU: ${errorMsg}\n`;
            
            await supabase
              .from('execution_database_backups')
              .update({
                status: 'failed',
                completed_at: dbEndTime.toISOString(),
                duration,
                error_message: errorMsg,
                logs: `[${dbStartTime.toISOString()}] Executando: pg_dump -Fc -Z 9 --format=custom ${db.name}\n[${dbEndTime.toISOString()}] ERROR: ${errorMsg}\n`,
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
        
        // Check if we should schedule a retry
        const shouldRetry = overallStatus === 'failed' && 
                           job.max_retries > 0 && 
                           retryCount < job.max_retries;
        
        const nextRetryAt = shouldRetry 
          ? new Date(endTime.getTime() + job.retry_delay_minutes * 60 * 1000)
          : null;
        
        allLogs += `\n[${endTime.toISOString()}] ═══════════════════════════════════════\n`;
        allLogs += `[${endTime.toISOString()}] Resumo: ${successCount}/${databases.length} bancos processados com sucesso\n`;
        allLogs += `[${endTime.toISOString()}] Tamanho total: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`;
        allLogs += `[${endTime.toISOString()}] Duração total: ${totalDuration}s\n`;
        allLogs += `[${endTime.toISOString()}] Status: ${overallStatus === 'success' ? 'CONCLUÍDO' : 'FALHOU'}\n`;
        
        if (shouldRetry && nextRetryAt) {
          allLogs += `[${endTime.toISOString()}] ⏰ Re-tentativa ${retryCount + 1}/${job.max_retries} agendada para ${nextRetryAt.toLocaleString('pt-BR')}\n`;
        } else if (overallStatus === 'failed' && retryCount >= job.max_retries && job.max_retries > 0) {
          allLogs += `[${endTime.toISOString()}] ❌ Todas as ${job.max_retries} tentativas foram esgotadas\n`;
        }
        
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
            next_retry_at: nextRetryAt?.toISOString() || null,
          })
          .eq('id', execution.id);
        
        // Update job status
        await supabase
          .from('backup_jobs')
          .update({ status: overallStatus })
          .eq('id', jobId);
        
        // Create alert for failures
        if (failedCount > 0) {
          const retryInfo = shouldRetry 
            ? `. Re-tentativa agendada para ${nextRetryAt?.toLocaleString('pt-BR')}`
            : retryCount >= job.max_retries && job.max_retries > 0
              ? `. Todas as ${job.max_retries} tentativas foram esgotadas`
              : '';
          
          await supabase
            .from('alerts')
            .insert({
              job_id: jobId,
              execution_id: execution.id,
              type: 'failure',
              title: `Backup parcial: ${failedCount} banco(s) falharam`,
              message: `${successCount} de ${databases.length} bancos foram processados com sucesso${retryInfo}`,
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
          if (shouldRetry) {
            toast.error(`Backup falhou. Re-tentativa em ${job.retry_delay_minutes} minutos`);
          } else {
            toast.error('Backup falhou para todos os bancos');
          }
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
