import { useBackendMode } from '@/contexts/BackendModeContext';

interface BackupParams {
  jobId: string;
  instanceId: string;
  destinationId: string;
  databases: string[];
  format?: 'custom' | 'sql';
  compression?: 'gzip' | 'zstd' | 'none';
}

interface BackupStatusResponse {
  backupId: string;
  status: 'pending' | 'dumping' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentDatabase?: string;
  message?: string;
  error?: string;
  result?: {
    files: Array<{
      database: string;
      fileName: string;
      size: number;
      checksum: string;
      ftpPath: string;
    }>;
    totalSize: number;
    duration: number;
  };
}

interface TestConnectionParams {
  type: 'postgres' | 'ftp';
  config: {
    host: string;
    port: number;
    username: string;
    password?: string;
    database?: string;
    sslEnabled?: boolean;
    protocol?: 'ftp' | 'ftps' | 'sftp';
    baseDirectory?: string;
    sshKey?: string;
  };
}

export function useSelfHostedApi() {
  const { config, isSelfHosted, getApiBaseUrl } = useBackendMode();

  const startBackup = async (params: BackupParams): Promise<{ backupId: string }> => {
    if (!isSelfHosted) {
      throw new Error('Self-hosted mode not enabled');
    }

    const response = await fetch(`${getApiBaseUrl()}/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: {
          instanceId: params.instanceId,
          // These would need to be fetched from the instance
        },
        destination: {
          destinationId: params.destinationId,
        },
        options: {
          databases: params.databases,
          format: params.format || 'custom',
          compression: params.compression || 'gzip',
        },
        executionId: params.jobId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to start backup');
    }

    return response.json();
  };

  const getBackupStatus = async (backupId: string): Promise<BackupStatusResponse> => {
    if (!isSelfHosted) {
      throw new Error('Self-hosted mode not enabled');
    }

    const response = await fetch(`${getApiBaseUrl()}/backup/${backupId}`);

    if (!response.ok) {
      throw new Error('Failed to get backup status');
    }

    return response.json();
  };

  const cancelBackup = async (backupId: string): Promise<void> => {
    if (!isSelfHosted) {
      throw new Error('Self-hosted mode not enabled');
    }

    const response = await fetch(`${getApiBaseUrl()}/backup/${backupId}/cancel`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to cancel backup');
    }
  };

  const testPostgresConnection = async (config: TestConnectionParams['config']) => {
    if (!isSelfHosted) {
      throw new Error('Self-hosted mode not enabled');
    }

    const response = await fetch(`${getApiBaseUrl()}/test-postgres`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    return response.json();
  };

  const testFtpConnection = async (config: TestConnectionParams['config']) => {
    if (!isSelfHosted) {
      throw new Error('Self-hosted mode not enabled');
    }

    const response = await fetch(`${getApiBaseUrl()}/test-ftp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    return response.json();
  };

  const healthCheck = async (): Promise<{ status: string; version: string }> => {
    if (!isSelfHosted) {
      throw new Error('Self-hosted mode not enabled');
    }

    const response = await fetch(`${getApiBaseUrl()}/health`);
    return response.json();
  };

  return {
    startBackup,
    getBackupStatus,
    cancelBackup,
    testPostgresConnection,
    testFtpConnection,
    healthCheck,
    isSelfHosted,
    serverUrl: config.selfHostedUrl,
  };
}
