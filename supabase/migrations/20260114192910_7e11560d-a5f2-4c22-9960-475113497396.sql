-- Add SSH fields to postgres_instances for native pg_dump backup
ALTER TABLE public.postgres_instances 
ADD COLUMN IF NOT EXISTS ssh_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ssh_host text,
ADD COLUMN IF NOT EXISTS ssh_port integer DEFAULT 22,
ADD COLUMN IF NOT EXISTS ssh_username text,
ADD COLUMN IF NOT EXISTS ssh_password text,
ADD COLUMN IF NOT EXISTS ssh_private_key text;