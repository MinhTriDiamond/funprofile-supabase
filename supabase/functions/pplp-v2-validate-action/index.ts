import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ANGEL_AI_ENDPOINT = "https://ssjoetiitctqzapymtzl.supabase.co/functions/v1/angel-chat";
const LOVABLE_AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const ANGEL_TIMEOUT_MS = 90000;

const HIGH_IMPACT_CODES = ['SOCIAL_IMPACT', 'SERVICE', 'GIVING'];
const MAX_HIGH_IMPACT_ACTIONS_PER_DAY = 3;

// =============================================
// PPLP Engine v2.0 — Human Value Recognition Engine
// 5 Trụ cột Ánh Sáng: Sám Hối, Biết Ơn, Phụng Sự, Giúp Đỡ, Trao Tặng
// LightScore = ∑ (Intent × Depth × Impact × Consistency × TrustFactor)
// =============================================

// Impact weights by action type
const IMPACT_WEIGHTS: Record<string, number> = {
  INNER_WORK: 0.8,
  CHANNELING: 1.0,
  GIVING: 1.2,
  SOCIAL_IMPACT: 1.2,
  SERVICE: 1.3,
};

// New v2.0 pillar keys
const NEW_PILLAR_KEYS = ['repentance', 'gratitude', 'service_pillar', 'help_pillar', 'giving_pillar'] as const;
// Legacy pillar keys (kept for backward compat)
const LEGACY_PILLAR_KEYS = ['serving_life', 'transparent_truth', 'healing_love', 'long_term_value', 'unity_over_separation'] as const;

interface V2PillarScores {
  repentance: number;
  gratitude: number;
  service_pillar: number;
  help_pillar: number;
  giving_pillar: number;
}

interface NLPFeatures {
  ego_signal: number;
  authenticity: number;
  love_tone: number;
  depth_score: number;
  intent_score: number;
}

interface LegacyPillarScores {
  serving_life: number;
  transparent_truth: number;
  healing_love: number;
  long_term_value: number;
  unity_over_separation: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// =============================================
// PPLP v2.0 Validation Prompt
// Đo lường giá trị thật của hành động con người
// =============================================
function buildValidationPrompt(action: any, proofs: any[]): string {
  const proofDescriptions = proofs.map(p => {
    const parts = [`Loại: ${p.proof_type}`];
    if (p.proof_url) parts.push(`URL: ${p.proof_url}`);
    if (p.extracted_text) parts.push(`Nội dung: ${p.extracted_text}`);
    if (p.external_ref) parts.push(`Ref: ${p.external_ref}`);
    return parts.join(', ');
  }).join('\n');

  const metrics = action.metrics || {};
  const metricsDesc = Object.keys(metrics).length > 0
    ? `Engagement metrics: ${JSON.stringify(metrics)}`
    : '(Không có metrics)';

  return `Bạn là PPLP Engine v2.0 — Human Value Recognition Engine.
Hệ thống đo lường GIÁ TRỊ THẬT của hành động con người, KHÔNG đếm số lượng.

MỤC TIÊU: Phân tích "linh hồn của hành động" — dấu vết chuyển hoá thật sự.

5 TRỤ CỘT ÁNH SÁNG (0-10 mỗi trụ):
1. repentance (Sám Hối): Có dấu hiệu tự nhìn lại, nhận lỗi, chuyển hoá bản thân? 
2. gratitude (Biết Ơn): Có năng lượng biết ơn, trân trọng cuộc sống/người khác?
3. service (Phụng Sự): Có phụng sự sự sống, giúp ích cộng đồng?
4. help (Giúp Đỡ): Có giúp đỡ người khác cụ thể? Có phản hồi xác nhận?
5. giving (Trao Tặng): Có trao tặng (thời gian, tiền, kiến thức, tình yêu)?

PHÂN TÍCH NLP (0.0-1.0):
- ego_signal: Mức độ bản ngã (0 = không ego, 1 = rất ego). EGO CAO → GIẢM ĐIỂM.
- authenticity: Độ chân thật của nội dung (0 = giả, 1 = rất thật)
- love_tone: Năng lượng yêu thương trong ngôn ngữ (0 = lạnh, 1 = rất yêu thương)
- depth_score: Độ sâu chuyển hoá (0 = bề mặt, 1 = chuyển hoá sâu)
- intent_score: Ý định thuần khiết (0 = vụ lợi, 1 = thuần khiết)

5 QUY TẮC BẤT BIẾN:
❗ RULE #1: Không có Proof → Không có Score
❗ RULE #2: Score tăng theo CHẤT LƯỢNG, không theo SỐ LƯỢNG
❗ RULE #3: Ego cao → Score giảm mạnh (ego_signal > 0.5 → trừ điểm)
❗ RULE #4: Giúp người khác THẬT → Score tăng mạnh
❗ RULE #5: Gian lận → giảm exponential

ĐÁNH GIÁ CHẤT LƯỢNG ENGAGEMENT:
- KHÔNG dùng raw likes/shares
- Dùng: chất lượng phản hồi, độ sâu tương tác, thời gian xem thật
- 1 bài có chuyển hoá thật > 100 bài spam

HÀNH ĐỘNG CẦN ĐÁNH GIÁ:
- Loại: ${action.action_type_code}
- Tiêu đề: ${action.title}
- Mô tả: ${action.description || '(không có)'}
- Nguồn: ${action.source_url || '(không có)'}
- Platform: ${action.platform || 'internal'}
- ${metricsDesc}

BẰNG CHỨNG:
${proofDescriptions || '(Không có bằng chứng)'}

Trả lời CHÍNH XÁC theo format JSON (không thêm text):
{
  "repentance": <0-10>,
  "gratitude": <0-10>,
  "service": <0-10>,
  "help": <0-10>,
  "giving": <0-10>,
  "ego_signal": <0.0-1.0>,
  "authenticity": <0.0-1.0>,
  "love_tone": <0.0-1.0>,
  "depth_score": <0.0-1.0>,
  "intent_score": <0.0-1.0>,
  "fraud_score": <0.0-1.0>,
  "confidence": <0.0-1.0>,
  "reasoning": "<giải thích ngắn gọn bằng tiếng Việt>",
  "flags": []
}`;
}

// =============================================
// AI Callers (Angel AI primary, Lovable AI fallback)
// =============================================
async function callAngelAI(prompt: string): Promise<string | null> {
  const ANGEL_AI_API_KEY = Deno.env.get("ANGEL_AI_API_KEY");
  if (!ANGEL_AI_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANGEL_TIMEOUT_MS);

  try {
    const resp = await fetch(ANGEL_AI_ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": ANGEL_AI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt, messages: [{ role: "user", content: prompt }] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;

    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.content || parsed.text || parsed.delta?.content || parsed.choices?.[0]?.delta?.content;
            if (content) fullText += content;
          } catch { /* partial */ }
        }
      }
      return fullText;
    } else {
      const json = await resp.json();
      return json.response || json.content || json.message || JSON.stringify(json);
    }
  } catch (e) {
    clearTimeout(timeout);
    console.warn('[PPLP v2 Validate] Angel AI failed:', e);
    return null;
  }
}

async function callLovableAI(prompt: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  try {
    const resp = await fetch(LOVABLE_AI_ENDPOINT, {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are PPLP Engine v2.0 — Human Value Recognition Engine. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.warn('[PPLP v2 Validate] Lovable AI failed:', e);
    return null;
  }
}

// =============================================
// Parse AI response → v2.0 scores
// =============================================
interface ParsedAIResponse {
  pillars: V2PillarScores;
  nlp: NLPFeatures;
  fraud_score: number;
  confidence: number;
  reasoning: string;
  flags: string[];
}

function parseAIResponse(text: string): ParsedAIResponse {
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error('No JSON found in AI response');
  const p = JSON.parse(jsonMatch[0]);

  return {
    pillars: {
      repentance: clamp(Number(p.repentance) || 0, 0, 10),
      gratitude: clamp(Number(p.gratitude) || 0, 0, 10),
      service_pillar: clamp(Number(p.service) || 0, 0, 10),
      help_pillar: clamp(Number(p.help) || 0, 0, 10),
      giving_pillar: clamp(Number(p.giving) || 0, 0, 10),
    },
    nlp: {
      ego_signal: clamp(Number(p.ego_signal) || 0, 0, 1),
      authenticity: clamp(Number(p.authenticity) || 0, 0, 1),
      love_tone: clamp(Number(p.love_tone) || 0, 0, 1),
      depth_score: clamp(Number(p.depth_score) || 0, 0, 1),
      intent_score: clamp(Number(p.intent_score) || 0, 0, 1),
    },
    fraud_score: clamp(Number(p.fraud_score) || 0, 0, 1),
    confidence: clamp(Number(p.confidence) || 0, 0, 1),
    reasoning: String(p.reasoning || ''),
    flags: Array.isArray(p.flags) ? p.flags : [],
  };
}

// =============================================
// PPLP v2.0 Scoring Formula
// LightScore = ∑ (Intent × Depth × Impact × Consistency × TrustFactor)
// Intent = f(gratitude + repentance + low_ego)
// TrustFactor = identity_score × anti_fraud_score × community_validation
// Scale: ∞ (no cap)
// =============================================
function calculateLightScoreV2(
  pillars: V2PillarScores,
  nlp: NLPFeatures,
  fraudScore: number,
  impactWeight: number,
  trustMultiplier: number,
  consistencyMultiplier: number,
  attendanceMultiplier: number,
  communityValidation: number,
): { rawScore: number; finalScore: number; dimensions: Record<string, number> } {

  // Intent = f(gratitude + repentance + low_ego)
  const egoReduction = 1 - nlp.ego_signal; // high ego → low reduction factor
  const intent = ((pillars.gratitude + pillars.repentance) / 20) * egoReduction * nlp.intent_score;

  // Depth = NLP depth + authenticity + love_tone
  const depth = (nlp.depth_score * 0.4 + nlp.authenticity * 0.3 + nlp.love_tone * 0.3);

  // Impact = service + help + giving weighted
  const impact = (pillars.service_pillar * 0.35 + pillars.help_pillar * 0.35 + pillars.giving_pillar * 0.30) / 10;

  // Consistency (passed in as multiplier)
  const consistency = consistencyMultiplier;

  // TrustFactor = identity × anti_fraud × community_validation
  const antiFraud = fraudScore > 0.5 ? Math.pow(1 - fraudScore, 2) : 1.0; // exponential penalty
  const trustFactor = trustMultiplier * antiFraud * (communityValidation / 10);

  // Raw score (∞ scale — multiply all dimensions, scale by 100 for readability)
  const rawScore = intent * depth * impact * 100;

  // Final score with all multipliers
  const finalScore = rawScore * impactWeight * consistency * trustFactor * attendanceMultiplier;

  return {
    rawScore: Math.round(rawScore * 10000) / 10000,
    finalScore: Math.round(finalScore * 10000) / 10000,
    dimensions: {
      intent: Math.round(intent * 10000) / 10000,
      depth: Math.round(depth * 10000) / 10000,
      impact: Math.round(impact * 10000) / 10000,
      consistency,
      trust_factor: Math.round(trustFactor * 10000) / 10000,
    },
  };
}

// Map new pillars → legacy pillars for backward compat
function mapToLegacyPillars(pillars: V2PillarScores, nlp: NLPFeatures): LegacyPillarScores {
  return {
    serving_life: pillars.service_pillar,
    transparent_truth: nlp.authenticity * 10,
    healing_love: (pillars.repentance + pillars.gratitude) / 2,
    long_term_value: nlp.depth_score * 10,
    unity_over_separation: pillars.giving_pillar,
  };
}

function calculateConsistencyMultiplier(streakDays: number): number {
  if (streakDays >= 90) return 1.20;
  if (streakDays >= 30) return 1.10;
  if (streakDays >= 7) return 1.05;
  return 1.0;
}

async function isDuplicateProof(supabase: any, actionId: string, proofs: any[]): Promise<boolean> {
  for (const proof of proofs) {
    if (proof.proof_url) {
      const { count } = await supabase.from('pplp_v2_proofs')
        .select('id', { count: 'exact', head: true }).eq('proof_url', proof.proof_url).neq('action_id', actionId);
      if ((count ?? 0) > 0) return true;
    }
    if (proof.file_hash) {
      const { count } = await supabase.from('pplp_v2_proofs')
        .select('id', { count: 'exact', head: true }).eq('file_hash', proof.file_hash).neq('action_id', actionId);
      if ((count ?? 0) > 0) return true;
    }
  }
  return false;
}

async function exceedsVelocityLimits(supabase: any, userId: string, actionTypeCode: string): Promise<boolean> {
  if (!HIGH_IMPACT_CODES.includes(actionTypeCode)) return false;
  const now = new Date();
  const vnOffset = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffset);
  const vnStartOfDay = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()));
  const utcStartOfDay = new Date(vnStartOfDay.getTime() - vnOffset);

  const { count } = await supabase.from('pplp_v2_user_actions')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId)
    .in('action_type_code', HIGH_IMPACT_CODES).in('status', ['validated', 'minted'])
    .gte('created_at', utcStartOfDay.toISOString());
  return (count ?? 0) >= MAX_HIGH_IMPACT_ACTIONS_PER_DAY;
}

async function increaseTrustForVerifiedConsistency(supabase: any, userId: string): Promise<void> {
  const { data } = await supabase.from('profiles').select('trust_level').eq('id', userId).single();
  const current = Number(data?.trust_level) || 1.0;
  await supabase.from('profiles').update({ trust_level: Math.min(1.25, current + 0.01) }).eq('id', userId);
}

async function decayTrustForSpam(supabase: any, userId: string): Promise<void> {
  const { data } = await supabase.from('profiles').select('trust_level').eq('id', userId).single();
  const current = Number(data?.trust_level) || 1.0;
  await supabase.from('profiles').update({ trust_level: Math.max(1.0, current - 0.05) }).eq('id', userId);
}

async function createReviewQueueItem(supabase: any, actionId: string, reason: string, priority = 'normal'): Promise<void> {
  const { error } = await supabase.from('pplp_v2_review_queue').upsert({
    action_id: actionId,
    reason,
    priority,
  }, { onConflict: 'action_id' });
  if (error) console.warn('[Validate] Review queue insert failed:', error);
}

// Record fraud signal
async function recordFraudSignal(supabase: any, userId: string, actionId: string, signalType: string, severity: number, details: any): Promise<void> {
  const { error } = await supabase.from('pplp_v2_fraud_signals').insert({
    user_id: userId,
    action_id: actionId,
    signal_type: signalType,
    severity,
    details,
    source: 'ai_validation',
  });
  if (error) console.warn('[Validate] Fraud signal insert failed:', error);
}

// =============================================
// MAIN HANDLER
// =============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);

    const { action_id, force_manual_review } = await req.json();
    if (!action_id) {
      return new Response(JSON.stringify({ code: 'VALIDATION', message: 'action_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // force_manual_review: skip AI
    if (force_manual_review === true) {
      const { data: action } = await supabase.from('pplp_v2_user_actions').select('user_id').eq('id', action_id).single();
      if (!action) {
        return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Action not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await supabase.from('pplp_v2_validations').insert({
        action_id,
        serving_life: 0, transparent_truth: 0, healing_love: 0,
        long_term_value: 0, unity_over_separation: 0,
        repentance: 0, gratitude: 0, service_pillar: 0, help_pillar: 0, giving_pillar: 0,
        ego_signal: 0, authenticity: 0, love_tone: 0, depth_score: 0, intent_score: 0,
        ai_score: 0, community_score: 0, trust_signal_score: 0,
        raw_light_score: 0, final_light_score: 0, confidence: 0,
        explanation: { reasoning: 'Forced manual review by admin/moderator' },
        flags: ['FORCE_MANUAL_REVIEW'],
        validation_status: 'manual_review',
        validated_at: new Date().toISOString(),
        validator_type: 'system',
      });
      await supabase.from('pplp_v2_user_actions').update({ status: 'under_review' }).eq('id', action_id);
      await createReviewQueueItem(supabase, action_id, 'Forced manual review by admin', 'high');
      return new Response(JSON.stringify({
        success: true, action_id, validation_status: 'manual_review',
        message: 'Hành động đã được chuyển sang review thủ công.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch action + proofs
    const { data: action, error: actionErr } = await supabase
      .from('pplp_v2_user_actions').select('*').eq('id', action_id).single();
    if (actionErr || !action) {
      return new Response(JSON.stringify({ error: 'Action not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: proofs } = await supabase.from('pplp_v2_proofs').select('*').eq('action_id', action_id);

    // NO PROOF → NO SCORE (immutable rule #1)
    if (!proofs || proofs.length === 0) {
      await supabase.from('pplp_v2_validations').insert({
        action_id,
        serving_life: 0, transparent_truth: 0, healing_love: 0,
        long_term_value: 0, unity_over_separation: 0,
        repentance: 0, gratitude: 0, service_pillar: 0, help_pillar: 0, giving_pillar: 0,
        ego_signal: 0, authenticity: 0, love_tone: 0, depth_score: 0, intent_score: 0,
        ai_score: 0, community_score: 0, trust_signal_score: 0,
        raw_light_score: 0, final_light_score: 0, confidence: 0,
        explanation: { reasoning: 'No proof attached — NO PROOF NO SCORE rule applied' },
        flags: ['NO_PROOF'],
        validation_status: 'rejected',
        validated_at: new Date().toISOString(),
        validator_type: 'system',
      });
      await supabase.from('pplp_v2_user_actions').update({ status: 'rejected' }).eq('id', action_id);
      return new Response(JSON.stringify({ success: false, reason: 'NO_PROOF_NO_SCORE', light_score: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Duplicate proof & velocity checks
    const duplicateProof = await isDuplicateProof(supabase, action_id, proofs);
    const velocityExceeded = await exceedsVelocityLimits(supabase, action.user_id, action.action_type_code);
    const flagsList: string[] = [];

    if (duplicateProof) flagsList.push('DUPLICATE_PROOF');
    if (velocityExceeded) flagsList.push('HIGH_IMPACT_VELOCITY_EXCEEDED');

    if (duplicateProof || velocityExceeded) {
      // Record fraud signal
      if (duplicateProof) {
        await recordFraudSignal(supabase, action.user_id, action_id, 'SPAM', 0.6, { reason: 'duplicate_proof' });
        await decayTrustForSpam(supabase, action.user_id);
      }

      await supabase.from('pplp_v2_validations').insert({
        action_id,
        serving_life: 0, transparent_truth: 0, healing_love: 0,
        long_term_value: 0, unity_over_separation: 0,
        repentance: 0, gratitude: 0, service_pillar: 0, help_pillar: 0, giving_pillar: 0,
        ego_signal: 0, authenticity: 0, love_tone: 0, depth_score: 0, intent_score: 0,
        ai_score: 0, community_score: 0, trust_signal_score: 0,
        raw_light_score: 0, final_light_score: 0, confidence: 0,
        explanation: { reasoning: `Auto-flagged: ${flagsList.join(', ')}` },
        flags: flagsList,
        validation_status: 'manual_review',
        validated_at: new Date().toISOString(),
        validator_type: 'system',
      });
      await supabase.from('pplp_v2_user_actions').update({ status: 'under_review' }).eq('id', action_id);
      await createReviewQueueItem(supabase, action_id, flagsList.join(', '), 'high');

      return new Response(JSON.stringify({
        success: true, status: 'manual_review', flags: flagsList,
        message: 'Hành động cần được xem xét thủ công.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build prompt and call AI
    const prompt = buildValidationPrompt(action, proofs);
    console.log(`[PPLP v2.0 Validate] Calling Angel AI for action ${action_id}`);

    let aiText = await callAngelAI(prompt);
    let validatorUsed = 'angel_ai';
    if (!aiText) {
      console.log(`[PPLP v2.0 Validate] Angel AI unavailable, falling back to Lovable AI`);
      aiText = await callLovableAI(prompt);
      validatorUsed = 'lovable_ai';
    }

    if (!aiText) {
      await supabase.from('pplp_v2_validations').insert({
        action_id,
        serving_life: 0, transparent_truth: 0, healing_love: 0,
        long_term_value: 0, unity_over_separation: 0,
        repentance: 0, gratitude: 0, service_pillar: 0, help_pillar: 0, giving_pillar: 0,
        ai_score: 0, community_score: 5, trust_signal_score: 5,
        raw_light_score: 0, final_light_score: 0, confidence: 0,
        explanation: { reasoning: 'AI validation unavailable — queued for manual review' },
        flags: ['AI_UNAVAILABLE'],
        validation_status: 'manual_review',
        validator_type: 'system',
      });
      await createReviewQueueItem(supabase, action_id, 'AI_UNAVAILABLE', 'normal');
      return new Response(JSON.stringify({
        success: true, status: 'manual_review',
        message: 'AI không khả dụng. Hành động sẽ được review thủ công.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Parse AI response (v2.0 format)
    let aiResult: ParsedAIResponse;
    try {
      aiResult = parseAIResponse(aiText);
    } catch {
      console.error('[PPLP v2.0 Validate] Failed to parse AI response:', aiText);
      await supabase.from('pplp_v2_validations').insert({
        action_id,
        serving_life: 0, transparent_truth: 0, healing_love: 0,
        long_term_value: 0, unity_over_separation: 0,
        repentance: 0, gratitude: 0, service_pillar: 0, help_pillar: 0, giving_pillar: 0,
        ai_score: 0, community_score: 5, trust_signal_score: 5,
        raw_light_score: 0, final_light_score: 0, confidence: 0,
        explanation: { reasoning: 'AI response unparseable', raw: aiText.slice(0, 500) },
        flags: ['PARSE_ERROR'],
        validation_status: 'manual_review',
        validator_type: 'system',
      });
      await createReviewQueueItem(supabase, action_id, 'PARSE_ERROR', 'normal');
      return new Response(JSON.stringify({
        success: true, status: 'manual_review',
        message: 'Kết quả AI không hợp lệ. Hành động sẽ được review thủ công.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    flagsList.push(...aiResult.flags);

    // RULE #3: Ego cao → flag
    if (aiResult.nlp.ego_signal > 0.7) {
      flagsList.push('HIGH_EGO_SIGNAL');
    }

    // RULE #5: Gian lận → giảm exponential
    if (aiResult.fraud_score > 0.5) {
      flagsList.push('HIGH_FRAUD_RISK');
      await recordFraudSignal(supabase, action.user_id, action_id, 'SPAM', aiResult.fraud_score, {
        reason: 'ai_detected_fraud',
        fraud_score: aiResult.fraud_score,
      });
    }

    // Trust signal score
    const { data: profile } = await supabase.from('profiles')
      .select('created_at, trust_level').eq('id', action.user_id).single();
    const profileTrustLevel = Number(profile?.trust_level) || 1.0;
    const trustScore = Math.min(10, 5.0 + (profileTrustLevel - 1.0) * 20);

    // Community score
    let communityScoreAvg = 5.0;
    const { data: reviews } = await supabase.from('pplp_v2_community_reviews')
      .select('endorse_score, flag_score')
      .eq('action_id', action_id);

    if (reviews && reviews.length >= 3) {
      const avgEndorse = reviews.reduce((s: number, r: any) => s + Number(r.endorse_score), 0) / reviews.length;
      const avgFlag = reviews.reduce((s: number, r: any) => s + Number(r.flag_score), 0) / reviews.length;
      communityScoreAvg = clamp(avgEndorse - avgFlag, 0, 10);
    }

    // Attendance multiplier
    let attendanceMultiplier = 1.0;
    if (action.raw_metadata?.attendance_id) {
      const { data: att } = await supabase.from('pplp_v2_attendance')
        .select('participation_factor, confirmed_by_leader')
        .eq('id', action.raw_metadata.attendance_id).single();
      if (att) {
        attendanceMultiplier = 1.0 + (Number(att.participation_factor) || 0) * 0.3;
        if (!att.confirmed_by_leader) flagsList.push('ATTENDANCE_UNCONFIRMED');
      }
    }

    // Consistency
    const { count: recentActions } = await supabase.from('pplp_v2_user_actions')
      .select('id', { count: 'exact', head: true }).eq('user_id', action.user_id)
      .eq('status', 'validated').gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    const streakDays = recentActions || 0;
    const consistencyMultiplier = calculateConsistencyMultiplier(streakDays);

    const impactWeight = IMPACT_WEIGHTS[action.action_type_code] || 1.0;

    // Calculate v2.0 LightScore
    const { rawScore, finalScore, dimensions } = calculateLightScoreV2(
      aiResult.pillars,
      aiResult.nlp,
      aiResult.fraud_score,
      impactWeight,
      profileTrustLevel,
      consistencyMultiplier,
      attendanceMultiplier,
      communityScoreAvg,
    );

    // Map to legacy pillars for backward compat
    const legacyPillars = mapToLegacyPillars(aiResult.pillars, aiResult.nlp);

    // Safety rules
    let validationStatus: string;
    let actionStatus: string;

    if (aiResult.nlp.authenticity < 0.3) {
      // Low authenticity → manual review (replaces transparent_truth < 3)
      validationStatus = 'manual_review';
      actionStatus = 'under_review';
      flagsList.push('LOW_AUTHENTICITY');
    } else if (aiResult.fraud_score > 0.7) {
      // High fraud → reject
      validationStatus = 'rejected';
      actionStatus = 'rejected';
      flagsList.push('FRAUD_REJECTED');
    } else if (aiResult.pillars.service_pillar === 0 && aiResult.pillars.help_pillar === 0 && aiResult.pillars.giving_pillar === 0) {
      // All action pillars zero → reject
      validationStatus = 'rejected';
      actionStatus = 'rejected';
      flagsList.push('ZERO_ACTION_PILLARS');
    } else {
      validationStatus = 'validated';
      actionStatus = 'validated';
    }

    // AI score average (for compat)
    const aiScoreAvg = (
      aiResult.pillars.repentance + aiResult.pillars.gratitude +
      aiResult.pillars.service_pillar + aiResult.pillars.help_pillar + aiResult.pillars.giving_pillar
    ) / 5;

    // Insert validation with both old and new pillars
    await supabase.from('pplp_v2_validations').insert({
      action_id,
      // Legacy pillars (backward compat)
      ...legacyPillars,
      // New v2.0 pillars
      repentance: aiResult.pillars.repentance,
      gratitude: aiResult.pillars.gratitude,
      service_pillar: aiResult.pillars.service_pillar,
      help_pillar: aiResult.pillars.help_pillar,
      giving_pillar: aiResult.pillars.giving_pillar,
      // NLP features
      ego_signal: aiResult.nlp.ego_signal,
      authenticity: aiResult.nlp.authenticity,
      love_tone: aiResult.nlp.love_tone,
      depth_score: aiResult.nlp.depth_score,
      intent_score: aiResult.nlp.intent_score,
      // Scores
      ai_score: aiScoreAvg,
      community_score: communityScoreAvg,
      trust_signal_score: trustScore,
      raw_light_score: rawScore,
      final_light_score: finalScore,
      confidence: aiResult.confidence,
      explanation: {
        reasoning: aiResult.reasoning,
        validator: validatorUsed,
        engine_version: 'PPLP-v2.0',
        formula: 'LightScore = Intent × Depth × Impact × Consistency × TrustFactor',
        dimensions,
        impact_weight: impactWeight,
        trust_multiplier: profileTrustLevel,
        consistency_multiplier: consistencyMultiplier,
        attendance_multiplier: attendanceMultiplier,
        fraud_score: aiResult.fraud_score,
        nlp_features: aiResult.nlp,
        community_score: communityScoreAvg,
      },
      flags: flagsList,
      validation_status: validationStatus,
      validated_at: new Date().toISOString(),
      validator_type: 'ai',
    });

    // Update action status
    await supabase.from('pplp_v2_user_actions').update({ status: actionStatus }).eq('id', action_id);

    // Audit trail
    await supabase.from('pplp_v2_event_log').insert({
      event_type: 'validation.completed',
      actor_id: action.user_id,
      reference_table: 'pplp_v2_validations',
      reference_id: action_id,
      payload: {
        validation_status: validationStatus,
        final_light_score: finalScore,
        validator: validatorUsed,
        engine_version: 'PPLP-v2.0',
      },
    });

    // Trust updates
    if (validationStatus === 'validated') {
      await increaseTrustForVerifiedConsistency(supabase, action.user_id);
    } else if (validationStatus === 'rejected') {
      await decayTrustForSpam(supabase, action.user_id);
    }

    // Insert into review queue if manual_review
    if (validationStatus === 'manual_review') {
      await createReviewQueueItem(supabase, action_id, flagsList.join(', ') || 'LOW_AUTHENTICITY', 'normal');
    }

    // Enqueue mint if validated
    let mintResult = null;
    if (validationStatus === 'validated' && finalScore > 0) {
      try {
        const mintResp = await fetch(`${supabaseUrl}/functions/v1/pplp-v2-mint-worker`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
          },
          body: JSON.stringify({ action_id }),
        });
        mintResult = await mintResp.json();
        console.log(`[PPLP v2.0 Validate] Mint worker result:`, JSON.stringify(mintResult));
      } catch (mintErr) {
        console.warn(`[PPLP v2.0 Validate] Mint worker call failed:`, mintErr);
      }
    }

    console.log(`[PPLP v2.0 Validate] Action ${action_id}: LS=${finalScore.toFixed(4)}, status=${validationStatus}, validator=${validatorUsed}`);

    return new Response(JSON.stringify({
      success: true,
      action_id,
      engine_version: 'PPLP-v2.0',
      validation_status: validationStatus,
      // v2.0 pillars
      pplp_v2_pillars: aiResult.pillars,
      nlp_features: aiResult.nlp,
      // Legacy pillars (backward compat)
      pplp_scores: legacyPillars,
      // Scores
      raw_light_score: rawScore,
      final_light_score: finalScore,
      dimensions,
      fraud_risk: aiResult.fraud_score < 0.3 ? 'low' : aiResult.fraud_score < 0.6 ? 'medium' : 'high',
      fraud_score: aiResult.fraud_score,
      // Multipliers
      impact_weight: impactWeight,
      trust_multiplier: profileTrustLevel,
      consistency_multiplier: consistencyMultiplier,
      attendance_multiplier: attendanceMultiplier,
      // Meta
      ai_score: Math.round(aiScoreAvg * 100) / 100,
      community_score: Math.round(communityScoreAvg * 10) / 10,
      trust_signal_score: Math.round(trustScore * 10) / 10,
      flags: flagsList,
      explanation: {
        reasoning: aiResult.reasoning,
        validator: validatorUsed,
      },
      mint: mintResult?.success ? {
        mint_amount_user: mintResult.mint_amount_user,
        mint_amount_platform: mintResult.mint_amount_platform,
      } : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[PPLP v2.0 Validate] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
