import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// Allowed action types from Angel AI
const ALLOWED_ACTION_TYPES = [
  'QUESTION_ASK',
  'FEEDBACK_GIVE',
  'VISION_CREATE',
  'POST_CREATE',
  'CONTENT_CREATE',
  'COMMENT_CREATE',
  'JOURNAL_WRITE',
  'GRATITUDE_PRACTICE',
  'HELP_COMMUNITY',
  'SHARE_CONTENT',
  'IDEA_SUBMIT',
  'DONATE_SUPPORT',
] as const;

// Base rewards for Angel AI actions
const BASE_REWARDS: Record<string, number> = {
  QUESTION_ASK: 50,
  FEEDBACK_GIVE: 60,
  VISION_CREATE: 1000,
  POST_CREATE: 80,
  CONTENT_CREATE: 100,
  COMMENT_CREATE: 30,
  JOURNAL_WRITE: 70,
  GRATITUDE_PRACTICE: 40,
  HELP_COMMUNITY: 80,
  SHARE_CONTENT: 30,
  IDEA_SUBMIT: 90,
  DONATE_SUPPORT: 100,
};

const MAX_ACTIONS_PER_USER_PER_DAY = 500;
const MAX_BATCH_SIZE = 50;

interface ActionPayload {
  fun_profile_id: string;
  action_type: string;
  light_score: number;
  metadata?: Record<string, unknown>;
  evidence_hash: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth: service-to-service API key ──
    const apiKey = req.headers.get('x-api-key');
    const expectedKey = Deno.env.get('ANGEL_AI_INGEST_KEY');
    if (!expectedKey || !apiKey || apiKey !== expectedKey) {
      return jsonError('Unauthorized', 401);
    }

    const body = await req.json();

    // ── Detect batch vs single mode ──
    if (Array.isArray(body.actions)) {
      return handleBatch(body);
    }
    // Single action (backward compatible)
    return handleSingle(body);

  } catch (error: unknown) {
    console.error('[INGEST] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, 500);
  }
});

// ══════════════════════════════════════════
// BATCH MODE: { actions: ActionPayload[], source_request_id?: string }
// ══════════════════════════════════════════
async function handleBatch(body: { actions: ActionPayload[]; source_request_id?: string }) {
  const { actions, source_request_id } = body;

  if (!actions.length) return jsonError('actions array is empty', 400);
  if (actions.length > MAX_BATCH_SIZE) return jsonError(`Max ${MAX_BATCH_SIZE} actions per batch`, 400);

  // All actions must belong to the same user
  const userIds = [...new Set(actions.map(a => a.fun_profile_id))];
  if (userIds.length !== 1) return jsonError('All actions in batch must belong to same user', 400);

  const funProfileId = userIds[0];

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  );

  // Check profile
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, is_banned')
    .eq('id', funProfileId)
    .maybeSingle();

  if (profileErr || !profile) return jsonError('Profile not found in FUN.RICH', 404);
  if (profile.is_banned) return jsonError('User is banned', 403);

  // Rate limit check
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('light_actions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', funProfileId)
    .eq('reference_type', 'angel_ai')
    .gte('created_at', todayStart.toISOString());

  const currentCount = count ?? 0;
  const remaining = MAX_ACTIONS_PER_USER_PER_DAY - currentCount;
  if (remaining <= 0) return jsonError(`Rate limit exceeded: max ${MAX_ACTIONS_PER_USER_PER_DAY} actions/day`, 429);

  // Process actions (up to remaining limit)
  const toProcess = actions.slice(0, remaining);
  const results: { action_id?: string; evidence_hash: string; status: string; error?: string }[] = [];
  let totalLightScore = 0;

  for (const action of toProcess) {
    // Validate
    if (!ALLOWED_ACTION_TYPES.includes(action.action_type as any)) {
      results.push({ evidence_hash: action.evidence_hash, status: 'skipped', error: `Invalid action_type: ${action.action_type}` });
      continue;
    }
    if (!action.evidence_hash) {
      results.push({ evidence_hash: '', status: 'skipped', error: 'Missing evidence_hash' });
      continue;
    }

    // Deduplicate
    const { data: existing } = await supabase
      .from('light_actions')
      .select('id')
      .eq('reference_id', action.evidence_hash)
      .eq('reference_type', 'angel_ai')
      .maybeSingle();

    if (existing) {
      results.push({ action_id: existing.id, evidence_hash: action.evidence_hash, status: 'duplicate' });
      continue;
    }

    const baseReward = BASE_REWARDS[action.action_type] ?? 50;
    const finalScore = action.light_score > 0 ? action.light_score : baseReward;

    const { data: inserted, error: insertErr } = await supabase
      .from('light_actions')
      .insert({
        user_id: funProfileId,
        actor_id: funProfileId,
        action_type: action.action_type.toLowerCase(),
        base_reward: baseReward,
        quality_score: 1.0,
        impact_score: 1.0,
        integrity_score: 1.0,
        unity_multiplier: 1.0,
        unity_score: 0,
        light_score: finalScore,
        mint_amount: 0,
        mint_status: 'approved',
        is_eligible: true,
        reference_id: action.evidence_hash,
        reference_type: 'angel_ai',
        content_preview: action.metadata?.content_preview as string || `Angel AI: ${action.action_type}`,
        angel_evaluation: action.metadata || null,
      })
      .select('id, light_score')
      .single();

    if (insertErr) {
      results.push({ evidence_hash: action.evidence_hash, status: 'error', error: insertErr.message });
    } else {
      totalLightScore += inserted.light_score;
      results.push({ action_id: inserted.id, evidence_hash: action.evidence_hash, status: 'ingested' });
    }
  }

  const ingested = results.filter(r => r.status === 'ingested').length;
  const duplicates = results.filter(r => r.status === 'duplicate').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`[INGEST-BATCH] user=${funProfileId} total=${toProcess.length} ingested=${ingested} dup=${duplicates} err=${errors} score=${totalLightScore} source=${source_request_id || 'n/a'}`);

  return jsonOk({
    message: `Batch processed: ${ingested} ingested, ${duplicates} duplicates, ${errors} errors`,
    fun_profile_id: funProfileId,
    source_request_id: source_request_id || null,
    summary: { total: toProcess.length, ingested, duplicates, errors, total_light_score: totalLightScore },
    results,
  });
}

// ══════════════════════════════════════════
// SINGLE MODE (backward compatible)
// ══════════════════════════════════════════
async function handleSingle(body: Record<string, unknown>) {
  const { fun_profile_id, action_type, light_score, metadata, evidence_hash } = body as ActionPayload;

  if (!fun_profile_id || typeof fun_profile_id !== 'string') return jsonError('fun_profile_id is required (string)', 400);
  if (!action_type || !ALLOWED_ACTION_TYPES.includes(action_type as any)) {
    return jsonError(`action_type must be one of: ${ALLOWED_ACTION_TYPES.join(', ')}`, 400);
  }
  if (light_score === undefined || typeof light_score !== 'number' || light_score < 0) {
    return jsonError('light_score must be a non-negative number', 400);
  }
  if (!evidence_hash || typeof evidence_hash !== 'string') {
    return jsonError('evidence_hash is required for deduplication', 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  );

  // Check profile
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, is_banned')
    .eq('id', fun_profile_id)
    .maybeSingle();

  if (profileErr || !profile) return jsonError('Profile not found in FUN.RICH', 404);
  if (profile.is_banned) return jsonError('User is banned', 403);

  // Deduplicate
  const { data: existing } = await supabase
    .from('light_actions')
    .select('id')
    .eq('reference_id', evidence_hash)
    .eq('reference_type', 'angel_ai')
    .maybeSingle();

  if (existing) {
    return jsonOk({ message: 'Action already ingested', action_id: existing.id, duplicate: true });
  }

  // Rate limit
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('light_actions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', fun_profile_id)
    .eq('reference_type', 'angel_ai')
    .gte('created_at', todayStart.toISOString());

  if ((count ?? 0) >= MAX_ACTIONS_PER_USER_PER_DAY) {
    return jsonError(`Rate limit exceeded: max ${MAX_ACTIONS_PER_USER_PER_DAY} actions/day from Angel AI`, 429);
  }

  const baseReward = BASE_REWARDS[action_type] ?? 50;
  const finalLightScore = light_score > 0 ? light_score : baseReward;

  const { data: inserted, error: insertErr } = await supabase
    .from('light_actions')
    .insert({
      user_id: fun_profile_id,
      actor_id: fun_profile_id,
      action_type: action_type.toLowerCase(),
      base_reward: baseReward,
      quality_score: 1.0,
      impact_score: 1.0,
      integrity_score: 1.0,
      unity_multiplier: 1.0,
      unity_score: 0,
      light_score: finalLightScore,
      mint_amount: 0,
      mint_status: 'approved',
      is_eligible: true,
      reference_id: evidence_hash,
      reference_type: 'angel_ai',
      content_preview: (metadata as any)?.content_preview || `Angel AI: ${action_type}`,
      angel_evaluation: metadata || null,
    })
    .select('id, light_score, created_at')
    .single();

  if (insertErr) {
    console.error('[INGEST] Insert error:', insertErr);
    return jsonError('Failed to insert action: ' + insertErr.message, 500);
  }

  console.log(`[INGEST] Angel AI action ingested: user=${fun_profile_id} type=${action_type} score=${finalLightScore} id=${inserted.id}`);

  return jsonOk({
    message: 'Action ingested successfully',
    action_id: inserted.id,
    light_score: inserted.light_score,
    created_at: inserted.created_at,
    duplicate: false,
  });
}

// ── Helpers ──
function jsonOk(data: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function jsonError(message: string, status = 500): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
