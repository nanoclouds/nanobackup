import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'operator' | 'viewer';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading, signOut, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user is approved
  if (profile && !profile.approved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center max-w-md text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10 mb-4">
            <ShieldAlert className="h-8 w-8 text-warning" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Aguardando Aprovação
          </h1>
          <p className="text-muted-foreground mb-6">
            Sua conta foi criada com sucesso, mas ainda precisa ser aprovada por um administrador
            para acessar o sistema. Você receberá uma notificação quando sua conta for aprovada.
          </p>
          <Button variant="outline" onClick={signOut}>
            Sair
          </Button>
        </div>
      </div>
    );
  }

  // Check for role requirement
  if (requiredRole === 'admin' && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
