import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@6";
import { logSignupFailure } from '../_shared/signupFailureLog.ts';
import { assertSignupEnabled } from "../_shared/signupGate.ts";
import { checkSignupBlock, SIGNUP_BLOCKED_MESSAGE } from "../_shared/signupBlockGuard.ts";
const ethersVerifyMessage = ethers.verifyMessage;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Best-effort in-memory rate limiting (resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function verifySignature(message: string, signature: string, expectedAddress: string): boolean {
  try {
    const sigRegex = /^0x[a-fA-F0-9]{130}$/;
    if (!sigRegex.test(signature)) return false;
    const addressRegex = /^0x[a-fA-F0-9]{40}$/i;
    if (!addressRegex.test(expectedAddress)) return false;
    const recoveredAddress = ethersVerifyMessage(message, signature) as string | undefined;
    if (!recoveredAddress) return false;
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getSupabase() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  return createClient(url, key);
}

/** Build the internal placeholder email for a wallet address */
function walletEmail(addr: string): string {
  return `wallet_${addr.toLowerCase()}@internal.fun.local`;
}

/** Log security-relevant events (fire-and-forget) */
async function logSecurityEvent(
  supabase: ReturnType<typeof getSupabase>,
  action: string,
  details: Record<string, unknown>,
  ipAddress: string | null,
  userId?: string,
) {
  try {
    await supabase.from('account_activity_logs').insert({
      user_id: userId || '00000000-0000-0000-0000-000000000000',
      action,
      details,
      ip_address: ipAddress,
    });
  } catch (e) {
    console.error('[WEB3-AUTH] Failed to log security event:', e);
  }
}

/** Find existing profile by wallet address across all wallet columns + email fallback */
async function findProfileByWallet(supabase: ReturnType<typeof getSupabase>, normalizedAddr: string) {
  // 1. external_wallet_address (case-insensitive)
  const { data: byExternal } = await supabase
    .from('profiles')
    .select('id, username, external_wallet_address, public_wallet_address, login_wallet_address')
    .ilike('external_wallet_address', normalizedAddr)
    .maybeSingle();
  if (byExternal) return { profile: byExternal, source: 'external' };

  // 2. login_wallet_address (case-insensitive)
  const { data: byLogin } = await supabase
    .from('profiles')
    .select('id, username, external_wallet_address, public_wallet_address, login_wallet_address')
    .ilike('login_wallet_address', normalizedAddr)
    .maybeSingle();
  if (byLogin) return { profile: byLogin, source: 'login' };

  // 3. Legacy wallet_address (case-insensitive)
  const { data: byLegacy } = await supabase
    .from('profiles')
    .select('id, username, wallet_address, external_wallet_address, public_wallet_address, login_wallet_address')
    .ilike('wallet_address', normalizedAddr)
    .maybeSingle();
  if (byLegacy) return { profile: byLegacy, source: 'legacy' };

  // 4. public_wallet_address (case-insensitive)
  const { data: byPublic } = await supabase
    .from('profiles')
    .select('id, username, external_wallet_address, public_wallet_address, login_wallet_address')
    .ilike('public_wallet_address', normalizedAddr)
    .maybeSingle();
  if (byPublic) return { profile: byPublic, source: 'public' };

  // NOTE: email_fallback đã bị XÓA vĩnh viễn vì gây lỗi cross-account login
  // (listUsers filter match không chính xác → trả user sai)

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || null;

  try {
    const body = await req.json();
    const { wallet_address, signature, message, action, nonce, device_hash } = body;

    // ========== ACTION: CHECK (UX-only, no auth) ==========
    if (action === 'check') {
      if (!wallet_address) return jsonResponse({ success: false, error: 'wallet_address is required' }, 400);
      const normalizedAddr = wallet_address.toLowerCase();
      if (!checkRateLimit(`check:${normalizedAddr}`)) return jsonResponse({ success: false, error: 'Too many requests' }, 429);

      const sb = getSupabase();
      const result = await findProfileByWallet(sb, normalizedAddr);
      return jsonResponse({ registered: !!result });
    }

    // ========== ACTION: CHALLENGE (generate nonce for signing) ==========
    if (action === 'challenge') {
      if (!wallet_address) return jsonResponse({ success: false, error: 'wallet_address is required' }, 400);
      const normalizedAddr = wallet_address.toLowerCase();
      if (!checkRateLimit(`challenge:${normalizedAddr}`)) return jsonResponse({ success: false, error: 'Too many requests' }, 429);

      const sb = getSupabase();

      // Global cleanup: delete all expired challenges (batch limit 100)
      await sb.from('wallet_challenges')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .limit(100);

      // Generate crypto nonce
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      const challengeNonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const challengeMessage = [
        'fun.rich wants you to sign in with your Ethereum account:',
        normalizedAddr,
        '',
        'Sign in to FUN Profile',
        '',
        'URI: https://fun.rich',
        'Version: 1',
        'Chain ID: 56',
        `Nonce: ${challengeNonce}`,
        `Issued At: ${issuedAt}`,
      ].join('\n');

      const { error: insertError } = await sb.from('wallet_challenges').insert({
        wallet_address: normalizedAddr,
        nonce: challengeNonce,
        message: challengeMessage,
        expires_at: expiresAt,
        ip_address: ipAddress,
      });

      if (insertError) {
        console.error('[WEB3-AUTH] Challenge insert error:', insertError);
        return jsonResponse({ success: false, error: 'Failed to create challenge' }, 500);
      }

      console.log(`[WEB3-AUTH] Challenge created for: ${normalizedAddr}`);
      return jsonResponse({ success: true, nonce: challengeNonce, message: challengeMessage, expires_at: expiresAt, expiresAt });
    }

    // ========== DEFAULT ACTION: LOGIN (signature verification) ==========
    if (!wallet_address || !signature || !message || !nonce) {
      return jsonResponse({ success: false, error: 'wallet_address, signature, message, and nonce are required' }, 400);
    }

    const normalizedAddress = wallet_address.toLowerCase();
    if (!checkRateLimit(`web3:${normalizedAddress}`)) {
      console.warn(`[WEB3-AUTH] Rate limit exceeded for: ${normalizedAddress}`);
      return jsonResponse({ success: false, error: 'Too many requests. Please wait before trying again.' }, 429);
    }

    console.log(`[WEB3-AUTH] Auth request for wallet: ${wallet_address}`);

    const supabase = getSupabase();

    // Step 1: Verify nonce from DB (single-use, not expired)
    const { data: challenge, error: challengeError } = await supabase
      .from('wallet_challenges')
      .select('*')
      .eq('nonce', nonce)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (challengeError || !challenge) {
      console.warn('[WEB3-AUTH] Invalid or expired nonce');
      await logSecurityEvent(supabase, 'wallet_login_failed_invalid_nonce', {
        wallet_address: normalizedAddress,
        nonce_provided: nonce?.substring(0, 8) + '...',
      }, ipAddress);
      return jsonResponse({ success: false, error: 'Invalid or expired nonce. Please request a new challenge.' }, 401);
    }

    // Mark nonce as used IMMEDIATELY (before any further checks)
    await supabase.from('wallet_challenges').update({ used_at: new Date().toISOString() }).eq('id', challenge.id);

    // SECURITY HARDENING: Verify challenge was issued for THIS wallet address
    if (challenge.wallet_address !== normalizedAddress) {
      console.warn('[WEB3-AUTH] Challenge wallet mismatch!', {
        challenge_wallet: challenge.wallet_address,
        request_wallet: normalizedAddress,
      });
      await logSecurityEvent(supabase, 'suspicious_wallet_login_attempt', {
        challenge_wallet: challenge.wallet_address,
        claimed_wallet: normalizedAddress,
        nonce: nonce?.substring(0, 8) + '...',
      }, ipAddress);
      return jsonResponse({ success: false, error: 'Challenge wallet mismatch' }, 401);
    }

    // SECURITY HARDENING: Verify message integrity (client didn't tamper)
    if (challenge.message !== message) {
      console.warn('[WEB3-AUTH] Message integrity check failed');
      await logSecurityEvent(supabase, 'wallet_login_failed_challenge_mismatch', {
        wallet_address: normalizedAddress,
      }, ipAddress);
      return jsonResponse({ success: false, error: 'Message integrity check failed' }, 401);
    }

    // Step 2: Verify signature cryptographically
    if (!verifySignature(message, signature, normalizedAddress)) {
      console.warn('[WEB3-AUTH] Signature verification failed');
      await logSecurityEvent(supabase, 'wallet_login_failed_invalid_signature', {
        wallet_address: normalizedAddress,
      }, ipAddress);
      return jsonResponse({ success: false, error: 'Invalid signature' }, 401);
    }

    console.log('[WEB3-AUTH] Signature verified');

    // Step 3: Check blacklist
    const { data: blacklisted } = await supabase
      .from('blacklisted_wallets')
      .select('id, reason')
      .eq('wallet_address', normalizedAddress)
      .maybeSingle();

    if (blacklisted) {
      console.warn('[WEB3-AUTH] Wallet blacklisted:', blacklisted.reason);
      return jsonResponse({ success: false, error: 'This wallet has been blacklisted' }, 403);
    }

    // Step 4: Server re-lookup wallet (don't trust client 'check')
    const lookupResult = await findProfileByWallet(supabase, normalizedAddress);

    let userId: string;
    let isNewUser = false;
    let userEmail = '';

    if (lookupResult) {
      // ===== EXISTING USER LOGIN =====
      const existingProfile = lookupResult.profile;
      console.log(`[WEB3-AUTH] Existing user found (via ${lookupResult.source}):`, existingProfile.id);
      userId = existingProfile.id;

      // Migrate legacy wallet if needed
      if (lookupResult.source === 'legacy') {
        const legacyUpdate: Record<string, string> = {
          external_wallet_address: normalizedAddress,
          default_wallet_type: 'external',
        };
        if (!existingProfile.public_wallet_address) {
          legacyUpdate.public_wallet_address = normalizedAddress;
        }
        if (!existingProfile.login_wallet_address) {
          legacyUpdate.login_wallet_address = normalizedAddress;
        }
        await supabase.from('profiles').update(legacyUpdate).eq('id', existingProfile.id);
        console.log('[WEB3-AUTH] Migrated legacy wallet to external_wallet_address');
      }

      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      userEmail = userData?.user?.email || '';
    } else {
      // ===== WALLET-FIRST SIGNUP (new) =====
      console.log('[WEB3-AUTH] New wallet, creating wallet-first account:', normalizedAddress);
      isNewUser = true;

      // Cổng chặn đăng ký (cutover migrate)
      const signupGate = await assertSignupEnabled(supabase, corsHeaders);
      if (signupGate) return signupGate;

      // Chốt chặn đăng ký: ví nằm trong danh sách chặn hợp nhất, hoặc thiết bị
      // đã bị gắn cờ và vượt ngưỡng — chỉ áp khi TẠO tài khoản mới bằng ví.
      const blockCheck = await checkSignupBlock(supabase, {
        walletAddress: normalizedAddress,
        deviceHash: typeof device_hash === 'string' ? device_hash : null,
        source: 'sso-web3-auth',
        ipAddress,
      });
      if (blockCheck.blocked) {
        console.warn('[WEB3-AUTH] Signup blocked by guard:', blockCheck.rule, blockCheck.blockType);
        return jsonResponse({ success: false, error: 'signup_blocked', message: SIGNUP_BLOCKED_MESSAGE }, 403);
      }

      const placeholderEmail = walletEmail(normalizedAddress);

      // Create auth user with system email
      const { data: newAuthUser, error: createError } = await supabase.auth.admin.createUser({
        email: placeholderEmail,
        email_confirm: false,
        user_metadata: {
          signup_method: 'wallet',
          is_system_email: true,
          wallet_address: normalizedAddress,
        },
      });

      if (createError || !newAuthUser?.user) {
        await logSignupFailure(supabase, { source: 'sso-web3-auth', email: placeholderEmail, username: null, error: createError, context: { wallet_address: normalizedAddress } });
        console.error('[WEB3-AUTH] Failed to create auth user:', createError);
        return jsonResponse({ success: false, error: 'Failed to create account' }, 500);
      }

      userId = newAuthUser.user.id;
      userEmail = placeholderEmail;

      // Wait for handle_new_user trigger to create profile row, then UPDATE it
      const profileData = {
        signup_method: 'wallet',
        reward_locked: true,
        account_status: 'limited',
        external_wallet_address: normalizedAddress,
        login_wallet_address: normalizedAddress,
        default_wallet_type: 'external',
      };

      // First attempt
      await new Promise(r => setTimeout(r, 300));
      const { error: profileError } = await supabase.from('profiles')
        .update(profileData)
        .eq('id', userId);

      if (profileError) {
        console.warn('[WEB3-AUTH] Profile update attempt 1 failed, retrying...', profileError);
        await new Promise(r => setTimeout(r, 700));
        const { error: retryError } = await supabase.from('profiles')
          .update(profileData)
          .eq('id', userId);

        if (retryError) {
          console.error('[WEB3-AUTH] Profile update failed after retry:', retryError);
        }
      }

      // Audit log
      await logSecurityEvent(supabase, 'wallet_signup_created', {
        wallet_address: normalizedAddress,
        signup_method: 'wallet',
      }, ipAddress, userId);

      console.log('[WEB3-AUTH] Wallet-first account created:', userId);
    }

    // Update last login
    await supabase.from('profiles').update({ last_login_platform: 'FUN Profile' }).eq('id', userId);

    // Generate magic link for session
    if (!userEmail) {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      userEmail = userData?.user?.email || '';
    }

    if (!userEmail) {
      return jsonResponse({ success: false, error: 'User email not found' }, 500);
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    });

    if (sessionError) {
      console.error('[WEB3-AUTH] Session generation failed:', sessionError);
      return jsonResponse({ success: false, error: 'Failed to create session' }, 500);
    }

    // Audit log for login
    if (!isNewUser) {
      await logSecurityEvent(supabase, 'wallet_login_succeeded', {
        wallet_address: normalizedAddress,
      }, ipAddress, userId);
    }

    console.log('[WEB3-AUTH] Auth successful for:', userId);

    return jsonResponse({
      success: true,
      message: isNewUser ? 'Account created and authenticated' : 'Authenticated successfully',
      user_id: userId,
      is_new_user: isNewUser,
      token_hash: sessionData?.properties?.hashed_token,
    });

  } catch (error) {
    console.error('[WEB3-AUTH] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse({ success: false, error: errMsg }, 500);
  }
});
