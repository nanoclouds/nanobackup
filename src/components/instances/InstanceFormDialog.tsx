import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Loader2, ChevronDown, Server } from 'lucide-react';
import { PostgresInstance, CreateInstanceData, useCreateInstance, useUpdateInstance } from '@/hooks/useInstances';

const instanceSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  host: z.string().min(1, 'Host é obrigatório').max(255),
  port: z.coerce.number().min(1).max(65535),
  database: z.string().min(1, 'Banco de dados é obrigatório').max(100),
  username: z.string().min(1, 'Usuário é obrigatório').max(100),
  password: z.string().min(1, 'Senha é obrigatória').max(255),
  ssl_enabled: z.boolean(),
  client_tag: z.string().max(100).nullable().optional(),
  environment: z.enum(['production', 'staging', 'development']),
  criticality: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional(),
  // SSH fields
  ssh_enabled: z.boolean(),
  ssh_host: z.string().max(255).nullable().optional(),
  ssh_port: z.coerce.number().min(1).max(65535).optional(),
  ssh_username: z.string().max(100).nullable().optional(),
  ssh_password: z.string().max(255).nullable().optional(),
  ssh_private_key: z.string().nullable().optional(),
});

type InstanceFormData = z.infer<typeof instanceSchema>;

interface InstanceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance?: PostgresInstance | null;
}

export function InstanceFormDialog({ open, onOpenChange, instance }: InstanceFormDialogProps) {
  const createMutation = useCreateInstance();
  const updateMutation = useUpdateInstance();
  const isEditing = !!instance;
  const [sshOpen, setSshOpen] = useState(false);

  const form = useForm<InstanceFormData>({
    resolver: zodResolver(instanceSchema),
    defaultValues: {
      name: '',
      host: '',
      port: 5432,
      database: 'postgres',
      username: '',
      password: '',
      ssl_enabled: false,
      client_tag: null,
      environment: 'development',
      criticality: 'medium',
      // SSH defaults
      ssh_enabled: false,
      ssh_host: null,
      ssh_port: 22,
      ssh_username: null,
      ssh_password: null,
      ssh_private_key: null,
    },
  });

  useEffect(() => {
    if (instance) {
      form.reset({
        name: instance.name,
        host: instance.host,
        port: instance.port,
        database: instance.database,
        username: instance.username,
        password: instance.password,
        ssl_enabled: instance.ssl_enabled,
        client_tag: instance.client_tag,
        environment: instance.environment,
        criticality: instance.criticality,
        // SSH fields
        ssh_enabled: instance.ssh_enabled || false,
        ssh_host: instance.ssh_host,
        ssh_port: instance.ssh_port || 22,
        ssh_username: instance.ssh_username,
        ssh_password: instance.ssh_password,
        ssh_private_key: instance.ssh_private_key,
      });
      setSshOpen(instance.ssh_enabled || false);
    } else {
      form.reset({
        name: '',
        host: '',
        port: 5432,
        database: 'postgres',
        username: '',
        password: '',
        ssl_enabled: false,
        client_tag: null,
        environment: 'development',
        criticality: 'medium',
        ssh_enabled: false,
        ssh_host: null,
        ssh_port: 22,
        ssh_username: null,
        ssh_password: null,
        ssh_private_key: null,
      });
      setSshOpen(false);
    }
  }, [instance, form, open]);

  const onSubmit = async (data: InstanceFormData) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: instance.id, ...data });
      } else {
        await createMutation.mutateAsync(data as CreateInstanceData);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const sshEnabled = form.watch('ssh_enabled');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Instância' : 'Nova Instância PostgreSQL'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Produção Principal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="host"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Host</FormLabel>
                    <FormControl>
                      <Input placeholder="localhost" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Porta</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="database"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Banco de Conexão</FormLabel>
                  <FormControl>
                    <Input placeholder="postgres" {...field} />
                  </FormControl>
                  <FormDescription>
                    Banco usado para conexão. O backup incluirá todos os bancos da instância.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Usuário</FormLabel>
                    <FormControl>
                      <Input placeholder="postgres" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="environment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ambiente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="production">Produção</SelectItem>
                        <SelectItem value="staging">Homologação</SelectItem>
                        <SelectItem value="development">Desenvolvimento</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="criticality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Criticidade</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="critical">Crítico</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="client_tag"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tag do Cliente (opcional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ex: Cliente ABC" 
                      {...field} 
                      value={field.value || ''} 
                    />
                  </FormControl>
                  <FormDescription>
                    Identificador para organização por cliente
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ssl_enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>SSL/TLS</FormLabel>
                    <FormDescription>
                      Conexão segura com o banco de dados
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

            {/* SSH Configuration Section */}
            <Collapsible open={sshOpen} onOpenChange={setSshOpen}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">Backup via SSH (pg_dump nativo)</span>
                      <p className="text-xs text-muted-foreground">
                        Use um servidor externo para backups mais rápidos e confiáveis
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 transition-transform ${sshOpen ? 'rotate-180' : ''}`} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="ssh_enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                      <div className="space-y-0.5">
                        <FormLabel>Habilitar backup via SSH</FormLabel>
                        <FormDescription>
                          Executa pg_dump no servidor remoto para backups nativos
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

                {sshEnabled && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="ssh_host"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Host SSH</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="192.168.1.100" 
                                {...field} 
                                value={field.value || ''} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="ssh_port"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Porta SSH</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="ssh_username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Usuário SSH</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="root" 
                                {...field} 
                                value={field.value || ''} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="ssh_password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Senha SSH</FormLabel>
                            <FormControl>
                              <Input 
                                type="password" 
                                placeholder="••••••••" 
                                {...field}
                                value={field.value || ''} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="ssh_private_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chave Privada SSH (opcional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..." 
                              className="font-mono text-xs h-24"
                              {...field}
                              value={field.value || ''} 
                            />
                          </FormControl>
                          <FormDescription>
                            Cole a chave privada SSH se preferir autenticação por chave
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>

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
