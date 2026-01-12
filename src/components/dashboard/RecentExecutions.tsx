import { BackupExecution } from '@/types/backup';
import { StatusBadge } from './StatusBadge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Clock, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RecentExecutionsProps {
  executions: BackupExecution[];
}

function formatBytes(bytes?: number): string {
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

function formatDuration(seconds?: number): string {
  if (!seconds) return '-';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function RecentExecutions({ executions }: RecentExecutionsProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h3 className="text-lg font-semibold text-foreground">Execuções Recentes</h3>
        <Button variant="outline" size="sm">
          Ver todas
        </Button>
      </div>
      <div className="divide-y divide-border">
        {executions.map((execution) => (
          <div 
            key={execution.id} 
            className="flex items-center justify-between px-6 py-4 table-row-hover"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {execution.job?.name || 'Job desconhecido'}
                </p>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(execution.startedAt, { 
                      addSuffix: true, 
                      locale: ptBR 
                    })}
                  </span>
                  {execution.duration && (
                    <span>• {formatDuration(execution.duration)}</span>
                  )}
                  {execution.fileSize && (
                    <span>• {formatBytes(execution.fileSize)}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={execution.status} />
              <Button variant="ghost" size="icon">
                <FileText className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
