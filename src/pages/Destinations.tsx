import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { mockDestinations } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  TestTube,
  Edit, 
  Trash2,
  FolderSync,
  Server,
  Lock
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

const protocolLabels = {
  ftp: 'FTP',
  ftps: 'FTPS',
  sftp: 'SFTP',
};

export default function Destinations() {
  return (
    <MainLayout 
      title="Destinos FTP/SFTP" 
      subtitle="Configure servidores de armazenamento remoto"
    >
      {/* Actions Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar destinos..."
            className="bg-secondary pl-9"
          />
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Destino
        </Button>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockDestinations.map((destination) => (
          <div 
            key={destination.id}
            className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/30"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <FolderSync className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{destination.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {protocolLabels[destination.protocol]}
                    </Badge>
                    {(destination.protocol === 'ftps' || destination.protocol === 'sftp') && (
                      <Lock className="h-3 w-3 text-success" />
                    )}
                  </div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem>
                    <TestTube className="mr-2 h-4 w-4" />
                    Testar Conexão
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

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Server className="h-4 w-4 text-muted-foreground" />
                <code className="rounded bg-secondary px-2 py-1 font-mono text-xs">
                  {destination.host}:{destination.port}
                </code>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Usuário:</span> {destination.username}
              </div>
              
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Diretório:</span>{' '}
                <code className="font-mono text-xs">{destination.baseDirectory}</code>
              </div>

              {destination.passiveMode && (
                <Badge variant="muted" className="text-xs">
                  Modo Passivo
                </Badge>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <StatusBadge status={destination.status} size="sm" />
              <span className="text-xs text-muted-foreground">
                Testado{' '}
                {destination.lastTested 
                  ? formatDistanceToNow(destination.lastTested, { addSuffix: true, locale: ptBR })
                  : 'nunca'
                }
              </span>
            </div>
          </div>
        ))}
      </div>
    </MainLayout>
  );
}
