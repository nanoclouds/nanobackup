-- Create storage bucket for backup files
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('backups', 'backups', false, 1073741824)
ON CONFLICT (id) DO NOTHING;

-- Policy: Authenticated users can read backup files
CREATE POLICY "Authenticated users can read backups"
ON storage.objects FOR SELECT
USING (bucket_id = 'backups' AND auth.role() = 'authenticated');

-- Policy: System (operators/admins) can upload backups
CREATE POLICY "Operators can upload backups"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'backups' AND can_modify(auth.uid()));

-- Policy: Admins can delete backups
CREATE POLICY "Admins can delete backups"
ON storage.objects FOR DELETE
USING (bucket_id = 'backups' AND is_admin(auth.uid()));

-- Add storage_path column to track where files are stored
ALTER TABLE public.execution_database_backups 
ADD COLUMN IF NOT EXISTS storage_path TEXT;