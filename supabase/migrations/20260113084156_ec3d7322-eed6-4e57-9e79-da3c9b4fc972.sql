-- Add retry configuration to backup_jobs
ALTER TABLE public.backup_jobs
ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS retry_delay_minutes integer NOT NULL DEFAULT 15;

-- Add retry tracking to backup_executions
ALTER TABLE public.backup_executions
ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS parent_execution_id uuid REFERENCES public.backup_executions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS next_retry_at timestamp with time zone;

-- Create index for retry scheduling
CREATE INDEX IF NOT EXISTS idx_backup_executions_next_retry 
ON public.backup_executions(next_retry_at) 
WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.backup_jobs.max_retries IS 'Maximum number of automatic retry attempts for failed backups (0 = no retries)';
COMMENT ON COLUMN public.backup_jobs.retry_delay_minutes IS 'Delay in minutes before retrying a failed backup';
COMMENT ON COLUMN public.backup_executions.retry_count IS 'Number of retry attempts made for this execution';
COMMENT ON COLUMN public.backup_executions.parent_execution_id IS 'Reference to the original execution if this is a retry';
COMMENT ON COLUMN public.backup_executions.next_retry_at IS 'Scheduled time for the next retry attempt';