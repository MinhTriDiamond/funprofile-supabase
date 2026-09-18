// =============================================
// PPLP Helper - Submit Action & Scoring Utilities
// =============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BASE_REWARDS, PILLARS, THRESHOLDS, calculateCascadeDistribution } from "./pplp-types.ts";
import { generateEvidenceHash, generateCanonicalHash } from "./pplp-crypto.ts";

// Create Supabase admin client
export function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  );
}

// Submit a PPLP action (called from other edge functions or directly)
export async function submitPPLPAction(params: {
  platform_id: string;
  action_type: string;
  actor_id: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
  impact?: Record<string, unknown>;
  integrity?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Generate hashes
  const evidence_hash = await generateEvidenceHash(
    params.action_type,
    params.actor_id,
    params.metadata || {},
    now
  );
  const canonical_hash = await generateCanonicalHash(
    params.action_type,
    params.actor_id,
    JSON.stringify(params.metadata || {}).substring(0, 100),
    now
  );

  // Check for duplicate (same canonical hash within 24h)
  const { data: existing } = await supabase
    .from('pplp_actions')
    .select('id')
    .eq('canonical_hash', canonical_hash)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    return { success: false, error: 'Duplicate action within 24h', action_id: existing[0].id };
  }

  // Get active policy
  const { data: policy } = await supabase
    .from('pplp_policies')
    .select('version')
    .eq('is_active', true)
    .limit(1)
    .single();

  // Insert action
  const { data, error } = await supabase
    .from('pplp_actions')
    .insert({
      platform_id: params.platform_id,
      action_type: params.action_type,
      actor_id: params.actor_id,
      target_id: params.target_id || null,
      metadata: params.metadata || {},
      impact: params.impact || {},
      integrity: params.integrity || {},
      evidence_hash,
      canonical_hash,
      policy_version: policy?.version || 'v1.0.2',
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[PPLP Helper] Insert error:', error);
    return { success: false, error: error.message };
  }

  return { success: true, action_id: data.id, evidence_hash };
}

// Calculate Light Score from 5 pillars
export function calculateLightScore(pillars: {
  s: number; t: number; h: number; c: number; u: number;
}): number {
  return (
    pillars.s * PILLARS.S.weight +
    pillars.t * PILLARS.T.weight +
    pillars.h * PILLARS.H.weight +
    pillars.c * PILLARS.C.weight +
    pillars.u * PILLARS.U.weight
  );
}

// Calculate final reward
export function calculateFinalReward(
  baseReward: number,
  q: number, // Quality multiplier
  i: number, // Impact multiplier
  k: number  // Integrity multiplier
): number {
  return Math.round(baseReward * q * i * k);
}

// Determine pass/fail decision
export function makeDecision(lightScore: number, pillarT: number): {
  decision: 'pass' | 'fail';
  reason: string;
  failReasons: string[];
} {
  const failReasons: string[] = [];

  if (lightScore < THRESHOLDS.MIN_LIGHT_SCORE) {
    failReasons.push(`Light Score ${lightScore.toFixed(1)} < minimum ${THRESHOLDS.MIN_LIGHT_SCORE}`);
  }
  if (pillarT < THRESHOLDS.MIN_PILLAR_T) {
    failReasons.push(`Truth pillar ${pillarT.toFixed(1)} < minimum ${THRESHOLDS.MIN_PILLAR_T}`);
  }

  if (failReasons.length > 0) {
    return { decision: 'fail', reason: failReasons.join('; '), failReasons };
  }

  return { decision: 'pass', reason: 'All thresholds met', failReasons: [] };
}

// Get base reward for action type
export function getBaseReward(actionType: string): number {
  return BASE_REWARDS[actionType] || 50; // Default 50 FUN
}

// Export cascade distribution helper
export { calculateCascadeDistribution };
