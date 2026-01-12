import { BackupJob } from '@/types/backup';
import { StatusBadge } from './StatusBadge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Play, MoreVertical, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface JobsOverviewProps {
  jobs: BackupJob[];
}

export function JobsOverview({ jobs }: JobsOverviewProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h3 className="text-lg font-semibold text-foreground">Jobs de Backup</h3>
        <Button variant="default" size="sm">
          <Calendar className="mr-2 h-4 w-4" />
          Novo Job
        </Button>
      </div>
      <div className="divide-y divide-border">
        {jobs.map((job) => (
          <div 
            key={job.id} 
            className="flex items-center justify-between px-6 py-4 table-row-hover"
          >
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{job.name}</p>
                  {!job.enabled && (
                    <Badge variant="muted" className="text-xs">
                      Desativado
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {job.instance?.name} → {job.destination?.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <p className="text-muted-foreground">Último backup</p>
                <p className="font-medium text-foreground">
                  {job.lastRun 
                    ? formatDistanceToNow(job.lastRun, { addSuffix: true, locale: ptBR })
                    : 'Nunca'
                  }
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="text-muted-foreground">Próximo</p>
                <p className="font-medium text-foreground">
                  {job.nextRun 
                    ? formatDistanceToNow(job.nextRun, { addSuffix: true, locale: ptBR })
                    : '-'
                  }
                </p>
              </div>
              <StatusBadge status={job.status} />
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" disabled={!job.enabled}>
                  <Play className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
