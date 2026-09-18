/**
 * tx-perf-beacon — User gửi 1 mẫu perf của hook unified.
 * Body { surface, op, ms, payload_bytes?, meta? }. Fire-and-forget.
 */
import { corsHeaders, json, requireUser, createAdminClient, normalizeError } from '../_shared/httpAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const surface = String(body.surface || '').slice(0, 64);
    const op = String(body.op || '').slice(0, 64);
    const ms = Number(body.ms);
    if (!surface || !op || !Number.isFinite(ms)) return json({ error: 'Thiếu surface/op/ms' }, 400);

    const admin = createAdminClient();
    await admin.from('tx_perf_samples').insert({
      user_id: user.id,
      surface,
      op,
      ms,
      payload_bytes: typeof body.payload_bytes === 'number' ? body.payload_bytes : null,
      meta: body.meta ?? {},
    });
    return json({ ok: true });
  } catch (e) {
    return json({ error: normalizeError(e).message }, 500);
  }
});
