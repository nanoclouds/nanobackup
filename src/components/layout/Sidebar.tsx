import { Link, useLocation } from 'react-router-dom';
import { 
  Database, 
  Server, 
  Calendar, 
  FolderSync, 
  History, 
  BarChart3, 
  Settings, 
  Bell,
  Shield,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadAlertsCount } from '@/hooks/useAlerts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Dashboard', href: '/', icon: BarChart3 },
  { name: 'Instâncias', href: '/instances', icon: Database },
  { name: 'Jobs de Backup', href: '/jobs', icon: Calendar },
  { name: 'Destinos FTP', href: '/destinations', icon: FolderSync },
  { name: 'Execuções', href: '/executions', icon: History },
];

const secondaryNav = [
  { name: 'Alertas', href: '/alerts', icon: Bell },
  { name: 'Usuários', href: '/users', icon: Shield, adminOnly: true },
  { name: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const { profile, signOut, isAdmin } = useAuth();
  const { data: unreadCount } = useUnreadAlertsCount();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <Server className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Nano Backup</h1>
            <p className="text-xs text-muted-foreground">PostgreSQL Manager</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto scrollbar-thin">
          <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Principal
          </div>
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'sidebar-link',
                  isActive && 'sidebar-link-active'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}

          <div className="mb-2 mt-6 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sistema
          </div>
          {secondaryNav.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'sidebar-link relative',
                  isActive && 'sidebar-link-active'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
                {item.name === 'Alertas' && unreadCount && unreadCount > 0 && (
                  <Badge variant="error" className="absolute right-2 h-5 min-w-5 justify-center rounded-full p-0 text-[10px]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
              {profile?.name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-foreground">
                {profile?.name || 'Usuário'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.role === 'admin' ? 'Administrador' : 
                 profile?.role === 'operator' ? 'Operador' : 'Visualizador'}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </aside>
  );
}
