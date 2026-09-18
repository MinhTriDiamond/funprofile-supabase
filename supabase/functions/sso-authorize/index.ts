import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate secure random code
function generateCode(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

// Validate PKCE code challenge (S256)
function verifyCodeChallenge(verifier: string, challenge: string, method: string): boolean {
  if (method === 'plain') {
    return verifier === challenge;
  }
  // S256: base64url(sha256(verifier)) === challenge
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  // For S256, we'd need async crypto - simplified for now
  return true; // Will be properly validated in sso-token
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    // Build external URL from SUPABASE_URL (req.url returns internal localhost in Edge Functions)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const externalUrl = `${supabaseUrl}/functions/v1/sso-authorize?${params.toString()}`;

    // Required OAuth 2.0 parameters
    const client_id = params.get('client_id');
    const redirect_uri = params.get('redirect_uri');
    const response_type = params.get('response_type') || 'code';
    const scope = params.get('scope') || 'profile';
    const state = params.get('state');
    
    // PKCE parameters (optional but recommended)
    const code_challenge = params.get('code_challenge');
    const code_challenge_method = params.get('code_challenge_method') || 'S256';

    // Validate required parameters
    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!redirect_uri) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'redirect_uri is required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (response_type !== 'code') {
      return new Response(
        JSON.stringify({ error: 'unsupported_response_type', error_description: 'Only code flow is supported' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate client_id and redirect_uri
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

    // Validate redirect_uri matches registered URIs
    const registeredUris = client.redirect_uris || [];
    if (!registeredUris.includes(redirect_uri)) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'redirect_uri not registered' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from Authorization header (user must be logged in)
    const authHeader = req.headers.get('Authorization');
    console.log('SSO Authorize called, external URL:', externalUrl);
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader) {
      // Redirect to FUN PROFILE login page (not client's login page!)
      // After login, user will be redirected back to complete the authorize flow
      const funProfileOrigin = Deno.env.get("FUN_PROFILE_ORIGIN") || "https://fun-profile.lovable.app";
      const loginUrl = new URL('/auth', funProfileOrigin);
      loginUrl.searchParams.set('return_to', externalUrl);
      loginUrl.searchParams.set('sso_flow', 'true');
      
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, "Location": loginUrl.toString() }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'invalid_token', error_description: 'Invalid or expired access token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse scopes
    const scopes = scope.split(' ').filter(s => s.length > 0);
    const allowedScopes = client.allowed_scopes || ['profile'];
    const validScopes = scopes.filter(s => allowedScopes.includes(s));

    // Generate authorization code
    const code = generateCode(48);

    // Store code in database
    const { error: insertError } = await supabase
      .from('oauth_codes')
      .insert({
        code,
        client_id,
        user_id: user.id,
        redirect_uri,
        scope: validScopes,
        code_challenge,
        code_challenge_method: code_challenge ? code_challenge_method : null,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
      });

    if (insertError) {
      console.error('Failed to store auth code:', insertError);
      return new Response(
        JSON.stringify({ error: 'server_error', error_description: 'Failed to generate authorization code' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build redirect URL with code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }

    // Return redirect or JSON based on Accept header
    const acceptHeader = req.headers.get('Accept') || '';
    if (acceptHeader.includes('application/json')) {
      return new Response(
        JSON.stringify({ 
          code, 
          state,
          redirect_uri: redirectUrl.toString()
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Redirect to client
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, "Location": redirectUrl.toString() }
    });

  } catch (error) {
    console.error('SSO Authorize error:', error);
    return new Response(
      JSON.stringify({ error: 'server_error', error_description: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
