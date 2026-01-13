import { useBackupProgress } from '@/contexts/BackupProgressContext';
import { Progress } from '@/components/ui/progress';
import { Database, Upload, Package, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BackupProgressBar() {
  const { progress } = useBackupProgress();

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
      default:
        return 'Processando...';
    }
  };

  const elapsed = Math.floor((Date.now() - progress.startedAt.getTime()) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const elapsedStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

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
      </div>

      {/* Progress bar */}
      <Progress 
        value={overallProgress} 
        className={cn(
          "h-2 mb-2",
          progress.phase === 'error' && "[&>div]:bg-destructive",
          progress.phase === 'done' && "[&>div]:bg-green-500"
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
      {progress.phase === 'generating' || progress.phase === 'uploading' ? (
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
      {progress.message && (
        <p className="mt-2 text-xs text-muted-foreground truncate">
          {progress.message}
        </p>
      )}
    </div>
  );
}
