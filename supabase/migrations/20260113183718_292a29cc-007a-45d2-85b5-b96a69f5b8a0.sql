-- Fix postgres_instances SELECT policy to prevent credential exposure
-- Currently allows all authenticated users to view database passwords

DROP POLICY IF EXISTS "Authenticated users can view instances" ON public.postgres_instances;

-- Only admins and operators can view instances (they contain credentials)
CREATE POLICY "Admins and operators can view instances" ON public.postgres_instances
  FOR SELECT TO authenticated
  USING (can_modify(auth.uid()));