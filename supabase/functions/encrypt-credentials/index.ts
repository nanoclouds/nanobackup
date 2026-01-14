import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encrypt } from "../_shared/crypto.ts";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EncryptRequest {
  type: 'instance' | 'destination' | 'instance-ssh';
  id: string;
  password?: string;
  ssh_key?: string;
  ssh_password?: string;
  ssh_private_key?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    
    // Verify user has operator or admin role
    await requireOperatorOrAdmin(
      authHeader,
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { type, id, password, ssh_key, ssh_password, ssh_private_key }: EncryptRequest = await req.json();
    
    if (!type || !id) {
      throw new Error("Type and ID are required");
    }

    // Use service role to update encrypted data
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (type === 'instance') {
      const updates: Record<string, string> = {};
      
      if (password !== undefined && password !== '') {
        updates.password = await encrypt(password);
      }
      
      if (Object.keys(updates).length === 0) {
        throw new Error("No credentials to encrypt");
      }

      const { error } = await serviceClient
        .from("postgres_instances")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
    } else if (type === 'instance-ssh') {
      // Encrypt SSH credentials for instance
      const updates: Record<string, string> = {};
      
      if (ssh_password !== undefined && ssh_password !== '') {
        updates.ssh_password = await encrypt(ssh_password);
      }
      
      if (ssh_private_key !== undefined && ssh_private_key !== '') {
        updates.ssh_private_key = await encrypt(ssh_private_key);
      }
      
      if (Object.keys(updates).length === 0) {
        throw new Error("No SSH credentials to encrypt");
      }

      const { error } = await serviceClient
        .from("postgres_instances")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
    } else if (type === 'destination') {
      const updates: Record<string, string> = {};
      
      if (password !== undefined && password !== '') {
        updates.password = await encrypt(password);
      }
      
      if (ssh_key !== undefined && ssh_key !== '') {
        updates.ssh_key = await encrypt(ssh_key);
      }
      
      if (Object.keys(updates).length === 0) {
        throw new Error("No credentials to encrypt");
      }

      const { error } = await serviceClient
        .from("ftp_destinations")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Credentials encrypted successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
