-- Create table to track individual database backups within an execution
CREATE TABLE public.execution_database_backups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_id UUID NOT NULL REFERENCES public.backup_executions(id) ON DELETE CASCADE,
  database_name TEXT NOT NULL,
  status public.job_status NOT NULL DEFAULT 'running',
  file_name TEXT,
  file_size BIGINT,
  checksum TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration INTEGER,
  error_message TEXT,
  logs TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.execution_database_backups ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view database backups"
ON public.execution_database_backups
FOR SELECT
USING (true);

CREATE POLICY "System can manage database backups"
ON public.execution_database_backups
FOR ALL
USING (can_modify(auth.uid()));

-- Add index for faster lookups
CREATE INDEX idx_execution_database_backups_execution_id ON public.execution_database_backups(execution_id);

-- Add postgres_format column to postgres_instances for version compatibility
ALTER TABLE public.postgres_instances 
ADD COLUMN IF NOT EXISTS pg_dump_format TEXT DEFAULT 'custom';

COMMENT ON TABLE public.execution_database_backups IS 'Tracks individual database backups within a job execution';
COMMENT ON COLUMN public.execution_database_backups.file_name IS 'File name pattern: {database_name}_{YYYYMMDD_HHmmss}.dump';