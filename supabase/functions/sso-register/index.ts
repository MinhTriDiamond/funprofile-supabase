import { createClient } from "npm:@supabase/supabase-js@2";
import { generateAccessToken, generateRefreshToken } from "../_shared/jwt.ts";
import { logSignupFailure } from '../_shared/signupFailureLog.ts';
import { assertSignupEnabled } from "../_shared/signupGate.ts";
import { verifyClientSecret } from "../_shared/clientAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 5; // 5 registrations per window
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

// Generate unique username
function generateUsername(email: string): string {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}_${suffix}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      email,
      phone,
      client_id,
      client_secret,
      username,
      full_name,
      avatar_url,
      platform_data, // Additional data from the registering platform
      scope = 'profile'
    } = body;

    // Validate required parameters
    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email && !phone) {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'email or phone is required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting by client_id
    if (!checkRateLimit(client_id)) {
      return new Response(
        JSON.stringify({ error: 'rate_limit_exceeded', error_description: 'Too many registration requests' }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate client
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

    // Verify client_secret (bcrypt only — plaintext fallback removed, T1)
    if (!(await verifyClientSecret(client.client_secret, client_secret))) {
      return new Response(
        JSON.stringify({ error: 'invalid_client', error_description: 'Invalid client credentials' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse scopes — filtered against the client's registered allowed_scopes
    // (SSO hardening 2026-10-15, C4: previously the client could grant
    // itself any scope, e.g. wallet/rewards/soul, regardless of its grant)
    const requestedScopes = scope.split(' ').filter((s: string) => s.length > 0);
    const allowedScopes: string[] = client.allowed_scopes || ['profile'];
    const scopes = requestedScopes.filter((s: string) => allowedScopes.includes(s));
    if (scopes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'invalid_scope', error_description: 'None of the requested scopes are allowed for this client' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const identifier = email || phone;
    let existingUser = null;

    if (email) {
      const { data: users } = await supabase.auth.admin.listUsers();
      existingUser = users?.users?.find(u => u.email === email);
    }

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      // SSO hardening 2026-10-15 (C4): NEVER issue tokens for an existing
      // account from sso-register. Previously any active client's secret +
      // a known email was enough to obtain access/refresh tokens for that
      // account — a full account-takeover path if one platform's secret
      // leaked. Existing users must sign in through the authorization flow
      // (sso-authorize), where they prove account ownership themselves.
      return new Response(
        JSON.stringify({
          error: 'user_exists',
          error_description: 'An account with this email already exists. Please sign in via the authorization flow instead of registering.',
          is_new_user: false
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Cổng chặn đăng ký (cutover migrate)
      const signupGate = await assertSignupEnabled(supabase, corsHeaders);
      if (signupGate) return signupGate;

      // Create new user in Supabase Auth
      const generatedUsername = username || generateUsername(identifier);
      const userEmail = email || `${phone.replace(/\+/g, '')}@fun.phone`;
      
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: userEmail,
        email_confirm: true, // Auto-confirm for SSO registrations
        user_metadata: {
          username: generatedUsername,
          full_name: full_name || '',
          avatar_url: avatar_url || '',
          registered_from: client.platform_name || client_id
        }
      });

      if (createError) {
        await logSignupFailure(supabase, { source: 'sso-register', email: userEmail, username: generatedUsername, error: createError });
        console.error('Failed to create user:', createError);
        return new Response(
          JSON.stringify({ error: 'server_error', error_description: 'Failed to create user account' }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;
      isNewUser = true;

      // Update profile with additional data
      // (SSO hardening 2026-10-15, C4: no longer auto-sets
      // law_of_light_accepted — accepting the Law of Light must be the
      // user's own act inside FUN Profile, not a platform's say-so.)
      const updateData: Record<string, unknown> = {
        registered_from: client.platform_name || client_id
      };

      if (phone) {
        updateData.phone = phone;
      }

      await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      // Store platform_data in separate table
      if (platform_data) {
        await supabase
          .from('platform_user_data')
          .insert({
            user_id: userId,
            client_id: client_id,
            data: platform_data,
            sync_count: 1,
            last_sync_mode: 'initial',
            synced_at: new Date().toISOString()
          });
      }

    }

    // (scopes were parsed + filtered against allowed_scopes before user creation)

    // Get user profile for JWT claims
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, fun_id, wallet_address')
      .eq('id', userId)
      .single();

    // Generate JWT access token (client-bound — C2 fix)
    const access_token = await generateAccessToken({
      sub: userId,
      fun_id: profile?.fun_id || '',
      username: profile?.username || '',
      client_id,
      scope: scopes
    });

    // Generate opaque refresh token
    const refresh_token = generateRefreshToken(96);
    const access_token_expires_in = 3600; // 1 hour
    const refresh_token_expires_in = 30 * 24 * 3600; // 30 days

    // Store tokens
    const { error: tokenError } = await supabase
      .from('cross_platform_tokens')
      .upsert({
        user_id: userId,
        client_id,
        access_token,
        refresh_token,
        scope: scopes,
        access_token_expires_at: new Date(Date.now() + access_token_expires_in * 1000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + refresh_token_expires_in * 1000).toISOString(),
        is_revoked: false,
        last_used_at: new Date().toISOString(),
        device_info: platform_data?.device || null
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

    // Get Soul NFT
    const { data: soulNft } = await supabase
      .from('soul_nfts')
      .select('soul_element, soul_level')
      .eq('user_id', userId)
      .single();

    // Update last login platform
    await supabase
      .from('profiles')
      .update({ last_login_platform: client.platform_name || client_id })
      .eq('id', userId);

    return new Response(
      JSON.stringify({
        access_token,
        token_type: 'Bearer',
        expires_in: access_token_expires_in,
        refresh_token,
        scope: scopes.join(' '),
        is_new_user: isNewUser,
        user: profile ? {
          id: profile.id,
          fun_id: profile.fun_id,
          username: profile.username,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          wallet_address: profile.wallet_address,
          soul: soulNft ? {
            element: soulNft.soul_element,
            level: soulNft.soul_level
          } : null
        } : null
      }),
      { status: isNewUser ? 201 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('SSO Register error:', error);
    return new Response(
      JSON.stringify({ error: 'server_error', error_description: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
