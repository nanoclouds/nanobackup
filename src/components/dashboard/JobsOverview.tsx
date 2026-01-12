import { BackupJob } from '@/hooks/useJobs';
import { useRunBackup } from '@/hooks/useExecutions';
import { StatusBadge } from './StatusBadge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Play, MoreVertical, Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface JobsOverviewProps {
  jobs: BackupJob[];
}

export function JobsOverview({ jobs }: JobsOverviewProps) {
  const { canModify } = useAuth();
  const runBackup = useRunBackup();

  const handleRunBackup = (jobId: string) => {
    runBackup.mutate(jobId);
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h3 className="text-lg font-semibold text-foreground">Jobs de Backup</h3>
        <Link to="/jobs">
          <Button variant="default" size="sm">
            <Calendar className="mr-2 h-4 w-4" />
            Ver Jobs
          </Button>
        </Link>
      </div>
      <div className="divide-y divide-border">
        {jobs.slice(0, 5).map((job) => (
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
                  {job.postgres_instances?.name} → {job.ftp_destinations?.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <p className="text-muted-foreground">Último backup</p>
                <p className="font-medium text-foreground">
                  {job.last_run 
                    ? formatDistanceToNow(new Date(job.last_run), { addSuffix: true, locale: ptBR })
                    : 'Nunca'
                  }
                </p>
              </div>
              <StatusBadge status={job.status} />
              <div className="flex items-center gap-1">
                {canModify && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    disabled={!job.enabled || job.status === 'running' || runBackup.isPending}
                    onClick={() => handleRunBackup(job.id)}
                  >
                    {job.status === 'running' || (runBackup.isPending && runBackup.variables === job.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
