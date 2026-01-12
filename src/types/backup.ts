export type JobStatus = 'scheduled' | 'running' | 'success' | 'failed' | 'cancelled';
export type UserRole = 'admin' | 'operator' | 'viewer';
export type Environment = 'production' | 'staging' | 'development';
export type BackupFormat = 'custom' | 'sql';
export type CompressionType = 'gzip' | 'zstd' | 'none';
export type FtpProtocol = 'ftp' | 'ftps' | 'sftp';

export interface PostgresInstance {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslEnabled: boolean;
  version?: string;
  tags: {
    client?: string;
    environment: Environment;
    criticality?: 'low' | 'medium' | 'high' | 'critical';
  };
  status: 'online' | 'offline' | 'unknown';
  lastChecked?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FtpDestination {
  id: string;
  name: string;
  protocol: FtpProtocol;
  host: string;
  port: number;
  username: string;
  baseDirectory: string;
  passiveMode?: boolean;
  status: 'connected' | 'disconnected' | 'unknown';
  lastTested?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BackupJob {
  id: string;
  name: string;
  instanceId: string;
  instance?: PostgresInstance;
  destinationId: string;
  destination?: FtpDestination;
  format: BackupFormat;
  compression: CompressionType;
  schedule: string; // cron expression
  enabled: boolean;
  retentionCount?: number;
  retentionDays?: number;
  timeout: number; // in seconds
  status: JobStatus;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BackupExecution {
  id: string;
  jobId: string;
  job?: BackupJob;
  status: JobStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // in seconds
  fileSize?: number; // in bytes
  checksum?: string;
  errorMessage?: string;
  logs?: string;
  createdAt: Date;
}

export interface DashboardStats {
  totalInstances: number;
  totalJobs: number;
  totalExecutions: number;
  successRate: number;
  lastBackup?: BackupExecution;
  failedJobs: number;
  runningJobs: number;
  scheduledJobs: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  environments: Environment[];
  createdAt: Date;
  lastLogin?: Date;
}
