import { useMemo } from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { useExecutions, BackupExecution } from '@/hooks/useExecutions';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';

export function ExecutionTrendChart() {
  const { data: executions, isLoading } = useExecutions();
  
  const chartData = useMemo(() => {
    const days = 7;
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      
      const dayExecutions = executions?.filter((exec: BackupExecution) => {
        const execDate = new Date(exec.started_at);
        return execDate >= dayStart && execDate <= dayEnd;
      }) || [];
      
      const success = dayExecutions.filter((e: BackupExecution) => e.status === 'success').length;
      const failed = dayExecutions.filter((e: BackupExecution) => e.status === 'failed').length;
      const running = dayExecutions.filter((e: BackupExecution) => e.status === 'running').length;
      
      data.push({
        date: i === 0 ? 'Hoje' : format(date, 'dd MMM', { locale: ptBR }),
        success,
        failed,
        running,
        total: success + failed + running,
      });
    }
    
    return data;
  }, [executions]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex h-[300px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Tendência de Execuções</h3>
        <p className="text-sm text-muted-foreground">Últimos 7 dias</p>
      </div>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="hsl(var(--border))" 
              vertical={false}
            />
            <XAxis 
              dataKey="date" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--foreground))',
              }}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px' }}
            />
            <Area
              type="monotone"
              dataKey="success"
              name="Sucesso"
              stroke="hsl(142 76% 36%)"
              strokeWidth={2}
              fill="url(#successGradient)"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="failed"
              name="Falha"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              fill="url(#failedGradient)"
              stackId="2"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
