import { MainLayout } from '@/components/layout/MainLayout';
import { useAlerts, useMarkAlertAsRead, useMarkAllAlertsAsRead } from '@/hooks/useAlerts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, CheckCheck, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function Alerts() {
  const { data: alerts, isLoading } = useAlerts();
  const markAsRead = useMarkAlertAsRead();
  const markAllAsRead = useMarkAllAlertsAsRead();

  const unreadCount = alerts?.filter(a => !a.read).length ?? 0;

  if (isLoading) {
    return (
      <MainLayout title="Alertas" subtitle="Notificações do sistema">
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Alertas" subtitle="Notificações do sistema">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-muted-foreground">{unreadCount} não lidos</p>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllAsRead.mutate()}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Marcar todos como lidos
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {alerts?.map((alert) => (
          <div 
            key={alert.id}
            className={`rounded-lg border p-4 transition-colors ${
              alert.read ? 'border-border bg-card' : 'border-primary/30 bg-primary/5'
            }`}
            onClick={() => !alert.read && markAsRead.mutate(alert.id)}
          >
            <div className="flex items-start gap-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                alert.type === 'failure' ? 'bg-destructive/10' : 
                alert.type === 'success' ? 'bg-success/10' : 'bg-warning/10'
              }`}>
                {alert.type === 'failure' ? <XCircle className="h-5 w-5 text-destructive" /> :
                 alert.type === 'success' ? <CheckCircle className="h-5 w-5 text-success" /> :
                 <AlertTriangle className="h-5 w-5 text-warning" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{alert.title}</p>
                  {!alert.read && <Badge variant="default" className="text-xs">Novo</Badge>}
                </div>
                {alert.message && <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: ptBR })}
                  {alert.backup_jobs && ` • ${alert.backup_jobs.name}`}
                </p>
              </div>
            </div>
          </div>
        ))}

        {(!alerts || alerts.length === 0) && (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">Nenhum alerta</h3>
            <p className="mt-2 text-muted-foreground">Você será notificado sobre eventos importantes aqui.</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
