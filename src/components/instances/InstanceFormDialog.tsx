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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
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
      });
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
      });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
