import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useExecutions } from '@/hooks/useExecutions';
import { 
  Search, 
  Calendar,
  Clock,
  HardDrive,
  RefreshCw,
  Filter,
  Eye,
  Loader2
} from 'lucide-react';
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

export default function Executions() {
  const navigate = useNavigate();
  const { data: executions, isLoading, refetch } = useExecutions();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredExecutions = executions?.filter(execution => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      execution.backup_jobs?.name?.toLowerCase().includes(query) ||
      execution.backup_jobs?.postgres_instances?.name?.toLowerCase().includes(query) ||
      execution.status.toLowerCase().includes(query)
    );
  });

  return (
    <MainLayout 
      title="Histórico de Execuções" 
      subtitle="Acompanhe todas as execuções de backup"
    >
      {/* Actions Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar execuções..."
              className="bg-secondary pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filtros
          </Button>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Job</TableHead>
                <TableHead className="text-muted-foreground">Início</TableHead>
                <TableHead className="text-muted-foreground">Duração</TableHead>
                <TableHead className="text-muted-foreground">Tamanho</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-muted-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExecutions?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    Nenhuma execução encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filteredExecutions?.map((execution) => (
                  <TableRow 
                    key={execution.id} 
                    className="border-border table-row-hover cursor-pointer"
                    onClick={() => navigate(`/executions/${execution.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                          <Calendar className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {execution.backup_jobs?.name || 'Job desconhecido'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {execution.backup_jobs?.postgres_instances?.name}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {format(new Date(execution.started_at), "dd/MM/yyyy HH:mm")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(execution.started_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{formatDuration(execution.duration)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{formatBytes(execution.file_size)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={execution.status} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/executions/${execution.id}`);
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Ver Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </MainLayout>
  );
}
