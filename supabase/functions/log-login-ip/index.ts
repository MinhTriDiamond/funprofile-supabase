import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Extract email prefix (strip trailing digits before @) for farm detection */
function getEmailBase(email: string): string {
  const local = email.split('@')[0] || '';
  // Remove dots (Gmail ignores them) and trailing numbers
  return local.replace(/\./g, '').replace(/\d+$/, '').toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const supabaseAuth = createClient(supabaseUrl, (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const ip = req.headers.get("cf-connecting-ip") 
      || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";

    // Check blacklisted IP
    if (ip !== "unknown") {
      const { data: blacklistedIp } = await supabaseAdmin
        .from("blacklisted_ips")
        .select("id, reason, associated_usernames")
        .eq("ip_address", ip)
        .eq("is_active", true)
        .eq("alert_on_login", true)
        .single();

      if (blacklistedIp) {
        console.warn(`[IP ALERT] Blacklisted IP ${ip} login attempt by user ${user.id}`);
        await handleBlacklistedIp(supabaseAdmin, user.id, ip, blacklistedIp);
      }
    }

    const userAgent = req.headers.get("user-agent") || "unknown";

    // Read body
    let deviceHash: string | null = null;
    let fingerprintVersion = 1;
    try {
      const body = await req.json();
      deviceHash = body?.device_hash || null;
      fingerprintVersion = body?.fingerprint_version || 1;
    } catch {
      // No body
    }

    // Insert login log
    await supabaseAdmin.from("login_ip_logs").insert({
      user_id: user.id,
      ip_address: ip,
      user_agent: userAgent,
    });

    // Device fingerprint handling - only process v2+ (v1 is unreliable)
    if (deviceHash && typeof deviceHash === "string" && deviceHash.length >= 16 && fingerprintVersion >= 2) {
      await handleDeviceFingerprint(supabaseAdmin, user.id, deviceHash, fingerprintVersion);
    }

    // Email farm detection
    if (user.email) {
      await detectEmailFarm(supabaseAdmin, user.id, user.email);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("log-login-ip error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: corsHeaders });
  }
});

// --- Helper functions ---

async function handleBlacklistedIp(supabaseAdmin: any, userId: string, ip: string, blacklistedIp: any) {
  await supabaseAdmin.from("pplp_fraud_signals").insert({
    actor_id: userId,
    signal_type: "BLACKLISTED_IP_LOGIN",
    severity: 5,
    details: { ip_address: ip, reason: blacklistedIp.reason, known_usernames: blacklistedIp.associated_usernames },
    source: "log-login-ip",
  });

  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  if (admins?.length) {
      await supabaseAdmin.from("notifications").insert(
        admins.map((a: { user_id: string }) => ({
          user_id: a.user_id, actor_id: userId, type: "admin_blacklisted_ip", read: false,
          metadata: {
            ip_address: ip,
            reason: blacklistedIp.reason,
            known_usernames: blacklistedIp.associated_usernames?.slice(0, 5) || [],
          },
        }))
      );
  }

  await supabaseAdmin.from("profiles").update({
    reward_status: "on_hold",
    admin_notes: `Đăng nhập từ IP bị chặn (${ip}): ${blacklistedIp.reason}`,
  }).eq("id", userId).not("reward_status", "eq", "banned");
}

async function handleDeviceFingerprint(supabaseAdmin: any, userId: string, deviceHash: string, fingerprintVersion: number) {
  const { error: upsertErr } = await supabaseAdmin
    .from("pplp_device_registry")
    .upsert(
      { user_id: userId, device_hash: deviceHash, last_seen: new Date().toISOString(), usage_count: 1, fingerprint_version: fingerprintVersion },
      { onConflict: "user_id,device_hash" }
    );

  if (upsertErr) {
    if (upsertErr.code === "42P10" || upsertErr.message?.includes("unique")) {
      await supabaseAdmin.from("pplp_device_registry").insert({
        user_id: userId, device_hash: deviceHash, last_seen: new Date().toISOString(), fingerprint_version: fingerprintVersion,
      });
    } else {
      console.error("Device registry upsert error:", upsertErr);
    }
  } else {
    await supabaseAdmin.from("pplp_device_registry")
      .update({ last_seen: new Date().toISOString() })
      .eq("user_id", userId).eq("device_hash", deviceHash);
  }

  // Check shared device (>2 other users)
  const { data: otherUsers } = await supabaseAdmin
    .from("pplp_device_registry").select("user_id")
    .eq("device_hash", deviceHash).neq("user_id", userId);

  if (otherUsers && otherUsers.length > 2) {
    const allUserIds = [userId, ...otherUsers.map((u: any) => u.user_id)];

    // Filter out banned users
    const { data: activeProfiles } = await supabaseAdmin
      .from("profiles").select("id, username, is_banned")
      .in("id", allUserIds);

    const bannedIds = new Set(activeProfiles?.filter((p: any) => p.is_banned).map((p: any) => p.id) || []);
    const activeUserIds = allUserIds.filter(id => !bannedIds.has(id));

    // Only alert if >2 active (non-banned) users share the device
    if (activeUserIds.length <= 2) return;

    console.warn(`[SHARED DEVICE] device_hash=${deviceHash.slice(0, 8)}... shared by ${activeUserIds.length} active users (${bannedIds.size} banned filtered)`);

    // Dedup: check if similar notification was sent in last 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: existingNotif } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("type", "admin_shared_device")
      .gte("created_at", oneHourAgo)
      .limit(1);

    // Check rapid registration (only for active users)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentAccounts } = await supabaseAdmin
      .from("pplp_device_registry").select("user_id, created_at").eq("device_hash", deviceHash);

    const recentUserIds = recentAccounts?.map((a: any) => a.user_id).filter((id: string) => !bannedIds.has(id)) || [];
    const { data: recentProfiles } = await supabaseAdmin
      .from("profiles").select("id, created_at")
      .in("id", recentUserIds).gte("created_at", oneDayAgo).eq("is_banned", false);

    const recentCount = recentProfiles?.length || 0;

    if (recentCount > 3) {
      // CHỈ GHI LOG + CẢNH BÁO — KHÔNG tự động ban/hold
      // Người dùng tại sự kiện cộng đồng có thể đăng ký hàng loạt trên cùng WiFi
      const newAccountIds = recentProfiles?.map((p: any) => p.id) || [];
      await supabaseAdmin.from("pplp_fraud_signals").insert({
        actor_id: userId, signal_type: "RAPID_REGISTRATION", severity: 3,
        details: { device_hash: deviceHash.slice(0, 8), recent_count: recentCount, flagged_ids: newAccountIds, note: "Chỉ cảnh báo - không tự động ban" },
        source: "log-login-ip",
      });
      console.warn(`[RAPID_REG] ${recentCount} accounts on device ${deviceHash.slice(0, 8)} in 24h — logged only, no auto-ban`);
    }
    // KHÔNG auto-hold cho shared device nữa — chỉ ghi signal phía dưới

    await supabaseAdmin.from("pplp_device_registry").update({
      is_flagged: true, flag_reason: `Cùng thiết bị với ${activeUserIds.length} tài khoản`,
    }).eq("device_hash", deviceHash);

    await supabaseAdmin.from("pplp_fraud_signals").insert({
      actor_id: userId, signal_type: "SHARED_DEVICE", severity: 3,
      details: { device_hash: deviceHash.slice(0, 8), all_user_ids: activeUserIds, banned_filtered: bannedIds.size },
      source: "log-login-ip",
    });

    // Only send notification if no recent dedup
    if (!existingNotif?.length) {
      const activeProfilesList = activeProfiles?.filter((p: any) => !p.is_banned) || [];
      const allUsernames = activeProfilesList.map((p: any) => p.username).filter(Boolean);

      // Fetch emails for active flagged users only
      const flaggedEmails: Record<string, string> = {};
      try {
        const { data: { users: authUsersList } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (authUsersList) {
          const emailMap = new Map(authUsersList.map((u: any) => [u.id, u.email]));
          activeProfilesList.forEach((p: any) => {
            if (p.username && emailMap.has(p.id)) {
              flaggedEmails[p.username] = emailMap.get(p.id) || '';
            }
          });
        }
      } catch (e) { console.error("Failed to fetch emails for shared device:", e); }

      const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
      if (admins?.length) {
        await supabaseAdmin.from("notifications").insert(
          admins.map((a: any) => ({
            user_id: a.user_id, actor_id: userId, type: "admin_shared_device", read: false,
            metadata: {
              device_hash: deviceHash.slice(0, 8),
              user_count: activeUserIds.length,
              usernames: allUsernames.slice(0, 10),
              flagged_emails: flaggedEmails,
              banned_filtered: bannedIds.size,
            },
          }))
        );
      }
    }
  }
}

const EMAIL_FARM_ALLOWLIST = ['hoangtydo', 'bongsieuoi'];

async function detectEmailFarm(supabaseAdmin: any, userId: string, email: string) {
  const emailBase = getEmailBase(email);
  if (!emailBase || emailBase.length < 3) return;

  // Skip allowlisted email clusters
  if (EMAIL_FARM_ALLOWLIST.some(allowed => emailBase.startsWith(allowed))) {
    return;
  }

  // Find accounts with similar email prefix
  const { data: allUsers } = await supabaseAdmin
    .from("profiles")
    .select("id, username")
    .limit(1000);

  if (!allUsers) return;

  // Get auth emails for these users to compare
  // We check by querying auth.users with similar patterns
  const { data: similarEmails } = await supabaseAdmin.rpc('get_similar_email_accounts', { p_email_base: emailBase });
  
  // Fallback: if RPC doesn't exist, skip
  if (!similarEmails) {
    // Try direct approach - query auth users
    const domain = email.split('@')[1] || 'gmail.com';
    const { data: authUsers, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    
    if (authErr || !authUsers?.users) return;
    
    const matchingUsers = authUsers.users.filter((u: any) => {
      if (!u.email) return false;
      return getEmailBase(u.email) === emailBase && u.email.endsWith(`@${domain}`);
    });

    if (matchingUsers.length >= 3) {
      const matchedIds = matchingUsers.map((u: any) => u.id);

      // Filter out banned users
      const { data: matchedProfiles } = await supabaseAdmin
        .from("profiles").select("id, username, is_banned").in("id", matchedIds);

      const activeProfiles = matchedProfiles?.filter((p: any) => !p.is_banned) || [];
      const activeMatchingUsers = matchingUsers.filter((u: any) => activeProfiles.some((p: any) => p.id === u.id));

      // Only alert if >=3 active (non-banned) users
      if (activeMatchingUsers.length < 3) return;

      // Check if signal already exists recently
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: existingSignal } = await supabaseAdmin
        .from("pplp_fraud_signals")
        .select("id")
        .eq("actor_id", userId)
        .eq("signal_type", "EMAIL_FARM")
        .gte("created_at", oneHourAgo)
        .limit(1);

      if (!existingSignal?.length) {
        const activeIds = activeMatchingUsers.map((u: any) => u.id);
        const activeEmails = activeMatchingUsers.map((u: any) => u.email);
        const activeUsernames = activeProfiles.map((p: any) => p.username).filter(Boolean);
        const flaggedEmails: Record<string, string> = {};
        activeProfiles.forEach((p: any) => {
          const authUser = activeMatchingUsers.find((u: any) => u.id === p.id);
          if (p.username && authUser?.email) {
            flaggedEmails[p.username] = authUser.email;
          }
        });
        const bannedCount = matchedIds.length - activeMatchingUsers.length;

        await supabaseAdmin.from("pplp_fraud_signals").insert({
          actor_id: userId,
          signal_type: "EMAIL_FARM",
          severity: 4,
          details: { email_base: emailBase, count: activeMatchingUsers.length, user_ids: activeIds, emails: activeEmails, banned_filtered: bannedCount },
          source: "log-login-ip",
        });

        // Notify admins
        const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
        if (admins?.length) {
          await supabaseAdmin.from("notifications").insert(
            admins.map((a: any) => ({
              user_id: a.user_id, actor_id: userId, type: "admin_email_farm", read: false,
              metadata: {
                email_base: emailBase,
                count: activeMatchingUsers.length,
                emails: activeEmails.slice(0, 5),
                usernames: activeUsernames,
                flagged_emails: flaggedEmails,
                banned_filtered: bannedCount,
              },
            }))
          );
        }

        console.warn(`[EMAIL FARM] Detected ${activeMatchingUsers.length} active accounts with email base "${emailBase}" (${bannedCount} banned filtered)`);
      }
    }
  }
}
