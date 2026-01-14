import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Database, Play, AlertCircle, HardDrive, FlaskConical } from 'lucide-react';
import { BackupJob } from '@/hooks/useJobs';
import { supabase } from '@/integrations/supabase/client';

interface DiscoveredDatabase {
  name: string;
  size: string;
}

interface RunJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: BackupJob | null;
  onConfirm: (selectedDatabases: string[], dryRun: boolean) => void;
  isPending?: boolean;
}

export function RunJobDialog({ open, onOpenChange, job, onConfirm, isPending }: RunJobDialogProps) {
  const [databases, setDatabases] = useState<DiscoveredDatabase[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(false);

  // Fetch databases when dialog opens
  useEffect(() => {
    const fetchDatabases = async () => {
      if (open && job?.instance_id) {
        setLoading(true);
        setDryRun(false); // Reset dry run on open
        try {
          const { data } = await supabase
            .from('postgres_instances')
            .select('discovered_databases')
            .eq('id', job.instance_id)
            .maybeSingle();
          
          const rawDbs = data?.discovered_databases;
          const dbs: DiscoveredDatabase[] = Array.isArray(rawDbs) 
            ? (rawDbs as unknown as DiscoveredDatabase[])
            : [];
          setDatabases(dbs);
          // Select all by default
          setSelected(dbs.map(db => db.name));
        } catch {
          setDatabases([]);
          setSelected([]);
        } finally {
          setLoading(false);
        }
      }
    };
    
    fetchDatabases();
  }, [open, job?.instance_id]);

  const toggleDatabase = (name: string) => {
    setSelected(prev => 
      prev.includes(name) 
        ? prev.filter(n => n !== name)
        : [...prev, name]
    );
  };

  const toggleAll = () => {
    if (selected.length === databases.length) {
      setSelected([]);
    } else {
      setSelected(databases.map(db => db.name));
    }
  };

  const handleConfirm = () => {
    onConfirm(selected, dryRun);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Executar Backup Manual
          </DialogTitle>
          <DialogDescription>
            Selecione os bancos de dados para incluir neste backup.
          </DialogDescription>
        </DialogHeader>

        {job && (
          <div className="space-y-4">
            {/* Job info */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-medium text-sm">{job.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {job.postgres_instances?.name} → {job.ftp_destinations?.name}
              </p>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">{job.format.toUpperCase()}</Badge>
                {job.compression !== 'none' && (
                  <Badge variant="muted" className="text-xs">{job.compression.toUpperCase()}</Badge>
                )}
              </div>
            </div>

            {/* Database selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Bancos de Dados</label>
                {databases.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={toggleAll}
                  >
                    {selected.length === databases.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </Button>
                )}
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : databases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-border rounded-lg">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum banco descoberto.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Teste a conexão da instância primeiro.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[200px] rounded-md border border-border">
                  <div className="p-2 space-y-1">
                    {databases.map((db) => (
                      <label
                        key={db.name}
                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                          selected.includes(db.name) 
                            ? 'bg-primary/10 border border-primary/30' 
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                      >
                        <Checkbox
                          checked={selected.includes(db.name)}
                          onCheckedChange={() => toggleDatabase(db.name)}
                        />
                        <Database className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{db.name}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <HardDrive className="h-3 w-3" />
                          <span>{db.size}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {selected.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selected.length} de {databases.length} banco(s) selecionado(s)
                </p>
              )}
            </div>

            {/* Dry Run Option */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium">Modo Dry Run</p>
                    <p className="text-xs text-muted-foreground">
                      Valida o backup sem enviar ao FTP
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={dryRun} 
                  onCheckedChange={setDryRun}
                />
              </div>
              {dryRun && (
                <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    O backup será gerado e validado, mas <strong>não será enviado</strong> ao servidor FTP.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={selected.length === 0 || isPending}
            variant={dryRun ? "secondary" : "default"}
          >
            {isPending ? (
              <>Executando...</>
            ) : dryRun ? (
              <>
                <FlaskConical className="mr-2 h-4 w-4" />
                Validar ({selected.length})
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Executar ({selected.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
