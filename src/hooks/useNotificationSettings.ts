import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface NotificationSettings {
  id: string;
  user_id: string;
  email_on_success: boolean;
  email_on_failure: boolean;
  webhook_on_success: boolean;
  webhook_on_failure: boolean;
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useNotificationSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as NotificationSettings | null;
    },
    enabled: !!user?.id,
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settings: Partial<Omit<NotificationSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      // Check if settings exist
      const { data: existing } = await supabase
        .from('notification_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Update existing settings
        const { data, error } = await supabase
          .from('notification_settings')
          .update({
            ...settings,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new settings
        const { data, error } = await supabase
          .from('notification_settings')
          .insert({
            user_id: user.id,
            email_on_success: settings.email_on_success ?? false,
            email_on_failure: settings.email_on_failure ?? true,
            webhook_on_success: settings.webhook_on_success ?? false,
            webhook_on_failure: settings.webhook_on_failure ?? false,
            webhook_url: settings.webhook_url ?? null,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Configurações salvas com sucesso');
    },
    onError: (error) => {
      console.error('Error updating notification settings:', error);
      toast.error('Erro ao salvar configurações');
    },
  });
}
