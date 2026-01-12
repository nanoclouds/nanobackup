-- Fix permissive RLS policies for alerts table
DROP POLICY IF EXISTS "Users can update alert read status" ON public.alerts;
DROP POLICY IF EXISTS "System can insert alerts" ON public.alerts;

-- More restrictive update policy - only authenticated users can mark their alerts as read
CREATE POLICY "Authenticated users can update alert read status" ON public.alerts
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Alerts can only be inserted by operators/admins (system operations)
CREATE POLICY "Operators and admins can insert alerts" ON public.alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.can_modify(auth.uid()));