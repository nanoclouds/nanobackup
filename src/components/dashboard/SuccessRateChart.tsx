import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

const data = [
  { date: '07 Jan', success: 100, failed: 0 },
  { date: '08 Jan', success: 95, failed: 5 },
  { date: '09 Jan', success: 100, failed: 0 },
  { date: '10 Jan', success: 90, failed: 10 },
  { date: '11 Jan', success: 100, failed: 0 },
  { date: '12 Jan', success: 95, failed: 5 },
  { date: 'Hoje', success: 93, failed: 7 },
];

export function SuccessRateChart() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Taxa de Sucesso</h3>
        <p className="text-sm text-muted-foreground">Últimos 7 dias</p>
      </div>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="hsl(222 47% 16%)" 
              vertical={false}
            />
            <XAxis 
              dataKey="date" 
              stroke="hsl(215 20% 55%)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke="hsl(215 20% 55%)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
              domain={[80, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(222 47% 10%)',
                border: '1px solid hsl(222 47% 16%)',
                borderRadius: '8px',
                color: 'hsl(210 40% 98%)',
              }}
              formatter={(value: number) => [`${value}%`, 'Taxa de Sucesso']}
            />
            <Area
              type="monotone"
              dataKey="success"
              stroke="hsl(142 76% 36%)"
              strokeWidth={2}
              fill="url(#successGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
