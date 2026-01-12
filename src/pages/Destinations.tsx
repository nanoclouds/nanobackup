import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { useDestinations, FtpDestination } from '@/hooks/useDestinations';
import { useTestFtpConnection } from '@/hooks/useTestConnection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DestinationFormDialog } from '@/components/destinations/DestinationFormDialog';
import { DeleteDestinationDialog } from '@/components/destinations/DeleteDestinationDialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Search, MoreVertical, TestTube, Edit, Trash2, FolderSync, Server, Lock, Loader2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const protocolLabels = { ftp: 'FTP', ftps: 'FTPS', sftp: 'SFTP' };

export default function Destinations() {
  const { data: destinations = [], isLoading } = useDestinations();
  const testConnection = useTestFtpConnection();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<FtpDestination | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const filtered = destinations.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) || d.host.toLowerCase().includes(search.toLowerCase()));

  const handleTest = async (dest: FtpDestination) => {
    setTestingId(dest.id);
    try {
      await testConnection.mutateAsync(dest.id);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <MainLayout title="Destinos FTP/SFTP" subtitle="Configure servidores de armazenamento remoto">
      <div className="mb-6 flex items-center justify-between">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar destinos..." className="bg-secondary pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => { setSelected(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />Novo Destino</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nenhum destino encontrado</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((dest) => (
            <div key={dest.id} className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/30">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10"><FolderSync className="h-6 w-6 text-primary" /></div>
                  <div>
                    <h3 className="font-semibold text-foreground">{dest.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{protocolLabels[dest.protocol]}</Badge>
                      {(dest.protocol === 'ftps' || dest.protocol === 'sftp') && <Lock className="h-3 w-3 text-success" />}
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => handleTest(dest)} disabled={testingId === dest.id}>
                      {testingId === dest.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                      {testingId === dest.id ? 'Testando...' : 'Testar Conexão'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSelected(dest); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setSelected(dest); setDeleteOpen(true); }}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm"><Server className="h-4 w-4 text-muted-foreground" /><code className="rounded bg-secondary px-2 py-1 font-mono text-xs">{dest.host}:{dest.port}</code></div>
                <div className="text-sm text-muted-foreground"><span className="font-medium">Usuário:</span> {dest.username}</div>
                <div className="text-sm text-muted-foreground"><span className="font-medium">Diretório:</span> <code className="font-mono text-xs">{dest.base_directory}</code></div>
                {dest.passive_mode && <Badge variant="muted" className="text-xs">Modo Passivo</Badge>}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <StatusBadge status={dest.status} size="sm" />
                <span className="text-xs text-muted-foreground">Testado {dest.last_tested ? formatDistanceToNow(new Date(dest.last_tested), { addSuffix: true, locale: ptBR }) : 'nunca'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <DestinationFormDialog open={formOpen} onOpenChange={setFormOpen} destination={selected} />
      <DeleteDestinationDialog open={deleteOpen} onOpenChange={setDeleteOpen} destination={selected} />
    </MainLayout>
  );
}
