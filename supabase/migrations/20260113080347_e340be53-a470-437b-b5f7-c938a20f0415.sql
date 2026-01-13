-- Add column to store discovered databases from connection test
ALTER TABLE public.postgres_instances 
ADD COLUMN IF NOT EXISTS discovered_databases JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.postgres_instances.discovered_databases IS 'List of databases discovered during connection test: [{name: string, size: string}]';