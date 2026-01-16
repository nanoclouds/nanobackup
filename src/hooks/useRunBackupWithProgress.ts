import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { BackupProgress } from '@/contexts/BackupProgressContext';
import { useBackendMode } from '@/contexts/BackendModeContext';
interface DiscoveredDatabase {
  name: string;
  size: string;
}

interface TableInfo {
  name: string;
  rows: number;
  index: number;
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
  const { isSelfHosted, getApiBaseUrl } = useBackendMode();
  
  return useMutation({
    mutationFn: async (params: RunBackupParams) => {
      const { jobId, parentExecutionId, retryCount = 0, selectedDatabases, dryRun = false } = params;
      const startTime = new Date();
      
      // ========= SELF-HOSTED MODE =========
      if (isSelfHosted) {
        return await executeSelfHostedBackup({
          jobId,
          selectedDatabases,
          dryRun,
          startTime,
          retryCount,
          parentExecutionId,
          apiBaseUrl: getApiBaseUrl(),
          onProgress,
          checkCancelled,
          queryClient,
        });
      }
      
      // Get job details - include SSH fields
      const { data: job, error: jobError } = await supabase
        .from('backup_jobs')
        .select(`
          id, name, format, compression, max_retries, retry_delay_minutes,
          postgres_instances (id, name, host, discovered_databases, ssh_enabled, ssh_host, ssh_port, ssh_username),
          ftp_destinations (id, name, protocol, host, port, base_directory, username)
        `)
        .eq('id', jobId)
        .single();
      
      if (jobError) throw jobError;
      
      // Check if SSH backup is enabled
      const sshEnabled = job.postgres_instances?.ssh_enabled === true;
      
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
          allLogs += `[${startTime.toISOString()}] Modo Dry Run: arquivos serão gerados mas NÃO enviados ao destino\n`;
        }

        // ========= SSH BACKUP MODE =========
        if (sshEnabled && !dryRun) {
          allLogs += `[${new Date().toISOString()}] Usando backup via SSH (pg_dump nativo)\n`;
          allLogs += `[${new Date().toISOString()}] Servidor SSH: ${job.postgres_instances?.ssh_host}:${job.postgres_instances?.ssh_port || 22}\n`;
          
          onProgress({
            executionId: execution.id,
            jobName: job.name,
            databaseName: databases[0]?.name || 'Unknown',
            currentChunk: 0,
            totalChunks: 1,
            currentDatabase: 0,
            totalDatabases: databases.length,
            phase: 'generating',
            message: 'Iniciando backup via SSH (pg_dump nativo)...',
            startedAt: startTime,
          });

          // Call the SSH backup edge function
          const { data: sshResult, error: sshError } = await supabase.functions.invoke('ssh-backup', {
            body: { 
              jobId, 
              executionId: execution.id,
              databases: databases.map(db => db.name)
            },
          });

          if (sshError) {
            throw new Error(`SSH backup failed: ${sshError.message}`);
          }

          if (!sshResult.success) {
            throw new Error(`SSH backup failed: ${sshResult.message}`);
          }

          // SSH backup was successful
          onProgress({
            executionId: execution.id,
            jobName: job.name,
            databaseName: databases[databases.length - 1]?.name || 'Unknown',
            currentChunk: 1,
            totalChunks: 1,
            currentDatabase: databases.length,
            totalDatabases: databases.length,
            phase: 'done',
            message: 'Backup SSH concluído com sucesso!',
            startedAt: startTime,
          });

          return {
            status: sshResult.status as 'success' | 'failed',
            fileSize: sshResult.fileSize,
            duration: sshResult.duration,
            logs: sshResult.logs?.join('\n') || allLogs,
          };
        }

        // ========= ORIGINAL BACKUP MODE (JavaScript-based) =========
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
              message: 'Obtendo lista de tabelas...',
              startedAt: startTime,
            });
            
            // Check for cancellation before metadata
            if (checkCancelled && checkCancelled()) {
              throw new Error('Cancelado pelo usuário');
            }
            
            // Get metadata (list of tables)
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
            
            const tables: TableInfo[] = metadata.metadata?.tables || [];
            const totalTables = tables.length;
            const totalRowsInDb = metadata.metadata?.totalRows || 0;
            const sequencesCount = metadata.metadata?.sequences || 0;
            
            dbLogs += `[${new Date().toISOString()}] ${totalTables} tabelas, ${totalRowsInDb} registros, ${sequencesCount} sequences\n`;
            dbLogs += `[${new Date().toISOString()}] ⚙️ Modo: 1 tabela por vez (dados completos)\n`;
            
            // ===== ACCUMULATE ALL CONTENT =====
            const allContentParts: string[] = [];
            let totalRowsProcessed = 0;
            
            // Helper function to decode base64 content safely (handles large content in chunks)
            const decodeBase64Content = (base64: string): string => {
              // Decode base64 in chunks to avoid memory issues
              const CHUNK_SIZE = 65536; // 64KB chunks
              const binaryString = atob(base64);
              const totalLength = binaryString.length;
              const bytes = new Uint8Array(totalLength);
              
              // Process in chunks to avoid call stack issues
              for (let offset = 0; offset < totalLength; offset += CHUNK_SIZE) {
                const end = Math.min(offset + CHUNK_SIZE, totalLength);
                for (let i = offset; i < end; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
              }
              
              return new TextDecoder('utf-8').decode(bytes);
            };
            
            // ===== GENERATE HEADER =====
            onProgress({
              executionId: execution.id,
              jobName: job.name,
              databaseName: db.name,
              currentChunk: 0,
              totalChunks: totalTables + 2, // +2 for header and footer
              currentDatabase: i + 1,
              totalDatabases: databases.length,
              phase: 'generating',
              message: 'Gerando cabeçalho...',
              startedAt: startTime,
            });
            
            const { data: headerResult, error: headerError } = await supabase.functions.invoke('generate-backup', {
              body: {
                instanceId: job.postgres_instances?.id,
                databaseName: db.name,
                tableIndex: -1, // Header
              }
            });
            
            if (headerError || !headerResult?.success) {
              throw new Error(`Header falhou: ${headerError?.message || headerResult?.message}`);
            }
            
            // Decode base64 header
            allContentParts.push(decodeBase64Content(headerResult.contentBase64));
            dbLogs += `[${new Date().toISOString()}] ✓ Header gerado\n`;
            
            // ===== PROCESS EACH TABLE =====
            for (let tableIdx = 0; tableIdx < tables.length; tableIdx++) {
              // Check for cancellation
              if (checkCancelled && checkCancelled()) {
                throw new Error('Cancelado pelo usuário');
              }
              
              const table = tables[tableIdx];
              
              // Update progress with table name
              onProgress({
                executionId: execution.id,
                jobName: job.name,
                databaseName: db.name,
                currentChunk: tableIdx + 1,
                totalChunks: totalTables,
                currentDatabase: i + 1,
                totalDatabases: databases.length,
                phase: 'generating',
                message: `${table.name} (${tableIdx + 1}/${totalTables})`,
                startedAt: startTime,
              });
              
              // Generate backup for this table
              const { data: tableResult, error: tableError } = await supabase.functions.invoke('generate-backup', {
                body: {
                  instanceId: job.postgres_instances?.id,
                  databaseName: db.name,
                  tableName: table.name,
                  tableIndex: tableIdx,
                }
              });
              
              if (tableError || !tableResult?.success) {
                throw new Error(`Tabela ${table.name} falhou: ${tableError?.message || tableResult?.message}`);
              }
              
              // Decode base64 table content
              allContentParts.push(decodeBase64Content(tableResult.contentBase64));
              totalRowsProcessed += tableResult.stats?.rowCount || 0;
              
              const tableSize = tableResult.stats?.size || 0;
              const tableRows = tableResult.stats?.rowCount || 0;
              dbLogs += `[${new Date().toISOString()}] ✓ ${table.name}: ${tableRows} registros, ${(tableSize / 1024).toFixed(1)} KB\n`;
            }
            
            // ===== GENERATE FOOTER =====
            onProgress({
              executionId: execution.id,
              jobName: job.name,
              databaseName: db.name,
              currentChunk: totalTables,
              totalChunks: totalTables,
              currentDatabase: i + 1,
              totalDatabases: databases.length,
              phase: 'generating',
              message: 'Finalizando...',
              startedAt: startTime,
            });
            
            const { data: footerResult, error: footerError } = await supabase.functions.invoke('generate-backup', {
              body: {
                instanceId: job.postgres_instances?.id,
                databaseName: db.name,
                tableIndex: -2, // Footer
              }
            });
            
            if (footerError || !footerResult?.success) {
              throw new Error(`Footer falhou: ${footerError?.message || footerResult?.message}`);
            }
            
            // Decode base64 footer
            allContentParts.push(decodeBase64Content(footerResult.contentBase64));
            dbLogs += `[${new Date().toISOString()}] ✓ Footer gerado (${sequencesCount} sequences)\n`;
            
            // ===== JOIN ALL CONTENT =====
            const fullBackupContent = allContentParts.join('');
            const totalBytes = new TextEncoder().encode(fullBackupContent).length;
            
            dbLogs += `[${new Date().toISOString()}] ✓ Backup completo: ${totalRowsProcessed} registros, ${totalTables} tabelas, ${(totalBytes / 1024 / 1024).toFixed(2)} MB\n`;
            
            // Calculate SHA256 checksum
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
              fileSize = totalBytes;
            } else {
              // ===== UPLOAD COMPLETE FILE =====
              if (destination) {
                onProgress({
                  executionId: execution.id,
                  jobName: job.name,
                  databaseName: db.name,
                  currentChunk: totalTables,
                  totalChunks: totalTables,
                  currentDatabase: i + 1,
                  totalDatabases: databases.length,
                  phase: 'uploading',
                  message: `Enviando ${(totalBytes / 1024 / 1024).toFixed(2)} MB...`,
                  startedAt: startTime,
                });
                
                const uploadFileName = fileName.replace('.gz', '').replace('.zst', '');
                const uploadPath = ftpPath.replace('.gz', '').replace('.zst', '');
                
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
                dbLogs += `[${new Date().toISOString()}] ✓ Upload: ${(remoteSize / 1024 / 1024).toFixed(2)} MB\n`;
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
                  currentChunk: totalTables,
                  totalChunks: totalTables,
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
                  dbLogs += `[${new Date().toISOString()}] ✓ Compactado: ${(compressResult.originalSize / 1024).toFixed(2)} KB → ${(fileSize / 1024).toFixed(2)} KB\n`;
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
            allLogs += `[${dbEndTime.toISOString()}] ✓ ${db.name}: ${totalTables} tabelas, ${(fileSize / 1024).toFixed(2)} KB em ${duration}s\n`;
            
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

// ========= SELF-HOSTED BACKUP EXECUTION =========
interface SelfHostedBackupParams {
  jobId: string;
  selectedDatabases?: string[];
  dryRun: boolean;
  startTime: Date;
  retryCount: number;
  parentExecutionId?: string;
  apiBaseUrl: string;
  onProgress: ProgressCallback;
  checkCancelled?: CancelCheckCallback;
  queryClient: ReturnType<typeof useQueryClient>;
}

async function executeSelfHostedBackup(params: SelfHostedBackupParams) {
  const {
    jobId,
    selectedDatabases,
    dryRun,
    startTime,
    retryCount,
    parentExecutionId,
    apiBaseUrl,
    onProgress,
    checkCancelled,
    queryClient,
  } = params;

  // Get job details from Supabase (still need this for metadata)
  const { data: job, error: jobError } = await supabase
    .from('backup_jobs')
    .select(`
      id, name, format, compression,
      postgres_instances (id, name, host, port, database, username, password, ssl_enabled, discovered_databases),
      ftp_destinations (id, name, protocol, host, port, base_directory, username, password, ssh_key)
    `)
    .eq('id', jobId)
    .single();
  
  if (jobError) throw jobError;
  
  const instance = job.postgres_instances;
  const destination = job.ftp_destinations;
  
  // Get databases
  const rawDbs = instance?.discovered_databases;
  const discoveredDbs: { name: string; size: string }[] = Array.isArray(rawDbs) 
    ? (rawDbs as unknown as { name: string; size: string }[])
    : [];
  
  let databases = discoveredDbs.length > 0 
    ? discoveredDbs.map(db => db.name)
    : ['postgres'];
  
  if (selectedDatabases && selectedDatabases.length > 0) {
    databases = databases.filter(db => selectedDatabases.includes(db));
  }
  
  // Create execution record
  const logPrefix = retryCount > 0 ? `[RETRY ${retryCount}] ` : '';
  
  const { data: execution, error: execError } = await supabase
    .from('backup_executions')
    .insert({
      job_id: jobId,
      status: 'running',
      started_at: startTime.toISOString(),
      retry_count: retryCount,
      parent_execution_id: parentExecutionId || null,
      logs: `[${startTime.toISOString()}] ${logPrefix}[SELF-HOSTED] Iniciando backup via API self-hosted...\n`,
    })
    .select()
    .single();
  
  if (execError) throw execError;
  
  // Update job status
  await supabase
    .from('backup_jobs')
    .update({ status: 'running', last_run: startTime.toISOString() })
    .eq('id', jobId);

  // Initial progress
  onProgress({
    executionId: execution.id,
    jobName: job.name,
    databaseName: databases[0] || 'Unknown',
    currentChunk: 0,
    totalChunks: databases.length,
    currentDatabase: 0,
    totalDatabases: databases.length,
    phase: 'generating',
    message: '[SELF-HOSTED] Iniciando backup...',
    startedAt: startTime,
  });

  try {
    // Call self-hosted API to start backup
    const response = await fetch(`${apiBaseUrl}/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: {
          host: instance?.host,
          port: instance?.port || 5432,
          username: instance?.username,
          password: instance?.password,
          database: instance?.database,
          sslEnabled: instance?.ssl_enabled,
        },
        destination: {
          protocol: destination?.protocol || 'sftp',
          host: destination?.host,
          port: destination?.port || 22,
          username: destination?.username,
          password: destination?.password,
          sshKey: destination?.ssh_key,
          baseDirectory: destination?.base_directory || '/',
        },
        options: {
          databases,
          format: job.format || 'custom',
          compression: job.compression || 'gzip',
          dryRun,
        },
        executionId: execution.id,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to start backup' }));
      throw new Error(errorData.message || 'Falha ao iniciar backup self-hosted');
    }

    const { backupId } = await response.json();
    
    let allLogs = `[${startTime.toISOString()}] ${logPrefix}[SELF-HOSTED] Backup iniciado (ID: ${backupId})\n`;
    
    // Poll for status
    let completed = false;
    let lastStatus = '';
    
    while (!completed) {
      // Check for cancellation
      if (checkCancelled && checkCancelled()) {
        // Cancel the backup
        await fetch(`${apiBaseUrl}/backup/${backupId}/cancel`, { method: 'POST' });
        throw new Error('Cancelado pelo usuário');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every second
      
      const statusResponse = await fetch(`${apiBaseUrl}/backup/${backupId}`);
      if (!statusResponse.ok) {
        throw new Error('Falha ao obter status do backup');
      }
      
      const status = await statusResponse.json();
      
      // Update progress based on status
      if (status.status !== lastStatus) {
        lastStatus = status.status;
        
        let phase: BackupProgress['phase'] = 'generating';
        if (status.status === 'dumping') phase = 'generating';
        else if (status.status === 'uploading') phase = 'uploading';
        else if (status.status === 'completed') phase = 'done';
        else if (status.status === 'failed') phase = 'error';
        else if (status.status === 'cancelled') phase = 'cancelled';
        
        onProgress({
          executionId: execution.id,
          jobName: job.name,
          databaseName: status.currentDatabase || databases[0],
          currentChunk: Math.floor((status.progress || 0) / 100 * databases.length),
          totalChunks: databases.length,
          currentDatabase: Math.floor((status.progress || 0) / 100 * databases.length) + 1,
          totalDatabases: databases.length,
          phase,
          message: status.message || `[SELF-HOSTED] ${status.status}`,
          startedAt: startTime,
        });
        
        allLogs += `[${new Date().toISOString()}] ${status.message || status.status}\n`;
      }
      
      if (['completed', 'failed', 'cancelled'].includes(status.status)) {
        completed = true;
        
        const endTime = new Date();
        const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
        
        let overallStatus: 'success' | 'failed' | 'cancelled' = 'success';
        if (status.status === 'failed') overallStatus = 'failed';
        else if (status.status === 'cancelled') overallStatus = 'cancelled';
        
        const totalSize = status.result?.totalSize || 0;
        
        allLogs += `\n[${endTime.toISOString()}] ═══════════════════════════════════════\n`;
        allLogs += `[${endTime.toISOString()}] [SELF-HOSTED] Backup ${overallStatus}\n`;
        allLogs += `[${endTime.toISOString()}] Tamanho: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`;
        allLogs += `[${endTime.toISOString()}] Duração: ${duration}s\n`;
        
        // Update execution record
        await supabase
          .from('backup_executions')
          .update({
            status: overallStatus,
            completed_at: endTime.toISOString(),
            duration,
            file_size: totalSize,
            logs: allLogs,
            error_message: status.error || null,
          })
          .eq('id', execution.id);
        
        // Update job status
        await supabase
          .from('backup_jobs')
          .update({ status: overallStatus === 'cancelled' ? 'scheduled' : overallStatus })
          .eq('id', jobId);
        
        // Create database backup records
        if (status.result?.files) {
          for (const file of status.result.files) {
            await supabase
              .from('execution_database_backups')
              .insert({
                execution_id: execution.id,
                database_name: file.database,
                status: 'success',
                file_name: file.fileName,
                file_size: file.size,
                storage_path: file.ftpPath,
                checksum: file.checksum ? `sha256:${file.checksum}` : null,
                started_at: startTime.toISOString(),
                completed_at: endTime.toISOString(),
                duration,
              });
          }
        }
        
        queryClient.invalidateQueries({ queryKey: ['executions'] });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        
        // Show final progress
        onProgress({
          executionId: execution.id,
          jobName: job.name,
          databaseName: databases[databases.length - 1],
          currentChunk: databases.length,
          totalChunks: databases.length,
          currentDatabase: databases.length,
          totalDatabases: databases.length,
          phase: overallStatus === 'success' ? 'done' : overallStatus === 'failed' ? 'error' : 'cancelled',
          message: `[SELF-HOSTED] ${databases.length} banco(s) processado(s)`,
          startedAt: startTime,
        });
        
        setTimeout(() => onProgress(null), 3000);
        
        if (overallStatus === 'success') {
          toast.success(`[Self-Hosted] Backup concluído: ${databases.length} banco(s)`);
        } else if (overallStatus === 'failed') {
          toast.error(`[Self-Hosted] Backup falhou: ${status.error || 'Erro desconhecido'}`);
        } else {
          toast.warning('[Self-Hosted] Backup cancelado');
        }
      }
    }
    
    return execution;
    
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    const isCancelError = errMsg.includes('Cancelado pelo usuário');
    
    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    
    await supabase
      .from('backup_executions')
      .update({
        status: isCancelError ? 'cancelled' : 'failed',
        completed_at: endTime.toISOString(),
        duration,
        error_message: errMsg,
        logs: `[${endTime.toISOString()}] [SELF-HOSTED] ${isCancelError ? 'Cancelado' : 'Erro'}: ${errMsg}\n`,
      })
      .eq('id', execution.id);
    
    await supabase
      .from('backup_jobs')
      .update({ status: isCancelError ? 'scheduled' : 'failed' })
      .eq('id', jobId);
    
    queryClient.invalidateQueries({ queryKey: ['executions'] });
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    
    onProgress({
      executionId: execution.id,
      jobName: job.name,
      databaseName: databases[0] || 'Unknown',
      currentChunk: 0,
      totalChunks: 0,
      currentDatabase: 0,
      totalDatabases: databases.length,
      phase: isCancelError ? 'cancelled' : 'error',
      message: errMsg,
      startedAt: startTime,
    });
    
    setTimeout(() => onProgress(null), 3000);
    
    if (isCancelError) {
      toast.warning('[Self-Hosted] Backup cancelado');
    } else {
      toast.error(`[Self-Hosted] Erro: ${errMsg}`);
    }
    
    return execution;
  }
}
