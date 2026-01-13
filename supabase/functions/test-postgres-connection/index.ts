import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt } from "../_shared/crypto.ts";
import { requireOperatorOrAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { instanceId } = await req.json();
    if (!instanceId) {
      throw new Error("Instance ID is required");
    }

    // Fetch instance details
    const { data: instance, error: instanceError } = await supabaseClient
      .from("postgres_instances")
      .select("*")
      .eq("id", instanceId)
      .single();

    if (instanceError || !instance) {
      throw new Error("Instance not found");
    }

    // Decrypt password if encrypted
    const password = await decrypt(instance.password);

    // Try to connect to PostgreSQL using Deno's postgres driver
    const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
    
    const client = new Client({
      hostname: instance.host,
      port: instance.port,
      user: instance.username,
      password: password,
      database: instance.database,
      tls: instance.ssl_enabled ? { enabled: true, enforce: false } : { enabled: false },
      connection: { attempts: 1 },
    });

    const startTime = Date.now();
    
    try {
      await client.connect();
      
      // Get PostgreSQL version
      const versionResult = await client.queryObject<{ version: string }>("SELECT version()");
      const versionMatch = versionResult.rows[0]?.version?.match(/PostgreSQL (\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : null;
      
      // List all databases (excluding templates)
      const dbResult = await client.queryObject<{ datname: string; size: string }>(
        `SELECT datname, pg_size_pretty(pg_database_size(datname)) as size 
         FROM pg_database 
         WHERE datistemplate = false 
         ORDER BY datname`
      );
      const databases = dbResult.rows.map(row => ({
        name: row.datname,
        size: row.size
      }));
      
      await client.end();
      
      const latency = Date.now() - startTime;

      // Update instance status and store discovered databases
      await supabaseClient
        .from("postgres_instances")
        .update({ 
          status: "online", 
          last_checked: new Date().toISOString(),
          version: version || instance.version,
          discovered_databases: databases
        })
        .eq("id", instanceId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Conexão estabelecida com sucesso",
          latency,
          version,
          databases
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (connError: unknown) {
      // Update instance status to offline
      await supabaseClient
        .from("postgres_instances")
        .update({ 
          status: "offline", 
          last_checked: new Date().toISOString()
        })
        .eq("id", instanceId);

      const errorMessage = connError instanceof Error ? connError.message : "Erro desconhecido";
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Falha na conexão: ${errorMessage}`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
