import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useExecutionDetails, DatabaseBackup } from '@/hooks/useExecutions';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { downloadBackupFromFtp, triggerBlobDownload, formatBytesReadable } from '@/lib/backupDownload';
import { 
  ArrowLeft,
  Calendar,
  Clock,
  HardDrive,
  Database,
  Server,
  FileText,
  CheckCircle2,
  XCircle,
  Play,
  Loader2,
  AlertCircle,
  Copy,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileDown,
  RotateCcw,
  Timer
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatBytes(bytes?: number | null): string {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return '-';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: 'start' | 'info' | 'success' | 'error' | 'warning' | 'db-success' | 'db-failed';
  message: string;
  database?: string;
}

function parseLogsToTimeline(logs?: string | null): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  
  if (logs) {
    const lines = logs.split('\n');
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      
      const match = line.match(/\[([^\]]+)\]\s*(.*)/);
      if (match) {
        const timestamp = new Date(match[1]);
        const message = match[2];
        
        let type: TimelineEvent['type'] = 'info';
        if (message.includes('✓')) {
          type = 'db-success';
        } else if (message.includes('✗')) {
          type = 'db-failed';
        } else if (message.toLowerCase().includes('error') || message.toLowerCase().includes('falhou')) {
          type = 'error';
        } else if (message.toLowerCase().includes('concluído') || message.toLowerCase().includes('success')) {
          type = 'success';
        } else if (message.toLowerCase().includes('iniciando')) {
          type = 'start';
        }
        
        events.push({
          id: `log-${index}`,
          timestamp,
          type,
          message,
        });
      }
    });
  }
  
  return events;
}

function TimelineEventIcon({ type }: { type: TimelineEvent['type'] }) {
  switch (type) {
    case 'start':
      return <Play className="h-4 w-4 text-primary" />;
    case 'success':
    case 'db-success':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'error':
    case 'db-failed':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function DatabaseBackupRow({ backup, destinationId }: { backup: DatabaseBackup; destinationId?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  const handleDownload = async () => {
    if (!backup.storage_path || backup.status !== 'success' || !destinationId) {
      toast.error('Não é possível baixar este backup');
      return;
    }
    
    setDownloading(true);
    try {
      toast.info('Baixando backup do FTP...');
      
      const result = await downloadBackupFromFtp(
        destinationId,
        backup.storage_path,
        true // decompress if gzipped
      );
      
      if (!result.success) {
        throw new Error(result.message || 'Falha no download');
      }
      
      // Determine file name (remove .gz if decompressed)
      let fileName = backup.file_name || 'backup.sql';
      if (result.wasDecompressed && fileName.endsWith('.gz')) {
        fileName = fileName.slice(0, -3);
      }
      
      // Trigger browser download
      triggerBlobDownload(
        result.content!,
        fileName,
        result.encoding === 'base64'
      );
      
      const sizeInfo = result.wasDecompressed 
        ? `${formatBytesReadable(result.originalSize || 0)} → ${formatBytesReadable(result.size || 0)} (descomprimido)`
        : formatBytesReadable(result.size || 0);
      
      toast.success(`Download concluído: ${fileName}`, {
        description: `Tamanho: ${sizeInfo} | Tempo: ${result.duration}ms`
      });
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Erro ao baixar backup', {
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    } finally {
      setDownloading(false);
    }
  };
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <TableRow className="border-border">
        <TableCell>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{backup.database_name}</span>
          </div>
        </TableCell>
        <TableCell>
          <code className="text-xs bg-muted px-2 py-1 rounded">
            {backup.file_name || '-'}
          </code>
        </TableCell>
        <TableCell>{formatBytes(backup.file_size)}</TableCell>
        <TableCell>{formatDuration(backup.duration)}</TableCell>
        <TableCell>
          <StatusBadge status={backup.status} size="sm" />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {backup.status === 'success' && backup.file_name && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleDownload}
                disabled={downloading}
                title="Baixar backup"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
              </Button>
            )}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </TableCell>
      </TableRow>
      <CollapsibleContent asChild>
        <TableRow className="border-border bg-muted/30">
          <TableCell colSpan={6} className="p-4">
            <div className="space-y-3">
              {backup.storage_path && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Caminho FTP:</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded break-all font-mono">
                    {backup.storage_path}
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(backup.storage_path!);
                      toast.success('Caminho copiado!');
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {backup.error_message && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-sm font-medium text-destructive">Erro:</p>
                  <p className="text-sm text-destructive/80">{backup.error_message}</p>
                </div>
              )}
              
              {backup.checksum && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Checksum:</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                    {backup.checksum}
                  </code>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6"
                    onClick={() => {
                      navigator.clipboard.writeText(backup.checksum!);
                      toast.success('Checksum copiado!');
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              {backup.logs && (
                <div className="rounded-lg border border-border bg-background">
                  <div className="px-3 py-2 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground">Logs</span>
                  </div>
                  <pre className="p-3 font-mono text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-auto">
                    {backup.logs}
                  </pre>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ExecutionDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: execution, isLoading, refetch } = useExecutionDetails(id || '');
  
  const timeline = useMemo(() => {
    if (!execution) return [];
    return parseLogsToTimeline(execution.logs);
  }, [execution]);
  
  const databaseBackups = useMemo(() => {
    return execution?.execution_database_backups || [];
  }, [execution]);
  
  const backupStats = useMemo(() => {
    const total = databaseBackups.length;
    const success = databaseBackups.filter(b => b.status === 'success').length;
    const failed = databaseBackups.filter(b => b.status === 'failed').length;
    const running = databaseBackups.filter(b => b.status === 'running').length;
    return { total, success, failed, running };
  }, [databaseBackups]);
  
  if (isLoading) {
    return (
      <MainLayout title="Carregando..." subtitle="">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }
  
  if (!execution) {
    return (
      <MainLayout title="Execução não encontrada" subtitle="">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Execução não encontrada</h2>
          <p className="mt-2 text-muted-foreground">A execução solicitada não existe ou foi removida.</p>
          <Button className="mt-6" onClick={() => navigate('/executions')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para Execuções
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      title="Detalhes da Execução" 
      subtitle={`${execution.backup_jobs?.name || 'Job desconhecido'}`}
    >
      {/* Header Actions */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate('/executions')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Status and Summary */}
      <Card className="mb-6 border-border bg-card">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                {execution.status === 'running' ? (
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                ) : execution.status === 'success' ? (
                  <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                ) : execution.status === 'failed' ? (
                  <XCircle className="h-7 w-7 text-destructive" />
                ) : (
                  <Clock className="h-7 w-7 text-primary" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-foreground">
                    {execution.backup_jobs?.name || 'Job desconhecido'}
                  </h2>
                  <StatusBadge status={execution.status} />
                  {execution.retry_count > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                      <RotateCcw className="h-3 w-3" />
                      Tentativa {execution.retry_count + 1}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Iniciado {formatDistanceToNow(new Date(execution.started_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
            
            {/* Stats Summary */}
            {backupStats.total > 0 && (
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{backupStats.total}</p>
                  <p className="text-xs text-muted-foreground">Bancos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-500">{backupStats.success}</p>
                  <p className="text-xs text-muted-foreground">Sucesso</p>
                </div>
                {backupStats.failed > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-destructive">{backupStats.failed}</p>
                    <p className="text-xs text-muted-foreground">Falhas</p>
                  </div>
                )}
                {backupStats.running > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-500">{backupStats.running}</p>
                    <p className="text-xs text-muted-foreground">Em execução</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Retry Info */}
          {execution.next_retry_at && execution.status === 'failed' && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-amber-600">
                  <Timer className="h-5 w-5" />
                  Re-tentativa Agendada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-amber-700">
                      Uma nova tentativa será executada automaticamente em{' '}
                      <span className="font-medium">
                        {formatDistanceToNow(new Date(execution.next_retry_at), { addSuffix: false, locale: ptBR })}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Agendado para: {format(new Date(execution.next_retry_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  {execution.backup_jobs?.max_retries && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Tentativas</p>
                      <p className="text-sm font-medium text-amber-600">
                        {execution.retry_count + 1} / {execution.backup_jobs.max_retries}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Retries Exhausted Info */}
          {execution.status === 'failed' && 
           !execution.next_retry_at && 
           execution.backup_jobs?.max_retries && 
           execution.backup_jobs.max_retries > 0 &&
           execution.retry_count >= execution.backup_jobs.max_retries && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <RotateCcw className="h-5 w-5" />
                  Re-tentativas Esgotadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-destructive/80">
                  Todas as {execution.backup_jobs.max_retries} tentativas automáticas foram esgotadas.
                  Verifique os logs e execute o backup manualmente.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Error Message */}
          {execution.error_message && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <XCircle className="h-5 w-5" />
                  Mensagem de Erro
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-destructive/80">{execution.error_message}</p>
              </CardContent>
            </Card>
          )}

          {/* Database Backups Table */}
          {databaseBackups.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="h-5 w-5 text-primary" />
                    Backups por Banco de Dados
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      (Formato: pg_dump compatível com PostgreSQL 18.1)
                    </span>
                  </CardTitle>
                  {backupStats.success > 0 && execution.backup_jobs?.ftp_destinations?.id && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={async () => {
                        const destinationId = execution.backup_jobs?.ftp_destinations?.id;
                        if (!destinationId) return;
                        
                        toast.info(`Baixando ${backupStats.success} backup(s)...`);
                        
                        for (const b of databaseBackups.filter(b => b.status === 'success' && b.storage_path)) {
                          try {
                            const result = await downloadBackupFromFtp(destinationId, b.storage_path!, true);
                            if (result.success && result.content) {
                              let fileName = b.file_name || 'backup.sql';
                              if (result.wasDecompressed && fileName.endsWith('.gz')) {
                                fileName = fileName.slice(0, -3);
                              }
                              triggerBlobDownload(result.content, fileName, result.encoding === 'base64');
                            }
                          } catch (err) {
                            console.error('Download error:', err);
                          }
                        }
                        
                        toast.success('Downloads concluídos');
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Baixar Todos ({backupStats.success})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Banco</TableHead>
                      <TableHead className="text-muted-foreground">Arquivo</TableHead>
                      <TableHead className="text-muted-foreground">Tamanho</TableHead>
                      <TableHead className="text-muted-foreground">Duração</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {databaseBackups.map((backup) => (
                      <DatabaseBackupRow 
                        key={backup.id} 
                        backup={backup} 
                        destinationId={execution.backup_jobs?.ftp_destinations?.id}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-5 w-5 text-primary" />
                Timeline de Eventos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length > 0 ? (
                <ScrollArea className="h-64">
                  <div className="relative space-y-0 pr-4">
                    {timeline.map((event, index) => (
                      <div key={event.id} className="relative flex gap-4 pb-4 last:pb-0">
                        {/* Vertical line */}
                        {index < timeline.length - 1 && (
                          <div className="absolute left-[11px] top-6 h-full w-0.5 bg-border" />
                        )}
                        
                        {/* Icon */}
                        <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                          <TimelineEventIcon type={event.type} />
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 pt-0.5">
                          <p className={`text-sm font-medium ${
                            event.type === 'error' || event.type === 'db-failed' ? 'text-destructive' :
                            event.type === 'success' || event.type === 'db-success' ? 'text-emerald-500' :
                            event.type === 'warning' ? 'text-amber-500' :
                            'text-foreground'
                          }`}>
                            {event.message}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {format(event.timestamp, "dd/MM/yyyy HH:mm:ss")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
              )}
            </CardContent>
          </Card>

          {/* Logs */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" />
                Logs Completos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-t border-border bg-muted/30">
                <ScrollArea className="h-80">
                  <pre className="p-4 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                    {execution.logs || 'Nenhum log disponível.'}
                  </pre>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Metadata */}
        <div className="space-y-6">
          {/* Execution Info */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informações da Execução</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Iniciado em</p>
                  <p className="text-sm font-medium text-foreground">
                    {format(new Date(execution.started_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
              </div>
              
              {execution.completed_at && (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Concluído em</p>
                    <p className="text-sm font-medium text-foreground">
                      {format(new Date(execution.completed_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              )}
              
              <Separator />
              
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Duração Total</p>
                  <p className="text-sm font-medium text-foreground">
                    {formatDuration(execution.duration)}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <HardDrive className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tamanho Total</p>
                  <p className="text-sm font-medium text-foreground">
                    {formatBytes(execution.file_size)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Related Resources */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recursos Relacionados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                  <Database className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Instância</p>
                  <p className="text-sm font-medium text-foreground">
                    {execution.backup_jobs?.postgres_instances?.name || '-'}
                  </p>
                  {execution.backup_jobs?.postgres_instances?.host && (
                    <p className="text-xs text-muted-foreground">
                      {execution.backup_jobs.postgres_instances.host}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                  <Server className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Destino</p>
                  <p className="text-sm font-medium text-foreground">
                    {execution.backup_jobs?.ftp_destinations?.name || '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Format Info */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Formato do Backup</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comando</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">pg_dump -Fc</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Compressão</span>
                  <span className="text-foreground">gzip (nível 9)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Compatível</span>
                  <span className="text-foreground">PostgreSQL 18.1</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Padrão do arquivo</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">nome_YYYYMMDD_HHmmss.dump</code>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
