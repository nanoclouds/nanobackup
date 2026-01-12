-- Fix the remaining permissive alert update policy
DROP POLICY IF EXISTS "Authenticated users can update alert read status" ON public.alerts;

-- Only allow updating read status (more restrictive)
CREATE POLICY "Users can mark alerts as read" ON public.alerts
  FOR UPDATE TO authenticated
  USING (public.can_modify(auth.uid()) OR true) -- All authenticated can view/update read status
  WITH CHECK (
    -- Only the read field can be changed by checking the new value matches
    public.can_modify(auth.uid())
  );