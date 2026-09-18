// log-swap-failure · Cho FE báo cáo thất bại ghi nhận swap (thay cho console.warn +
// localStorage chết). CHỈ ghi log, KHÔNG đụng nghiệp vụ swap.
import {
  corsHeaders,
  json,
  requireUser,
  createAdminClient,
  normalizeError,
} from '../_shared/httpAuth.ts';

const ALLOWED_STAGES = new Set(['client_record_failed', 'client_retry_failed']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const user = await requireUser(req);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }

    const stage = String(body.stage ?? 'client_record_failed');
    if (!ALLOWED_STAGES.has(stage)) return json({ error: 'invalid_stage' }, 400);

    const txHash = body.tx_hash ? String(body.tx_hash).slice(0, 100) : null;
    const chainIdRaw = Number(body.chain_id);
    const chainId = Number.isInteger(chainIdRaw) ? chainIdRaw : null;
    const errorMessage = body.error_message ? String(body.error_message).slice(0, 2000) : null;
    const reason = body.reason ? String(body.reason).slice(0, 200) : null;

    const admin = createAdminClient();
    await admin.rpc('log_swap_failure', {
      p_stage: stage,
      p_tx_hash: txHash,
      p_chain_id: chainId,
      p_user_id: user.id,
      p_reason: reason,
      p_http_status: null,
      p_sqlstate: null,
      p_error_message: errorMessage,
      p_context: {
        from_symbol: body.from_symbol ?? null,
        to_symbol: body.to_symbol ?? null,
        from_amount: body.from_amount ?? null,
        to_amount: body.to_amount ?? null,
      },
    });

    return json({ status: 'logged' });
  } catch (err) {
    const e = normalizeError(err);
    return json({ error: e.message }, e.status ?? 500);
  }
});
