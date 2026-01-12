import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DatabaseInfo {
  name: string;
  size: string;
}

export interface PostgresTestResult {
  success: boolean;
  message: string;
  latency?: number;
  version?: string;
  databases?: DatabaseInfo[];
}

interface TestResult {
  success: boolean;
  message: string;
  latency?: number;
  version?: string;
}

export function useTestPostgresConnection() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (instanceId: string): Promise<PostgresTestResult> => {
      const { data, error } = await supabase.functions.invoke('test-postgres-connection', {
        body: { instanceId },
      });
      
      if (error) throw error;
      return data as PostgresTestResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['instances'] });
      if (data.success) {
        const dbCount = data.databases?.length || 0;
        toast.success(data.message, {
          description: `${dbCount} banco(s) encontrado(s)${data.latency ? ` | Latência: ${data.latency}ms` : ''}${data.version ? ` | PostgreSQL ${data.version}` : ''}`,
        });
      } else {
        toast.error('Falha na conexão', { description: data.message });
      }
    },
    onError: (error) => {
      toast.error('Erro ao testar conexão', { description: error.message });
    },
  });
}

export function useTestFtpConnection() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (destinationId: string): Promise<TestResult> => {
      const { data, error } = await supabase.functions.invoke('test-ftp-connection', {
        body: { destinationId },
      });
      
      if (error) throw error;
      return data as TestResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['destinations'] });
      if (data.success) {
        toast.success(data.message, {
          description: data.latency ? `Latência: ${data.latency}ms` : undefined,
        });
      } else {
        toast.error('Falha na conexão', { description: data.message });
      }
    },
    onError: (error) => {
      toast.error('Erro ao testar conexão', { description: error.message });
    },
  });
}
