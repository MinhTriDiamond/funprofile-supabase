import { createClient } from "npm:@supabase/supabase-js@2";
import { logSignupFailure } from '../_shared/signupFailureLog.ts';
import { assertSignupEnabled } from "../_shared/signupGate.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { identifier, code } = await req.json();

    console.log(`[OTP-VERIFY] Verifying OTP for: ${identifier}`);

    if (!identifier || !code) {
      return new Response(
        JSON.stringify({ success: false, error: 'Identifier and code are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find valid OTP
    const { data: otpRecord, error: fetchError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('identifier', identifier.toLowerCase())
      .eq('is_used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !otpRecord) {
      console.warn('[OTP-VERIFY] No valid OTP found');
      return new Response(
        JSON.stringify({ success: false, error: 'OTP expired or not found. Please request a new one.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check max attempts
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      await supabase
        .from('otp_codes')
        .update({ is_used: true })
        .eq('id', otpRecord.id);

      return new Response(
        JSON.stringify({ success: false, error: 'Too many failed attempts. Please request a new OTP.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify OTP
    if (otpRecord.code !== code) {
      await supabase
        .from('otp_codes')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('id', otpRecord.id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid OTP code',
          attempts_remaining: otpRecord.max_attempts - otpRecord.attempts - 1
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[OTP-VERIFY] OTP verified successfully');

    // Mark OTP as used
    await supabase
      .from('otp_codes')
      .update({ is_used: true })
      .eq('id', otpRecord.id);

    // Determine user email
    const userEmail = otpRecord.type === 'email' 
      ? identifier.toLowerCase() 
      : `${identifier.replace(/[^0-9]/g, '')}@phone.local`;

    // Rate limit OTP verification attempts (separate from generation)
    const verifyRateLimit = await supabase.rpc('check_rate_limit', {
      p_key: `otp_verify:${identifier.toLowerCase()}`,
      p_limit: 10,
      p_window_ms: 3600000 // 1 hour
    });
    
    if (verifyRateLimit.data && !verifyRateLimit.data.allowed) {
      console.warn('[OTP-VERIFY] Rate limit exceeded for verification:', identifier);
      return new Response(
        JSON.stringify({ success: false, error: 'Too many verification attempts. Please wait.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optimized: Find user by email using profiles table (O(1) indexed lookup instead of O(n) pagination)
    const findUserByEmail = async (email: string) => {
      const target = email.toLowerCase();
      
      // First check profiles table for existing user (fast indexed lookup)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', target.split('@')[0] + '%')
        .limit(1);
      
      if (profileData && profileData.length > 0) {
        // Verify this user has the matching email via auth.admin
        const { data: userData } = await supabase.auth.admin.getUserById(profileData[0].id);
        if (userData?.user?.email?.toLowerCase() === target) {
          return userData.user;
        }
      }
      
      // Fallback: Single page lookup (most users found here)
      const { data, error } = await supabase.auth.admin.listUsers({ 
        page: 1, 
        perPage: 1000 
      });
      
      if (error) throw error;
      
      const found = data?.users?.find((u) => u.email?.toLowerCase() === target);
      if (found) return found;
      
      // Only paginate if not found and there might be more users (limit to 2 pages)
      if (data?.users?.length === 1000) {
        const { data: pageData, error: pageError } = await supabase.auth.admin.listUsers({ 
          page: 2, 
          perPage: 1000 
        });
        if (pageError) throw pageError;
        
        const foundInPage = pageData?.users?.find((u) => u.email?.toLowerCase() === target);
        if (foundInPage) return foundInPage;
      }
      
      return null;
    };

    // Generate cryptographically secure username
    const generateSecureUsername = (identifier: string): string => {
      let baseUsername = identifier.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      
      // Ensure minimum length - prefix with 'user' if too short
      if (baseUsername.length < 3) {
        baseUsername = 'user' + baseUsername;
      }
      
      // Truncate if too long (leave room for suffix)
      if (baseUsername.length > 20) {
        baseUsername = baseUsername.substring(0, 20);
      }
      
      // Generate cryptographically secure random suffix (6 chars)
      const randomBytes = new Uint8Array(4);
      crypto.getRandomValues(randomBytes);
      const randomSuffix = Array.from(randomBytes)
        .map(b => b.toString(36))
        .join('')
        .substring(0, 6);
      
      const username = `${baseUsername}${randomSuffix}`;
      
      // Final validation: ensure 5-30 chars, alphanumeric only
      if (username.length < 5 || username.length > 30 || !/^[a-z0-9]+$/.test(username)) {
        // Fallback to completely random username
        const fallbackBytes = new Uint8Array(8);
        crypto.getRandomValues(fallbackBytes);
        return 'user' + Array.from(fallbackBytes).map(b => b.toString(36)).join('').substring(0, 12);
      }
      
      return username;
    };

    // Check if user exists
    let user = await findUserByEmail(userEmail);
    let isNewUser = false;

    if (!user) {
      console.log('[OTP-VERIFY] Creating new user for:', userEmail);
      isNewUser = true;
      
      // Generate secure unique username from identifier
      const username = generateSecureUsername(identifier);

      // Cổng chặn đăng ký (cutover migrate)
      const signupGate = await assertSignupEnabled(supabase, corsHeaders);
      if (signupGate) return signupGate;

      // Create new user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: userEmail,
        email_confirm: true,
        user_metadata: {
          username: username,
          registered_from: 'FUN Profile',
          oauth_provider: 'Email OTP',
          identifier: identifier.toLowerCase()
        }
      });

      if (createError) {
        // Handle race condition
        if (
          createError.message?.includes('already been registered') ||
          (createError as unknown as { code?: string }).code === 'email_exists'
        ) {
          console.log('[OTP-VERIFY] User already exists (race condition), fetching...');
          user = await findUserByEmail(userEmail);
          if (!user) {
            return new Response(
              JSON.stringify({ success: false, error: 'User exists but could not be retrieved' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          await logSignupFailure(supabase, { source: 'sso-otp-verify', email: userEmail, username, error: createError });
          console.error('[OTP-VERIFY] Failed to create user:', createError);
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to create user account' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        user = newUser.user;
      }
    }

    // Update last login platform and oauth_provider for new users
    if (user) {
      const updateData: Record<string, string> = { last_login_platform: 'FUN Profile' };
      if (isNewUser) {
        updateData.oauth_provider = 'Email OTP';
        updateData.registered_from = 'FUN Profile';
      }
      await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);
    }

    // Generate session directly using admin API
    console.log('[OTP-VERIFY] Creating session for user:', user?.id);
    
    // Use signInWithPassword with a generated token approach
    // Since we verified OTP, we can generate a session directly
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    });

    if (linkError || !linkData) {
      console.error('[OTP-VERIFY] Failed to generate link:', linkError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the token from the magic link and verify it to get session
    const magicLinkUrl = new URL(linkData.properties?.action_link || '');
    const token_hash = magicLinkUrl.searchParams.get('token');
    const type = magicLinkUrl.searchParams.get('type') as 'magiclink';

    if (!token_hash) {
      console.error('[OTP-VERIFY] No token in magic link');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to extract session token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the token to get a real session
    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
      token_hash,
      type: type || 'magiclink',
    });

    if (sessionError || !sessionData.session) {
      console.error('[OTP-VERIFY] Failed to verify token:', sessionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[OTP-VERIFY] Session created successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'OTP verified successfully',
        user_id: user?.id,
        is_new_user: isNewUser,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[OTP-VERIFY] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
