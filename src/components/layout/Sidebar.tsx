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
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/', icon: BarChart3 },
  { name: 'Instâncias', href: '/instances', icon: Database },
  { name: 'Jobs de Backup', href: '/jobs', icon: Calendar },
  { name: 'Destinos FTP', href: '/destinations', icon: FolderSync },
  { name: 'Execuções', href: '/executions', icon: History },
];

const secondaryNav = [
  { name: 'Alertas', href: '/alerts', icon: Bell },
  { name: 'Usuários', href: '/users', icon: Shield },
  { name: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

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
        <nav className="flex-1 space-y-1 px-3 py-4">
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
        </nav>

        {/* Status Footer */}
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
            </span>
            <span className="text-muted-foreground">Sistema operacional</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Última verificação: agora
          </p>
        </div>
      </div>
    </aside>
  );
}
