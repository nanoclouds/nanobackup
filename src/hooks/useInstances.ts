import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

export interface DiscoveredDatabase {
  name: string;
  size: string;
}

export interface PostgresInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl_enabled: boolean;
  version: string | null;
  client_tag: string | null;
  environment: 'production' | 'staging' | 'development';
  criticality: 'low' | 'medium' | 'high' | 'critical' | null;
  status: 'online' | 'offline' | 'unknown' | 'connected' | 'disconnected';
  last_checked: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  discovered_databases: DiscoveredDatabase[] | null;
}

export type CreateInstanceData = Omit<PostgresInstance, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'last_checked' | 'version' | 'status' | 'discovered_databases'>;

// Transform raw DB data to typed PostgresInstance
function transformInstance(raw: Record<string, unknown>): PostgresInstance {
  return {
    ...raw,
    discovered_databases: Array.isArray(raw.discovered_databases) 
      ? (raw.discovered_databases as unknown as DiscoveredDatabase[])
      : null,
  } as PostgresInstance;
}

// Encrypt credentials via edge function
async function encryptCredentials(type: 'instance' | 'destination', id: string, password?: string, ssh_key?: string) {
  if (!password && !ssh_key) return;
  
  try {
    const { error } = await supabase.functions.invoke('encrypt-credentials', {
      body: { type, id, password, ssh_key },
    });
    
    if (error) {
      console.error('Failed to encrypt credentials:', error);
    }
  } catch (e) {
    console.error('Failed to encrypt credentials:', e);
  }
}

export function useInstances() {
  return useQuery({
    queryKey: ['instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('postgres_instances')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []).map(transformInstance);
    },
  });
}

export function useCreateInstance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (instance: CreateInstanceData) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('postgres_instances')
        .insert({
          name: instance.name,
          host: instance.host,
          port: instance.port,
          database: instance.database,
          username: instance.username,
          password: instance.password, // Stored temporarily
          ssl_enabled: instance.ssl_enabled,
          environment: instance.environment,
          criticality: instance.criticality,
          client_tag: instance.client_tag,
          created_by: user?.id,
          status: 'unknown',
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Encrypt the password after creation
      if (data && instance.password) {
        await encryptCredentials('instance', data.id, instance.password);
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      toast.success('Instância criada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar instância: ' + error.message);
    },
  });
}

export function useUpdateInstance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, discovered_databases, password, ...updates }: Partial<PostgresInstance> & { id: string }) => {
      // Prepare update payload without the discovered_databases (it's managed by edge function)
      const updatePayload: Record<string, unknown> = { ...updates };
      
      // If password is provided, include it temporarily (will be encrypted)
      if (password) {
        updatePayload.password = password;
      }
      
      const { data, error } = await supabase
        .from('postgres_instances')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Encrypt password if it was updated
      if (password) {
        await encryptCredentials('instance', id, password);
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      toast.success('Instância atualizada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar instância: ' + error.message);
    },
  });
}

export function useDeleteInstance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('postgres_instances')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      toast.success('Instância excluída com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir instância: ' + error.message);
    },
  });
}
