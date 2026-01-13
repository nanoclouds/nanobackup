import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useUsers, useApproveUser, useUpdateUserRole, type UserProfile } from '@/hooks/useUsers';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search,
  MoreVertical,
  UserCheck,
  UserX,
  ShieldCheck,
  Shield,
  Eye,
  Loader2,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Visualizador',
};

const roleIcons: Record<string, typeof ShieldCheck> = {
  admin: ShieldCheck,
  operator: Shield,
  viewer: Eye,
};

const roleColors: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'muted'> = {
  admin: 'error',
  operator: 'warning',
  viewer: 'secondary',
};

export default function Users() {
  const { data: users = [], isLoading } = useUsers();
  const approveUser = useApproveUser();
  const updateRole = useUpdateUserRole();
  const { profile: currentUser } = useAuth();
  
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    user: UserProfile | null;
    action: 'approve' | 'revoke' | null;
  }>({ open: false, user: null, action: null });

  const filtered = users.filter((user) => {
    const matchesSearch =
      user.name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'pending' && !user.approved) ||
      (filterStatus === 'approved' && user.approved);
    
    return matchesSearch && matchesStatus;
  });

  const pendingCount = users.filter((u) => !u.approved).length;

  const handleApprove = (user: UserProfile) => {
    setConfirmDialog({ open: true, user, action: 'approve' });
  };

  const handleRevoke = (user: UserProfile) => {
    setConfirmDialog({ open: true, user, action: 'revoke' });
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog.user || !confirmDialog.action) return;

    const approved = confirmDialog.action === 'approve';
    await approveUser.mutateAsync({
      userId: confirmDialog.user.id,
      approved,
    });
    setConfirmDialog({ open: false, user: null, action: null });
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'operator' | 'viewer') => {
    await updateRole.mutateAsync({ userId, role: newRole });
  };

  return (
    <MainLayout title="Gerenciamento de Usuários" subtitle="Aprove novos usuários e gerencie permissões">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar usuários..."
              className="bg-secondary pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="w-48 bg-secondary">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os usuários</SelectItem>
              <SelectItem value="pending">
                Pendentes {pendingCount > 0 && `(${pendingCount})`}
              </SelectItem>
              <SelectItem value="approved">Aprovados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {pendingCount > 0 && (
          <Badge variant="warning" className="gap-1">
            <Clock className="h-3 w-3" />
            {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Usuário</TableHead>
              <TableHead className="text-muted-foreground">E-mail</TableHead>
              <TableHead className="text-muted-foreground">Nível</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Cadastro</TableHead>
              <TableHead className="text-right text-muted-foreground">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-12 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum usuário encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => {
                const RoleIcon = roleIcons[user.role];
                const isCurrentUser = user.user_id === currentUser?.user_id;
                
                return (
                  <TableRow key={user.id} className="border-border table-row-hover">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {user.name || 'Sem nome'}
                            {isCurrentUser && (
                              <Badge variant="muted" className="ml-2 text-xs">
                                Você
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{user.email}</span>
                    </TableCell>
                    <TableCell>
                      {isCurrentUser ? (
                        <Badge variant={roleColors[user.role]} className="gap-1">
                          <RoleIcon className="h-3 w-3" />
                          {roleLabels[user.role]}
                        </Badge>
                      ) : (
                        <Select
                          value={user.role}
                          onValueChange={(value) => handleRoleChange(user.id, value as 'admin' | 'operator' | 'viewer')}
                          disabled={updateRole.isPending}
                        >
                          <SelectTrigger className="w-36 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="h-3 w-3" />
                                Administrador
                              </div>
                            </SelectItem>
                            <SelectItem value="operator">
                              <div className="flex items-center gap-2">
                                <Shield className="h-3 w-3" />
                                Operador
                              </div>
                            </SelectItem>
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-3 w-3" />
                                Visualizador
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.approved ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Aprovado
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Pendente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(user.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isCurrentUser && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {!user.approved ? (
                              <DropdownMenuItem
                                onClick={() => handleApprove(user)}
                                disabled={approveUser.isPending}
                              >
                                {approveUser.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <UserCheck className="mr-2 h-4 w-4" />
                                )}
                                Aprovar Usuário
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleRevoke(user)}
                                disabled={approveUser.isPending}
                              >
                                {approveUser.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <UserX className="mr-2 h-4 w-4" />
                                )}
                                Revogar Acesso
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, user: null, action: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === 'approve' ? 'Aprovar Usuário' : 'Revogar Acesso'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'approve' ? (
                <>
                  Você está prestes a aprovar o usuário{' '}
                  <strong>{confirmDialog.user?.name || confirmDialog.user?.email}</strong>. 
                  Ele poderá acessar o sistema com o nível de permissão atribuído.
                </>
              ) : (
                <>
                  Você está prestes a revogar o acesso do usuário{' '}
                  <strong>{confirmDialog.user?.name || confirmDialog.user?.email}</strong>. 
                  Ele não poderá mais acessar o sistema.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={confirmDialog.action === 'revoke' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {approveUser.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {confirmDialog.action === 'approve' ? 'Aprovar' : 'Revogar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
