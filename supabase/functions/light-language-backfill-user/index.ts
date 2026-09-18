// One-shot admin tool: scan user's old posts with Light Language filter and
// apply the same handling as create-post (toxic→hide+revert LS, negative→revert LS).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LIGHT_LANG_TIMEOUT_MS = 12000;

const TOXIC_HARD_PATTERNS: RegExp[] = [
  /\b(đ[ụuùúủũ]|đ[éẻẽèê]|đ[ịĩỉì]) m[ẹèé]/i,
  /\bđmm?\b/i, /\bdmm?\b/i, /\bvl\b/i, /\bvcl\b/i, /\bvkl\b/i, /\bcc+\b/i, /\bclgt\b/i,
  /\b(địt|đit|đjt|đík)\b/i,
  /\b(lồn|lon|loz|l[oô]z)\b/i,
  /\b(cặc|cak|cax|kax)\b/i,
  /\b(buồi|bu[ồô]j)\b/i,
  /\b(đéo|đếch|đách|đếk)\b/i,
  /\b(chó|cho) ch[ếêè]t\b/i,
  /\b(con|thằng) (chó|cho|điên|đi[êe]n|khốn|khon)\b/i,
  /\bf[\W_]*u[\W_]*c[\W_]*k\b/i, /\bsh[\W_]*i[\W_]*t\b/i, /\bb[\W_]*i[\W_]*t[\W_]*c[\W_]*h\b/i,
];
const NEGATIVE_SOFT_PATTERNS: RegExp[] = [
  /\b(ghét|cay đ[ắa]ng|hận|thù|kinh tởm)\b/i,
  /\b(chán đời|chán sống|tuyệt vọng|vô dụng|bỏ cuộc|chết đi)\b/i,
  /\b(ngu (ngốc|si|đần)|đần độn|óc chó|khốn nạn|đồ (rác|chó|khốn))\b/i,
  /\b(địa ngục|nguyền rủa|trù ẻo)\b/i,
];

type LightLevel = 'light' | 'neutral' | 'negative' | 'toxic';
interface LightLangResult { level: LightLevel; source: 'blacklist'|'ai'|'fallback'; categories?: string[] }

function quickScan(content: string): LightLangResult | null {
  const text = content.normalize('NFC');
  for (const re of TOXIC_HARD_PATTERNS) if (re.test(text)) return { level: 'toxic', source: 'blacklist', categories: ['profanity'] };
  for (const re of NEGATIVE_SOFT_PATTERNS) if (re.test(text)) return { level: 'negative', source: 'blacklist', categories: ['negative_tone'] };
  return null;
}

async function evalAI(content: string, apiKey: string): Promise<LightLangResult | null> {
  if (content.trim().length < 20) return null;
  const prompt = `Bạn là Angel — phân loại NGÔN TỪ ÁNH SÁNG tiếng Việt.
- "light": tích cực, biết ơn, yêu thương
- "neutral": trung tính, đời thường
- "negative": than vãn nặng, công kích nhẹ, lời nguyền, năng lượng nặng
- "toxic": chửi tục, thù ghét, kỳ thị, sỉ nhục

Bài viết:
"""
${content.trim().substring(0, 2000)}
"""

Chỉ trả JSON: {"level":"light|neutral|negative|toxic","categories":["..."]}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), LIGHT_LANG_TIMEOUT_MS);
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: [{ role: 'user', content: prompt }] }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content ?? '';
    const match = String(raw).match(/\{[\s\S]*"level"[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const lvl = String(parsed.level || 'neutral').toLowerCase() as LightLevel;
    if (!['light','neutral','negative','toxic'].includes(lvl)) return null;
    return { level: lvl, source: 'ai', categories: Array.isArray(parsed.categories) ? parsed.categories.map(String) : [] };
  } catch { return null; }
}

async function evaluate(content: string, apiKey: string): Promise<LightLangResult> {
  const q = quickScan(content);
  if (q && q.level === 'toxic') return q;
  const ai = await evalAI(content, apiKey);
  if (ai) return ai;
  if (q) return q;
  return { level: 'neutral', source: 'fallback' };
}

const SKIP_IDS = new Set(['41955f49','3b86d74e','76e6d57c','c92935a9','5db05d5a']);
const REVERT_REASON = 'light_language_backfill_user_truong';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let isAuthorized = bearer && bearer === SERVICE_KEY;
    if (!isAuthorized) {
      const userClient = createClient(SUPABASE_URL, (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes } = await userClient.auth.getUser();
      const caller = userRes?.user;
      if (caller) {
        const { data: isAdmin } = await admin.rpc('has_role', { _user_id: caller.id, _role: 'admin' });
        if (isAdmin) isAuthorized = true;
      }
    }
    if (!isAuthorized) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json();
    const user_id: string = body.user_id;
    const dry_run: boolean = body.dry_run !== false; // default true
    const max_posts: number = Math.min(Math.max(Number(body.max_posts ?? 60), 1), 200);
    const offset: number = Math.max(Number(body.offset ?? 0), 0);
    if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Fetch chunk of posts (stable order: oldest first for deterministic pagination)
    const { data: posts, error: pErr } = await admin
      .from('posts')
      .select('id, content, post_type, is_reward_eligible, moderation_status')
      .eq('user_id', user_id)
      .order('created_at', { ascending: true })
      .range(offset, offset + max_posts - 1);
    if (pErr) throw pErr;

    const fetched = (posts || []).length;
    const has_more = fetched === max_posts;
    const next_offset = offset + fetched;

    const candidates = (posts || []).filter(p => {
      if (!p.content || p.content.trim().length < 10) return false;
      if (p.post_type === 'gift_celebration' || p.post_type === 'system') return false;
      if (SKIP_IDS.has(String(p.id).substring(0, 8))) return false;
      // idempotency: skip already-handled
      if (p.moderation_status === 'pending_review') return false;
      if (p.is_reward_eligible === false) return false;
      return true;
    });

    const result = {
      fetched, has_more, next_offset,
      scanned: 0, toxic_count: 0, negative_count: 0, light_count: 0, neutral_count: 0,
      light_actions_reverted: 0,
      toxic_posts: [] as string[], negative_posts: [] as string[],
      errors: [] as string[],
    };

    for (const post of candidates) {
      result.scanned++;
      let lang: LightLangResult;
      try {
        lang = await evaluate(post.content, LOVABLE_API_KEY);
      } catch (e) {
        result.errors.push(`${post.id}: ${(e as Error).message}`);
        continue;
      }

      if (lang.level === 'light') { result.light_count++; continue; }
      if (lang.level === 'neutral') { result.neutral_count++; continue; }

      if (lang.level === 'toxic') {
        result.toxic_count++;
        result.toxic_posts.push(post.id);
      } else {
        result.negative_count++;
        result.negative_posts.push(post.id);
      }

      if (dry_run) {
        await new Promise(r => setTimeout(r, 600));
        continue;
      }

      // Apply changes
      const postUpdate: Record<string, unknown> = { is_reward_eligible: false };
      if (lang.level === 'toxic') postUpdate.moderation_status = 'pending_review';
      const { error: uErr } = await admin.from('posts').update(postUpdate).eq('id', post.id);
      if (uErr) { result.errors.push(`post ${post.id}: ${uErr.message}`); continue; }

      // Revert light_actions
      const { data: actions } = await admin
        .from('light_actions')
        .select('id, angel_evaluation')
        .eq('reference_id', post.id)
        .eq('user_id', user_id);
      for (const act of actions || []) {
        const prev = (act.angel_evaluation && typeof act.angel_evaluation === 'object') ? act.angel_evaluation : {};
        const newEval = {
          ...prev,
          reverted_at: new Date().toISOString(),
          reverted_reason: REVERT_REASON,
          reverted_level: lang.level,
          reverted_source: lang.source,
        };
        const { error: laErr } = await admin
          .from('light_actions')
          .update({
            is_eligible: false,
            light_score: 0,
            mint_status: 'rejected',
            angel_evaluation: newEval,
          })
          .eq('id', act.id);
        if (!laErr) result.light_actions_reverted++;
        else result.errors.push(`la ${act.id}: ${laErr.message}`);
      }

      await new Promise(r => setTimeout(r, 600));
    }

    // Send 1 aggregate notification — only on FINAL chunk (has_more=false), based on DB totals across all chunks
    let notified = false;
    if (!dry_run && !has_more) {
      // Count all backfilled posts so far (idempotent — counts across all chunks of this session)
      const { data: flagged } = await admin
        .from('posts')
        .select('id, moderation_status')
        .eq('user_id', user_id)
        .eq('is_reward_eligible', false);
      // Cross-check with light_actions reverted_reason to scope strictly to this backfill
      const { data: revertedActs } = await admin
        .from('light_actions')
        .select('reference_id')
        .eq('user_id', user_id)
        .eq('mint_status', 'rejected')
        .filter('angel_evaluation->>reverted_reason', 'eq', REVERT_REASON);
      const flaggedPostIds = new Set((revertedActs || []).map(a => a.reference_id));
      const total = flaggedPostIds.size;
      let toxicCnt = 0, negCnt = 0;
      for (const p of flagged || []) {
        if (!flaggedPostIds.has(p.id)) continue;
        if (p.moderation_status === 'pending_review') toxicCnt++; else negCnt++;
      }
      if (total > 0) {
        // Skip if a backfill notification already exists for this user
        const { data: existing } = await admin
          .from('notifications')
          .select('id')
          .eq('user_id', user_id)
          .eq('type', 'reward_adjustment')
          .filter('metadata->>source', 'eq', 'light_language_backfill')
          .limit(1);
        if (!existing || existing.length === 0) {
          const message =
`Chào bạn 💛 Angel vừa rà soát lại các bài viết cũ với bộ lọc Ngôn từ Ánh sáng và đã tạm gỡ điểm ${total} bài (${toxicCnt} bài tạm ẩn để rà soát, ${negCnt} bài vẫn hiển thị nhưng không tính Light Score).

Đây không phải là phán xét, mà là lời mời nhẹ nhàng cùng nhau gìn giữ không gian năng lượng tích cực 🌸 Mong bạn tiếp tục chia sẻ bằng ngôn từ ánh sáng — biết ơn, yêu thương, chúc lành — để cùng FUN.rich lan toả điều đẹp ✨`;
          const { error: nErr } = await admin.from('notifications').insert({
            user_id,
            actor_id: user_id,
            type: 'reward_adjustment',
            read: false,
            metadata: {
              source: 'light_language_backfill',
              post_count: total,
              toxic_count: toxicCnt,
              negative_count: negCnt,
              message,
            },
          });
          notified = !nErr;
          if (nErr) result.errors.push(`notify: ${nErr.message}`);
        }
      }
    }

    return new Response(JSON.stringify({ ...result, dry_run, notified }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
