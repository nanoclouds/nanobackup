import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { useInstances, PostgresInstance } from '@/hooks/useInstances';
import { useTestPostgresConnection, PostgresTestResult } from '@/hooks/useTestConnection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { InstanceFormDialog } from '@/components/instances/InstanceFormDialog';
import { DeleteInstanceDialog } from '@/components/instances/DeleteInstanceDialog';
import { DatabasesDialog } from '@/components/instances/DatabasesDialog';
import { 
  Plus, Search, MoreVertical, TestTube, Edit, Trash2, Database, ShieldCheck, Loader2
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const criticalityColors = {
  low: 'muted', medium: 'warning', high: 'warning', critical: 'error',
} as const;

export default function Instances() {
  const { data: instances = [], isLoading } = useInstances();
  const testConnection = useTestPostgresConnection();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [databasesOpen, setDatabasesOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<PostgresInstance | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<PostgresTestResult | null>(null);

  const filtered = instances.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.host.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (instance: PostgresInstance) => {
    setSelectedInstance(instance);
    setFormOpen(true);
  };

  const handleDelete = (instance: PostgresInstance) => {
    setSelectedInstance(instance);
    setDeleteOpen(true);
  };

  const handleNew = () => {
    setSelectedInstance(null);
    setFormOpen(true);
  };

  const handleTest = async (instance: PostgresInstance) => {
    setTestingId(instance.id);
    setSelectedInstance(instance);
    try {
      const result = await testConnection.mutateAsync(instance.id);
      if (result.success && result.databases && result.databases.length > 0) {
        setTestResult(result);
        setDatabasesOpen(true);
      }
    } finally {
      setTestingId(null);
    }
  };

  return (
    <MainLayout title="Instâncias PostgreSQL" subtitle="Gerencie suas conexões com bancos de dados">
      <div className="mb-6 flex items-center justify-between">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar instâncias..." className="bg-secondary pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={handleNew}><Plus className="mr-2 h-4 w-4" />Nova Instância</Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Instância</TableHead>
              <TableHead className="text-muted-foreground">Host</TableHead>
              <TableHead className="text-muted-foreground">Bancos</TableHead>
              <TableHead className="text-muted-foreground">Versão</TableHead>
              <TableHead className="text-muted-foreground">Ambiente</TableHead>
              <TableHead className="text-muted-foreground">Criticidade</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-right text-muted-foreground">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-12 w-full" /></TableCell></TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma instância encontrada</TableCell></TableRow>
            ) : (
              filtered.map((instance) => (
                <TableRow key={instance.id} className="border-border table-row-hover">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Database className="h-4 w-4 text-primary" /></div>
                      <div>
                        <p className="font-medium text-foreground">{instance.name}</p>
                        {instance.client_tag && <p className="text-xs text-muted-foreground">{instance.client_tag}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><code className="rounded bg-secondary px-2 py-1 font-mono text-sm text-foreground">{instance.host}:{instance.port}</code></TableCell>
                  <TableCell>
                    {instance.discovered_databases && instance.discovered_databases.length > 0 ? (
                      <Badge variant="secondary" className="gap-1">
                        <Database className="h-3 w-3" />
                        {instance.discovered_databases.length} banco{instance.discovered_databases.length > 1 ? 's' : ''}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Testar conexão</span>
                    )}
                  </TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{instance.version || 'Desconhecida'}</span></TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{instance.environment === 'production' ? 'Produção' : instance.environment === 'staging' ? 'Homologação' : 'Desenvolvimento'}</Badge></TableCell>
                  <TableCell>{instance.criticality && <Badge variant={criticalityColors[instance.criticality]} className="capitalize">{instance.criticality === 'critical' ? 'Crítico' : instance.criticality === 'high' ? 'Alta' : instance.criticality === 'medium' ? 'Média' : 'Baixa'}</Badge>}</TableCell>
                  <TableCell><div className="flex items-center gap-2"><StatusBadge status={instance.status} size="sm" />{instance.ssl_enabled && <ShieldCheck className="h-4 w-4 text-success" />}</div></TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleTest(instance)} disabled={testingId === instance.id}>
                          {testingId === instance.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
                          {testingId === instance.id ? 'Testando...' : 'Testar Conexão'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEdit(instance)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(instance)}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InstanceFormDialog open={formOpen} onOpenChange={setFormOpen} instance={selectedInstance} />
      <DeleteInstanceDialog open={deleteOpen} onOpenChange={setDeleteOpen} instance={selectedInstance} />
      <DatabasesDialog 
        open={databasesOpen} 
        onOpenChange={setDatabasesOpen} 
        instanceName={selectedInstance?.name || ''} 
        databases={testResult?.databases || []}
        version={testResult?.version}
        latency={testResult?.latency}
      />
    </MainLayout>
  );
}
