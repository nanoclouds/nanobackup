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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { FtpDestination, CreateDestinationData, useCreateDestination, useUpdateDestination } from '@/hooks/useDestinations';

const destinationSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  protocol: z.enum(['ftp', 'ftps', 'sftp']),
  host: z.string().min(1, 'Host é obrigatório').max(255),
  port: z.coerce.number().min(1).max(65535),
  username: z.string().min(1, 'Usuário é obrigatório').max(100),
  password: z.string().max(255).nullable().optional(),
  ssh_key: z.string().max(10000).nullable().optional(),
  base_directory: z.string().min(1, 'Diretório base é obrigatório').max(500),
  passive_mode: z.boolean().nullable().optional(),
});

type DestinationFormData = z.infer<typeof destinationSchema>;

interface DestinationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destination?: FtpDestination | null;
}

export function DestinationFormDialog({ open, onOpenChange, destination }: DestinationFormDialogProps) {
  const createMutation = useCreateDestination();
  const updateMutation = useUpdateDestination();
  const isEditing = !!destination;
  const [authMethod, setAuthMethod] = useState<'password' | 'ssh_key'>('password');

  const form = useForm<DestinationFormData>({
    resolver: zodResolver(destinationSchema),
    defaultValues: {
      name: '',
      protocol: 'sftp',
      host: '',
      port: 22,
      username: '',
      password: null,
      ssh_key: null,
      base_directory: '/',
      passive_mode: false,
    },
  });

  const protocol = form.watch('protocol');

  useEffect(() => {
    if (destination) {
      form.reset({
        name: destination.name,
        protocol: destination.protocol,
        host: destination.host,
        port: destination.port,
        username: destination.username,
        password: destination.password,
        ssh_key: destination.ssh_key,
        base_directory: destination.base_directory,
        passive_mode: destination.passive_mode,
      });
      setAuthMethod(destination.ssh_key ? 'ssh_key' : 'password');
    } else {
      form.reset({
        name: '',
        protocol: 'sftp',
        host: '',
        port: 22,
        username: '',
        password: null,
        ssh_key: null,
        base_directory: '/',
        passive_mode: false,
      });
      setAuthMethod('password');
    }
  }, [destination, form, open]);

  // Update default port when protocol changes
  useEffect(() => {
    if (!isEditing) {
      if (protocol === 'ftp') {
        form.setValue('port', 21);
      } else if (protocol === 'ftps') {
        form.setValue('port', 990);
      } else {
        form.setValue('port', 22);
      }
    }
  }, [protocol, form, isEditing]);

  const onSubmit = async (data: DestinationFormData) => {
    // Clear unused auth method
    if (authMethod === 'password') {
      data.ssh_key = null;
    } else {
      data.password = null;
    }

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: destination.id, ...data });
      } else {
        await createMutation.mutateAsync(data as CreateDestinationData);
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
            {isEditing ? 'Editar Destino' : 'Novo Destino FTP/SFTP'}
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
                    <Input placeholder="Ex: Backup Server 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="protocol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Protocolo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="sftp">SFTP (recomendado)</SelectItem>
                      <SelectItem value="ftps">FTPS</SelectItem>
                      <SelectItem value="ftp">FTP</SelectItem>
                    </SelectContent>
                  </Select>
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
                      <Input placeholder="ftp.exemplo.com" {...field} />
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
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usuário</FormLabel>
                  <FormControl>
                    <Input placeholder="backup_user" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {protocol === 'sftp' ? (
              <Tabs value={authMethod} onValueChange={(v) => setAuthMethod(v as 'password' | 'ssh_key')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="password">Senha</TabsTrigger>
                  <TabsTrigger value="ssh_key">Chave SSH</TabsTrigger>
                </TabsList>
                <TabsContent value="password" className="mt-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha</FormLabel>
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
                </TabsContent>
                <TabsContent value="ssh_key" className="mt-4">
                  <FormField
                    control={form.control}
                    name="ssh_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Chave SSH Privada</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
                            className="font-mono text-xs h-32"
                            {...field} 
                            value={field.value || ''} 
                          />
                        </FormControl>
                        <FormDescription>
                          Cole o conteúdo completo da chave privada
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
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
            )}

            <FormField
              control={form.control}
              name="base_directory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Diretório Base</FormLabel>
                  <FormControl>
                    <Input placeholder="/backups" {...field} />
                  </FormControl>
                  <FormDescription>
                    Diretório remoto onde os backups serão armazenados
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(protocol === 'ftp' || protocol === 'ftps') && (
              <FormField
                control={form.control}
                name="passive_mode"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Modo Passivo</FormLabel>
                      <FormDescription>
                        Usar conexão passiva (recomendado para firewalls)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value || false}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

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
