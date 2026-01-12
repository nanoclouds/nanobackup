import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { destinationId } = await req.json();
    if (!destinationId) {
      throw new Error("Destination ID is required");
    }

    // Fetch destination details
    const { data: destination, error: destError } = await supabaseClient
      .from("ftp_destinations")
      .select("*")
      .eq("id", destinationId)
      .single();

    if (destError || !destination) {
      throw new Error("Destination not found");
    }

    const startTime = Date.now();
    let success = false;
    let message = "";

    // For SFTP connections, we'll use a different approach
    if (destination.protocol === "sftp") {
      // Since Deno doesn't have a built-in SSH/SFTP client, we'll simulate
      // a connection test using TCP socket check
      try {
        const conn = await Deno.connect({
          hostname: destination.host,
          port: destination.port,
        });
        
        // Read the SSH banner
        const buffer = new Uint8Array(256);
        const bytesRead = await conn.read(buffer);
        
        if (bytesRead && bytesRead > 0) {
          const banner = new TextDecoder().decode(buffer.subarray(0, bytesRead));
          if (banner.startsWith("SSH-")) {
            success = true;
            message = `Servidor SSH/SFTP respondendo: ${banner.split('\n')[0]}`;
          } else {
            message = "Servidor não respondeu com protocolo SSH válido";
          }
        } else {
          message = "Servidor não respondeu";
        }
        
        conn.close();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
        message = `Falha ao conectar: ${errorMessage}`;
      }
    } else {
      // FTP/FTPS - check TCP connectivity and FTP banner
      try {
        const conn = await Deno.connect({
          hostname: destination.host,
          port: destination.port,
        });
        
        // Read FTP welcome message
        const buffer = new Uint8Array(1024);
        const bytesRead = await conn.read(buffer);
        
        if (bytesRead && bytesRead > 0) {
          const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));
          if (response.startsWith("220")) {
            success = true;
            message = `Servidor FTP respondendo: ${response.split('\n')[0].substring(4)}`;
          } else {
            message = `Resposta inesperada do servidor: ${response.split('\n')[0]}`;
          }
        } else {
          message = "Servidor não respondeu";
        }
        
        conn.close();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
        message = `Falha ao conectar: ${errorMessage}`;
      }
    }

    const latency = Date.now() - startTime;

    // Update destination status
    await supabaseClient
      .from("ftp_destinations")
      .update({ 
        status: success ? "online" : "offline", 
        last_tested: new Date().toISOString()
      })
      .eq("id", destinationId);

    return new Response(
      JSON.stringify({ success, message, latency }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
