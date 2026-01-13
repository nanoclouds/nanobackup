import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { useSuccessRateData } from '@/hooks/useSuccessRateData';
import { Loader2 } from 'lucide-react';

export function SuccessRateChart() {
  const { data, isLoading } = useSuccessRateData();

  // Check if there's any data with executions
  const hasData = data && data.some(d => d.total > 0);

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Taxa de Sucesso</h3>
        <p className="text-sm text-muted-foreground">Últimos 7 dias</p>
      </div>
      <div className="h-[250px]">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !hasData ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <p className="text-sm">Nenhuma execução nos últimos 7 dias</p>
            <p className="text-xs mt-1">Execute um backup para visualizar os dados</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
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
                tickFormatter={(value) => `${value}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'success') return [`${value}%`, 'Taxa de Sucesso'];
                  return [`${value}%`, name];
                }}
                labelFormatter={(label, payload) => {
                  if (payload && payload.length > 0) {
                    const point = payload[0].payload;
                    return `${label} (${point.total} execuções)`;
                  }
                  return label;
                }}
              />
              <Area
                type="monotone"
                dataKey="success"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                fill="url(#successGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
