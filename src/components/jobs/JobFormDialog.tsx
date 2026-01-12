import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { BackupJob, CreateJobData, useCreateJob, useUpdateJob } from '@/hooks/useJobs';
import { useInstances } from '@/hooks/useInstances';
import { useDestinations } from '@/hooks/useDestinations';
import { CronPreview } from './CronPreview';
import { validateCronExpression } from '@/lib/cron';

const jobSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  instance_id: z.string().uuid('Selecione uma instância'),
  destination_id: z.string().uuid('Selecione um destino'),
  format: z.enum(['custom', 'sql']),
  compression: z.enum(['gzip', 'zstd', 'none']),
  schedule: z.string().min(1, 'Agendamento é obrigatório').max(100).refine(
    (val) => validateCronExpression(val).isValid,
    (val) => ({ message: validateCronExpression(val).error || 'Expressão cron inválida' })
  ),
  enabled: z.boolean(),
  retention_count: z.coerce.number().min(1).max(1000).nullable().optional(),
  retention_days: z.coerce.number().min(1).max(3650).nullable().optional(),
  timeout: z.coerce.number().min(60).max(86400),
});

type JobFormData = z.infer<typeof jobSchema>;

interface JobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: BackupJob | null;
}

export function JobFormDialog({ open, onOpenChange, job }: JobFormDialogProps) {
  const createMutation = useCreateJob();
  const updateMutation = useUpdateJob();
  const { data: instances = [] } = useInstances();
  const { data: destinations = [] } = useDestinations();
  const isEditing = !!job;

  const form = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      name: '',
      instance_id: '',
      destination_id: '',
      format: 'custom',
      compression: 'gzip',
      schedule: '0 2 * * *',
      enabled: true,
      retention_count: 7,
      retention_days: null,
      timeout: 3600,
    },
  });

  useEffect(() => {
    if (job) {
      form.reset({
        name: job.name,
        instance_id: job.instance_id,
        destination_id: job.destination_id,
        format: job.format,
        compression: job.compression,
        schedule: job.schedule,
        enabled: job.enabled,
        retention_count: job.retention_count,
        retention_days: job.retention_days,
        timeout: job.timeout,
      });
    } else {
      form.reset({
        name: '',
        instance_id: '',
        destination_id: '',
        format: 'custom',
        compression: 'gzip',
        schedule: '0 2 * * *',
        enabled: true,
        retention_count: 7,
        retention_days: null,
        timeout: 3600,
      });
    }
  }, [job, form, open]);

  const onSubmit = async (data: JobFormData) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: job.id, ...data });
      } else {
        await createMutation.mutateAsync(data as CreateJobData);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Job de Backup' : 'Novo Job de Backup'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Job</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Backup Diário Produção" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="instance_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instância PostgreSQL</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma instância..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {instances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.name} ({instance.host})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    O backup será executado para todos os bancos de dados desta instância (pg_dumpall)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="destination_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destino</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um destino..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {destinations.map((dest) => (
                        <SelectItem key={dest.id} value={dest.id}>
                          {dest.name} ({dest.protocol.toUpperCase()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="format"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Formato</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="custom">Custom (pg_dump -Fc)</SelectItem>
                        <SelectItem value="sql">SQL Plain Text</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="compression"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compressão</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="gzip">GZIP</SelectItem>
                        <SelectItem value="zstd">ZSTD</SelectItem>
                        <SelectItem value="none">Nenhuma</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="schedule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agendamento (Cron)</FormLabel>
                  <FormControl>
                    <Input placeholder="0 2 * * *" className="font-mono" {...field} />
                  </FormControl>
                  <FormDescription>
                    Formato: minuto hora dia mês dia_semana
                  </FormDescription>
                  <FormMessage />
                  <CronPreview 
                    expression={field.value} 
                    onSelectPreset={(preset) => form.setValue('schedule', preset, { shouldValidate: true })}
                  />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="retention_count"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retenção (quantidade)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="7" 
                        {...field} 
                        value={field.value ?? ''} 
                      />
                    </FormControl>
                    <FormDescription>
                      Manter últimos N backups
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="retention_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retenção (dias)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="30" 
                        {...field} 
                        value={field.value ?? ''} 
                      />
                    </FormControl>
                    <FormDescription>
                      Manter backups por N dias
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="timeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timeout (segundos)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormDescription>
                    Tempo máximo de execução do backup
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Job Ativo</FormLabel>
                    <FormDescription>
                      Executar o backup conforme agendamento
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
