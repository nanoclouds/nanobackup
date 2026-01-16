import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useBackendMode, BackendMode } from '@/contexts/BackendModeContext';
import { Cloud, Server, Loader2, CheckCircle2, XCircle, Globe } from 'lucide-react';
import { toast } from 'sonner';

export function BackendModeCard() {
  const { config, setMode, setSelfHostedUrl, isCloud, isSelfHosted } = useBackendMode();
  const [localUrl, setLocalUrl] = useState(config.selfHostedUrl);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    setLocalUrl(config.selfHostedUrl);
  }, [config.selfHostedUrl]);

  const handleModeChange = (value: string) => {
    setMode(value as BackendMode);
    setConnectionStatus('idle');
  };

  const handleUrlChange = (url: string) => {
    setLocalUrl(url);
    setConnectionStatus('idle');
  };

  const handleSaveUrl = () => {
    setSelfHostedUrl(localUrl);
    toast.success('URL do servidor atualizada');
  };

  const testConnection = async () => {
    setTesting(true);
    setConnectionStatus('idle');
    
    try {
      const normalizedUrl = localUrl.endsWith('/') ? localUrl.slice(0, -1) : localUrl;
      const response = await fetch(`${normalizedUrl}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
          setConnectionStatus('success');
          toast.success('Conexão bem-sucedida!', {
            description: `Servidor NanoBackup v${data.version || '1.0'} online`,
          });
        } else {
          throw new Error('Resposta inválida do servidor');
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Falha na conexão', {
        description: error instanceof Error ? error.message : 'Servidor não encontrado',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle>Modo de Backend</CardTitle>
          </div>
          <Badge variant={isCloud ? 'default' : 'secondary'}>
            {isCloud ? 'Cloud' : 'Self-Hosted'}
          </Badge>
        </div>
        <CardDescription>
          Escolha onde os backups serão processados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={config.mode}
          onValueChange={handleModeChange}
          className="space-y-4"
        >
          {/* Cloud Mode */}
          <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors ${
            isCloud ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
          }`}>
            <RadioGroupItem value="cloud" id="mode-cloud" className="mt-1" />
            <div className="flex-1 space-y-1">
              <Label htmlFor="mode-cloud" className="flex items-center gap-2 cursor-pointer">
                <Cloud className="h-4 w-4" />
                <span className="font-medium">Cloud (Lovable)</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Backups processados via Edge Functions na nuvem. Ideal para começar rapidamente sem configuração de servidor.
              </p>
            </div>
          </div>

          {/* Self-Hosted Mode */}
          <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors ${
            isSelfHosted ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
          }`}>
            <RadioGroupItem value="self-hosted" id="mode-selfhosted" className="mt-1" />
            <div className="flex-1 space-y-1">
              <Label htmlFor="mode-selfhosted" className="flex items-center gap-2 cursor-pointer">
                <Server className="h-4 w-4" />
                <span className="font-medium">Self-Hosted (Docker)</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Backups processados em seu próprio servidor com pg_dump nativo. Melhor performance e controle total.
              </p>
            </div>
          </div>
        </RadioGroup>

        {/* Self-Hosted URL Configuration */}
        {isSelfHosted && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="server-url">URL do Servidor</Label>
              <div className="flex gap-2">
                <Input
                  id="server-url"
                  type="url"
                  placeholder="https://nanobackup.seudominio.com"
                  value={localUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={testConnection}
                  disabled={testing || !localUrl}
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : connectionStatus === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : connectionStatus === 'error' ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    'Testar'
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Endereço do servidor NanoBackup self-hosted (ex: http://localhost:3000 ou https://backup.empresa.com)
              </p>
            </div>

            {localUrl !== config.selfHostedUrl && (
              <Button onClick={handleSaveUrl} className="w-full">
                Salvar URL
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
