import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface SuccessRateDataPoint {
  date: string;
  success: number;
  failed: number;
  total: number;
}

export function useSuccessRateData() {
  return useQuery({
    queryKey: ['success-rate-chart'],
    queryFn: async () => {
      const today = new Date();
      const dataPoints: SuccessRateDataPoint[] = [];
      
      // Fetch data for the last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = subDays(today, i);
        const dayStart = startOfDay(date).toISOString();
        const dayEnd = endOfDay(date).toISOString();
        
        // Get total executions for this day
        const { count: totalCount } = await supabase
          .from('backup_executions')
          .select('*', { count: 'exact', head: true })
          .gte('started_at', dayStart)
          .lte('started_at', dayEnd);
        
        // Get successful executions for this day
        const { count: successCount } = await supabase
          .from('backup_executions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'success')
          .gte('started_at', dayStart)
          .lte('started_at', dayEnd);
        
        // Get failed executions for this day
        const { count: failedCount } = await supabase
          .from('backup_executions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'failed')
          .gte('started_at', dayStart)
          .lte('started_at', dayEnd);
        
        const total = totalCount ?? 0;
        const successful = successCount ?? 0;
        const failed = failedCount ?? 0;
        
        // Calculate success rate as percentage
        const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
        const failRate = total > 0 ? Math.round((failed / total) * 100) : 0;
        
        // Format date label
        const dateLabel = i === 0 
          ? 'Hoje' 
          : format(date, 'dd MMM', { locale: ptBR });
        
        dataPoints.push({
          date: dateLabel,
          success: successRate,
          failed: failRate,
          total,
        });
      }
      
      return dataPoints;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
