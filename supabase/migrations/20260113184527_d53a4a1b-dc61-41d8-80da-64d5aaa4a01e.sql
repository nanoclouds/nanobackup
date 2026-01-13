-- Drop existing permissive policies on backups bucket
DROP POLICY IF EXISTS "Authenticated users can read backups" ON storage.objects;
DROP POLICY IF EXISTS "System can upload backups" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete backups" ON storage.objects;

-- Create restrictive policies for backups bucket - only admins/operators can access
CREATE POLICY "Admins and operators can read backups"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'backups' 
  AND public.can_modify(auth.uid())
);

CREATE POLICY "Admins and operators can upload backups"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'backups' 
  AND public.can_modify(auth.uid())
);

CREATE POLICY "Admins and operators can update backups"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'backups' 
  AND public.can_modify(auth.uid())
);

CREATE POLICY "Admins can delete backups"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'backups' 
  AND public.is_admin(auth.uid())
);