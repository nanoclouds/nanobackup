import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
}

export type CreateInstanceData = Omit<PostgresInstance, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'last_checked' | 'version' | 'status'>;

export function useInstances() {
  return useQuery({
    queryKey: ['instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('postgres_instances')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PostgresInstance[];
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
          ...instance,
          created_by: user?.id,
          status: 'unknown',
        })
        .select()
        .single();
      
      if (error) throw error;
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
    mutationFn: async ({ id, ...updates }: Partial<PostgresInstance> & { id: string }) => {
      const { data, error } = await supabase
        .from('postgres_instances')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
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
