import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Get today's start (00:00 VN = 17:00 UTC previous day) as ISO string */
function getTodayStartVN(): string {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const nowVN = new Date(Date.now() + VN_OFFSET_MS);
  const startUTC = new Date(Date.UTC(nowVN.getUTCFullYear(), nowVN.getUTCMonth(), nowVN.getUTCDate()) - VN_OFFSET_MS);
  return startUTC.toISOString();
}

/** Extract email prefix (strip trailing digits before @) for farm detection */
function getEmailBase(email: string): string {
  const local = email.split('@')[0] || '';
  return local.replace(/\./g, '').replace(/\d+$/, '').toLowerCase();
}

/** Email farm allowlist - verified admin clusters */
const EMAIL_FARM_ALLOWLIST = ['hoangtydo', 'bongsieuoi'];

const DAILY_CLAIM_CAP = 500000;

/** Lookup usernames from profiles table */
async function lookupUsernames(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const uniqueIds = [...new Set(userIds)];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    const { data } = await supabase.from("profiles").select("id, username").in("id", chunk);
    if (data) for (const p of data) map.set(p.id, p.username || p.id.slice(0, 8));
  }
  return map;
}

/** Build userId -> email map */
function buildEmailMap(authUsers: Array<{ id: string; email?: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of authUsers) if (u.email) map.set(u.id, u.email);
  return map;
}

/** Format username with email */
function formatUserWithEmail(userId: string, usernameMap: Map<string, string>, emailMap: Map<string, string>): string {
  const name = usernameMap.get(userId) || userId.slice(0, 8);
  const email = emailMap.get(userId);
  return email ? `${name} (${email})` : name;
}

/**
 * Progressive fraud risk escalation — 3-step system
 * Step 1 (risk_level 0→1): Flag internally, no user impact
 * Step 2 (risk_level 1→2): Soft warning + claim speed limit (1 claim per 48h)
 * Step 3 (risk_level 2→3): Suspend for manual review (on_hold)
 */
async function escalateRisk(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  adminIds: Set<string>,
  reason: string,
): Promise<{ flagged: number; limited: number; held: number }> {
  const result = { flagged: 0, limited: 0, held: 0 };
  const toProcess = userIds.filter(id => !adminIds.has(id));
  if (toProcess.length === 0) return result;

  // Get current risk levels + trusted status
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, fraud_risk_level, reward_status, fraud_trusted")
    .in("id", toProcess);

  if (!profiles) return result;

  const now = new Date().toISOString();
  const cooldownUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h

  for (const p of profiles) {
    // Skip already banned, approved by admin, or TRUSTED users
    if (p.reward_status === 'banned' || p.reward_status === 'approved') continue;
    if (p.fraud_trusted === true) {
      console.log(`[escalateRisk] Skipping trusted user ${p.id}`);
      continue;
    }

    const currentLevel = p.fraud_risk_level || 0;
    const newLevel = Math.min(currentLevel + 1, 3);

    if (newLevel === 1) {
      // STEP 1: Internal flag only — no user-facing impact
      await supabase.from("profiles").update({
        fraud_risk_level: 1,
        admin_notes: `[Step 1] Đánh dấu nghi ngờ: ${reason}`,
      }).eq("id", p.id);
      result.flagged++;

    } else if (newLevel === 2) {
      // STEP 2: Soft warning + claim speed limit + max 100k/request
      await supabase.from("profiles").update({
        fraud_risk_level: 2,
        claim_speed_limit_until: cooldownUntil,
        max_claim_per_request: 100000,
        admin_notes: `[Step 2] Cảnh báo + giới hạn tốc độ claim: ${reason}`,
      }).eq("id", p.id);
      result.limited++;

    } else if (newLevel >= 3) {
      // STEP 3: Suspend for manual review
      await supabase.from("profiles").update({
        fraud_risk_level: 3,
        reward_status: "on_hold",
        admin_notes: `[Step 3] Đình chỉ để Admin xác minh: ${reason}. Tự động bởi hệ thống ${now.split('T')[0]}.`,
      }).eq("id", p.id);
      result.held++;
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const alerts: string[] = [];
    let totalHeld = 0;
    let totalFlagged = 0;
    let totalLimited = 0;
    const allFlaggedUserIds: string[] = [];

    // Pre-fetch admin IDs
    const { data: adminRoles } = await supabase
      .from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = new Set((adminRoles || []).map((r: { user_id: string }) => r.user_id));

    // 1. Shared device detection — LOG ONLY, no action
    const { data: flaggedDevices } = await supabase
      .from("pplp_device_registry")
      .select("device_hash, user_id")
      .eq("is_flagged", false)
      .gte("fingerprint_version", 2);

    const deviceClusters: Array<{ hash: string; users: string[] }> = [];

    if (flaggedDevices) {
      const deviceMap = new Map<string, string[]>();
      for (const d of flaggedDevices) {
        const users = deviceMap.get(d.device_hash) || [];
        users.push(d.user_id);
        deviceMap.set(d.device_hash, users);
      }

      for (const [hash, users] of deviceMap) {
        if (users.length > 2) {
          allFlaggedUserIds.push(...users);
          deviceClusters.push({ hash, users });

           const today = new Date(getTodayStartVN());
          const { data: existing } = await supabase
            .from("pplp_fraud_signals").select("id")
            .eq("signal_type", "SHARED_DEVICE").eq("source", "daily-fraud-scan")
            .gte("created_at", today.toISOString()).in("actor_id", users).limit(1);

          if (!existing?.length) {
            await supabase.from("pplp_fraud_signals").insert({
              actor_id: users[0], signal_type: "SHARED_DEVICE", severity: 2,
              details: { device_hash: hash.slice(0, 8), user_count: users.length, user_ids: users, note: "Chỉ theo dõi - không tự động đình chỉ" },
              source: "daily-fraud-scan",
            });
          }
        }
      }
    }

    // 2. Email farm detection — LOG ONLY
    const emailClusters: Array<{ emailBase: string; users: Array<{ id: string; email: string }> }> = [];
    let globalEmailMap = new Map<string, string>();
    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (!authErr && authUsers?.users) {
      globalEmailMap = buildEmailMap(authUsers.users as Array<{ id: string; email?: string }>);
      const emailGroups = new Map<string, Array<{ id: string; email: string }>>();
      for (const u of authUsers.users) {
        if (!u.email) continue;
        const base = getEmailBase(u.email);
        if (base.length < 3) continue;
        const domain = u.email.split('@')[1] || '';
        const key = `${base}@${domain}`;
        const group = emailGroups.get(key) || [];
        group.push({ id: u.id, email: u.email });
        emailGroups.set(key, group);
      }

      for (const [key, users] of emailGroups) {
        if (users.length >= 3) {
          const emailBase = key.split('@')[0];
          if (EMAIL_FARM_ALLOWLIST.some(allowed => emailBase.startsWith(allowed))) continue;

          allFlaggedUserIds.push(...users.map(u => u.id));
          emailClusters.push({ emailBase, users });

           const today = new Date(getTodayStartVN());
          const { data: existing } = await supabase
            .from("pplp_fraud_signals").select("id")
            .eq("signal_type", "EMAIL_FARM").eq("source", "daily-fraud-scan")
            .gte("created_at", today.toISOString()).limit(1);

          if (!existing?.length) {
            await supabase.from("pplp_fraud_signals").insert({
              actor_id: users[0].id, signal_type: "EMAIL_FARM", severity: 3,
              details: { email_base: emailBase, count: users.length, emails: users.map(u => u.email), note: "Chỉ theo dõi" },
              source: "daily-fraud-scan",
            });
          }
        }
      }
    }

    // 3. IP clustering — LOG ONLY
    const ipClusters: Array<{ ip: string; sharedDeviceUsers: string[]; uniqueDeviceUsers: string[] }> = [];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLogins } = await supabase
      .from("login_ip_logs").select("ip_address, user_id").gte("created_at", oneDayAgo);

    if (recentLogins) {
      const ipMap = new Map<string, Set<string>>();
      for (const log of recentLogins) {
        if (log.ip_address === "unknown") continue;
        const users = ipMap.get(log.ip_address) || new Set();
        users.add(log.user_id);
        ipMap.set(log.ip_address, users);
      }

      for (const [ip, users] of ipMap) {
        if (users.size > 5) {
          const userArr = Array.from(users);
          const { data: deviceData } = await supabase
            .from("pplp_device_registry").select("user_id, device_hash")
            .in("user_id", userArr).gte("fingerprint_version", 2);

          const deviceToUsers = new Map<string, string[]>();
          if (deviceData) {
            for (const d of deviceData) {
              const list = deviceToUsers.get(d.device_hash) || [];
              list.push(d.user_id);
              deviceToUsers.set(d.device_hash, list);
            }
          }
          const sharedDeviceUserSet = new Set<string>();
          for (const [, deviceUsers] of deviceToUsers) {
            if (deviceUsers.length > 1) for (const uid of deviceUsers) sharedDeviceUserSet.add(uid);
          }
          const sharedDeviceUsers = Array.from(sharedDeviceUserSet);
          const uniqueDeviceUsers = userArr.filter(id => !sharedDeviceUserSet.has(id));

          allFlaggedUserIds.push(...userArr);
          ipClusters.push({ ip, sharedDeviceUsers, uniqueDeviceUsers });

           const today = new Date(getTodayStartVN());
          const signalType = sharedDeviceUsers.length > 0 ? "IP_DEVICE_CLUSTER" : "IP_CLUSTER";
          const { data: existing } = await supabase
            .from("pplp_fraud_signals").select("id")
            .eq("signal_type", signalType).eq("source", "daily-fraud-scan")
            .gte("created_at", today.toISOString()).limit(1);

          if (!existing?.length) {
            await supabase.from("pplp_fraud_signals").insert({
              actor_id: userArr[0], signal_type: signalType,
              severity: sharedDeviceUsers.length > 0 ? 2 : 1,
              details: {
                ip_address: ip, user_count: users.size,
                shared_device_users: sharedDeviceUsers, unique_device_users: uniqueDeviceUsers,
                note: "Chỉ theo dõi - không đình chỉ. Chỉ hold khi phát hiện claim farm.",
              },
              source: "daily-fraud-scan",
            });
          }
        }
      }
    }

    // 4. === CLAIM FARM DETECTION — 3-Step Progressive System ===
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recentClaims } = await supabase
      .from("pending_claims").select("user_id, amount, created_at, wallet_address").gte("created_at", oneHourAgo);
    const { data: recentRewardClaims } = await supabase
      .from("reward_claims").select("user_id, amount, created_at").gte("created_at", oneHourAgo);

    const allRecentClaims = [
      ...(recentClaims || []).map(c => ({ user_id: c.user_id, amount: Number(c.amount), created_at: c.created_at })),
      ...(recentRewardClaims || []).map(c => ({ user_id: c.user_id, amount: Number(c.amount), created_at: c.created_at })),
    ];

    if (allRecentClaims.length >= 5) {
      const claimUserIds = [...new Set(allRecentClaims.map(c => c.user_id))];

      // Group claim users by IP
      const { data: claimUserIps } = await supabase
        .from("login_ip_logs").select("user_id, ip_address")
        .in("user_id", claimUserIds).gte("created_at", oneDayAgo);
      const ipToClaimUsers = new Map<string, Set<string>>();
      if (claimUserIps) {
        for (const log of claimUserIps) {
          if (log.ip_address === "unknown") continue;
          const set = ipToClaimUsers.get(log.ip_address) || new Set();
          set.add(log.user_id);
          ipToClaimUsers.set(log.ip_address, set);
        }
      }

      // Group claim users by device
      const { data: claimDevices } = await supabase
        .from("pplp_device_registry").select("user_id, device_hash")
        .in("user_id", claimUserIds).gte("fingerprint_version", 2);
      const deviceToClaimUsers = new Map<string, Set<string>>();
      if (claimDevices) {
        for (const d of claimDevices) {
          const set = deviceToClaimUsers.get(d.device_hash) || new Set();
          set.add(d.user_id);
          deviceToClaimUsers.set(d.device_hash, set);
        }
      }

      // Build claim clusters (≥5 users from same IP or device)
      const claimClusters: Array<{ type: string; key: string; users: string[] }> = [];
      for (const [ip, userSet] of ipToClaimUsers) {
        if (userSet.size >= 5) claimClusters.push({ type: "ip", key: ip, users: Array.from(userSet) });
      }
      for (const [hash, userSet] of deviceToClaimUsers) {
        if (userSet.size >= 5) claimClusters.push({ type: "device", key: hash, users: Array.from(userSet) });
      }

      for (const cluster of claimClusters) {
        const clusterClaims = allRecentClaims.filter(c => cluster.users.includes(c.user_id));
        if (clusterClaims.length < 5) continue;

        // Check: % claiming near max amount
        const maxClaimCount = clusterClaims.filter(c => c.amount >= DAILY_CLAIM_CAP * 0.8).length;
        const maxClaimRatio = clusterClaims.length > 0 ? maxClaimCount / clusterClaims.length : 0;

        // Check: synchronized timing
        const timestamps = clusterClaims.map(c => new Date(c.created_at).getTime()).sort();
        let syncPairs = 0;
        for (let i = 1; i < timestamps.length; i++) {
          if (timestamps[i] - timestamps[i - 1] < 5 * 60 * 1000) syncPairs++;
        }
        const syncRatio = timestamps.length > 1 ? syncPairs / (timestamps.length - 1) : 0;

        // Only trigger when BOTH conditions met: high max-claim ratio AND synchronized
        if (maxClaimRatio >= 0.6 && syncRatio >= 0.5) {
          console.warn(`[CLAIM FARM] ${cluster.type}=${cluster.key.slice(0, 8)}: ${cluster.users.length} users, maxRatio=${maxClaimRatio}, syncRatio=${syncRatio}`);

          const today = new Date(getTodayStartVN());
          const { data: existing } = await supabase
            .from("pplp_fraud_signals").select("id")
            .eq("signal_type", "CLAIM_FARM").eq("source", "daily-fraud-scan")
            .gte("created_at", today.toISOString()).limit(1);

          if (!existing?.length) {
            await supabase.from("pplp_fraud_signals").insert({
              actor_id: cluster.users[0], signal_type: "CLAIM_FARM", severity: 5,
              details: {
                cluster_type: cluster.type, cluster_key: cluster.key.slice(0, 8),
                user_ids: cluster.users, claim_count: clusterClaims.length,
                max_claim_ratio: maxClaimRatio, sync_ratio: syncRatio,
                note: "Farm claim đồng bộ - escalate theo 3 bước",
              },
              source: "daily-fraud-scan",
            });
          }

          // === 3-STEP PROGRESSIVE ESCALATION ===
          const escalation = await escalateRisk(
            supabase, cluster.users, adminIds,
            `CLAIM FARM: ${cluster.users.length} TK claim đồng bộ từ cùng ${cluster.type} (${cluster.key.slice(0, 8)}), max=${Math.round(maxClaimRatio * 100)}%, sync=${Math.round(syncRatio * 100)}%`,
          );

          totalFlagged += escalation.flagged;
          totalLimited += escalation.limited;
          totalHeld += escalation.held;

          allFlaggedUserIds.push(...cluster.users);

          const stepSummary = [];
          if (escalation.flagged > 0) stepSummary.push(`${escalation.flagged} flagged (Step 1)`);
          if (escalation.limited > 0) stepSummary.push(`${escalation.limited} limited (Step 2)`);
          if (escalation.held > 0) stepSummary.push(`${escalation.held} held (Step 3)`);

          alerts.push(`🚨 CLAIM FARM (${cluster.type}=${cluster.key.slice(0, 8)}): ${cluster.users.length} TK, max=${Math.round(maxClaimRatio * 100)}%, sync=${Math.round(syncRatio * 100)}% → ${stepSummary.join(', ')}`);
        }
      }
    }

    // 5. === AI-POWERED SYBIL DETECTION ===
    // Call analyze-fraud-patterns to use AI for behavioral analysis
    let aiResults: { clusters_analyzed: number; clusters_actioned: number; summary: string; details: any[] } | null = null;
    try {
      const aiResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-fraud-patterns`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ source: "daily-fraud-scan" }),
        }
      );

      if (aiResponse.ok) {
        aiResults = await aiResponse.json();
        if (aiResults && aiResults.clusters_actioned > 0) {
          totalFlagged += aiResults.details?.reduce((s: number, d: any) => s + (d.escalation?.flagged || 0), 0) || 0;
          totalLimited += aiResults.details?.reduce((s: number, d: any) => s + (d.escalation?.limited || 0), 0) || 0;
          totalHeld += aiResults.details?.reduce((s: number, d: any) => s + (d.escalation?.held || 0), 0) || 0;

          for (const detail of (aiResults.details || [])) {
            alerts.push(`🤖 AI Sybil: "${detail.cluster_id}" (${detail.users} TK, confidence ${detail.confidence}%, risk ${detail.risk_level}) — ${detail.reason?.slice(0, 100)}`);
          }
        }
        console.log(`[Daily Fraud Scan] AI analysis: ${aiResults?.clusters_analyzed || 0} clusters analyzed, ${aiResults?.clusters_actioned || 0} actioned`);
      } else {
        console.warn(`[Daily Fraud Scan] AI analysis failed: ${aiResponse.status}`);
      }
    } catch (aiErr) {
      console.error("[Daily Fraud Scan] AI analysis error:", aiErr);
      // Continue without AI — rule-based detection still works
    }

    const usernameMap = await lookupUsernames(supabase, allFlaggedUserIds);
    const allFlaggedUsernames: string[] = [...new Set(allFlaggedUserIds)].map(
      id => usernameMap.get(id) || id.slice(0, 8)
    );
    const flaggedEmails: Record<string, string> = {};
    for (const uid of new Set(allFlaggedUserIds)) {
      const uname = usernameMap.get(uid) || uid.slice(0, 8);
      const email = globalEmailMap.get(uid);
      if (email) flaggedEmails[uname] = email;
    }

    for (const { hash, users } of deviceClusters) {
      const names = users.map(id => formatUserWithEmail(id, usernameMap, globalEmailMap)).join(', ');
      alerts.push(`⚠️ Thiết bị ${hash.slice(0, 8)}... có ${users.length} TK (theo dõi): ${names}`);
    }
    for (const { emailBase, users } of emailClusters) {
      const names = users.map(u => formatUserWithEmail(u.id, usernameMap, globalEmailMap)).join(', ');
      alerts.push(`⚠️ Cụm email "${emailBase}" có ${users.length} TK (theo dõi): ${names}`);
    }
    for (const { ip, sharedDeviceUsers, uniqueDeviceUsers } of ipClusters) {
      const parts: string[] = [];
      if (sharedDeviceUsers.length > 0) {
        const names = sharedDeviceUsers.map(id => formatUserWithEmail(id, usernameMap, globalEmailMap)).join(', ');
        parts.push(`${sharedDeviceUsers.length} TK chung thiết bị: ${names}`);
      }
      if (uniqueDeviceUsers.length > 0) {
        const names = uniqueDeviceUsers.map(id => formatUserWithEmail(id, usernameMap, globalEmailMap)).join(', ');
        parts.push(`${uniqueDeviceUsers.length} TK riêng: ${names}`);
      }
      alerts.push(`⚠️ IP ${ip}: ${parts.join(' | ')}`);
    }

    // 6. === FRAUD RISK DECAY === (reduce risk by 1 for users clean for 7 days)
    let decayedCount = 0;
    try {
      const { data: decayResult } = await supabase.rpc('decay_fraud_risk');
      decayedCount = decayResult || 0;
      if (decayedCount > 0) {
        console.log(`[Daily Fraud Scan] Fraud risk decayed for ${decayedCount} users`);
        alerts.push(`✅ Risk Decay: ${decayedCount} TK được giảm fraud_risk_level do không vi phạm 7 ngày`);
      }
    } catch (decayErr) {
      console.error("[Daily Fraud Scan] Risk decay error:", decayErr);
    }

    // 7. Notify admins
    if (alerts.length > 0) {
      const admins = Array.from(adminIds);
      if (admins.length) {
        const systemActorId = admins[0];
        await supabase.from("notifications").insert(
          admins.map((userId: string) => ({
            user_id: userId, actor_id: systemActorId,
            type: "admin_fraud_daily", read: false,
            metadata: {
              alerts_count: alerts.length,
              alerts: alerts.slice(0, 10),
              accounts_flagged: totalFlagged,
              accounts_limited: totalLimited,
              accounts_held: totalHeld,
              accounts_decayed: decayedCount,
              flagged_usernames: allFlaggedUsernames.slice(0, 50),
              flagged_emails: flaggedEmails,
              note: "Hệ thống 3 bước + AI Sybil Detection + Risk Decay. Chỉ escalate khi phát hiện claim farm hoặc AI phát hiện Sybil cluster. User trusted được miễn trừ.",
              ai_summary: aiResults?.summary || "AI không chạy hoặc không có kết quả",
              ai_clusters_found: aiResults?.clusters_actioned || 0,
            },
          }))
        );
        console.log(`[Daily Fraud Scan] ${alerts.length} alerts. Step1: ${totalFlagged} flagged, Step2: ${totalLimited} limited, Step3: ${totalHeld} held, Decayed: ${decayedCount}.`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      alerts_count: alerts.length,
      accounts_flagged: totalFlagged,
      accounts_limited: totalLimited,
      accounts_held: totalHeld,
      accounts_decayed: decayedCount,
      ai_analysis: aiResults ? {
        clusters_analyzed: aiResults.clusters_analyzed,
        clusters_actioned: aiResults.clusters_actioned,
        summary: aiResults.summary,
      } : null,
      alerts,
      scanned_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Daily Fraud Scan] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
