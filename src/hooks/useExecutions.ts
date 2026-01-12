import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BackupExecution {
  id: string;
  job_id: string;
  status: 'scheduled' | 'running' | 'success' | 'failed' | 'cancelled';
  started_at: string;
  completed_at: string | null;
  duration: number | null;
  file_size: number | null;
  file_name: string | null;
  checksum: string | null;
  error_message: string | null;
  logs: string | null;
  created_at: string;
  // Joined data
  backup_jobs?: {
    id: string;
    name: string;
    postgres_instances?: {
      id: string;
      name: string;
    };
    ftp_destinations?: {
      id: string;
      name: string;
    };
  };
}

export function useExecutions(jobId?: string) {
  return useQuery({
    queryKey: ['executions', jobId],
    queryFn: async () => {
      let query = supabase
        .from('backup_executions')
        .select(`
          *,
          backup_jobs (
            id, 
            name,
            postgres_instances (id, name),
            ftp_destinations (id, name)
          )
        `)
        .order('started_at', { ascending: false })
        .limit(100);
      
      if (jobId) {
        query = query.eq('job_id', jobId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as BackupExecution[];
    },
  });
}

export function useCreateExecution() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await supabase
        .from('backup_executions')
        .insert({
          job_id: jobId,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update job status
      await supabase
        .from('backup_jobs')
        .update({ 
          status: 'running',
          last_run: new Date().toISOString(),
        })
        .eq('id', jobId);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Backup iniciado!');
    },
    onError: (error) => {
      toast.error('Erro ao iniciar backup: ' + error.message);
    },
  });
}

export function useUpdateExecution() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, jobId, ...updates }: Partial<BackupExecution> & { id: string; jobId?: string }) => {
      const { data, error } = await supabase
        .from('backup_executions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update job status if provided
      if (jobId && updates.status) {
        await supabase
          .from('backup_jobs')
          .update({ status: updates.status })
          .eq('id', jobId);
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => {
      toast.error('Erro ao atualizar execução: ' + error.message);
    },
  });
}

export function useRunBackup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (jobId: string) => {
      // Create execution record
      const { data: execution, error: execError } = await supabase
        .from('backup_executions')
        .insert({
          job_id: jobId,
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (execError) throw execError;
      
      // Update job status
      await supabase
        .from('backup_jobs')
        .update({ 
          status: 'running',
          last_run: new Date().toISOString(),
        })
        .eq('id', jobId);

      // Simulate backup execution (in production this would call an edge function)
      const simulateBackup = async () => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 5000));
        
        const success = Math.random() > 0.2; // 80% success rate
        const duration = Math.floor(Math.random() * 300) + 60;
        const fileSize = Math.floor(Math.random() * 500000000) + 10000000;
        
        const updateData: Partial<BackupExecution> = {
          status: success ? 'success' : 'failed',
          completed_at: new Date().toISOString(),
          duration,
          ...(success ? {
            file_size: fileSize,
            file_name: `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.dump`,
            checksum: `sha256:${Math.random().toString(36).substring(2, 15)}`,
            logs: `[${new Date().toISOString()}] Backup started\n[${new Date().toISOString()}] Connecting to database...\n[${new Date().toISOString()}] Running pg_dump...\n[${new Date().toISOString()}] Compressing backup...\n[${new Date().toISOString()}] Uploading to destination...\n[${new Date().toISOString()}] Backup completed successfully`,
          } : {
            error_message: 'Connection timeout: could not connect to database',
            logs: `[${new Date().toISOString()}] Backup started\n[${new Date().toISOString()}] Connecting to database...\n[${new Date().toISOString()}] ERROR: Connection timeout after 30s\n[${new Date().toISOString()}] Backup failed`,
          }),
        };
        
        await supabase
          .from('backup_executions')
          .update(updateData)
          .eq('id', execution.id);
        
        await supabase
          .from('backup_jobs')
          .update({ status: success ? 'success' : 'failed' })
          .eq('id', jobId);
        
        // Create alert for failures
        if (!success) {
          await supabase
            .from('alerts')
            .insert({
              job_id: jobId,
              execution_id: execution.id,
              type: 'failure',
              title: 'Backup falhou',
              message: 'Connection timeout: could not connect to database',
            });
        }
        
        queryClient.invalidateQueries({ queryKey: ['executions'] });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['alerts'] });
        
        if (success) {
          toast.success('Backup concluído com sucesso!');
        } else {
          toast.error('Backup falhou');
        }
      };
      
      // Run simulation in background
      simulateBackup();
      
      return execution;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.info('Backup em execução...');
    },
    onError: (error) => {
      toast.error('Erro ao executar backup: ' + error.message);
    },
  });
}
