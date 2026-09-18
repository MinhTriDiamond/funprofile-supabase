import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * AI-Powered Fraud Pattern Analysis
 * 
 * Collects claim data, device fingerprints, IP patterns, and behavioral signals,
 * then uses Lovable AI (Gemini) to identify Sybil clusters and farm patterns.
 * 
 * Called by daily-fraud-scan to enhance detection with AI reasoning.
 */

interface ClaimRecord {
  user_id: string;
  amount: number;
  created_at: string;
  wallet_address?: string;
}

interface UserSignals {
  user_id: string;
  username?: string;
  email?: string;
  claim_count_7d: number;
  total_claimed_7d: number;
  max_claim_ratio: number; // % of claims at max amount
  avg_claim_interval_min: number;
  device_hashes: string[];
  ip_addresses: string[];
  account_age_days: number;
  post_count_7d: number;
  fraud_risk_level: number;
}

interface SybilCluster {
  cluster_id: string;
  user_ids: string[];
  confidence: number; // 0-100
  risk_level: number; // 0-3
  reason: string;
  signals: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!lovableApiKey) {
      console.error("[AI Fraud] LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Collect all claims in last 7 days
    const { data: pendingClaims } = await supabase
      .from("pending_claims")
      .select("user_id, amount, created_at, wallet_address")
      .gte("created_at", sevenDaysAgo);

    const { data: rewardClaims } = await supabase
      .from("reward_claims")
      .select("user_id, amount, created_at")
      .gte("created_at", sevenDaysAgo);

    const allClaims: ClaimRecord[] = [
      ...(pendingClaims || []).map(c => ({ user_id: c.user_id, amount: Number(c.amount), created_at: c.created_at, wallet_address: c.wallet_address })),
      ...(rewardClaims || []).map(c => ({ user_id: c.user_id, amount: Number(c.amount), created_at: c.created_at })),
    ];

    if (allClaims.length < 3) {
      return new Response(JSON.stringify({
        success: true, clusters: [], message: "Not enough claim data for analysis",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Get unique claiming users and their signals
    const claimUserIds = [...new Set(allClaims.map(c => c.user_id))];

    // Profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, created_at, fraud_risk_level, reward_status")
      .in("id", claimUserIds);

    // Device hashes
    const { data: devices } = await supabase
      .from("pplp_device_registry")
      .select("user_id, device_hash")
      .in("user_id", claimUserIds)
      .gte("fingerprint_version", 2);

    // IP addresses (last 7 days)
    const { data: ipLogs } = await supabase
      .from("login_ip_logs")
      .select("user_id, ip_address")
      .in("user_id", claimUserIds)
      .gte("created_at", sevenDaysAgo);

    // Post counts
    const { data: posts } = await supabase
      .from("posts")
      .select("user_id")
      .in("user_id", claimUserIds)
      .gte("created_at", sevenDaysAgo);

    // Auth users for emails
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>();
    if (authData?.users) {
      for (const u of authData.users) {
        if (u.email) emailMap.set(u.id, u.email);
      }
    }

    // 3. Build per-user signal profiles
    const DAILY_CLAIM_CAP = 500000;
    const userSignals: UserSignals[] = [];

    for (const uid of claimUserIds) {
      const userClaims = allClaims.filter(c => c.user_id === uid).sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const profile = profiles?.find(p => p.id === uid);
      const userDevices = devices?.filter(d => d.user_id === uid).map(d => d.device_hash) || [];
      const userIps = [...new Set(ipLogs?.filter(l => l.user_id === uid).map(l => l.ip_address) || [])];
      const userPostCount = posts?.filter(p => p.user_id === uid).length || 0;

      const maxClaims = userClaims.filter(c => c.amount >= DAILY_CLAIM_CAP * 0.8).length;
      const totalClaimed = userClaims.reduce((s, c) => s + c.amount, 0);

      // Calculate average interval between claims
      let avgInterval = 0;
      if (userClaims.length > 1) {
        const intervals: number[] = [];
        for (let i = 1; i < userClaims.length; i++) {
          intervals.push(
            (new Date(userClaims[i].created_at).getTime() - new Date(userClaims[i - 1].created_at).getTime()) / 60000
          );
        }
        avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      }

      const accountAge = profile?.created_at
        ? (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
        : 0;

      userSignals.push({
        user_id: uid.slice(0, 8), // Truncate for privacy in AI prompt
        username: profile?.username || undefined,
        email: emailMap.get(uid)?.replace(/(.{2}).*(@.*)/, '$1***$2'), // Mask email
        claim_count_7d: userClaims.length,
        total_claimed_7d: totalClaimed,
        max_claim_ratio: userClaims.length > 0 ? maxClaims / userClaims.length : 0,
        avg_claim_interval_min: Math.round(avgInterval),
        device_hashes: userDevices.map(d => d.slice(0, 6)),
        ip_addresses: userIps.map(ip => ip.replace(/\.\d+$/, '.x')), // Mask last octet
        account_age_days: Math.round(accountAge),
        post_count_7d: userPostCount,
        fraud_risk_level: profile?.fraud_risk_level || 0,
      });
    }

    // 4. Build shared-signal clusters for AI to analyze
    // Group by shared device
    const deviceGroups = new Map<string, string[]>();
    if (devices) {
      for (const d of devices) {
        const list = deviceGroups.get(d.device_hash) || [];
        list.push(d.user_id);
        deviceGroups.set(d.device_hash, list);
      }
    }

    // Group by shared IP
    const ipGroups = new Map<string, Set<string>>();
    if (ipLogs) {
      for (const l of ipLogs) {
        if (l.ip_address === "unknown") continue;
        const set = ipGroups.get(l.ip_address) || new Set();
        set.add(l.user_id);
        ipGroups.set(l.ip_address, set);
      }
    }

    const sharedSignals = {
      shared_devices: Array.from(deviceGroups.entries())
        .filter(([, users]) => users.length > 1)
        .map(([hash, users]) => ({ device: hash.slice(0, 6), users: users.map(u => u.slice(0, 8)), count: users.length }))
        .slice(0, 20),
      shared_ips: Array.from(ipGroups.entries())
        .filter(([, users]) => users.size > 2)
        .map(([ip, users]) => ({ ip: ip.replace(/\.\d+$/, '.x'), users: Array.from(users).map(u => u.slice(0, 8)), count: users.size }))
        .slice(0, 20),
    };

    // 5. Call Lovable AI for analysis
    const aiPrompt = `You are an anti-fraud analyst for a crypto rewards platform (CAMLY token). Analyze the following user behavior data to identify Sybil attacks and farm bot clusters.

RULES:
- A Sybil attack = one person controlling multiple accounts to farm rewards
- Shared WiFi/IP alone is NOT sufficient evidence (community events exist)
- Focus on CLAIM BEHAVIOR patterns: synchronized timing, max-amount claiming, bot-like intervals
- Shared device + similar claim patterns = high confidence Sybil
- Account age < 7 days + max claims = suspicious
- Low post count + high claim activity = suspicious
- Be CONSERVATIVE: only flag clusters with confidence ≥ 60%

DATA - User Claim Signals (last 7 days):
${JSON.stringify(userSignals.slice(0, 50), null, 1)}

DATA - Shared Signals:
${JSON.stringify(sharedSignals, null, 1)}

DAILY_CLAIM_CAP: 500,000 CAMLY

Respond using the suggest_clusters tool with your analysis.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a fraud detection AI. Analyze behavioral patterns to identify Sybil clusters. Be conservative — never flag legitimate users." },
          { role: "user", content: aiPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_clusters",
            description: "Return identified Sybil clusters with confidence scores",
            parameters: {
              type: "object",
              properties: {
                clusters: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      cluster_id: { type: "string", description: "Unique cluster identifier" },
                      user_ids: { type: "array", items: { type: "string" }, description: "Truncated user IDs in this cluster" },
                      confidence: { type: "number", description: "Confidence score 0-100" },
                      risk_level: { type: "integer", description: "0=monitor, 1=flag, 2=limit, 3=suspend" },
                      reason: { type: "string", description: "Explanation of why these accounts are suspicious" },
                      signals: { type: "array", items: { type: "string" }, description: "List of detected signals" },
                    },
                    required: ["cluster_id", "user_ids", "confidence", "risk_level", "reason", "signals"],
                    additionalProperties: false,
                  },
                },
                summary: { type: "string", description: "Overall analysis summary" },
              },
              required: ["clusters", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_clusters" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`[AI Fraud] AI gateway error ${aiResponse.status}:`, errText);

      if (aiResponse.status === 429 || aiResponse.status === 402) {
        return new Response(JSON.stringify({
          error: aiResponse.status === 429 ? "AI rate limited" : "AI credits insufficient",
          fallback: true,
        }), {
          status: aiResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI analysis failed", fallback: true }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    let aiClusters: SybilCluster[] = [];
    let aiSummary = "";

    // Parse tool call response
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        aiClusters = parsed.clusters || [];
        aiSummary = parsed.summary || "";
      } catch (e) {
        console.error("[AI Fraud] Failed to parse AI response:", e);
      }
    }

    console.log(`[AI Fraud] AI identified ${aiClusters.length} clusters. Summary: ${aiSummary}`);

    // 6. Map truncated IDs back to full IDs and store results
    const truncatedToFull = new Map<string, string>();
    for (const uid of claimUserIds) {
      truncatedToFull.set(uid.slice(0, 8), uid);
    }

    const processedClusters: Array<{
      cluster: SybilCluster;
      fullUserIds: string[];
      escalation: { flagged: number; limited: number; held: number };
    }> = [];

    // Pre-fetch admin IDs
    const { data: adminRoles } = await supabase
      .from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = new Set((adminRoles || []).map((r: { user_id: string }) => r.user_id));

    for (const cluster of aiClusters) {
      // Only process clusters with confidence ≥ 60%
      if (cluster.confidence < 60) continue;

      const fullIds = cluster.user_ids
        .map(tid => truncatedToFull.get(tid))
        .filter((id): id is string => !!id);

      if (fullIds.length < 2) continue;

      // Store in sybil_clusters table
      const { data: existingCluster } = await supabase
        .from("sybil_clusters")
        .select("id, risk_level")
        .eq("cluster_key", cluster.cluster_id)
        .single();

      if (existingCluster) {
        // Update existing cluster
        await supabase.from("sybil_clusters").update({
          user_ids: fullIds,
          confidence_score: cluster.confidence,
          risk_level: Math.max(existingCluster.risk_level, cluster.risk_level),
          ai_analysis: { reason: cluster.reason, signals: cluster.signals, summary: aiSummary },
          last_scanned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", existingCluster.id);
      } else {
        await supabase.from("sybil_clusters").insert({
          cluster_type: "ai_detected",
          cluster_key: cluster.cluster_id,
          user_ids: fullIds,
          confidence_score: cluster.confidence,
          risk_level: cluster.risk_level,
          ai_analysis: { reason: cluster.reason, signals: cluster.signals, summary: aiSummary },
          detection_signals: { user_signals: userSignals.filter(s => cluster.user_ids.includes(s.user_id)) },
        });
      }

      // Apply progressive escalation based on AI risk level
      if (cluster.risk_level >= 1) {
        // Use escalateRisk-like logic
        const escalation = { flagged: 0, limited: 0, held: 0 };
        const cooldownUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        const { data: clusterProfiles } = await supabase
          .from("profiles")
          .select("id, fraud_risk_level, reward_status")
          .in("id", fullIds);

        for (const p of (clusterProfiles || [])) {
          if (p.reward_status === 'banned' || p.reward_status === 'approved') continue;
          if (adminIds.has(p.id)) continue;

          const currentLevel = p.fraud_risk_level || 0;
          // AI can recommend a specific level, but we still respect progressive escalation
          const targetLevel = Math.min(Math.max(currentLevel + 1, cluster.risk_level), 3);

          if (targetLevel === 1 && currentLevel < 1) {
            await supabase.from("profiles").update({
              fraud_risk_level: 1,
              admin_notes: `[AI Step 1] Sybil cluster "${cluster.cluster_id}": ${cluster.reason}`,
            }).eq("id", p.id);
            escalation.flagged++;
          } else if (targetLevel === 2 && currentLevel < 2) {
            await supabase.from("profiles").update({
              fraud_risk_level: 2,
              claim_speed_limit_until: cooldownUntil,
              admin_notes: `[AI Step 2] Sybil cluster: ${cluster.reason}. Claim giới hạn 48h.`,
            }).eq("id", p.id);
            escalation.limited++;
          } else if (targetLevel >= 3 && currentLevel < 3) {
            await supabase.from("profiles").update({
              fraud_risk_level: 3,
              reward_status: "on_hold",
              admin_notes: `[AI Step 3] Sybil cluster (confidence ${cluster.confidence}%): ${cluster.reason}. Đình chỉ chờ Admin.`,
            }).eq("id", p.id);
            escalation.held++;
          }
        }

        // Log fraud signal
        await supabase.from("pplp_fraud_signals").insert({
          actor_id: fullIds[0],
          signal_type: "AI_SYBIL_CLUSTER",
          severity: Math.min(cluster.risk_level + 2, 5),
          details: {
            cluster_id: cluster.cluster_id,
            user_ids: fullIds,
            confidence: cluster.confidence,
            risk_level: cluster.risk_level,
            reason: cluster.reason,
            signals: cluster.signals,
            escalation,
          },
          source: "analyze-fraud-patterns",
        });

        processedClusters.push({ cluster, fullUserIds: fullIds, escalation });
      }
    }

    // 7. Notify admins about AI findings
    if (processedClusters.length > 0) {
      const admins = Array.from(adminIds);
      if (admins.length) {
        await supabase.from("notifications").insert(
          admins.map(adminId => ({
            user_id: adminId,
            actor_id: admins[0],
            type: "admin_ai_sybil",
            read: false,
            metadata: {
              clusters_found: processedClusters.length,
              ai_summary: aiSummary,
              clusters: processedClusters.map(pc => ({
                id: pc.cluster.cluster_id,
                users: pc.cluster.user_ids.length,
                confidence: pc.cluster.confidence,
                risk: pc.cluster.risk_level,
                reason: pc.cluster.reason.slice(0, 200),
                escalation: pc.escalation,
              })),
            },
          }))
        );
      }
    }

    return new Response(JSON.stringify({
      success: true,
      clusters_analyzed: aiClusters.length,
      clusters_actioned: processedClusters.length,
      summary: aiSummary,
      details: processedClusters.map(pc => ({
        cluster_id: pc.cluster.cluster_id,
        users: pc.fullUserIds.length,
        confidence: pc.cluster.confidence,
        risk_level: pc.cluster.risk_level,
        reason: pc.cluster.reason,
        escalation: pc.escalation,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[AI Fraud] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
