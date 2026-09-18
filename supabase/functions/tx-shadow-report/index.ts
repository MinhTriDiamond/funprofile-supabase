/**
 * tx-shadow-report — User (any authed) gửi 1 dòng diff phát hiện ở Shadow Mode.
 * Fire-and-forget. Body { surface, diff_type, legacy_count?, unified_count?,
 *   legacy_sum?, unified_sum?, details? }.
 */
import { corsHeaders, json, requireUser, createAdminClient, normalizeError } from '../_shared/httpAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const surface = String(body.surface || '').slice(0, 64);
    const diff_type = String(body.diff_type || '').slice(0, 64);
    if (!surface || !diff_type) return json({ error: 'Thiếu surface/diff_type' }, 400);

    const admin = createAdminClient();
    await admin.from('tx_shadow_diffs').insert({
      user_id: user.id,
      surface,
      diff_type,
      legacy_count: body.legacy_count ?? null,
      unified_count: body.unified_count ?? null,
      legacy_sum: body.legacy_sum ?? null,
      unified_sum: body.unified_sum ?? null,
      details: body.details ?? {},
      user_agent: req.headers.get('user-agent')?.slice(0, 240) ?? null,
    });
    return json({ ok: true });
  } catch (e) {
    return json({ error: normalizeError(e).message }, 500);
  }
});
