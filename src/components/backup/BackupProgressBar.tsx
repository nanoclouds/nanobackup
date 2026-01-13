import { useBackupProgress } from '@/contexts/BackupProgressContext';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Database, Upload, Package, CheckCircle2, XCircle, Loader2, StopCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BackupProgressBar() {
  const { progress, cancelBackup, isCancelled } = useBackupProgress();

  if (!progress) return null;

  // Calculate overall progress percentage
  const chunkProgress = progress.totalChunks > 0 
    ? (progress.currentChunk / progress.totalChunks) * 100 
    : 0;
  
  const dbProgress = progress.totalDatabases > 0
    ? ((progress.currentDatabase - 1) / progress.totalDatabases) * 100 + 
      (chunkProgress / progress.totalDatabases)
    : chunkProgress;

  const overallProgress = Math.min(Math.round(dbProgress), 100);

  const isRunning = !['done', 'error', 'cancelled'].includes(progress.phase);

  const getPhaseIcon = () => {
    switch (progress.phase) {
      case 'metadata':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'generating':
        return <Database className="h-4 w-4 animate-pulse" />;
      case 'uploading':
        return <Upload className="h-4 w-4 animate-pulse" />;
      case 'compressing':
        return <Package className="h-4 w-4 animate-pulse" />;
      case 'done':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  const getPhaseLabel = () => {
    switch (progress.phase) {
      case 'metadata':
        return 'Obtendo metadados...';
      case 'generating':
        return 'Gerando backup...';
      case 'uploading':
        return 'Enviando para FTP...';
      case 'compressing':
        return 'Compactando arquivo...';
      case 'done':
        return 'Concluído!';
      case 'error':
        return 'Erro';
      case 'cancelled':
        return 'Cancelado';
      default:
        return 'Processando...';
    }
  };

  const elapsed = Math.floor((Date.now() - progress.startedAt.getTime()) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const elapsedStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  const handleCancel = () => {
    cancelBackup();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-card border border-border rounded-lg shadow-lg p-4 animate-in slide-in-from-bottom-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {getPhaseIcon()}
        <span className="font-medium text-sm truncate flex-1">
          {progress.jobName}
        </span>
        <span className="text-xs text-muted-foreground">
          {elapsedStr}
        </span>
        {isRunning && !isCancelled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={handleCancel}
            title="Parar backup"
          >
            <StopCircle className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <Progress 
        value={overallProgress} 
        className={cn(
          "h-2 mb-2",
          progress.phase === 'error' && "[&>div]:bg-destructive",
          progress.phase === 'done' && "[&>div]:bg-green-500",
          progress.phase === 'cancelled' && "[&>div]:bg-yellow-500",
          isCancelled && isRunning && "[&>div]:bg-yellow-500"
        )}
      />

      {/* Details */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Database className="h-3 w-3" />
          <span>
            {progress.databaseName} ({progress.currentDatabase}/{progress.totalDatabases})
          </span>
        </div>
        <span>{overallProgress}%</span>
      </div>

      {/* Chunk progress */}
      {isCancelled && isRunning ? (
        <div className="mt-2 text-xs text-yellow-500 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Cancelando...</span>
        </div>
      ) : progress.phase === 'generating' || progress.phase === 'uploading' ? (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {getPhaseLabel()} Chunk {progress.currentChunk}/{progress.totalChunks}
          </span>
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">
          {getPhaseLabel()}
        </div>
      )}

      {/* Message */}
      {progress.message && !isCancelled && (
        <p className="mt-2 text-xs text-muted-foreground truncate">
          {progress.message}
        </p>
      )}
    </div>
  );
}
