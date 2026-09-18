import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient, calculateLightScore, calculateFinalReward, makeDecision, getBaseReward } from "../_shared/pplp-helper.ts";
import { PILLARS, SCORE_RANGES } from "../_shared/pplp-types.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Score a single pillar based on metadata
function scorePillar(
  pillar: 'S' | 'T' | 'H' | 'C' | 'U',
  metadata: Record<string, unknown>,
  impact: Record<string, unknown>,
  integrity: Record<string, unknown>
): number {
  let score = 50; // Base score

  switch (pillar) {
    case 'S': // Service
      if (impact.beneficiaries && Number(impact.beneficiaries) > 0) score += 15;
      if (impact.outcome === 'positive') score += 15;
      if (metadata.is_educational) score += 10;
      if (impact.healing_effect) score += 10;
      break;
    case 'T': // Truth
      if (metadata.has_evidence) score += 15;
      if (metadata.verified) score += 15;
      if (integrity.source_verified) score += 10;
      if (integrity.anti_sybil_score && Number(integrity.anti_sybil_score) > 0.7) score += 10;
      break;
    case 'H': // Healing
      if (metadata.sentiment_score && Number(metadata.sentiment_score) > 0.5) score += 15;
      if (impact.healing_effect) score += 15;
      if (impact.promotes_unity) score += 10;
      if (metadata.is_educational) score += 10;
      break;
    case 'C': // Contribution
      const contentLength = String(metadata.content || '').length;
      if (contentLength > 200) score += 15;
      else if (contentLength > 50) score += 10;
      if (metadata.is_educational) score += 15;
      if (metadata.has_evidence) score += 10;
      if (Number(impact.beneficiaries || 0) > 1) score += 10;
      break;
    case 'U': // Unity
      if (impact.promotes_unity) score += 20;
      if (Number(impact.beneficiaries || 0) > 1) score += 15;
      if (metadata.sentiment_score && Number(metadata.sentiment_score) > 0.7) score += 10;
      if (integrity.anti_sybil_score && Number(integrity.anti_sybil_score) > 0.8) score += 5;
      break;
  }

  return Math.min(100, Math.max(0, score));
}

// Calculate multipliers
function calculateMultipliers(
  metadata: Record<string, unknown>,
  impact: Record<string, unknown>,
  integrity: Record<string, unknown>
): { q: number; i: number; k: number } {
  // Quality (Q): 0.5 - 3.0
  let q = 1.0;
  if (metadata.has_evidence) q += 0.3;
  if (metadata.is_educational) q += 0.5;
  if (metadata.verified) q += 0.2;
  const contentLen = String(metadata.content || '').length;
  if (contentLen > 500) q += 0.5;
  else if (contentLen > 200) q += 0.3;
  q = Math.max(SCORE_RANGES.Q.min, Math.min(SCORE_RANGES.Q.max, q));

  // Impact (I): 0.5 - 5.0
  let i = 1.0;
  const beneficiaries = Number(impact.beneficiaries || 0);
  if (beneficiaries > 10) i += 2.0;
  else if (beneficiaries > 5) i += 1.0;
  else if (beneficiaries > 1) i += 0.5;
  if (impact.outcome === 'positive') i += 0.5;
  if (impact.healing_effect) i += 0.5;
  i = Math.max(SCORE_RANGES.I.min, Math.min(SCORE_RANGES.I.max, i));

  // Integrity (K): 0.0 - 1.0
  let k = 1.0;
  const antiSybil = Number(integrity.anti_sybil_score || 0.85);
  if (antiSybil < 0.3) k = 0;
  else if (antiSybil < 0.5) k = 0.3;
  else if (antiSybil < 0.7) k = 0.7;
  else k = Math.min(1.0, antiSybil);

  return { q, i, k };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();

    // This is a backend-to-backend function - verify service role authorization
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized - service role required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action_id } = await req.json();

    if (!action_id) {
      return new Response(JSON.stringify({ error: 'action_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch action
    const { data: action, error: fetchErr } = await supabase
      .from('pplp_actions')
      .select('*')
      .eq('id', action_id)
      .single();

    // Check if actor is banned
    if (action?.actor_id) {
      const { data: banCheck } = await supabase
        .from('profiles').select('is_banned').eq('id', action.actor_id).single();
      if (banCheck?.is_banned) {
        return new Response(JSON.stringify({ error: 'Tài khoản đã bị cấm vĩnh viễn.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (fetchErr || !action) {
      return new Response(JSON.stringify({ error: 'Action not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Action already scored', status: action.status }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[PPLP Score] Scoring action ${action_id}, type: ${action.action_type}`);

    // Calculate 5 pillar scores
    const pillars = {
      s: scorePillar('S', action.metadata, action.impact, action.integrity),
      t: scorePillar('T', action.metadata, action.impact, action.integrity),
      h: scorePillar('H', action.metadata, action.impact, action.integrity),
      c: scorePillar('C', action.metadata, action.impact, action.integrity),
      u: scorePillar('U', action.metadata, action.impact, action.integrity),
    };

    const lightScore = calculateLightScore(pillars);
    const baseReward = getBaseReward(action.action_type);
    const { q, i, k } = calculateMultipliers(action.metadata, action.impact, action.integrity);
    const finalReward = calculateFinalReward(baseReward, q, i, k);
    const { decision, reason, failReasons } = makeDecision(lightScore, pillars.t);

    console.log(`[PPLP Score] Pillars: S=${pillars.s} T=${pillars.t} H=${pillars.h} C=${pillars.c} U=${pillars.u}`);
    console.log(`[PPLP Score] LightScore=${lightScore.toFixed(1)}, Reward=${finalReward}, Decision=${decision}`);

    // Check caps
    const capResult = await supabase.rpc('check_user_cap_and_update', {
      _user_id: action.actor_id,
      _action_type: action.action_type,
      _reward_amount: finalReward,
    });

    const effectiveReward = capResult.data?.effective_reward ?? finalReward;
    const capAllowed = capResult.data?.allowed ?? true;

    // Insert score
    const { error: scoreErr } = await supabase
      .from('pplp_scores')
      .insert({
        action_id,
        pillar_s: pillars.s,
        pillar_t: pillars.t,
        pillar_h: pillars.h,
        pillar_c: pillars.c,
        pillar_u: pillars.u,
        light_score: lightScore,
        base_reward: baseReward,
        multiplier_q: q,
        multiplier_i: i,
        multiplier_k: k,
        final_reward: capAllowed ? effectiveReward : 0,
        decision: capAllowed ? decision : 'fail',
        decision_reason: capAllowed ? reason : 'Daily cap exceeded',
        fail_reasons: capAllowed ? failReasons : ['Daily cap exceeded'],
        scored_by: 'pplp-score-action',
        policy_version: action.policy_version,
      });

    if (scoreErr) {
      console.error('[PPLP Score] Insert error:', scoreErr);
      throw scoreErr;
    }

    // Update action status
    await supabase
      .from('pplp_actions')
      .update({ status: 'scored', scored_at: new Date().toISOString() })
      .eq('id', action_id);

    return new Response(JSON.stringify({
      success: true,
      action_id,
      pillars,
      light_score: lightScore,
      final_reward: capAllowed ? effectiveReward : 0,
      decision: capAllowed ? decision : 'fail',
      cap_info: capResult.data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[PPLP Score] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
