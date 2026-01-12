import { Badge } from '@/components/ui/badge';
import { JobStatus } from '@/types/backup';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2, 
  Ban,
  Circle
} from 'lucide-react';

interface StatusBadgeProps {
  status: JobStatus | 'online' | 'offline' | 'unknown' | 'connected' | 'disconnected';
  showIcon?: boolean;
  size?: 'sm' | 'default';
}

const statusConfig = {
  success: { label: 'Sucesso', variant: 'success' as const, icon: CheckCircle2 },
  failed: { label: 'Falha', variant: 'error' as const, icon: XCircle },
  scheduled: { label: 'Agendado', variant: 'muted' as const, icon: Clock },
  running: { label: 'Em execução', variant: 'warning' as const, icon: Loader2 },
  cancelled: { label: 'Cancelado', variant: 'muted' as const, icon: Ban },
  online: { label: 'Online', variant: 'success' as const, icon: CheckCircle2 },
  offline: { label: 'Offline', variant: 'error' as const, icon: XCircle },
  connected: { label: 'Conectado', variant: 'success' as const, icon: CheckCircle2 },
  disconnected: { label: 'Desconectado', variant: 'error' as const, icon: XCircle },
  unknown: { label: 'Desconhecido', variant: 'muted' as const, icon: Circle },
};

export function StatusBadge({ status, showIcon = true, size = 'default' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge 
      variant={config.variant}
      className={size === 'sm' ? 'text-xs px-2 py-0.5' : ''}
    >
      {showIcon && (
        <Icon className={`mr-1 h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      )}
      {config.label}
    </Badge>
  );
}
