import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Database, HardDrive, CheckCircle2 } from 'lucide-react';
import { DatabaseInfo } from '@/hooks/useTestConnection';

interface DatabasesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  databases: DatabaseInfo[];
  version?: string;
  latency?: number;
}

export function DatabasesDialog({ 
  open, 
  onOpenChange, 
  instanceName, 
  databases,
  version,
  latency 
}: DatabasesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Bancos de Dados - {instanceName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Connection Info */}
          <div className="flex items-center gap-4 rounded-lg bg-success/10 p-3">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div className="flex-1">
              <p className="text-sm font-medium text-success">Conexão estabelecida</p>
              <p className="text-xs text-muted-foreground">
                {version && `PostgreSQL ${version}`}
                {latency && ` • ${latency}ms`}
              </p>
            </div>
          </div>

          {/* Database List */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {databases.length} banco(s) encontrado(s)
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {databases.map((db) => (
                <div
                  key={db.name}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                      <Database className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-mono text-sm">{db.name}</span>
                  </div>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    {db.size}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            O backup será executado para todos os bancos listados acima usando pg_dumpall.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
