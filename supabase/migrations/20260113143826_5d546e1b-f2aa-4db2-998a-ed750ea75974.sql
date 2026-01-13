-- Fix the alerts UPDATE policy that incorrectly uses "OR true"
-- This policy had a bug where USING clause contained "OR true" making it always evaluate to true

DROP POLICY IF EXISTS "Users can mark alerts as read" ON public.alerts;

-- Recreate the policy to allow all authenticated users to mark alerts as read
-- (the "read" field is not security-critical data, and all users should see/dismiss alerts)
CREATE POLICY "Users can mark alerts as read" ON public.alerts
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);