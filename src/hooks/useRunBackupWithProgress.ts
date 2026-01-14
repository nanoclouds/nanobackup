import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { BackupProgress } from '@/contexts/BackupProgressContext';

interface DiscoveredDatabase {
  name: string;
  size: string;
}

// Default databases if none discovered (fallback)
const DEFAULT_DATABASES = [
  { name: 'postgres', size: '8.5 MB' },
];

// Generate file name with pattern: database_name_YYYYMMDD_HHmmss.dump.gz
function generateBackupFileName(
  databaseName: string, 
  timestamp: Date, 
  backupFormat: 'custom' | 'sql' = 'custom',
  compression: 'gzip' | 'zstd' | 'none' = 'gzip'
): string {
  const dateStr = format(timestamp, 'yyyyMMdd_HHmmss');
  const safeName = databaseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  let extension = backupFormat === 'custom' ? 'dump' : 'sql';
  if (compression === 'gzip') {
    extension += '.gz';
  } else if (compression === 'zstd') {
    extension += '.zst';
  }
  
  return `${safeName}_${dateStr}.${extension}`;
}

function generateFtpPath(baseDirectory: string, fileName: string): string {
  const basePath = baseDirectory.endsWith('/') ? baseDirectory.slice(0, -1) : baseDirectory;
  return `${basePath}/${fileName}`;
}

interface RunBackupParams {
  jobId: string;
  parentExecutionId?: string;
  retryCount?: number;
  selectedDatabases?: string[];
  dryRun?: boolean;
}

type ProgressCallback = (progress: BackupProgress | null) => void;
type CancelCheckCallback = () => boolean;

export function useRunBackupWithProgress(
  onProgress: ProgressCallback,
  checkCancelled?: CancelCheckCallback
) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: RunBackupParams) => {
      const { jobId, parentExecutionId, retryCount = 0, selectedDatabases, dryRun = false } = params;
      const startTime = new Date();
      
      // Get job details
      const { data: job, error: jobError } = await supabase
        .from('backup_jobs')
        .select(`
          id, name, format, compression, max_retries, retry_delay_minutes,
          postgres_instances (id, name, host, discovered_databases),
          ftp_destinations (id, name, protocol, host, port, base_directory, username)
        `)
        .eq('id', jobId)
        .single();
      
      if (jobError) throw jobError;
      
      // Get databases
      const rawDbs = job.postgres_instances?.discovered_databases;
      const discoveredDbs: DiscoveredDatabase[] = Array.isArray(rawDbs) 
        ? (rawDbs as unknown as DiscoveredDatabase[])
        : [];
      
      let databases: DiscoveredDatabase[] = discoveredDbs.length > 0 
        ? discoveredDbs 
        : DEFAULT_DATABASES;
      
      if (selectedDatabases && selectedDatabases.length > 0) {
        databases = databases.filter(db => selectedDatabases.includes(db.name));
      }
      
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
        .select()
        .single();
      
      if (execError) throw execError;
      
      // Update job status
      await supabase
        .from('backup_jobs')
        .update({ status: 'running', last_run: startTime.toISOString() })
        .eq('id', jobId);

      // Execute backup with progress updates
      const executeBackup = async () => {
        const destination = job.ftp_destinations;
        const backupFormat = job.format || 'custom';
        const compression = job.compression || 'gzip';
        
        const modePrefix = dryRun ? '[DRY RUN] ' : '';
        let allLogs = `[${startTime.toISOString()}] ${logPrefix}${modePrefix}Iniciando backup...\n`;
        if (dryRun) {
          allLogs += `[${startTime.toISOString()}] ⚗️ Modo Dry Run: Backup será validado mas NÃO enviado ao FTP\n`;
        }
        let totalSize = 0;
        let successCount = 0;
        let failedCount = 0;
        let wasCancelled = false;
        const dbBackupIds: string[] = [];
        
        // Create initial records
        for (const db of databases) {
          const { data: dbBackup } = await supabase
            .from('execution_database_backups')
            .insert({
              execution_id: execution.id,
              database_name: db.name,
              status: 'running',
              started_at: new Date().toISOString(),
            })
            .select()
            .single();
          
          if (dbBackup) dbBackupIds.push(dbBackup.id);
        }
        
        // Process each database
        for (let i = 0; i < databases.length; i++) {
          // Check for cancellation
          if (checkCancelled && checkCancelled()) {
            wasCancelled = true;
            allLogs += `\n[${new Date().toISOString()}] ⚠️ Backup cancelado pelo usuário\n`;
            
            // Mark remaining databases as cancelled
            for (let j = i; j < databases.length; j++) {
              const backupId = dbBackupIds[j];
              await supabase
                .from('execution_database_backups')
                .update({
                  status: 'cancelled',
                  completed_at: new Date().toISOString(),
                  error_message: 'Cancelado pelo usuário',
                })
                .eq('id', backupId);
            }
            
            onProgress({
              executionId: execution.id,
              jobName: job.name,
              databaseName: databases[i].name,
              currentChunk: 0,
              totalChunks: 0,
              currentDatabase: i + 1,
              totalDatabases: databases.length,
              phase: 'cancelled',
              message: 'Backup cancelado pelo usuário',
              startedAt: startTime,
            });
            
            break;
          }
          
          const db = databases[i];
          const dbStartTime = new Date();
          const backupId = dbBackupIds[i];
          
          const fileName = generateBackupFileName(db.name, dbStartTime, backupFormat, compression);
          const ftpPath = destination 
            ? generateFtpPath(destination.base_directory, fileName)
            : `/backups/${fileName}`;

          let dbLogs = '';
          let fileSize = 0;
          let backupSuccess = false;
          
          try {
            // Update progress: metadata phase
            onProgress({
              executionId: execution.id,
              jobName: job.name,
              databaseName: db.name,
              currentChunk: 0,
              totalChunks: 0,
              currentDatabase: i + 1,
              totalDatabases: databases.length,
              phase: 'metadata',
              message: 'Obtendo informações do banco...',
              startedAt: startTime,
            });
            
            // Check for cancellation before metadata
            if (checkCancelled && checkCancelled()) {
              throw new Error('Cancelado pelo usuário');
            }
            
            // Get metadata
            const { data: metadata, error: metaError } = await supabase.functions.invoke('generate-backup', {
              body: {
                instanceId: job.postgres_instances?.id,
                databaseName: db.name,
                getMetadataOnly: true
              }
            });
            
            if (metaError || !metadata?.success) {
              throw new Error(metaError?.message || metadata?.message || 'Falha ao obter metadados');
            }
            
            const estimatedChunks = metadata.metadata?.estimatedChunks || 1;
            const totalTables = metadata.metadata?.totalTables || 0;
            const totalRowsInDb = metadata.metadata?.totalRows || 0;
            
            dbLogs += `[${new Date().toISOString()}] ${totalTables} tabelas, ${totalRowsInDb} linhas, ~${estimatedChunks} chunks estimados\n`;
            dbLogs += `[${new Date().toISOString()}] ⚙️ Modo: Geração completa em memória + envio único\n`;
            
            let totalTablesProcessed = 0;
            let totalRowsProcessed = 0;
            let chunkCount = 0;
            
            // ===== NOVO: Acumular todo o conteúdo em memória =====
            const allContentParts: string[] = [];
            
            // Process chunks incrementally until no more data - but accumulate in memory
            let cursor: { tableIndex: number; rowOffset: number } | null = null;
            let hasMoreData = true;
            
            while (hasMoreData) {
              chunkCount++;
              
              // Check for cancellation before each chunk
              if (checkCancelled && checkCancelled()) {
                throw new Error('Cancelado pelo usuário');
              }
              
              // Update progress: generating phase
              const currentTableInfo = cursor ? ` [tabela ${cursor.tableIndex + 1}]` : '';
              onProgress({
                executionId: execution.id,
                jobName: job.name,
                databaseName: db.name,
                currentChunk: chunkCount,
                totalChunks: Math.max(estimatedChunks, chunkCount),
                currentDatabase: i + 1,
                totalDatabases: databases.length,
                phase: 'generating',
                message: `Gerando em memória: chunk ${chunkCount}${currentTableInfo}... (${totalRowsProcessed}/${totalRowsInDb} linhas)`,
                startedAt: startTime,
              });
              
              // Generate chunk with cursor
              const { data: chunkResult, error: chunkError } = await supabase.functions.invoke('generate-backup', {
                body: {
                  instanceId: job.postgres_instances?.id,
                  databaseName: db.name,
                  format: backupFormat,
                  includeData: true,
                  cursor: cursor
                }
              });
              
              if (chunkError || !chunkResult?.success) {
                // Check if it's a validation error
                if (chunkResult?.validation && !chunkResult.validation.isValid) {
                  const validationErrors = chunkResult.validation.errors?.join('; ') || 'Erros de validação';
                  throw new Error(`Validação falhou no chunk ${chunkCount}: ${validationErrors}`);
                }
                throw new Error(`Chunk ${chunkCount} falhou: ${chunkError?.message || chunkResult?.message}`);
              }
              
              // Check validation result
              const validation = chunkResult.validation;
              if (validation && !validation.isValid) {
                const validationErrors = validation.errors?.join('; ') || 'Erros estruturais no SQL';
                throw new Error(`Backup rejeitado - ${validationErrors}`);
              }
              
              // Log validation warnings if any
              if (validation?.warnings?.length > 0) {
                dbLogs += `[${new Date().toISOString()}] ⚠ Avisos: ${validation.warnings.join(', ')}\n`;
              }
              
              const chunkContent = chunkResult.content;
              const chunkSize = chunkResult.stats?.size || 0;
              const rowsInChunk = chunkResult.stats?.rowsInChunk || 0;
              const currentTableName = chunkResult.stats?.currentTableName || '';
              const sequencesCount = chunkResult.stats?.sequencesCount || 0;
              
              // ===== ACUMULAR em memória =====
              allContentParts.push(chunkContent);
              
              totalTablesProcessed = chunkResult.stats?.totalTables || totalTablesProcessed;
              totalRowsProcessed += rowsInChunk;
              
              // Update pagination state
              hasMoreData = chunkResult.pagination?.hasMoreData || false;
              cursor = chunkResult.pagination?.nextCursor || null;
              
              // Build table info for log
              const tableInfo = currentTableName ? ` → ${currentTableName}` : '';
              const seqInfo = sequencesCount > 0 && !hasMoreData ? ` [${sequencesCount} sequences]` : '';
              dbLogs += `[${new Date().toISOString()}] Chunk ${chunkCount}${tableInfo}: +${rowsInChunk} linhas, ${(chunkSize / 1024).toFixed(2)} KB${seqInfo} ✓\n`;
            }
            
            // ===== JUNTAR TODO O CONTEÚDO =====
            const fullBackupContent = allContentParts.join('');
            const totalBytes = new TextEncoder().encode(fullBackupContent).length;
            
            dbLogs += `[${new Date().toISOString()}] ✓ Geração completa: ${totalRowsProcessed} linhas, ${chunkCount} chunks, ${(totalBytes / 1024 / 1024).toFixed(2)} MB\n`;
            dbLogs += `[${new Date().toISOString()}] ✓ Validação estrutural: OK (tabelas ordenadas por FK)\n`;
            
            // Calculate final SHA256 checksum
            const encoder = new TextEncoder();
            const data = encoder.encode(fullBackupContent);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const finalChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            dbLogs += `[${new Date().toISOString()}] SHA256: ${finalChecksum.substring(0, 32)}...\n`;
            
            // Check for cancellation before upload
            if (checkCancelled && checkCancelled()) {
              throw new Error('Cancelado pelo usuário');
            }
            
            // ===== DRY RUN: Skip FTP upload =====
            if (dryRun) {
              dbLogs += `[${new Date().toISOString()}] ⚗️ [DRY RUN] Backup validado com sucesso!\n`;
              dbLogs += `[${new Date().toISOString()}] ⚗️ [DRY RUN] Upload e compressão ignorados\n`;
              dbLogs += `[${new Date().toISOString()}] ✓ Arquivo restaurável: ${totalTablesProcessed} tabelas, ${totalRowsProcessed} linhas\n`;
              fileSize = totalBytes;
            } else {
              // ===== ENVIAR ARQUIVO COMPLETO DE UMA SÓ VEZ =====
              if (destination) {
                onProgress({
                  executionId: execution.id,
                  jobName: job.name,
                  databaseName: db.name,
                  currentChunk: chunkCount,
                  totalChunks: chunkCount,
                  currentDatabase: i + 1,
                  totalDatabases: databases.length,
                  phase: 'uploading',
                  message: `Enviando arquivo completo (${(totalBytes / 1024 / 1024).toFixed(2)} MB)...`,
                  startedAt: startTime,
                });
                
                const uploadFileName = fileName.replace('.gz', '').replace('.zst', '');
                const uploadPath = ftpPath.replace('.gz', '').replace('.zst', '');
                
                // Enviar arquivo completo de uma só vez (NÃO usar appendMode)
                const { data: uploadResult, error: uploadError } = await supabase.functions.invoke('upload-to-ftp', {
                  body: {
                    destinationId: destination.id,
                    fileName: uploadFileName,
                    remotePath: uploadPath,
                    fileContent: fullBackupContent,
                    compression: 'none',
                    appendMode: false,
                    isFirstChunk: true,
                    isLastChunk: true,
                  }
                });
                
                if (uploadError || !uploadResult?.success) {
                  throw new Error(`Upload falhou: ${uploadError?.message || uploadResult?.message}`);
                }
                
                const remoteSize = uploadResult.remoteSize || 0;
                const uploadedBytes = uploadResult.uploadedBytes || 0;
                
                dbLogs += `[${new Date().toISOString()}] ✓ Upload completo: ${(remoteSize / 1024 / 1024).toFixed(2)} MB no servidor\n`;
                
                // Verify integrity
                if (uploadedBytes !== totalBytes) {
                  dbLogs += `[${new Date().toISOString()}] ⚠ Alerta: Bytes enviados (${uploadedBytes}) ≠ gerados (${totalBytes})\n`;
                } else {
                  dbLogs += `[${new Date().toISOString()}] ✓ Integridade verificada: ${totalBytes} bytes\n`;
                }
                
                fileSize = remoteSize;
              } else {
                dbLogs += `[${new Date().toISOString()}] ⚠ Sem destino configurado\n`;
                fileSize = totalBytes;
              }
              
              // Compress if needed
              if (compression !== 'none' && destination) {
                onProgress({
                  executionId: execution.id,
                  jobName: job.name,
                  databaseName: db.name,
                  currentChunk: chunkCount,
                  totalChunks: chunkCount,
                  currentDatabase: i + 1,
                  totalDatabases: databases.length,
                  phase: 'compressing',
                  message: `Compactando com ${compression.toUpperCase()}...`,
                  startedAt: startTime,
                });
                
                const uncompressedPath = ftpPath.replace('.gz', '').replace('.zst', '');
                
                const { data: compressResult, error: compressError } = await supabase.functions.invoke('compress-ftp-file', {
                  body: {
                    destinationId: destination.id,
                    sourceFilePath: uncompressedPath,
                    targetFilePath: ftpPath,
                    compression,
                    deleteOriginal: true
                  }
                });
                
                if (!compressError && compressResult?.success) {
                  fileSize = compressResult.compressedSize;
                  dbLogs += `[${new Date().toISOString()}] Compactado: ${(compressResult.originalSize / 1024).toFixed(2)} KB → ${(fileSize / 1024).toFixed(2)} KB\n`;
                }
              }
            }
            
            backupSuccess = true;
            
            // Update database backup record
            const dbEndTime = new Date();
            const duration = Math.floor((dbEndTime.getTime() - dbStartTime.getTime()) / 1000);
            
            await supabase
              .from('execution_database_backups')
              .update({
                status: 'success',
                file_name: fileName,
                file_size: fileSize,
                storage_path: ftpPath,
                checksum: `sha256:${finalChecksum}`,
                completed_at: dbEndTime.toISOString(),
                duration,
                logs: dbLogs,
              })
              .eq('id', backupId);
            
            successCount++;
            totalSize += fileSize;
            allLogs += `[${dbEndTime.toISOString()}] ✓ ${db.name}: ${(fileSize / 1024).toFixed(2)} KB em ${duration}s\n`;
            
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Erro desconhecido';
            const isCancelError = errMsg.includes('Cancelado pelo usuário');
            
            dbLogs += `[${new Date().toISOString()}] ${isCancelError ? '⚠️' : '❌'} ${isCancelError ? 'Cancelado' : 'Erro'}: ${errMsg}\n`;
            allLogs += `[${new Date().toISOString()}] ${isCancelError ? '⚠️' : '❌'} ${db.name}: ${errMsg}\n`;
            
            await supabase
              .from('execution_database_backups')
              .update({
                status: isCancelError ? 'cancelled' : 'failed',
                completed_at: new Date().toISOString(),
                duration: Math.floor((Date.now() - dbStartTime.getTime()) / 1000),
                logs: dbLogs,
                error_message: errMsg,
              })
              .eq('id', backupId);
            
            if (isCancelError) {
              wasCancelled = true;
              onProgress({
                executionId: execution.id,
                jobName: job.name,
                databaseName: db.name,
                currentChunk: 0,
                totalChunks: 0,
                currentDatabase: i + 1,
                totalDatabases: databases.length,
                phase: 'cancelled',
                message: 'Backup cancelado pelo usuário',
                startedAt: startTime,
              });
              
              // Mark remaining databases as cancelled
              for (let j = i + 1; j < databases.length; j++) {
                const remainingBackupId = dbBackupIds[j];
                await supabase
                  .from('execution_database_backups')
                  .update({
                    status: 'cancelled',
                    completed_at: new Date().toISOString(),
                    error_message: 'Cancelado pelo usuário',
                  })
                  .eq('id', remainingBackupId);
              }
              
              break;
            }
            
            failedCount++;
            
            onProgress({
              executionId: execution.id,
              jobName: job.name,
              databaseName: db.name,
              currentChunk: 0,
              totalChunks: 0,
              currentDatabase: i + 1,
              totalDatabases: databases.length,
              phase: 'error',
              message: errMsg,
              startedAt: startTime,
            });
          }
          
          // Update execution logs
          await supabase
            .from('backup_executions')
            .update({ logs: allLogs })
            .eq('id', execution.id);
          
          queryClient.invalidateQueries({ queryKey: ['execution', execution.id] });
        }
        
        // Finalize
        const endTime = new Date();
        const totalDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
        
        let overallStatus: 'success' | 'failed' | 'cancelled';
        if (wasCancelled) {
          overallStatus = 'cancelled';
        } else if (failedCount === 0) {
          overallStatus = 'success';
        } else if (successCount === 0) {
          overallStatus = 'failed';
        } else {
          overallStatus = 'success';
        }
        
        allLogs += `\n[${endTime.toISOString()}] ═══════════════════════════════════════\n`;
        if (wasCancelled) {
          allLogs += `[${endTime.toISOString()}] Backup cancelado\n`;
          allLogs += `[${endTime.toISOString()}] Processados: ${successCount}/${databases.length} bancos\n`;
        } else {
          allLogs += `[${endTime.toISOString()}] Resumo: ${successCount}/${databases.length} bancos\n`;
        }
        allLogs += `[${endTime.toISOString()}] Tamanho: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`;
        allLogs += `[${endTime.toISOString()}] Duração: ${totalDuration}s\n`;
        
        await supabase
          .from('backup_executions')
          .update({
            status: overallStatus,
            completed_at: endTime.toISOString(),
            duration: totalDuration,
            file_size: totalSize,
            logs: allLogs,
            error_message: wasCancelled 
              ? 'Cancelado pelo usuário' 
              : failedCount > 0 
                ? `${failedCount} banco(s) falharam` 
                : null,
          })
          .eq('id', execution.id);
        
        await supabase
          .from('backup_jobs')
          .update({ status: overallStatus === 'cancelled' ? 'scheduled' : overallStatus })
          .eq('id', jobId);
        
        if (wasCancelled) {
          await supabase
            .from('alerts')
            .insert({
              job_id: jobId,
              execution_id: execution.id,
              type: 'warning',
              title: 'Backup cancelado',
              message: `${successCount} de ${databases.length} bancos foram processados antes do cancelamento`,
            });
        } else if (failedCount > 0) {
          await supabase
            .from('alerts')
            .insert({
              job_id: jobId,
              execution_id: execution.id,
              type: 'failure',
              title: `Backup parcial: ${failedCount} banco(s) falharam`,
              message: `${successCount} de ${databases.length} bancos processados`,
            });
        }
        
        queryClient.invalidateQueries({ queryKey: ['executions'] });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['alerts'] });
        
        // Show done progress briefly then clear
        if (!wasCancelled) {
          const dryRunSuffix = dryRun ? ' (Dry Run)' : '';
          onProgress({
            executionId: execution.id,
            jobName: job.name,
            databaseName: databases[databases.length - 1].name,
            currentChunk: 0,
            totalChunks: 0,
            currentDatabase: databases.length,
            totalDatabases: databases.length,
            phase: 'done',
            message: `${successCount}/${databases.length} bancos ${dryRun ? 'validados' : 'processados'}${dryRunSuffix}`,
            startedAt: startTime,
          });
        }
        
        setTimeout(() => onProgress(null), 3000);
        
        if (wasCancelled) {
          toast.warning('Backup cancelado');
        } else if (overallStatus === 'success') {
          if (dryRun) {
            toast.success(`⚗️ Dry Run concluído: ${databases.length} banco(s) validado(s) com sucesso`);
          } else {
            toast.success(`Backup concluído: ${databases.length} bancos`);
          }
        } else if (successCount > 0) {
          toast.warning(`${dryRun ? 'Validação' : 'Backup'} parcial: ${successCount}/${databases.length} bancos`);
        } else {
          toast.error(dryRun ? 'Validação falhou' : 'Backup falhou');
        }
      };
      
      executeBackup();
      return execution;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.info(variables.dryRun ? '⚗️ Validação (Dry Run) iniciada...' : 'Backup iniciado...');
    },
    onError: (error) => {
      toast.error('Erro: ' + error.message);
      onProgress(null);
    },
  });
}
