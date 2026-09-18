import { createClient } from "npm:@supabase/supabase-js@2";
import { generateAccessToken, generateRefreshToken } from "../_shared/jwt.ts";

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
      grant_type = 'refresh_token',
      refresh_token,
      client_id
    } = body;

    // Validate grant type
    if (grant_type !== 'refresh_token') {
      return new Response(
        JSON.stringify({ error: 'unsupported_grant_type', error_description: 'Only refresh_token is supported' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required parameters
    if (!refresh_token || !client_id) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'Missing refresh_token or client_id' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate client
    const { data: client, error: clientError } = await supabase
      .from('oauth_clients')
      .select('client_id, is_active')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'invalid_client', error_description: 'Unknown or inactive client' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find and validate refresh token
    const { data: tokenData, error: tokenError } = await supabase
      .from('cross_platform_tokens')
      .select('*')
      .eq('refresh_token', refresh_token)
      .eq('client_id', client_id)
      .eq('is_revoked', false)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid or revoked refresh token' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check refresh token expiration
    if (new Date(tokenData.refresh_token_expires_at) < new Date()) {
      // Revoke the expired token
      await supabase
        .from('cross_platform_tokens')
        .update({ is_revoked: true })
        .eq('id', tokenData.id);

      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token has expired' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user profile for JWT claims
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, fun_id')
      .eq('id', tokenData.user_id)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'User profile not found' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate new JWT access token with fresh claims
    const new_access_token = await generateAccessToken({
      sub: tokenData.user_id,
      fun_id: profile.fun_id || '',
      username: profile.username || '',
      scope: tokenData.scope
    });

    // Generate new opaque refresh token (token rotation for security)
    const new_refresh_token = generateRefreshToken(96);
    const access_token_expires_in = 3600; // 1 hour
    const refresh_token_expires_in = 30 * 24 * 3600; // 30 days

    // Update tokens in database
    const { error: updateError } = await supabase
      .from('cross_platform_tokens')
      .update({
        access_token: new_access_token,
        refresh_token: new_refresh_token,
        access_token_expires_at: new Date(Date.now() + access_token_expires_in * 1000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + refresh_token_expires_in * 1000).toISOString(),
        last_used_at: new Date().toISOString()
      })
      .eq('id', tokenData.id);

    if (updateError) {
      console.error('Failed to update tokens:', updateError);
      return new Response(
        JSON.stringify({ error: 'server_error', error_description: 'Failed to refresh tokens' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return new tokens
    return new Response(
      JSON.stringify({
        access_token: new_access_token,
        token_type: 'Bearer',
        expires_in: access_token_expires_in,
        refresh_token: new_refresh_token,
        scope: tokenData.scope.join(' ')
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('SSO Refresh error:', error);
    return new Response(
      JSON.stringify({ error: 'server_error', error_description: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
