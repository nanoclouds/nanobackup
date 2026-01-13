-- Fix ftp_destinations SELECT policy to prevent credential exposure
-- Currently allows all authenticated users to view FTP passwords and SSH keys

DROP POLICY IF EXISTS "Authenticated users can view destinations" ON public.ftp_destinations;

-- Only admins and operators can view destinations (they contain credentials)
CREATE POLICY "Admins and operators can view destinations" ON public.ftp_destinations
  FOR SELECT TO authenticated
  USING (can_modify(auth.uid()));