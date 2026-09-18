import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { keccak256, toBytes, pad } from "npm:viem@^2.38.0";
import { pickOnChainAction, actionHash as computeActionHash } from "../_shared/pplp-action-registry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FUN_MONEY_CONTRACT = '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6';
const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';

async function getNonceFromContract(address: string): Promise<bigint> {
  try {
    const functionSelector = keccak256(toBytes('nonces(address)')).slice(0, 10);
    const paddedAddress = pad(address as `0x${string}`, { size: 32 });
    const data = functionSelector + paddedAddress.slice(2);

    const response = await fetch(BSC_TESTNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: FUN_MONEY_CONTRACT, data }, 'latest'],
      }),
    });

    const result = await response.json();
    if (result.error) return 0n;
    return BigInt(result.result || '0x0');
  } catch {
    return 0n;
  }
}

function toWei(amount: number): string {
  const amountStr = String(amount);
  const [intPart, decPart = ''] = amountStr.split('.');
  const paddedDec = (decPart + '000000000000000000').slice(0, 18);
  return BigInt(intPart + paddedDec).toString();
}

// generateActionHash đã thay bằng computeActionHash từ shared registry

function generateEvidenceHash(actionTypes: string[], userId: string, timestamp: number): string {
  const input = `${actionTypes.sort().join(',')}:${userId}:${timestamp}`;
  return keccak256(toBytes(input));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth: Accept service_role key (internal/admin call)
    // This function is a one-time admin operation

    // Get failed (stale nonce) + expired requests. Tách 2 query để tránh
    // rắc rối với cú pháp .or() lồng .and() + ký tự '%' trong PostgREST.
    const [failedRes, expiredRes] = await Promise.all([
      supabase
        .from('pplp_mint_requests')
        .select('id, user_id, recipient_address, amount_display, action_types, nonce, status, error_message')
        .eq('status', 'failed')
        .like('error_message', 'Nonce stale%'),
      supabase
        .from('pplp_mint_requests')
        .select('id, user_id, recipient_address, amount_display, action_types, nonce, status, error_message')
        .eq('status', 'expired'),
    ]);

    const fetchErr = failedRes.error || expiredRes.error;
    const staleRequests = [
      ...(failedRes.data ?? []),
      ...(expiredRes.data ?? []),
    ].sort((a, b) => String(a.id).localeCompare(String(b.id)));

    console.log('[REMINT] Fetch result:', JSON.stringify({
      failedCount: failedRes.data?.length ?? 0,
      expiredCount: expiredRes.data?.length ?? 0,
      failedErr: failedRes.error?.message ?? null,
      expiredErr: expiredRes.error?.message ?? null,
    }));

    if (fetchErr || staleRequests.length === 0) {
      return new Response(JSON.stringify({
        error: 'No signed requests found',
        details: fetchErr,
        debug: {
          failedCount: failedRes.data?.length ?? 0,
          expiredCount: expiredRes.data?.length ?? 0,
          failedErr: failedRes.error?.message ?? null,
          expiredErr: expiredRes.error?.message ?? null,
        },
      }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[REMINT] Processing ${staleRequests.length} stale signed requests`);

    const results: Array<{
      old_id: string;
      user_id: string;
      wallet: string;
      amount: number;
      old_nonce: number;
      new_nonce: string;
      new_request_id?: string;
      allocation_id?: string;
      status: string;
      error?: string;
    }> = [];

    for (const req of staleRequests) {
      const entry: typeof results[0] = {
        old_id: req.id,
        user_id: req.user_id,
        wallet: req.recipient_address,
        amount: req.amount_display,
        old_nonce: req.nonce,
        new_nonce: '',
        status: 'processing',
      };

      try {
        // 1. Mark old request as failed
        await supabase
          .from('pplp_mint_requests')
          .update({ status: 'failed', error_message: 'Stale nonce - replaced by remint' })
          .eq('id', req.id);

        // 2. Find and reset the allocation linked to this request
        const { data: allocation } = await supabase
          .from('mint_allocations')
          .select('id')
          .eq('mint_request_id', req.id)
          .maybeSingle();

        if (allocation) {
          await supabase
            .from('mint_allocations')
            .update({ status: 'pending', mint_request_id: null, updated_at: new Date().toISOString() })
            .eq('id', allocation.id);
          entry.allocation_id = allocation.id;
        }

        // 3. Get fresh nonce from chain
        const freshNonce = await getNonceFromContract(req.recipient_address);
        entry.new_nonce = freshNonce.toString();

        // 4. Compute correct amount_wei using BigInt
        const amountWei = toWei(req.amount_display);

        // 5. Pick on-chain action dynamically theo dominant action_type
        const actionTypes = (req.action_types && req.action_types.length > 0)
          ? req.action_types
          : ['epoch_allocation'];
        const pickedAction = pickOnChainAction(actionTypes);
        const aHash = computeActionHash(pickedAction);
        const evidenceHash = generateEvidenceHash(actionTypes, req.user_id, Date.now());

        // 6. Create new mint request với action mới
        const { data: newReq, error: insertErr } = await supabase
          .from('pplp_mint_requests')
          .insert({
            user_id: req.user_id,
            recipient_address: req.recipient_address,
            amount_wei: amountWei,
            amount_display: req.amount_display,
            action_name: pickedAction,
            action_hash: aHash,
            evidence_hash: evidenceHash,
            action_types: actionTypes,
            nonce: Number(freshNonce),
            deadline: null,
            status: 'pending_sig',
            action_ids: [],
            retry_count: 0,
            parent_request_id: req.id,
          })
          .select('id')
          .single();

        if (insertErr) throw insertErr;

        // 7. Link allocation to new request
        if (allocation) {
          await supabase
            .from('mint_allocations')
            .update({
              status: 'claimed',
              mint_request_id: newReq.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', allocation.id);
        }

        entry.new_request_id = newReq.id;
        entry.status = 'success';
      } catch (err) {
        entry.status = 'error';
        if (err instanceof Error) {
          entry.error = err.message;
        } else if (err && typeof err === 'object') {
          // Supabase PostgrestError có shape { message, details, hint, code }
          const e = err as Record<string, unknown>;
          entry.error = JSON.stringify({
            message: e.message ?? null,
            details: e.details ?? null,
            hint: e.hint ?? null,
            code: e.code ?? null,
          });
        } else {
          entry.error = String(err);
        }
        console.error('[REMINT] Item error', req.id, entry.error);
      }

      results.push(entry);
    }

    const success = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;

    console.log(`[REMINT] Done: ${success} success, ${failed} failed`);

    return new Response(JSON.stringify({
      summary: { total: results.length, success, failed },
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[REMINT] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
