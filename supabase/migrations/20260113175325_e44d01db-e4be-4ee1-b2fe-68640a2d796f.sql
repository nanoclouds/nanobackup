-- Add approved column to profiles table for admin approval workflow
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- Add approved_at timestamp to track when a user was approved
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone DEFAULT NULL;

-- Add approved_by to track which admin approved the user
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved_by uuid DEFAULT NULL;

-- Update existing profiles to be approved (so existing users aren't locked out)
UPDATE public.profiles SET approved = true, approved_at = now() WHERE approved = false;

-- Create policy to allow admins to view all profiles (already exists as "Users can view all profiles")
-- Create policy to allow admins to update any profile's approval status
DROP POLICY IF EXISTS "Admins can approve users" ON public.profiles;
CREATE POLICY "Admins can approve users" ON public.profiles
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Create function to update the handle_new_user to set approved = false for new users
-- (first user is auto-approved as admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first_user boolean;
BEGIN
  -- Check if this is the first user
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;
  
  INSERT INTO public.profiles (user_id, email, name, role, approved, approved_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE 
      WHEN is_first_user THEN 'admin'::user_role
      ELSE 'viewer'::user_role
    END,
    -- First user is auto-approved
    is_first_user,
    CASE WHEN is_first_user THEN now() ELSE NULL END
  );
  
  -- Also add to user_roles table
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE 
      WHEN is_first_user THEN 'admin'::user_role
      ELSE 'viewer'::user_role
    END
  );
  
  RETURN NEW;
END;
$$;