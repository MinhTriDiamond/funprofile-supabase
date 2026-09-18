import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import { createWalletClient, http, parseUnits, encodeFunctionData, createPublicClient } from 'npm:viem@^2.38.0';
import { privateKeyToAccount } from 'npm:viem@^2.38.0/accounts';
import { bsc } from 'npm:viem@^2.38.0/chains';
import { validateClaimInput } from './validateClaimInput.ts';
import { compareClaimWallet } from './walletMatch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// CAMLY Token config - 3 decimals
const CAMLY_CONTRACT = '0x0910320181889feFDE0BB1Ca63962b0A8882e413';
const CAMLY_DECIMALS = 3;
const MINIMUM_CLAIM = 200000; // Tối thiểu 200.000 CAMLY
const DAILY_CLAIM_CAP = 500000; // Giới hạn 500.000 CAMLY/ngày

// ERC20 Transfer ABI
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Validate authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Token không hợp lệ' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Initialize Supabase client with user token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Verify JWT and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('JWT verification failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Phiên đăng nhập hết hạn' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`Claim request from user: ${userId}`);

    // 4+5. Parse + validate body (BigInt string-based, ví lowercase)
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Bad Request', message: 'Dữ liệu yêu cầu không hợp lệ' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsed = validateClaimInput(rawBody);
    if (!parsed.ok) {
      return new Response(
        JSON.stringify({ error: 'Bad Request', field: parsed.field, message: parsed.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ví luôn lowercase từ đây trở đi
    const wallet_address = parsed.walletAddress;
    // So sánh nghiệp vụ (min/cap) dùng Number trên chuỗi ĐÃ validate
    // (≤ 1e9 CAMLY, ≤ 3 decimals ⇒ nằm trong dải an toàn của double).
    const claimAmount = Number(parsed.amountDecimal);

    // 6. Check rate limit (1 claim per minute per user)
    const { data: rateLimit } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: `claim_reward:${userId}`,
      p_limit: 1,
      p_window_ms: 60000,
    });

    if (rateLimit && !rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate Limited', 
          message: `Vui lòng chờ ${Math.ceil((60000 - (Date.now() % 60000)) / 1000)} giây` 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Check user profile and reward_status
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('reward_status, username, full_name, avatar_url, cover_url, public_wallet_address, claim_freeze_until, wallet_risk_status, reward_locked, fraud_risk_level, claim_speed_limit_until, fraud_trusted, max_claim_per_request')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Not Found', message: 'Không tìm thấy hồ sơ người dùng' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // 7a. Check reward_locked (wallet-first accounts before email verification)
    if (profile.reward_locked === true) {
      return new Response(
        JSON.stringify({
          error: 'Reward Locked',
          message: 'Vui lòng liên kết và xác thực email để mở khóa tính năng rút thưởng.',
          action: 'link_email',
          redirect: '/settings/security'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7aa. Check wallet risk status - BLOCKED users cannot claim
    if (profile.wallet_risk_status === 'blocked') {
      return new Response(
        JSON.stringify({ 
          error: 'Wallet Blocked', 
          message: 'Tài khoản bị tạm khóa do thay đổi ví quá nhiều lần. Vui lòng liên hệ Admin để được hỗ trợ.',
          wallet_risk_status: 'blocked'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7ab. Check claim freeze (after wallet change)
    if (profile.claim_freeze_until) {
      const freezeUntil = new Date(profile.claim_freeze_until);
      if (freezeUntil > new Date()) {
        const hoursLeft = Math.ceil((freezeUntil.getTime() - Date.now()) / (1000 * 60 * 60));
        return new Response(
          JSON.stringify({ 
            error: 'Claim Frozen', 
            message: `Tài khoản đang được kiểm tra bảo mật do thay đổi ví. Vui lòng thử lại sau ${hoursLeft} giờ (${freezeUntil.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}).`,
            freeze_until: profile.claim_freeze_until,
            wallet_risk_status: profile.wallet_risk_status
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 7ac. Check claim speed limit (Step 2 of anti-farm progressive system)
    // SKIP speed limit check for trusted users
    if (profile.claim_speed_limit_until && !profile.fraud_trusted) {
      const speedLimitUntil = new Date(profile.claim_speed_limit_until);
      if (speedLimitUntil > new Date()) {
        const hoursLeft = Math.ceil((speedLimitUntil.getTime() - Date.now()) / (1000 * 60 * 60));
        return new Response(
          JSON.stringify({ 
            error: 'Claim Speed Limited', 
            message: `⚠️ Hệ thống phát hiện hoạt động bất thường. Tốc độ claim bị giới hạn tạm thời. Vui lòng thử lại sau ${hoursLeft} giờ.`,
            speed_limit_until: profile.claim_speed_limit_until,
            fraud_risk_level: profile.fraud_risk_level,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 7b. Check profile completeness (avatar + wallet)
    if (!profile.avatar_url) {
      return new Response(
        JSON.stringify({ error: 'Incomplete Profile', message: 'Vui lòng cập nhật ảnh đại diện trong trang cá nhân trước khi claim' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile.public_wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(profile.public_wallet_address)) {
      return new Response(
        JSON.stringify({ error: 'Incomplete Profile', message: 'Vui lòng cập nhật địa chỉ ví trong trang cá nhân trước khi claim', missing: ['wallet'] }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7b-bis. Đối chiếu ví yêu cầu rút với ví đã đăng ký (KHÔNG chặn cứng).
    // Lệch ví ⇒ ghi cờ + fraud signal để admin thấy rõ khi duyệt.
    const walletMatch = compareClaimWallet(wallet_address, profile.public_wallet_address);
    if (!walletMatch.matches) {
      console.warn(`[claim-reward] wallet ${walletMatch.flag} for user ${userId}: requested=${walletMatch.requested} registered=${walletMatch.registered}`);
      await supabaseAdmin.from('pplp_fraud_signals').insert({
        actor_id: userId,
        signal_type: 'CLAIM_WALLET_MISMATCH',
        severity: 2,
        details: {
          requested_wallet: walletMatch.requested,
          registered_wallet: walletMatch.registered,
          flag: walletMatch.flag,
        },
        source: 'claim-reward',
      }).then(() => {}, (e: unknown) => console.error('fraud signal insert failed', e));
    }



    // 7c. Check cover photo
    if (!profile.cover_url) {
      return new Response(
        JSON.stringify({ error: 'Incomplete Profile', message: 'Vui lòng cập nhật ảnh bìa trong trang cá nhân trước khi claim. Vào trang cá nhân → nhấn vào ảnh bìa để cập nhật!', missing: ['cover_url'] }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7d. Check at least 1 post today (dùng giờ Việt Nam UTC+7)
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowVN = new Date(Date.now() + VN_OFFSET_MS);
    const postTodayStart = new Date(
      Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate()) - VN_OFFSET_MS
    );
    const { count: todayPostCount } = await supabaseAdmin
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', postTodayStart.toISOString());

    if (!todayPostCount || todayPostCount === 0) {
      return new Response(
        JSON.stringify({ error: 'Activity Required', message: 'Bạn cần đăng ít nhất 1 bài viết hôm nay để được claim. Hãy chia sẻ một bài viết trên trang chủ của bạn!', missing: ['today_post'] }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7e. Check full name validity (auto hold unclear names like wallet_xxx)
    const fullName = (profile.full_name || '').trim();
    const username = profile.username || '';
    const isWalletUsername = /^wallet_[a-z0-9]+$/i.test(username);
    const isNameValid = fullName.length >= 4
      && !/^\d+$/.test(fullName)
      && /[a-zA-ZÀ-ỹ]/.test(fullName);

    if (!isNameValid) {
      const holdNote = 'Tên hiển thị không rõ ràng hoặc chưa cập nhật họ tên đầy đủ. Vui lòng cập nhật tên thật.';
      console.warn(`Unclear name for user ${userId}: full_name="${profile.full_name}", username="${username}"`);

      await supabaseAdmin.from('profiles').update({
        reward_status: 'on_hold',
        admin_notes: holdNote,
      }).eq('id', userId);

      await supabaseAdmin.from('pplp_fraud_signals').insert({
        actor_id: userId,
        signal_type: 'UNCLEAR_NAME',
        severity: 2,
        details: { full_name: profile.full_name, username },
        source: 'claim-reward',
      });

      return new Response(JSON.stringify({
        error: 'Incomplete Profile',
        message: 'Tên hiển thị chưa rõ ràng. Vui lòng cập nhật họ tên đầy đủ (tối thiểu 4 ký tự, có chữ cái) trong trang cá nhân. Tài khoản đã được chuyển sang chờ Admin duyệt.',
        missing: ['full_name'],
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 7g. Check account age - must be at least 7 days old
    const accountCreatedAt = new Date(user.created_at);
    const accountAgeDays = (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 7) {
      const daysLeft = Math.ceil(7 - accountAgeDays);
      return new Response(JSON.stringify({
        error: 'Account Too New',
        message: `Tài khoản cần hoạt động ít nhất 7 ngày trước khi được claim. Còn ${daysLeft} ngày nữa bạn sẽ có thể rút thưởng 🌱`,
        missing: ['account_age'],
        days_remaining: daysLeft,
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 7f. Auto fraud detection — 3-step progressive system
    // Skip if admin already approved OR user is fraud_trusted
    if (profile.reward_status !== 'approved' && !profile.fraud_trusted) {
      const fraudWarnings: string[] = [];

      // === CLAIM SYNC CHECK: Detect synchronized claims from same IP ===
      const claimIp = req.headers.get("cf-connecting-ip") 
        || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "unknown";

      if (claimIp !== "unknown") {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        
        const { data: recentIpClaims } = await supabaseAdmin
          .from('pending_claims')
          .select('user_id, amount, created_at')
          .neq('user_id', userId)
          .gte('created_at', thirtyMinAgo);

        if (recentIpClaims && recentIpClaims.length > 0) {
          const claimUserIds = [...new Set(recentIpClaims.map(c => c.user_id))];
          
          const { data: sameIpUsers } = await supabaseAdmin
            .from('login_ip_logs')
            .select('user_id')
            .eq('ip_address', claimIp)
            .in('user_id', claimUserIds)
            .gte('created_at', thirtyMinAgo);

          const sameIpClaimUsers = [...new Set(sameIpUsers?.map(u => u.user_id) || [])];

          // ≥5 accounts claiming from same IP in 30 min → check further
          if (sameIpClaimUsers.length >= 5) {
            const allSuspect = [userId, ...sameIpClaimUsers];

            // === DEVICE FINGERPRINT CHECK ===
            // If same IP has ≥3 different device fingerprints → shared network, skip suspension
            const { data: ipDevices } = await supabaseAdmin
              .from('pplp_device_registry')
              .select('device_hash')
              .in('user_id', allSuspect)
              .gte('fingerprint_version', 2);

            const uniqueDevices = new Set(ipDevices?.map(d => d.device_hash) || []);
            const isSharedNetwork = uniqueDevices.size >= 3;

            if (isSharedNetwork) {
              // Shared network (office, home, event) — log only, NO suspension
              console.log(`[CLAIM SYNC] ${allSuspect.length} users from IP ${claimIp} but ${uniqueDevices.size} unique devices — shared network, logged only`);
              await supabaseAdmin.from('pplp_fraud_signals').insert({
                actor_id: userId, signal_type: 'CLAIM_SYNC_SHARED_NETWORK', severity: 1,
                details: { ip_address: claimIp, user_ids: allSuspect, unique_devices: uniqueDevices.size, note: 'Mạng chung (≥3 thiết bị khác nhau) — không đình chỉ' },
                source: 'claim-reward',
              });
            } else {
              // Same IP + few devices — check behavioral patterns
              const suspectClaims = recentIpClaims.filter(c => sameIpClaimUsers.includes(c.user_id));
              const maxClaimCount = suspectClaims.filter(c => Number(c.amount) >= DAILY_CLAIM_CAP * 0.8).length;
              const maxClaimRatio = suspectClaims.length > 0 ? maxClaimCount / suspectClaims.length : 0;

              // Check synchronized timing (claims within 5 min of each other)
              const timestamps = suspectClaims.map(c => new Date(c.created_at).getTime()).sort();
              let syncPairs = 0;
              for (let i = 1; i < timestamps.length; i++) {
                if (timestamps[i] - timestamps[i - 1] < 5 * 60 * 1000) syncPairs++;
              }
              const syncRatio = timestamps.length > 1 ? syncPairs / (timestamps.length - 1) : 0;

              // ALL 3 conditions must be met: ≥5 users + high max-claim ratio + synchronized timing
              if (maxClaimRatio >= 0.6 && syncRatio >= 0.5) {
                await supabaseAdmin.from('pplp_fraud_signals').insert({
                  actor_id: userId, signal_type: 'CLAIM_SYNC_SUSPICIOUS', severity: 3,
                  details: { ip_address: claimIp, user_ids: allSuspect, claim_count: sameIpClaimUsers.length + 1, max_claim_ratio: maxClaimRatio, sync_ratio: syncRatio, unique_devices: uniqueDevices.size, window: '30min' },
                  source: 'claim-reward',
                });

                // Filter out trusted users from escalation targets
                const { data: trustedCheck } = await supabaseAdmin
                  .from('profiles')
                  .select('id, fraud_trusted')
                  .in('id', allSuspect)
                  .eq('fraud_trusted', true);
                const trustedIds = new Set(trustedCheck?.map(t => t.id) || []);
                const escalateTargets = allSuspect.filter(uid => !trustedIds.has(uid));

                if (escalateTargets.length === 0) {
                  console.log(`[CLAIM SYNC] All ${allSuspect.length} users are trusted — skipping escalation`);
                } else {
                  // Get current risk level to determine action
                  const currentRisk = profile.fraud_risk_level || 0;

                  if (currentRisk === 0) {
                    // STEP 1: Flag internally — allow this claim to proceed
                    await supabaseAdmin.from('profiles').update({
                      fraud_risk_level: 1,
                      admin_notes: `[Step 1] Claim sync: ${allSuspect.length} TK từ cùng IP ${claimIp}, max=${Math.round(maxClaimRatio*100)}%, sync=${Math.round(syncRatio*100)}%. Chỉ đánh dấu.`,
                    }).eq('id', userId);
                    console.log(`[CLAIM SYNC Step 1] User ${userId} flagged — claim allowed`);

                  } else if (currentRisk === 1) {
                    // STEP 2: Soft warning + speed limit + max_claim_per_request = 100000
                    const cooldownUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
                    for (const uid of escalateTargets) {
                      await supabaseAdmin.from('profiles').update({
                        fraud_risk_level: 2,
                        claim_speed_limit_until: cooldownUntil,
                        max_claim_per_request: 100000,
                        admin_notes: `[Step 2] Claim sync lặp lại: ${allSuspect.length} TK từ IP ${claimIp}, max=${Math.round(maxClaimRatio*100)}%, sync=${Math.round(syncRatio*100)}%. Giới hạn claim 48h + tối đa 100k/lần.`,
                      }).eq('id', uid).not('reward_status', 'in', '("banned","approved")');
                    }

                    const { data: admins } = await supabaseAdmin
                      .from('user_roles').select('user_id').eq('role', 'admin');
                    if (admins?.length) {
                      await supabaseAdmin.from('notifications').insert(
                        admins.map(a => ({
                          user_id: a.user_id, actor_id: userId,
                          type: 'admin_claim_sync', read: false,
                          metadata: { ip: claimIp, count: allSuspect.length, step: 2, max_ratio: maxClaimRatio, sync_ratio: syncRatio, unique_devices: uniqueDevices.size },
                        }))
                      );
                    }

                    return new Response(JSON.stringify({
                      error: 'Claim Speed Limited',
                      message: '⚠️ Hệ thống phát hiện hoạt động claim liên tục bất thường từ cùng mạng. Tốc độ claim bị giới hạn tạm thời 48 giờ và tối đa 100.000 CAMLY/lần.',
                      fraud_risk_level: 2,
                    }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

                  } else {
                    // STEP 3: Suspend for manual review — chỉ khi claim liên tục từ cùng IP
                    for (const uid of escalateTargets) {
                      await supabaseAdmin.from('profiles').update({
                        fraud_risk_level: 3,
                        reward_status: 'on_hold',
                        admin_notes: `[Step 3] Claim farm liên tục: ${allSuspect.length} TK từ IP ${claimIp}, max=${Math.round(maxClaimRatio*100)}%, sync=${Math.round(syncRatio*100)}%. Đình chỉ chờ Admin.`,
                      }).eq('id', uid).not('reward_status', 'in', '("banned","approved")');
                    }

                    const { data: admins } = await supabaseAdmin
                      .from('user_roles').select('user_id').eq('role', 'admin');
                    if (admins?.length) {
                      await supabaseAdmin.from('notifications').insert(
                        admins.map(a => ({
                          user_id: a.user_id, actor_id: userId,
                          type: 'admin_claim_sync', read: false,
                          metadata: { ip: claimIp, count: allSuspect.length, step: 3, max_ratio: maxClaimRatio, sync_ratio: syncRatio, unique_devices: uniqueDevices.size },
                        }))
                      );
                    }

                    return new Response(JSON.stringify({
                      error: 'Account Review',
                      message: 'Tài khoản đang chờ Admin xác minh do phát hiện claim liên tục bất thường 🙏',
                    }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                  }
                }
              } else {
                // Just log — not enough evidence to escalate
                console.log(`[CLAIM SYNC] ${allSuspect.length} users from IP ${claimIp} but maxRatio=${Math.round(maxClaimRatio*100)}%, syncRatio=${Math.round(syncRatio*100)}% — below threshold, logged only`);
                await supabaseAdmin.from('pplp_fraud_signals').insert({
                  actor_id: userId, signal_type: 'CLAIM_SYNC_LOG', severity: 1,
                  details: { ip_address: claimIp, user_ids: allSuspect, max_claim_ratio: maxClaimRatio, sync_ratio: syncRatio, unique_devices: uniqueDevices.size, note: 'Chỉ ghi log - chưa đủ bằng chứng' },
                  source: 'claim-reward',
                });
              }
            }
          }
        }
      }

      // Check duplicate avatar/wallet — warning only, no hold
      if (profile.avatar_url) {
        const { count: avatarDups } = await supabaseAdmin
          .from('profiles').select('id', { count: 'exact', head: true })
          .eq('avatar_url', profile.avatar_url).neq('id', userId);
        if (avatarDups && avatarDups > 0) fraudWarnings.push('Ảnh đại diện trùng');
      }
      if (profile.public_wallet_address) {
        const { count: walletDups } = await supabaseAdmin
          .from('profiles').select('id', { count: 'exact', head: true })
          .eq('public_wallet_address', profile.public_wallet_address).neq('id', userId);
        if (walletDups && walletDups > 0) fraudWarnings.push('Ví trùng TK khác');
      }

      if (fraudWarnings.length > 0) {
        console.warn(`Integrity warning for ${userId}: ${fraudWarnings.join('; ')}`);
        await supabaseAdmin.from('pplp_fraud_signals').insert({
          actor_id: userId, signal_type: 'CLAIM_INTEGRITY_WARNING', severity: 2,
          details: { reasons: fraudWarnings, note: 'Chỉ cảnh báo - không hold' },
          source: 'claim-reward',
        });
      }
    } else if (profile.fraud_trusted) {
      // Trusted user — log suspicious activity only, never suspend
      const claimIp = req.headers.get("cf-connecting-ip") 
        || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "unknown";
      console.log(`[CLAIM] Trusted user ${userId} claiming from IP ${claimIp} — fraud checks skipped`);
    }

    const blockedStatuses = ['pending', 'on_hold', 'rejected', 'banned'];
    if (blockedStatuses.includes(profile.reward_status)) {
      const statusMessages: Record<string, string> = {
        pending: 'Tài khoản đang chờ Admin xét duyệt trước khi claim.',
        on_hold: 'Phần thưởng đang bị treo. Vui lòng liên hệ Admin.',
        rejected: 'Phần thưởng đã bị từ chối. Vui lòng liên hệ Admin.',
        banned: 'Tài khoản đã bị khóa. Vui lòng liên hệ Admin.',
      };
      return new Response(
        JSON.stringify({ 
          error: 'Forbidden', 
          message: statusMessages[profile.reward_status] || 'Phần thưởng chưa được duyệt' 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === FIX: Check existing pending claims - block duplicate submissions ===
    const { data: existingPending } = await supabaseAdmin
      .from('pending_claims')
      .select('id, amount')
      .eq('user_id', userId)
      .in('status', ['pending', 'processing']);

    if (existingPending && existingPending.length > 0) {
      const existingTotal = existingPending.reduce((sum, c) => sum + Number(c.amount), 0);
      console.warn(`DUPLICATE_PENDING: User ${userId} already has ${existingPending.length} pending claims totaling ${existingTotal}`);
      return new Response(JSON.stringify({
        error: 'Pending Exists',
        message: `Bạn đang có ${existingPending.length} lệnh claim chờ duyệt (${existingTotal.toLocaleString()} CAMLY). Vui lòng đợi Admin xử lý trước khi tạo lệnh mới.`,
        existing_claims: existingPending.length,
        existing_total: existingTotal,
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 8. Calculate claimable amount using single-user RPC (tránh quét toàn bộ user — fix timeout)
    const { data: rewardsData, error: rewardsError } = await supabase.rpc('get_user_rewards_v2_single', {
      target_user_id: userId,
    });

    if (rewardsError) {
      console.error('Rewards RPC error:', rewardsError);
      return new Response(
        JSON.stringify({ error: 'Internal Error', message: 'Lỗi tính toán phần thưởng' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userReward = rewardsData?.[0];
    const totalReward = Number(userReward?.total_reward) || 0;
    const todayReward = Number(userReward?.today_reward) || 0;

    // Get already claimed amount
    const { data: claims } = await supabase
      .from('reward_claims')
      .select('amount')
      .eq('user_id', userId);

    const claimedAmount = claims?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;

    // === FIX: Get pending claims amounts to subtract from claimable ===
    const { data: pendingClaimsData } = await supabaseAdmin
      .from('pending_claims')
      .select('amount')
      .eq('user_id', userId)
      .in('status', ['pending', 'processing']);

    const pendingAmount = pendingClaimsData?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;

    // Calculate daily claimed amount (Giờ Việt Nam UTC+7 - reset lúc 00:00 VN thay vì 07:00 VN)
    const VN_OFFSET_MS_DAILY = 7 * 60 * 60 * 1000;
    const nowVNDaily = new Date(Date.now() + VN_OFFSET_MS_DAILY);
    const todayStart = new Date(
      Date.UTC(nowVNDaily.getUTCFullYear(), nowVNDaily.getUTCMonth(), nowVNDaily.getUTCDate()) - VN_OFFSET_MS_DAILY
    );

    const { data: todayClaims } = await supabaseAdmin
      .from('reward_claims')
      .select('amount')
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString());

    // === FIX: Include pending claims in daily total ===
    const { data: todayPendingClaims } = await supabaseAdmin
      .from('pending_claims')
      .select('amount')
      .eq('user_id', userId)
      .in('status', ['pending', 'processing'])
      .gte('created_at', todayStart.toISOString());

    const todayPendingAmount = todayPendingClaims?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;

    const todayClaimed = (todayClaims?.reduce((sum, c) => sum + Number(c.amount), 0) || 0) + todayPendingAmount;
    const dailyRemaining = Math.max(0, DAILY_CLAIM_CAP - todayClaimed);
    // === FIX: Subtract pending amount from claimable ===
    const claimableAmount = Math.max(0, totalReward - claimedAmount - pendingAmount);

    // ===== CLAIM VELOCITY CHECK: Phát hiện sớm hành vi farm =====
    // Kiểm tra số lần rút trong 24 giờ thực (không phụ thuộc ngày UTC)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count: recentClaimCount } = await supabaseAdmin
      .from('reward_claims')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', last24h.toISOString());

    // === FIX: Count pending claims in velocity check too ===
    const { count: recentPendingCount } = await supabaseAdmin
      .from('pending_claims')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['pending', 'processing', 'completed'])
      .gte('created_at', last24h.toISOString());

    const totalRecentClaims = (recentClaimCount || 0) + (recentPendingCount || 0);

    // ===== CHECK 1: Giới hạn 2 lần/24h - thông báo friendly =====
    if (totalRecentClaims >= 2) {
      console.warn(`CLAIM_LIMIT: User ${userId} đã rút ${totalRecentClaims} lần trong 24h (claims: ${recentClaimCount}, pending: ${recentPendingCount})`);

      // Lần thứ 3+ → on_hold + fraud signal (phòng race condition)
      if (totalRecentClaims >= 3) {
        await supabaseAdmin.from('profiles').update({
          reward_status: 'on_hold',
          admin_notes: `CLAIM_VELOCITY: Rút ${totalRecentClaims} lần trong 24 giờ (claims: ${recentClaimCount}, pending: ${recentPendingCount}). Nghi ngờ khai thác lỗ hổng. Chờ Admin xác minh.`,
        }).eq('id', userId);

        await supabaseAdmin.from('pplp_fraud_signals').insert({
          actor_id: userId,
          signal_type: 'CLAIM_VELOCITY',
          severity: 4,
          details: { 
            claim_count_24h: totalRecentClaims,
            reward_claims_count: recentClaimCount,
            pending_claims_count: recentPendingCount,
            today_claimed: todayClaimed,
            daily_remaining: dailyRemaining,
            window: '24h',
            threshold: 2
          },
          source: 'claim-reward',
        });

        const { data: admins } = await supabaseAdmin
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');
        if (admins && admins.length > 0) {
          await supabaseAdmin.from('notifications').insert(
            admins.map(a => ({
              user_id: a.user_id,
              actor_id: userId,
              type: 'admin_claim_velocity',
              read: false,
            }))
          );
        }
      }

      return new Response(JSON.stringify({
        error: 'Daily Limit Reached',
        message: 'Bạn đã đạt giới hạn rút 2 lần trong 24 giờ. Vui lòng quay lại ngày mai! 🙏',
        claim_count_24h: totalRecentClaims,
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`User ${userId}: total=${totalReward}, claimed=${claimedAmount}, claimable=${claimableAmount}, requested=${claimAmount}, todayClaimed=${todayClaimed}, dailyRemaining=${dailyRemaining}`);

    // 9. Validate claim amount
    if (claimAmount < MINIMUM_CLAIM) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request', 
          message: 'Cần tối thiểu 200.000 CAMLY để claim. Hãy tiếp tục hoạt động để tích lũy thêm!' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (dailyRemaining <= 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Daily Limit', 
          message: 'Bạn đã claim tối đa 500.000 CAMLY hôm nay, vui lòng quay lại ngày mai',
          daily_claimed: todayClaimed,
          daily_remaining: 0,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enforce max_claim_per_request if set (Step 2 fraud penalty)
    const maxPerRequest = profile.max_claim_per_request;
    const cappedClaimAmount = maxPerRequest ? Math.min(claimAmount, maxPerRequest) : claimAmount;

    // Auto-cap to daily remaining
    const effectiveAmount = Math.min(cappedClaimAmount, claimableAmount, dailyRemaining);

    if (effectiveAmount < MINIMUM_CLAIM) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request', 
          message: `Số dư khả dụng (${claimableAmount.toLocaleString()} CAMLY) hoặc giới hạn còn lại (${dailyRemaining.toLocaleString()} CAMLY) chưa đủ tối thiểu 200.000 CAMLY để claim. Hãy tiếp tục hoạt động để tích lũy thêm!`,
          daily_claimed: todayClaimed,
          daily_remaining: dailyRemaining,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (effectiveAmount <= 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request', 
          message: `Không đủ số dư hoặc đã hết giới hạn hôm nay`,
          daily_claimed: todayClaimed,
          daily_remaining: dailyRemaining,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (effectiveAmount > claimableAmount) {
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request', 
          message: `Số tiền vượt quá số dư khả dụng (${claimableAmount.toLocaleString()} CAMLY)` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 10. Instead of sending on-chain immediately, create a pending_claim for admin approval
    console.log(`Creating pending claim: ${effectiveAmount} CAMLY for user ${userId} to wallet ${wallet_address}`);

    const { data: pendingClaim, error: pendingError } = await supabaseAdmin
      .from('pending_claims')
      .insert({
        user_id: userId,
        amount: effectiveAmount,
        wallet_address: wallet_address.toLowerCase(),
        status: 'pending',
      })
      .select('id')
      .single();

    if (pendingError) {
      console.error('Failed to create pending claim:', pendingError);
      return new Response(
        JSON.stringify({ error: 'Internal Error', message: 'Lỗi khi tạo lệnh claim' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Notify admins about new pending claim
    const { data: admins } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      await supabaseAdmin.from('notifications').insert(
        admins.map(a => ({
          user_id: a.user_id,
          actor_id: userId,
          type: 'pending_claim',
          read: false,
        }))
      );
    }

    // Log to audit
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: userId,
      target_user_id: userId,
      action: 'CLAIM_REQUEST',
      details: {
        amount: effectiveAmount,
        wallet_address,
        registered_wallet: walletMatch.registered,
        wallet_match: walletMatch.flag,
        pending_claim_id: pendingClaim.id,
      },
      reason: `Requested claim ${effectiveAmount.toLocaleString()} CAMLY to ${wallet_address}`,
    });

    const newDailyClaimed = todayClaimed + effectiveAmount;
    console.log(`Pending claim created: ${pendingClaim.id} for ${effectiveAmount} CAMLY`);

    // Return pending response (NOT success with tx_hash)
    return new Response(
      JSON.stringify({
        success: true,
        pending: true,
        pending_claim_id: pendingClaim.id,
        amount: effectiveAmount,
        wallet_address,
        message: `Lệnh claim ${effectiveAmount.toLocaleString()} CAMLY đã được gửi, chờ Admin duyệt ⏳`,
        daily_claimed: newDailyClaimed,
        daily_remaining: Math.max(0, DAILY_CLAIM_CAP - newDailyClaimed),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Claim reward error:', error);
    
    // Handle specific blockchain errors
    if (error.message?.includes('insufficient funds')) {
      return new Response(
        JSON.stringify({ error: 'Service Unavailable', message: 'Treasury không đủ gas fee' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal Error', 
        message: error.message || 'Lỗi hệ thống, vui lòng thử lại sau' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
