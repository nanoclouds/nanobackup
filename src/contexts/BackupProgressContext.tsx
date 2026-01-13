import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

export interface BackupProgress {
  executionId: string;
  jobName: string;
  databaseName: string;
  currentChunk: number;
  totalChunks: number;
  currentDatabase: number;
  totalDatabases: number;
  phase: 'metadata' | 'generating' | 'uploading' | 'compressing' | 'done' | 'error';
  message: string;
  startedAt: Date;
}

interface BackupProgressContextType {
  progress: BackupProgress | null;
  setProgress: (progress: BackupProgress | null) => void;
  updateProgress: (update: Partial<BackupProgress>) => void;
  clearProgress: () => void;
}

const BackupProgressContext = createContext<BackupProgressContextType | undefined>(undefined);

export function BackupProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgressState] = useState<BackupProgress | null>(null);

  const setProgress = useCallback((progress: BackupProgress | null) => {
    setProgressState(progress);
  }, []);

  const updateProgress = useCallback((update: Partial<BackupProgress>) => {
    setProgressState(prev => prev ? { ...prev, ...update } : null);
  }, []);

  const clearProgress = useCallback(() => {
    setProgressState(null);
  }, []);

  return (
    <BackupProgressContext.Provider value={{ progress, setProgress, updateProgress, clearProgress }}>
      {children}
    </BackupProgressContext.Provider>
  );
}

export function useBackupProgress() {
  const context = useContext(BackupProgressContext);
  if (context === undefined) {
    throw new Error('useBackupProgress must be used within a BackupProgressProvider');
  }
  return context;
}
