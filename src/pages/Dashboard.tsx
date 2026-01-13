import { MainLayout } from '@/components/layout/MainLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { RecentExecutions } from '@/components/dashboard/RecentExecutions';
import { JobsOverview } from '@/components/dashboard/JobsOverview';
import { SuccessRateChart } from '@/components/dashboard/SuccessRateChart';
import { BackupsByInstanceChart } from '@/components/dashboard/BackupsByInstanceChart';
import { BackupsByDestinationChart } from '@/components/dashboard/BackupsByDestinationChart';
import { ExecutionTrendChart } from '@/components/dashboard/ExecutionTrendChart';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useExecutions } from '@/hooks/useExecutions';
import { useJobs } from '@/hooks/useJobs';
import { 
  Database, 
  Calendar, 
  XCircle, 
  TrendingUp,
  Loader2
} from 'lucide-react';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: executions, isLoading: executionsLoading } = useExecutions();
  const { data: jobs, isLoading: jobsLoading } = useJobs();

  const isLoading = statsLoading || executionsLoading || jobsLoading;

  if (isLoading) {
    return (
      <MainLayout 
        title="Dashboard" 
        subtitle="Visão geral do sistema de backups"
      >
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      title="Dashboard" 
      subtitle="Visão geral do sistema de backups"
    >
      {/* Stats Grid */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Instâncias PostgreSQL"
          value={stats?.totalInstances ?? 0}
          subtitle={`${stats?.onlineInstances ?? 0} online`}
          icon={Database}
        />
        <StatsCard
          title="Jobs Ativos"
          value={stats?.enabledJobs ?? 0}
          subtitle={`${stats?.runningJobs ?? 0} em execução`}
          icon={Calendar}
          variant={stats?.runningJobs ? 'warning' : 'success'}
        />
        <StatsCard
          title="Taxa de Sucesso"
          value={`${stats?.successRate ?? 0}%`}
          subtitle="Total de execuções"
          icon={TrendingUp}
          variant="success"
        />
        <StatsCard
          title="Falhas Recentes"
          value={stats?.failedJobs ?? 0}
          subtitle="Jobs com falha"
          icon={XCircle}
          variant={(stats?.failedJobs ?? 0) > 0 ? 'error' : 'default'}
        />
      </div>

      {/* Charts Row 1 - Success Rate and Trend */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <SuccessRateChart />
        <ExecutionTrendChart />
      </div>

      {/* Charts Row 2 - By Instance and Destination */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <BackupsByInstanceChart />
        <BackupsByDestinationChart />
      </div>

      {/* Quick Status */}
      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">Status do Sistema</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-medium text-foreground">Backups Concluídos</p>
                <p className="text-sm text-muted-foreground">Hoje</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-success">{stats?.todaySuccessful ?? 0}</p>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <Loader2 className={`h-5 w-5 text-warning ${stats?.runningJobs ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <p className="font-medium text-foreground">Em Execução</p>
                <p className="text-sm text-muted-foreground">Jobs ativos</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-warning">{stats?.runningJobs ?? 0}</p>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-foreground">Falhas</p>
                <p className="text-sm text-muted-foreground">Hoje</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-destructive">{stats?.todayFailed ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Jobs Overview */}
      {jobs && jobs.length > 0 && (
        <div className="mb-6">
          <JobsOverview jobs={jobs} />
        </div>
      )}

      {/* Recent Executions */}
      {executions && executions.length > 0 && (
        <RecentExecutions executions={executions.slice(0, 5)} />
      )}

      {/* Empty State */}
      {(!jobs || jobs.length === 0) && (!executions || executions.length === 0) && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Database className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            Bem-vindo ao Nano Backup!
          </h3>
          <p className="mt-2 text-muted-foreground">
            Comece cadastrando uma instância PostgreSQL e configurando seu primeiro job de backup.
          </p>
        </div>
      )}
    </MainLayout>
  );
}
