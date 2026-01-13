-- Fix profiles SELECT policy to prevent exposure of user emails
-- Current policy allows all authenticated users to see all profiles

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can only view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all profiles (for user management page)
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));