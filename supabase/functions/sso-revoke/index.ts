import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const contentType = req.headers.get('content-type') || '';
    let body: Record<string, string>;
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      body = {};
      formData.forEach((value: FormDataEntryValue, key: string) => {
        if (typeof value === 'string') {
          body[key] = value;
        }
      });
    } else {
      body = await req.json();
    }

    const { 
      token, // Can be access_token or refresh_token
      token_type_hint, // 'access_token' or 'refresh_token' (optional)
      client_id
    } = body;

    // Validate required parameters
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'Missing token parameter' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try to find and revoke the token
    let tokenFound = false;

    // Check based on token_type_hint or try both
    if (!token_type_hint || token_type_hint === 'access_token') {
      const { data: accessTokenData, error } = await supabase
        .from('cross_platform_tokens')
        .update({ is_revoked: true })
        .eq('access_token', token)
        .eq('is_revoked', false)
        .select('id')
        .single();

      if (accessTokenData && !error) {
        tokenFound = true;
      }
    }

    if (!tokenFound && (!token_type_hint || token_type_hint === 'refresh_token')) {
      const { data: refreshTokenData, error } = await supabase
        .from('cross_platform_tokens')
        .update({ is_revoked: true })
        .eq('refresh_token', token)
        .eq('is_revoked', false)
        .select('id')
        .single();

      if (refreshTokenData && !error) {
        tokenFound = true;
      }
    }

    // OAuth 2.0 spec says revoke should always return 200
    // even if token was not found (to prevent token probing) — and the
    // response must not reveal which case it was (SSO hardening 2026-10-15)
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Token revocation processed'
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('SSO Revoke error:', error);
    return new Response(
      JSON.stringify({ error: 'server_error', error_description: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
