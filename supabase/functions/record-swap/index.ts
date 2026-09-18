// record-swap · Ghi swap on-chain một cách idempotent + verify tx tồn tại.
// Deploy tự động qua Lovable Cloud. verify_jwt = default (validate trong code).

import {
  corsHeaders,
  json,
  requireUser,
  createAdminClient,
  normalizeError,
} from '../_shared/httpAuth.ts';
import { moralisFetch } from '../_shared/moralisFetch.ts';
import { validateSwapInput } from './validateSwapInput.ts';

interface Body {
  tx_hash?: string;
  chain_id?: number;
  from_symbol?: string;
  to_symbol?: string;
  from_amount?: string | number;
  to_amount?: string | number;
  from_amount_usd?: number | null;
  to_amount_usd?: number | null;
  dex_provider?: string;
  quote_id?: string | null;
}

const SUPPORTED_CHAINS = new Set([56, 97]);

/**
 * Ghi log BỀN mọi nhánh thất bại vào public.swap_failures (RPC log_swap_failure,
 * dedup theo (tx_hash, chain_id, stage) + tăng attempts).
 * KHÔNG đổi hành vi nghiệp vụ: log là best-effort, lỗi log bị bỏ qua.
 */
async function logFailure(
  admin: ReturnType<typeof createAdminClient> | null,
  stage: string,
  info: {
    tx_hash?: string | null;
    chain_id?: number | null;
    user_id?: string | null;
    reason?: string | null;
    http_status?: number | null;
    sqlstate?: string | null;
    error_message?: string | null;
    context?: Record<string, unknown>;
  } = {},
) {
  try {
    const client = admin ?? createAdminClient();
    await client.rpc('log_swap_failure', {
      p_stage: stage,
      p_tx_hash: info.tx_hash ?? null,
      p_chain_id: info.chain_id ?? null,
      p_user_id: info.user_id ?? null,
      p_reason: info.reason ?? null,
      p_http_status: info.http_status ?? null,
      p_sqlstate: info.sqlstate ?? null,
      p_error_message: info.error_message ?? null,
      p_context: info.context ?? {},
    });
  } catch (_) { /* log là best-effort, không được làm hỏng luồng chính */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const user = await requireUser(req);

    // ─── Validate (BigInt string-based, xem validateSwapInput.ts) ───
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch (e) {
      await logFailure(null, 'invalid_body', {
        user_id: user.id, http_status: 400, reason: 'invalid_body',
        error_message: (e as Error)?.message ?? null,
      });
      return json({ error: 'invalid_body' }, 400);
    }
    const parsed = validateSwapInput(rawBody);
    if (!parsed.ok) {
      await logFailure(null, 'validation', {
        user_id: user.id, http_status: 400, reason: parsed.message,
        context: { field: parsed.field },
      });
      return json({ error: parsed.message, field: parsed.field }, 400);
    }
    const txHash = parsed.txHash;
    const chainId = parsed.chainId;
    const fromSymbol = parsed.fromSymbol;
    const toSymbol = parsed.toSymbol;
    const fromAmount = parsed.fromAmount;
    const toAmount = parsed.toAmount;

    const admin = createAdminClient();

    // ─── Idempotent check ───
    const { data: existing } = await admin
      .from('swap_transactions')
      .select('id')
      .eq('tx_hash', txHash)
      .eq('chain_id', chainId)
      .maybeSingle();

    if (existing?.id) {
      return json({ status: 'duplicate', swap_id: existing.id });
    }

    // ─── Verify on-chain ───
    // Lấy public_wallet_address của user để so with tx.from
    const { data: profile } = await admin
      .from('profiles')
      .select('public_wallet_address')
      .eq('id', user.id)
      .maybeSingle();
    const userAddress = (profile?.public_wallet_address ?? '').toLowerCase();

    const chainParam = chainId === 56 ? 'bsc' : 'bsc%20testnet';
    const url = `https://deep-index.moralis.io/api/v2.2/transaction/${txHash}?chain=${chainParam}`;
    let verified = false;
    let verifyReason = 'unknown';
    try {
      const res = await moralisFetch(url);
      if (res.ok) {
        const tx: any = await res.json();
        const fromAddr = (tx?.from_address ?? '').toLowerCase();
        const receiptStatus = String(tx?.receipt_status ?? '1');
        if (receiptStatus !== '1') {
          verifyReason = 'tx_failed_on_chain';
        } else if (userAddress && fromAddr !== userAddress) {
          verifyReason = 'sender_mismatch';
        } else {
          verified = true;
        }
      } else if (res.status === 404) {
        verifyReason = 'tx_not_found';
      } else {
        verifyReason = `moralis_${res.status}`;
      }
    } catch (e) {
      // Moralis outage → cho ghi tạm với verified_by='pending-verify' (safety net = reconciliation-cron sẽ dọn dẹp)
      verifyReason = `moralis_error:${(e as Error).message}`;
      await logFailure(admin, 'verify_provider_error', {
        tx_hash: txHash, chain_id: chainId, user_id: user.id,
        reason: 'moralis_error', error_message: (e as Error)?.message ?? null,
      });
    }

    if (!verified) {
      // Nếu chỉ lỗi tạm (moralis outage) — vẫn ghi nhưng đánh dấu chưa xác thực để cron sau này verify lại.
      const isTransient = verifyReason.startsWith('moralis_error') || verifyReason.startsWith('moralis_5');
      if (!isTransient) {
        await logFailure(admin, 'invalid_tx', {
          tx_hash: txHash, chain_id: chainId, user_id: user.id,
          reason: verifyReason, http_status: 400,
        });
        return json({ status: 'invalid_tx', reason: verifyReason }, 400);
      }
      await logFailure(admin, 'verify_transient', {
        tx_hash: txHash, chain_id: chainId, user_id: user.id, reason: verifyReason,
      });
    }

    // ─── Insert (idempotent) ───
    const { data: inserted, error: insertErr } = await admin
      .from('swap_transactions')
      .insert({
        user_id: user.id,
        tx_hash: txHash,
        chain_id: chainId,
        from_symbol: fromSymbol,
        to_symbol: toSymbol,
        from_amount: fromAmount,
        to_amount: toAmount,
        from_amount_usd: parsed.fromAmountUsd,
        to_amount_usd: parsed.toAmountUsd,
        dex_provider: parsed.dexProvider,
        quote_id: parsed.quoteId,
        verified_by: verified ? 'edge:record-swap' : 'edge:pending-verify',
        status: 'confirmed',
      })
      .select('id')
      .single();

    if (insertErr) {
      // Race: unique index bắt duplicate → coi như thành công
      if ((insertErr.code ?? '') === '23505') {
        const { data: dup } = await admin
          .from('swap_transactions')
          .select('id')
          .eq('tx_hash', txHash)
          .eq('chain_id', chainId)
          .maybeSingle();
        return json({ status: 'duplicate', swap_id: dup?.id ?? null });
      }
      await logFailure(admin, 'insert_error', {
        tx_hash: txHash, chain_id: chainId, user_id: user.id,
        sqlstate: insertErr.code ?? null, error_message: insertErr.message,
        context: { details: insertErr.details ?? null, hint: insertErr.hint ?? null },
      });
      throw insertErr;
    }

    // ─── Audit log (best effort) ───
    await admin.from('audit_logs').insert({
      admin_id: user.id,
      target_user_id: user.id,
      action: 'record_swap',
      reason: `swap ${fromSymbol}→${toSymbol}`,
      details: {
        swap_id: inserted.id,
        tx_hash: txHash,
        chain_id: chainId,
        from_symbol: fromSymbol,
        to_symbol: toSymbol,
        from_amount: fromAmount,
        to_amount: toAmount,
        dex_provider: parsed.dexProvider,
        quote_id: parsed.quoteId,
        verified,
        verify_reason: verifyReason,
      },
    }).then(({ error }: { error: unknown }) => {
      if (error) {
        return logFailure(admin, 'audit_log', {
          tx_hash: txHash, chain_id: chainId, user_id: user.id,
          reason: 'audit_log_insert_failed',
          error_message: (error as { message?: string })?.message ?? String(error),
        });
      }
    }, (error: unknown) => logFailure(admin, 'audit_log', {
      tx_hash: txHash, chain_id: chainId, user_id: user.id,
      reason: 'audit_log_insert_threw',
      error_message: (error as { message?: string })?.message ?? String(error),
    }));

    return json({ status: 'recorded', swap_id: inserted.id, verified });
  } catch (err) {
    const e = normalizeError(err);
    await logFailure(null, 'unhandled', {
      reason: e.code ?? 'unhandled', http_status: e.status ?? 500,
      error_message: e.message, context: { details: e.details ?? null },
    });
    return json({ error: e.message, code: e.code, details: e.details }, e.status ?? 500);
  }
});
