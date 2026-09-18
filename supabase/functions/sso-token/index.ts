import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyClientSecret } from "../_shared/clientAuth.ts";
import { generateAccessToken, generateRefreshToken } from "../_shared/jwt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Verify PKCE code challenge
async function verifyPKCE(verifier: string, challenge: string, method: string): Promise<boolean> {
  if (method === 'plain') {
    return verifier === challenge;
  }
  
  // S256: base64url(sha256(verifier)) === challenge
  if (method === 'S256') {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    
    // Convert to base64url
    let base64 = btoa(String.fromCharCode(...hashArray));
    base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    return base64 === challenge;
  }
  
  return false;
}

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
      grant_type = 'authorization_code',
      code,
      client_id,
      client_secret,
      redirect_uri,
      code_verifier // PKCE
    } = body;

    // Validate grant type
    if (grant_type !== 'authorization_code') {
      return new Response(
        JSON.stringify({ error: 'unsupported_grant_type', error_description: 'Only authorization_code is supported' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required parameters
    if (!code || !client_id || !redirect_uri) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate client credentials
    const { data: client, error: clientError } = await supabase
      .from('oauth_clients')
      .select('*')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'invalid_client', error_description: 'Unknown or inactive client' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify client_secret (bcrypt hash, fallback plaintext legacy)
    if (client.client_secret && client_secret) {
      const secretValid = await verifyClientSecret(client.client_secret, client_secret);
      if (!secretValid) {
        return new Response(
          JSON.stringify({ error: 'invalid_client', error_description: 'Invalid client credentials' }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (client.client_secret && !client_secret && !code_verifier) {
      return new Response(
        JSON.stringify({ error: 'invalid_client', error_description: 'client_secret is required' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find and validate authorization code
    const { data: authCode, error: codeError } = await supabase
      .from('oauth_codes')
      .select('*')
      .eq('code', code)
      .eq('client_id', client_id)
      .eq('is_used', false)
      .single();

    if (codeError || !authCode) {
      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check code expiration
    if (new Date(authCode.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'Authorization code has expired' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate redirect_uri matches
    if (authCode.redirect_uri !== redirect_uri) {
      return new Response(
        JSON.stringify({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify PKCE if code_challenge was provided
    if (authCode.code_challenge) {
      if (!code_verifier) {
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'code_verifier is required for PKCE' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const pkceValid = await verifyPKCE(
        code_verifier, 
        authCode.code_challenge, 
        authCode.code_challenge_method || 'S256'
      );
      
      if (!pkceValid) {
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE verification failed' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Mark code as used
    await supabase
      .from('oauth_codes')
      .update({ is_used: true })
      .eq('id', authCode.id);

    // Get user profile with wallet info for JWT claims
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, fun_id')
      .eq('id', authCode.user_id)
      .single();

    // Lấy email từ auth.users (profiles không lưu email)
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(authCode.user_id);

    // Generate JWT access token with claims
    const access_token = await generateAccessToken({
      sub: authCode.user_id,
      fun_id: profile?.fun_id || '',
      username: profile?.username || '',
      custodial_wallet: null,
      scope: authCode.scope
    });

    // Generate opaque refresh token (stored in DB for security)
    const refresh_token = generateRefreshToken(96);
    const access_token_expires_in = 3600; // 1 hour
    const refresh_token_expires_in = 30 * 24 * 3600; // 30 days

    // Upsert tokens (replace existing tokens for same user+client)
    const { error: tokenError } = await supabase
      .from('cross_platform_tokens')
      .upsert({
        user_id: authCode.user_id,
        client_id,
        access_token, // Store JWT for reference/revocation
        refresh_token,
        scope: authCode.scope,
        access_token_expires_at: new Date(Date.now() + access_token_expires_in * 1000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + refresh_token_expires_in * 1000).toISOString(),
        is_revoked: false,
        last_used_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,client_id'
      });

    if (tokenError) {
      console.error('Failed to store tokens:', tokenError);
      return new Response(
        JSON.stringify({ error: 'server_error', error_description: 'Failed to generate tokens' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update last login platform
    await supabase
      .from('profiles')
      .update({ last_login_platform: client.platform_name || client_id })
      .eq('id', authCode.user_id);

    // Return OAuth 2.0 token response with JWT
    return new Response(
      JSON.stringify({
        access_token,
        token_type: 'Bearer',
        expires_in: access_token_expires_in,
        refresh_token,
        scope: authCode.scope.join(' '),
        user: profile ? {
          id: profile.id,
          fun_id: profile.fun_id,
          username: profile.username,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          email: authUser?.email || null
        } : null
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('SSO Token error:', error);
    return new Response(
      JSON.stringify({ error: 'server_error', error_description: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
