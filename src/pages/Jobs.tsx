import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { useJobs, useToggleJob, BackupJob } from '@/hooks/useJobs';
import { useRunBackupWithProgress } from '@/hooks/useRunBackupWithProgress';
import { useBackupProgress } from '@/contexts/BackupProgressContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { JobFormDialog } from '@/components/jobs/JobFormDialog';
import { DeleteJobDialog } from '@/components/jobs/DeleteJobDialog';
import { RunJobDialog } from '@/components/jobs/RunJobDialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Search, MoreVertical, Play, Edit, Trash2, Calendar, Clock, Database, FolderSync } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function Jobs() {
  const { data: jobs = [], isLoading } = useJobs();
  const toggleMutation = useToggleJob();
  const { setProgress } = useBackupProgress();
  const runMutation = useRunBackupWithProgress(setProgress);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [selected, setSelected] = useState<BackupJob | null>(null);

  const filtered = jobs.filter(j => j.name.toLowerCase().includes(search.toLowerCase()));

  const handleRunJob = (selectedDatabases: string[]) => {
    if (selected) {
      runMutation.mutate({ jobId: selected.id, selectedDatabases });
      setRunOpen(false);
    }
  };

  return (
    <MainLayout title="Jobs de Backup" subtitle="Configure e gerencie seus backups agendados">
      <div className="mb-6 flex items-center justify-between">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar jobs..." className="bg-secondary pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => { setSelected(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />Novo Job</Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Job</TableHead>
              <TableHead className="text-muted-foreground">Instância</TableHead>
              <TableHead className="text-muted-foreground">Destino</TableHead>
              <TableHead className="text-muted-foreground">Formato</TableHead>
              <TableHead className="text-muted-foreground">Agendamento</TableHead>
              <TableHead className="text-muted-foreground">Último Backup</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Ativo</TableHead>
              <TableHead className="text-right text-muted-foreground">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}><Skeleton className="h-12 w-full" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Nenhum job encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((job) => (
                <TableRow key={job.id} className="border-border table-row-hover">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                      <p className="font-medium text-foreground">{job.name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{job.postgres_instances?.name || '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FolderSync className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{job.ftp_destinations?.name || '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge variant="secondary" className="text-xs uppercase">{job.format}</Badge>
                      {job.compression !== 'none' && (
                        <Badge variant="muted" className="text-xs uppercase">{job.compression}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <code className="font-mono text-xs text-muted-foreground">{job.schedule}</code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {job.last_run ? formatDistanceToNow(new Date(job.last_run), { addSuffix: true, locale: ptBR }) : 'Nunca'}
                    </span>
                  </TableCell>
                  <TableCell><StatusBadge status={job.status} size="sm" /></TableCell>
                  <TableCell>
                    <Switch 
                      checked={job.enabled} 
                      onCheckedChange={(enabled) => toggleMutation.mutate({ id: job.id, enabled })} 
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        disabled={!job.enabled || runMutation.isPending} 
                        onClick={() => { setSelected(job); setRunOpen(true); }} 
                        title="Executar agora"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem 
                            onClick={() => { setSelected(job); setRunOpen(true); }} 
                            disabled={!job.enabled}
                          >
                            <Play className="mr-2 h-4 w-4" />Executar Agora
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSelected(job); setFormOpen(true); }}>
                            <Edit className="mr-2 h-4 w-4" />Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive" 
                            onClick={() => { setSelected(job); setDeleteOpen(true); }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <JobFormDialog open={formOpen} onOpenChange={setFormOpen} job={selected} />
      <DeleteJobDialog open={deleteOpen} onOpenChange={setDeleteOpen} job={selected} />
      <RunJobDialog 
        open={runOpen} 
        onOpenChange={setRunOpen} 
        job={selected} 
        onConfirm={handleRunJob}
        isPending={runMutation.isPending}
      />
    </MainLayout>
  );
}
