import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DashboardStats {
  totalInstances: number;
  onlineInstances: number;
  totalJobs: number;
  enabledJobs: number;
  runningJobs: number;
  failedJobs: number;
  totalExecutions: number;
  successRate: number;
  todaySuccessful: number;
  todayFailed: number;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Fetch instances count
      const { count: totalInstances } = await supabase
        .from('postgres_instances')
        .select('*', { count: 'exact', head: true });
      
      const { count: onlineInstances } = await supabase
        .from('postgres_instances')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'online');
      
      // Fetch jobs counts
      const { count: totalJobs } = await supabase
        .from('backup_jobs')
        .select('*', { count: 'exact', head: true });
      
      const { count: enabledJobs } = await supabase
        .from('backup_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('enabled', true);
      
      const { count: runningJobs } = await supabase
        .from('backup_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'running');
      
      const { count: failedJobs } = await supabase
        .from('backup_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed');
      
      // Fetch executions stats
      const { count: totalExecutions } = await supabase
        .from('backup_executions')
        .select('*', { count: 'exact', head: true });
      
      const { count: successfulExecutions } = await supabase
        .from('backup_executions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'success');
      
      // Today's stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: todaySuccessful } = await supabase
        .from('backup_executions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'success')
        .gte('started_at', today.toISOString());
      
      const { count: todayFailed } = await supabase
        .from('backup_executions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('started_at', today.toISOString());
      
      const successRate = totalExecutions && totalExecutions > 0
        ? ((successfulExecutions ?? 0) / totalExecutions) * 100
        : 0;
      
      return {
        totalInstances: totalInstances ?? 0,
        onlineInstances: onlineInstances ?? 0,
        totalJobs: totalJobs ?? 0,
        enabledJobs: enabledJobs ?? 0,
        runningJobs: runningJobs ?? 0,
        failedJobs: failedJobs ?? 0,
        totalExecutions: totalExecutions ?? 0,
        successRate: Math.round(successRate * 10) / 10,
        todaySuccessful: todaySuccessful ?? 0,
        todayFailed: todayFailed ?? 0,
      } as DashboardStats;
    },
  });
}
