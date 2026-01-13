import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Check if user has operator or admin role
export async function requireOperatorOrAdmin(
  authHeader: string | null,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ userId: string; role: string }> {
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }

  const supabaseClient = createClient(
    supabaseUrl,
    supabaseAnonKey,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  // Check user role from profiles table
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('role, approved')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("User profile not found");
  }

  // Check if user is approved
  if (!profile.approved) {
    throw new Error("Account pending approval");
  }

  // Check if user has required role
  if (profile.role !== 'admin' && profile.role !== 'operator') {
    throw new Error("Forbidden: Admin or operator role required");
  }

  return { userId: user.id, role: profile.role };
}

// Check if user has admin role only
export async function requireAdmin(
  authHeader: string | null,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ userId: string; role: string }> {
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }

  const supabaseClient = createClient(
    supabaseUrl,
    supabaseAnonKey,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  // Check user role from profiles table
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('role, approved')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("User profile not found");
  }

  // Check if user is approved
  if (!profile.approved) {
    throw new Error("Account pending approval");
  }

  // Check if user has admin role
  if (profile.role !== 'admin') {
    throw new Error("Forbidden: Admin role required");
  }

  return { userId: user.id, role: profile.role };
}
