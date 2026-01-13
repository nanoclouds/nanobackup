import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FtpDestination {
  id: string;
  name: string;
  protocol: 'ftp' | 'ftps' | 'sftp';
  host: string;
  port: number;
  username: string;
  password: string | null;
  ssh_key: string | null;
  base_directory: string;
  passive_mode: boolean | null;
  status: 'online' | 'offline' | 'unknown' | 'connected' | 'disconnected';
  write_permission: boolean | null;
  last_tested: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateDestinationData = Omit<FtpDestination, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'last_tested' | 'status'>;

export function useDestinations() {
  return useQuery({
    queryKey: ['destinations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ftp_destinations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as FtpDestination[];
    },
  });
}

export function useCreateDestination() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (destination: CreateDestinationData) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('ftp_destinations')
        .insert({
          ...destination,
          created_by: user?.id,
          status: 'unknown',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['destinations'] });
      toast.success('Destino criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar destino: ' + error.message);
    },
  });
}

export function useUpdateDestination() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FtpDestination> & { id: string }) => {
      const { data, error } = await supabase
        .from('ftp_destinations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['destinations'] });
      toast.success('Destino atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar destino: ' + error.message);
    },
  });
}

export function useDeleteDestination() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ftp_destinations')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['destinations'] });
      toast.success('Destino excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir destino: ' + error.message);
    },
  });
}
