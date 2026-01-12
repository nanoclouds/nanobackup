import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BackupJob {
  id: string;
  name: string;
  instance_id: string;
  destination_id: string;
  format: 'custom' | 'sql';
  compression: 'gzip' | 'zstd' | 'none';
  schedule: string;
  enabled: boolean;
  retention_count: number | null;
  retention_days: number | null;
  timeout: number;
  status: 'scheduled' | 'running' | 'success' | 'failed' | 'cancelled';
  last_run: string | null;
  next_run: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  postgres_instances?: {
    id: string;
    name: string;
    host: string;
    database: string;
  };
  ftp_destinations?: {
    id: string;
    name: string;
    protocol: string;
    host: string;
  };
}

export type CreateJobData = Omit<BackupJob, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'last_run' | 'next_run' | 'status' | 'postgres_instances' | 'ftp_destinations'>;

export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backup_jobs')
        .select(`
          *,
          postgres_instances (id, name, host, database),
          ftp_destinations (id, name, protocol, host)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as BackupJob[];
    },
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (job: CreateJobData) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('backup_jobs')
        .insert({
          ...job,
          created_by: user?.id,
          status: 'scheduled',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar job: ' + error.message);
    },
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BackupJob> & { id: string }) => {
      const { data, error } = await supabase
        .from('backup_jobs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar job: ' + error.message);
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('backup_jobs')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir job: ' + error.message);
    },
  });
}

export function useToggleJob() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { data, error } = await supabase
        .from('backup_jobs')
        .update({ enabled })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success(variables.enabled ? 'Job ativado!' : 'Job desativado!');
    },
    onError: (error) => {
      toast.error('Erro ao alterar status do job: ' + error.message);
    },
  });
}
