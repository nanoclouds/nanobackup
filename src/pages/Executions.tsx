import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { mockExecutions } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Search, 
  FileText,
  Calendar,
  Clock,
  HardDrive,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  X
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BackupExecution } from '@/types/backup';

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

export default function Executions() {
  const [selectedExecution, setSelectedExecution] = useState<BackupExecution | null>(null);

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
            />
          </div>
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" />
            Filtros
          </Button>
        </div>
        <Button variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Job</TableHead>
              <TableHead className="text-muted-foreground">Início</TableHead>
              <TableHead className="text-muted-foreground">Duração</TableHead>
              <TableHead className="text-muted-foreground">Tamanho</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-right text-muted-foreground">Logs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockExecutions.map((execution) => (
              <TableRow key={execution.id} className="border-border table-row-hover">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {execution.job?.name || 'Job desconhecido'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {execution.job?.instance?.name}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {format(execution.startedAt, "dd/MM/yyyy HH:mm")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(execution.startedAt, { addSuffix: true, locale: ptBR })}
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
                    <span className="text-sm">{formatBytes(execution.fileSize)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={execution.status} size="sm" />
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedExecution(execution)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Ver Logs
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Logs Dialog */}
      <Dialog open={!!selectedExecution} onOpenChange={() => setSelectedExecution(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Logs da Execução
            </DialogTitle>
          </DialogHeader>
          
          {selectedExecution && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-secondary p-4">
                <div>
                  <p className="font-medium text-foreground">
                    {selectedExecution.job?.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(selectedExecution.startedAt, "dd/MM/yyyy 'às' HH:mm:ss")}
                  </p>
                </div>
                <StatusBadge status={selectedExecution.status} />
              </div>

              {selectedExecution.errorMessage && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                  <p className="text-sm font-medium text-destructive">Erro:</p>
                  <p className="mt-1 text-sm text-destructive/80">
                    {selectedExecution.errorMessage}
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border bg-background">
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <span className="text-sm font-medium text-muted-foreground">Output</span>
                </div>
                <ScrollArea className="h-64">
                  <pre className="p-4 font-mono text-xs text-muted-foreground">
                    {selectedExecution.logs || 'Nenhum log disponível.'}
                  </pre>
                </ScrollArea>
              </div>

              {selectedExecution.checksum && (
                <div className="rounded-lg bg-secondary p-4">
                  <p className="text-sm font-medium text-muted-foreground">Checksum</p>
                  <code className="mt-1 block font-mono text-xs text-foreground">
                    {selectedExecution.checksum}
                  </code>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
