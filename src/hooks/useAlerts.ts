import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Alert {
  id: string;
  job_id: string | null;
  execution_id: string | null;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
  backup_jobs?: {
    id: string;
    name: string;
  };
}

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select(`
          *,
          backup_jobs (id, name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Alert[];
    },
  });
}

export function useUnreadAlertsCount() {
  return useQuery({
    queryKey: ['alerts', 'unread-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('read', false);
      
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkAlertAsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('alerts')
        .update({ read: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useMarkAllAlertsAsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('alerts')
        .update({ read: true })
        .eq('read', false);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
