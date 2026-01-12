import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { mockJobs } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Play,
  Edit, 
  Trash2,
  Calendar,
  Clock,
  Database,
  FolderSync
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Jobs() {
  return (
    <MainLayout 
      title="Jobs de Backup" 
      subtitle="Configure e gerencie seus backups agendados"
    >
      {/* Actions Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar jobs..."
            className="bg-secondary pl-9"
          />
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Job
        </Button>
      </div>

      {/* Table */}
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
            {mockJobs.map((job) => (
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
                    <span className="text-sm">{job.instance?.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FolderSync className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{job.destination?.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Badge variant="secondary" className="text-xs uppercase">
                      {job.format}
                    </Badge>
                    {job.compression !== 'none' && (
                      <Badge variant="muted" className="text-xs uppercase">
                        {job.compression}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <code className="font-mono text-xs text-muted-foreground">
                      {job.schedule}
                    </code>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {job.lastRun 
                      ? formatDistanceToNow(job.lastRun, { addSuffix: true, locale: ptBR })
                      : 'Nunca'
                    }
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={job.status} size="sm" />
                </TableCell>
                <TableCell>
                  <Switch checked={job.enabled} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      disabled={!job.enabled}
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
                        <DropdownMenuItem>
                          <Play className="mr-2 h-4 w-4" />
                          Executar Agora
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </MainLayout>
  );
}
