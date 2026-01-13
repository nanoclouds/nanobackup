import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'operator' | 'viewer';
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  environments: string[] | null;
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as UserProfile[];
    },
  });
}

export function useApproveUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, approved }: { userId: string; approved: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('profiles')
        .update({
          approved,
          approved_at: approved ? new Date().toISOString() : null,
          approved_by: approved ? user?.id : null,
        })
        .eq('id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(
        variables.approved
          ? 'Usuário aprovado com sucesso!'
          : 'Acesso do usuário revogado!'
      );
    },
    onError: (error) => {
      toast.error('Erro ao atualizar usuário: ' + error.message);
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'operator' | 'viewer' }) => {
      // Update profile role
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', userId);
      
      if (profileError) throw profileError;
      
      // Get user_id from profile to update user_roles
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', userId)
        .single();
      
      if (profile?.user_id) {
        // Update user_roles table as well
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', profile.user_id);
        
        if (roleError) throw roleError;
      }
      
      return { userId, role };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Nível de acesso atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar nível: ' + error.message);
    },
  });
}
