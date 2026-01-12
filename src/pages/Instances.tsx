import { MainLayout } from '@/components/layout/MainLayout';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { mockInstances } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  TestTube, 
  Edit, 
  Trash2,
  Database,
  ShieldCheck
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

const criticalityColors = {
  low: 'muted',
  medium: 'warning',
  high: 'warning',
  critical: 'error',
} as const;

export default function Instances() {
  return (
    <MainLayout 
      title="Instâncias PostgreSQL" 
      subtitle="Gerencie suas conexões com bancos de dados"
    >
      {/* Actions Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar instâncias..."
            className="bg-secondary pl-9"
          />
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nova Instância
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Instância</TableHead>
              <TableHead className="text-muted-foreground">Host</TableHead>
              <TableHead className="text-muted-foreground">Banco de Dados</TableHead>
              <TableHead className="text-muted-foreground">Versão</TableHead>
              <TableHead className="text-muted-foreground">Ambiente</TableHead>
              <TableHead className="text-muted-foreground">Criticidade</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-right text-muted-foreground">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockInstances.map((instance) => (
              <TableRow key={instance.id} className="border-border table-row-hover">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Database className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{instance.name}</p>
                      {instance.tags.client && (
                        <p className="text-xs text-muted-foreground">{instance.tags.client}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="rounded bg-secondary px-2 py-1 font-mono text-sm text-foreground">
                    {instance.host}:{instance.port}
                  </code>
                </TableCell>
                <TableCell className="font-mono text-sm">{instance.database}</TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {instance.version || 'Desconhecida'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {instance.tags.environment === 'production' ? 'Produção' : 
                     instance.tags.environment === 'staging' ? 'Homologação' : 'Desenvolvimento'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {instance.tags.criticality && (
                    <Badge variant={criticalityColors[instance.tags.criticality]} className="capitalize">
                      {instance.tags.criticality === 'critical' ? 'Crítico' :
                       instance.tags.criticality === 'high' ? 'Alta' :
                       instance.tags.criticality === 'medium' ? 'Média' : 'Baixa'}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={instance.status} size="sm" />
                    {instance.sslEnabled && (
                      <ShieldCheck className="h-4 w-4 text-success" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </MainLayout>
  );
}
