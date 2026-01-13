import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationSettings, useUpdateNotificationSettings } from '@/hooks/useNotificationSettings';
import { Loader2, Bell, Mail, Webhook, User, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Settings() {
  const { profile, user } = useAuth();
  const { data: settings, isLoading } = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();

  const [emailOnSuccess, setEmailOnSuccess] = useState(false);
  const [emailOnFailure, setEmailOnFailure] = useState(true);
  const [webhookOnSuccess, setWebhookOnSuccess] = useState(false);
  const [webhookOnFailure, setWebhookOnFailure] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  // Initialize form with existing settings
  useEffect(() => {
    if (settings) {
      setEmailOnSuccess(settings.email_on_success);
      setEmailOnFailure(settings.email_on_failure);
      setWebhookOnSuccess(settings.webhook_on_success);
      setWebhookOnFailure(settings.webhook_on_failure);
      setWebhookUrl(settings.webhook_url || '');
    }
  }, [settings]);

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      email_on_success: emailOnSuccess,
      email_on_failure: emailOnFailure,
      webhook_on_success: webhookOnSuccess,
      webhook_on_failure: webhookOnFailure,
      webhook_url: webhookUrl || null,
    });
  };

  const hasWebhookEnabled = webhookOnSuccess || webhookOnFailure;

  return (
    <MainLayout title="Configurações" subtitle="Gerencie suas preferências de conta e notificações">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie suas preferências de conta e notificações
          </p>
        </div>

        <div className="grid gap-6">
          {/* Profile Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle>Perfil</CardTitle>
              </div>
              <CardDescription>
                Informações da sua conta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={profile?.name || ''} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user?.email || ''} disabled className="bg-muted" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Função</Label>
                <Input 
                  value={
                    profile?.role === 'admin' ? 'Administrador' : 
                    profile?.role === 'operator' ? 'Operador' : 'Visualizador'
                  } 
                  disabled 
                  className="bg-muted max-w-xs" 
                />
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <CardTitle>Preferências de Notificação</CardTitle>
              </div>
              <CardDescription>
                Configure como e quando você deseja receber notificações sobre os backups
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <>
                  {/* Email Notifications */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium">Notificações por Email</h3>
                    </div>
                    <div className="ml-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="email-success">Backup concluído com sucesso</Label>
                          <p className="text-sm text-muted-foreground">
                            Receber email quando um backup for concluído com sucesso
                          </p>
                        </div>
                        <Switch
                          id="email-success"
                          checked={emailOnSuccess}
                          onCheckedChange={setEmailOnSuccess}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="email-failure">Falha no backup</Label>
                          <p className="text-sm text-muted-foreground">
                            Receber email quando um backup falhar
                          </p>
                        </div>
                        <Switch
                          id="email-failure"
                          checked={emailOnFailure}
                          onCheckedChange={setEmailOnFailure}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Webhook Notifications */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Webhook className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium">Notificações por Webhook</h3>
                    </div>
                    <div className="ml-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="webhook-success">Backup concluído com sucesso</Label>
                          <p className="text-sm text-muted-foreground">
                            Enviar webhook quando um backup for concluído
                          </p>
                        </div>
                        <Switch
                          id="webhook-success"
                          checked={webhookOnSuccess}
                          onCheckedChange={setWebhookOnSuccess}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="webhook-failure">Falha no backup</Label>
                          <p className="text-sm text-muted-foreground">
                            Enviar webhook quando um backup falhar
                          </p>
                        </div>
                        <Switch
                          id="webhook-failure"
                          checked={webhookOnFailure}
                          onCheckedChange={setWebhookOnFailure}
                        />
                      </div>
                      
                      {hasWebhookEnabled && (
                        <div className="space-y-2 pt-2">
                          <Label htmlFor="webhook-url">URL do Webhook</Label>
                          <Input
                            id="webhook-url"
                            type="url"
                            placeholder="https://seu-servidor.com/webhook"
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Um POST será enviado para esta URL com os detalhes do backup
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={updateSettings.isPending}>
                      {updateSettings.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Salvar Configurações
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
