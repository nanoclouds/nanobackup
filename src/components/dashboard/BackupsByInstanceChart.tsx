import { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from 'recharts';
import { useExecutions, BackupExecution } from '@/hooks/useExecutions';
import { Loader2 } from 'lucide-react';

export function BackupsByInstanceChart() {
  const { data: executions, isLoading } = useExecutions();
  
  const chartData = useMemo(() => {
    if (!executions || executions.length === 0) return [];
    
    const instanceMap = new Map<string, { name: string; success: number; failed: number }>();
    
    executions.forEach((exec: BackupExecution) => {
      const instanceName = exec.backup_jobs?.postgres_instances?.name || 'Desconhecido';
      const instanceId = exec.backup_jobs?.postgres_instances?.id || 'unknown';
      
      if (!instanceMap.has(instanceId)) {
        instanceMap.set(instanceId, { name: instanceName, success: 0, failed: 0 });
      }
      
      const entry = instanceMap.get(instanceId)!;
      if (exec.status === 'success') {
        entry.success++;
      } else if (exec.status === 'failed') {
        entry.failed++;
      }
    });
    
    return Array.from(instanceMap.values())
      .sort((a, b) => (b.success + b.failed) - (a.success + a.failed))
      .slice(0, 6);
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

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground">Backups por Instância</h3>
          <p className="text-sm text-muted-foreground">Execuções por instância PostgreSQL</p>
        </div>
        <div className="flex h-[250px] items-center justify-center text-muted-foreground">
          Nenhuma execução registrada
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Backups por Instância</h3>
        <p className="text-sm text-muted-foreground">Execuções por instância PostgreSQL</p>
      </div>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="hsl(var(--border))" 
              horizontal={true}
              vertical={false}
            />
            <XAxis 
              type="number"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              type="category"
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={100}
              tickFormatter={(value) => value.length > 12 ? `${value.slice(0, 12)}...` : value}
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
            <Bar 
              dataKey="success" 
              name="Sucesso"
              fill="hsl(142 76% 36%)" 
              radius={[0, 4, 4, 0]}
            />
            <Bar 
              dataKey="failed" 
              name="Falha"
              fill="hsl(var(--destructive))" 
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
