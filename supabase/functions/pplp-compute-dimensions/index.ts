import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// =============================================
// 5 Dimension Scoring Engine (Whitepaper v1)
// Now reads UNIFIED data (v1 + v2)
// =============================================

function computeIdentityScore(profile: any): number {
  let score = 0;
  if (profile.display_name) score += 10;
  if (profile.avatar_url) score += 10;
  if (profile.bio) score += 5;
  if (profile.location) score += 5;
  if (profile.wallet_address) score += 30;
  if (profile.law_of_light_accepted) score += 20;
  if (profile.created_at) {
    const ageMs = Date.now() - new Date(profile.created_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 30) score += 20;
  }
  return Math.min(100, score);
}

function computeActivityScore(totalLightScore: number): number {
  if (totalLightScore <= 0) return 0;
  const normalized = Math.log(1 + totalLightScore) / Math.log(1 + 100000);
  return Math.min(100, Math.round(normalized * 100));
}

function computeOnChainScore(profile: any, donationStats: any): number {
  let score = 0;
  if (profile.wallet_address) score += 30;
  if (donationStats.sent_count > 0) score += 30;
  if (donationStats.received_count > 0) score += 20;
  if (donationStats.first_donation_at) {
    const ageMs = Date.now() - new Date(donationStats.first_donation_at).getTime();
    if (ageMs > 30 * 24 * 60 * 60 * 1000) score += 20;
  }
  return Math.min(100, score);
}

function computeTransparencyScore(fraudSignals: any[]): number {
  let score = 100;
  for (const signal of fraudSignals) {
    const sev = signal.severity || 0;
    if (sev >= 7) score -= 30;
    else if (sev >= 4) score -= 15;
    else score -= 5;
  }
  return Math.max(0, score);
}

function computeEcosystemScore(stats: {
  hasPost: boolean;
  hasComment: boolean;
  donationsSent: number;
  donationsReceived: number;
  streakDays: number;
  lawAccepted: boolean;
  hasV2Actions: boolean;
}): number {
  let score = 0;
  if (stats.hasPost) score += 15;
  if (stats.hasComment) score += 15;
  if (stats.donationsSent > 0) score += 20;
  if (stats.donationsReceived > 0) score += 15;
  if (stats.streakDays >= 7) score += 15;
  if (stats.lawAccepted) score += 20;
  // Bonus for v2 participation (Truth Validation Engine usage)
  if (stats.hasV2Actions) score += 10;
  return Math.min(100, score);
}

function computeRiskPenalty(fraudSignals: any[]): number {
  let total = 0;
  for (const signal of fraudSignals) {
    total += signal.severity || 0;
  }
  return Math.min(80, total);
}

function computeStreakBonusPct(streakDays: number): number {
  if (streakDays >= 90) return 10;
  if (streakDays >= 30) return 5;
  if (streakDays >= 7) return 2;
  return 0;
}

function applyDecay(activityScore: number, inactiveDays: number): number {
  if (inactiveDays >= 180) return 0;
  if (inactiveDays >= 90) return activityScore * 0.3;
  if (inactiveDays >= 60) return activityScore * 0.6;
  if (inactiveDays >= 30) return activityScore * 0.85;
  return activityScore;
}

function getLevelName(total: number): string {
  if (total >= 800) return 'Cosmic Contributor';
  if (total >= 500) return 'Light Leader';
  if (total >= 250) return 'Light Guardian';
  if (total >= 100) return 'Light Builder';
  return 'Light Seed';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Support both authenticated single-user and cron batch mode
    let targetUserIds: string[] = [];
    const authHeader = req.headers.get('Authorization');

    const body = await req.json().catch(() => ({}));

    if (body.batch === true) {
      // Batch mode: compute for all users with any activity (v1 OR v2)
      // Get v1 active users
      const { data: v1Users } = await supabase
        .from('light_reputation')
        .select('user_id')
        .gte('last_action_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString());
      
      const userSet = new Set<string>();
      if (v1Users) v1Users.forEach((u: any) => userSet.add(u.user_id));

      // Also get v2 active users
      const { data: v2Users } = await supabase
        .from('pplp_v2_user_actions')
        .select('user_id')
        .gte('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString());
      
      if (v2Users) v2Users.forEach((u: any) => userSet.add(u.user_id));

      targetUserIds = Array.from(userSet);
    } else if (body.user_id) {
      targetUserIds = [body.user_id];
    } else if (authHeader) {
      const userSupabase = createClient(supabaseUrl, (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: { user } } = await userSupabase.auth.getUser();
      if (user) targetUserIds = [user.id];
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No users to compute' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[DIMENSIONS] Computing for ${targetUserIds.length} users (unified v1+v2)`);
    let computed = 0;

    for (const userId of targetUserIds) {
      try {
        // 1. Fetch profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, bio, location, wallet_address, law_of_light_accepted, created_at')
          .eq('id', userId)
          .single();

        if (!profile) continue;

        // 2. Fetch UNIFIED light score (v1+v2 combined)
        const { data: unifiedRows } = await supabase
          .rpc('get_unified_light_score', { p_user_id: userId });
        
        const unified = unifiedRows?.[0];
        const combinedLightScore = unified ? Number(unified.combined_light_score) : 0;
        const v2ActionsCount = unified ? Number(unified.v2_actions_count) : 0;

        // 2b. Still need streak from light_reputation
        const { data: rep } = await supabase
          .from('light_reputation')
          .select('consistency_streak, last_action_at')
          .eq('user_id', userId)
          .single();

        // 3. Fetch donation stats
        const { data: sentDonations } = await supabase
          .from('donations')
          .select('id, created_at')
          .eq('sender_id', userId)
          .eq('status', 'confirmed')
          .order('created_at', { ascending: true })
          .limit(1);

        const { count: sentCount } = await supabase
          .from('donations')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', userId)
          .eq('status', 'confirmed');

        const { count: receivedCount } = await supabase
          .from('donations')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_id', userId)
          .eq('status', 'confirmed');

        // 4. Fetch fraud signals (unresolved)
        const { data: fraudSignals } = await supabase
          .from('pplp_fraud_signals')
          .select('severity')
          .eq('user_id', userId)
          .eq('is_resolved', false);

        // 5. Check posts & comments existence
        const { count: postsCount } = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        const { count: commentsCount } = await supabase
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        // Compute inactive days
        const lastActionAt = rep?.last_action_at;
        let inactiveDays = 0;
        if (lastActionAt) {
          inactiveDays = Math.floor((Date.now() - new Date(lastActionAt).getTime()) / (1000 * 60 * 60 * 24));
        }

        const streakDays = rep?.consistency_streak || 0;

        // Compute 5 dimensions using COMBINED light score
        const identityScore = computeIdentityScore(profile);
        let activityScore = computeActivityScore(combinedLightScore);
        activityScore = applyDecay(activityScore, inactiveDays);
        
        const onchainScore = computeOnChainScore(profile, {
          sent_count: sentCount || 0,
          received_count: receivedCount || 0,
          first_donation_at: sentDonations?.[0]?.created_at || null,
        });
        
        const transparencyScore = computeTransparencyScore(fraudSignals || []);
        
        const ecosystemScore = computeEcosystemScore({
          hasPost: (postsCount || 0) > 0,
          hasComment: (commentsCount || 0) > 0,
          donationsSent: sentCount || 0,
          donationsReceived: receivedCount || 0,
          streakDays,
          lawAccepted: profile.law_of_light_accepted || false,
          hasV2Actions: v2ActionsCount > 0,
        });

        const riskPenalty = computeRiskPenalty(fraudSignals || []);
        const streakBonusPct = computeStreakBonusPct(streakDays);

        const rawTotal = (identityScore + activityScore + onchainScore + transparencyScore + ecosystemScore);
        const totalWithBonus = rawTotal * (1 + streakBonusPct / 100);
        const finalTotal = Math.max(0, Math.min(1000, Math.round(totalWithBonus - riskPenalty)));
        
        const levelName = getLevelName(finalTotal);

        // Upsert into user_dimension_scores
        const { error: upsertError } = await supabase
          .from('user_dimension_scores')
          .upsert({
            user_id: userId,
            identity_score: Math.round(identityScore),
            activity_score: Math.round(activityScore),
            onchain_score: Math.round(onchainScore),
            transparency_score: Math.round(transparencyScore),
            ecosystem_score: Math.round(ecosystemScore),
            risk_penalty: riskPenalty,
            streak_bonus_pct: streakBonusPct,
            inactive_days: inactiveDays,
            decay_applied: inactiveDays >= 30,
            total_light_score: finalTotal,
            level_name: levelName,
            computed_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (upsertError) {
          console.error(`[DIMENSIONS] Error for user ${userId}:`, upsertError);
        } else {
          computed++;
        }
      } catch (userError) {
        console.error(`[DIMENSIONS] Error computing user ${userId}:`, userError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      computed,
      total: targetUserIds.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[DIMENSIONS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
