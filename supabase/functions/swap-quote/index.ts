import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { path, query } = await req.json();
    if (!path || !query) {
      return new Response(
        JSON.stringify({ _status: 400, reason: "Missing path or query" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("ZEROX_API_KEY") || "";
    const url = `https://api.0x.org${path}?${query}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["0x-api-key"] = apiKey;
    }

    const resp = await fetch(url, { headers });
    const data = await resp.json();

    return new Response(
      JSON.stringify({ ...data, _status: resp.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[swap-quote] error:", err);
    return new Response(
      JSON.stringify({ _status: 500, reason: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
