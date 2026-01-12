import { MainLayout } from '@/components/layout/MainLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { RecentExecutions } from '@/components/dashboard/RecentExecutions';
import { JobsOverview } from '@/components/dashboard/JobsOverview';
import { SuccessRateChart } from '@/components/dashboard/SuccessRateChart';
import { 
  mockDashboardStats, 
  mockExecutions, 
  mockJobs 
} from '@/data/mockData';
import { 
  Database, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  TrendingUp
} from 'lucide-react';

export default function Dashboard() {
  const stats = mockDashboardStats;

  return (
    <MainLayout 
      title="Dashboard" 
      subtitle="Visão geral do sistema de backups"
    >
      {/* Stats Grid */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Instâncias PostgreSQL"
          value={stats.totalInstances}
          subtitle="2 online, 1 offline"
          icon={Database}
        />
        <StatsCard
          title="Jobs Ativos"
          value={stats.totalJobs}
          subtitle={`${stats.runningJobs} em execução`}
          icon={Calendar}
          variant="success"
        />
        <StatsCard
          title="Taxa de Sucesso"
          value={`${stats.successRate}%`}
          subtitle="Últimos 30 dias"
          icon={TrendingUp}
          trend={{ value: 2.5, isPositive: true }}
          variant="success"
        />
        <StatsCard
          title="Falhas Recentes"
          value={stats.failedJobs}
          subtitle="Requer atenção"
          icon={XCircle}
          variant={stats.failedJobs > 0 ? 'error' : 'default'}
        />
      </div>

      {/* Chart and Status */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <SuccessRateChart />
        
        {/* Quick Status */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Status do Sistema</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Backups Concluídos</p>
                  <p className="text-sm text-muted-foreground">Hoje</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-success">12</p>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                  <Loader2 className="h-5 w-5 animate-spin text-warning" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Em Execução</p>
                  <p className="text-sm text-muted-foreground">analytics-daily</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-warning">1</p>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Falhas</p>
                  <p className="text-sm text-muted-foreground">Últimas 24h</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-destructive">1</p>
            </div>
          </div>
        </div>
      </div>

      {/* Jobs Overview */}
      <div className="mb-6">
        <JobsOverview jobs={mockJobs} />
      </div>

      {/* Recent Executions */}
      <RecentExecutions executions={mockExecutions} />
    </MainLayout>
  );
}
