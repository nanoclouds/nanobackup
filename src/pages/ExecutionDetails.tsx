import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useExecutions } from '@/hooks/useExecutions';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
  RefreshCw
} from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';

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
  type: 'start' | 'info' | 'success' | 'error' | 'warning';
  message: string;
}

function parseLogsToTimeline(logs?: string | null, startedAt?: string, completedAt?: string | null, status?: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  
  // Add start event
  if (startedAt) {
    events.push({
      id: 'start',
      timestamp: new Date(startedAt),
      type: 'start',
      message: 'Backup iniciado',
    });
  }
  
  // Parse log lines
  if (logs) {
    const lines = logs.split('\n');
    lines.forEach((line, index) => {
      const match = line.match(/\[([^\]]+)\]\s*(.*)/);
      if (match) {
        const timestamp = new Date(match[1]);
        const message = match[2];
        
        let type: TimelineEvent['type'] = 'info';
        if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
          type = 'error';
        } else if (message.toLowerCase().includes('success') || message.toLowerCase().includes('completed successfully')) {
          type = 'success';
        } else if (message.toLowerCase().includes('warning')) {
          type = 'warning';
        } else if (message.toLowerCase().includes('started')) {
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
  
  // Add completion event if not already in logs
  if (completedAt && !events.some(e => e.type === 'success' || e.type === 'error')) {
    events.push({
      id: 'end',
      timestamp: new Date(completedAt),
      type: status === 'success' ? 'success' : status === 'failed' ? 'error' : 'info',
      message: status === 'success' ? 'Backup concluído com sucesso' : status === 'failed' ? 'Backup falhou' : 'Backup finalizado',
    });
  }
  
  return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function TimelineEventIcon({ type }: { type: TimelineEvent['type'] }) {
  switch (type) {
    case 'start':
      return <Play className="h-4 w-4 text-primary" />;
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-amber-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function ExecutionDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: executions, isLoading, refetch } = useExecutions();
  
  const execution = useMemo(() => {
    return executions?.find(e => e.id === id);
  }, [executions, id]);
  
  const timeline = useMemo(() => {
    if (!execution) return [];
    return parseLogsToTimeline(
      execution.logs, 
      execution.started_at, 
      execution.completed_at,
      execution.status
    );
  }, [execution]);
  
  const copyChecksum = () => {
    if (execution?.checksum) {
      navigator.clipboard.writeText(execution.checksum);
      toast.success('Checksum copiado!');
    }
  };
  
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
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Iniciado {formatDistanceToNow(new Date(execution.started_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
            
            {execution.file_name && execution.status === 'success' && (
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Baixar Backup
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
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
                <div className="relative space-y-0">
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
                          event.type === 'error' ? 'text-destructive' :
                          event.type === 'success' ? 'text-emerald-500' :
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
                  <p className="text-xs text-muted-foreground">Duração</p>
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
                  <p className="text-xs text-muted-foreground">Tamanho do Arquivo</p>
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

          {/* Checksum */}
          {execution.checksum && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Checksum</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-xs text-muted-foreground break-all">
                    {execution.checksum}
                  </code>
                  <Button variant="ghost" size="icon" onClick={copyChecksum}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* File Info */}
          {execution.file_name && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Arquivo de Backup</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="font-mono text-xs text-muted-foreground break-all">
                    {execution.file_name}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
