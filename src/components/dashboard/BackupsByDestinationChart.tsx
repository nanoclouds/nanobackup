import { useMemo } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import { useExecutions, BackupExecution } from '@/hooks/useExecutions';
import { Loader2 } from 'lucide-react';

const COLORS = [
  'hsl(221 83% 53%)', // blue
  'hsl(142 76% 36%)', // green
  'hsl(262 83% 58%)', // purple
  'hsl(24 95% 53%)',  // orange
  'hsl(173 80% 40%)', // teal
  'hsl(340 75% 55%)', // pink
];

export function BackupsByDestinationChart() {
  const { data: executions, isLoading } = useExecutions();
  
  const chartData = useMemo(() => {
    if (!executions || executions.length === 0) return [];
    
    const destinationMap = new Map<string, { name: string; value: number }>();
    
    executions.forEach((exec: BackupExecution) => {
      const destName = exec.backup_jobs?.ftp_destinations?.name || 'Desconhecido';
      const destId = exec.backup_jobs?.ftp_destinations?.id || 'unknown';
      
      if (!destinationMap.has(destId)) {
        destinationMap.set(destId, { name: destName, value: 0 });
      }
      
      const entry = destinationMap.get(destId)!;
      entry.value++;
    });
    
    return Array.from(destinationMap.values())
      .sort((a, b) => b.value - a.value)
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
          <h3 className="text-lg font-semibold text-foreground">Backups por Destino</h3>
          <p className="text-sm text-muted-foreground">Distribuição por destino FTP/SFTP</p>
        </div>
        <div className="flex h-[250px] items-center justify-center text-muted-foreground">
          Nenhuma execução registrada
        </div>
      </div>
    );
  }

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Backups por Destino</h3>
        <p className="text-sm text-muted-foreground">Distribuição por destino FTP/SFTP</p>
      </div>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {chartData.map((_, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={COLORS[index % COLORS.length]}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value: number, name: string) => [
                `${value} (${((value / total) * 100).toFixed(1)}%)`,
                name
              ]}
            />
            <Legend 
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => value.length > 15 ? `${value.slice(0, 15)}...` : value}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
