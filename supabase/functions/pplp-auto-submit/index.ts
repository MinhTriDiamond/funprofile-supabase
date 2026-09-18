/**
 * PPLP Auto-Submit Edge Function
 * Tự động submit các mint requests đã đủ 3/3 chữ ký lên blockchain
 * Sử dụng ví hệ thống (hot wallet) để trả gas
 * Chạy định kỳ mỗi 30 phút qua pg_cron
 * 
 * v2: Thêm nonce verification + retry limit
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createWalletClient, createPublicClient, http, keccak256, toBytes } from "npm:viem@^2.38.0";
import { privateKeyToAccount } from "npm:viem@^2.38.0/accounts";
import { bscTestnet } from "npm:viem@^2.38.0/chains";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONTRACT_ADDRESS = '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6' as const;
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const GOV_GROUPS: readonly string[] = ['will', 'wisdom', 'love'];
const ACTIVE_STATUSES = ['pending_sig', 'signing', 'signed', 'submitted'] as const;

const CONTRACT_ABI = [
  {
    name: 'lockWithPPLP',
    type: 'function' as const,
    inputs: [
      { name: 'user', type: 'address' as const },
      { name: 'action', type: 'string' as const },
      { name: 'amount', type: 'uint256' as const },
      { name: 'evidenceHash', type: 'bytes32' as const },
      { name: 'sigs', type: 'bytes[]' as const },
    ],
    outputs: [],
    stateMutability: 'nonpayable' as const,
  },
  {
    name: 'nonces',
    type: 'function' as const,
    inputs: [{ name: 'account', type: 'address' as const }],
    outputs: [{ name: '', type: 'uint256' as const }],
    stateMutability: 'view' as const,
  },
] as const;

function createAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
    
    if (!authHeader || (authHeader !== `Bearer ${serviceRoleKey}` && authHeader !== `Bearer ${anonKey}`)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const privateKey = Deno.env.get('PPLP_HOT_WALLET_PRIVATE_KEY');
    if (!privateKey) {
      return new Response(JSON.stringify({ error: 'Hot wallet not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createAdminClient();

    // === B3-02 LỚP 1: SINGLE-FLIGHT LEASE ===
    // Chặn 2 lượt cron/manual chạy song song → tránh double-submit và vượt EPOCH_CAP.
    const LEASE_JOB = 'pplp-auto-submit';
    const LEASE_TTL_SECONDS = 300;
    const leaseToken = crypto.randomUUID();
    const { data: leaseOk, error: leaseErr } = await supabase.rpc('job_acquire_lease', {
      p_job_name: LEASE_JOB,
      p_owner_token: leaseToken,
      p_ttl_seconds: LEASE_TTL_SECONDS,
    });
    if (leaseErr) {
      console.error('[PPLP Auto-Submit] Lease RPC error:', leaseErr.message);
      return new Response(JSON.stringify({ error: 'LEASE_ERROR', message: leaseErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (leaseOk !== true) {
      console.log('[PPLP Auto-Submit] Another run holds the lease → skip');
      return new Response(JSON.stringify({
        success: true, skipped: true, reason: 'LOCK_HELD',
        message: 'Một lượt pplp-auto-submit khác đang chạy, bỏ qua lượt này.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const releaseLease = async () => {
      await supabase.rpc('job_release_lease', { p_job_name: LEASE_JOB, p_owner_token: leaseToken })
        .then(() => {}, (e: any) => console.error('[PPLP Auto-Submit] release lease failed:', e?.message));
    };

    try {
    // Fetch signed requests that haven't exceeded retry limit
    const { data: signedRequests, error: fetchErr } = await supabase
      .from('pplp_mint_requests')
      .select('*')
      .eq('status', 'signed')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    if (!signedRequests || signedRequests.length === 0) {
      return new Response(JSON.stringify({
        success: true, processed: 0, message: 'No signed requests to submit',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Filter out requests that have exceeded retry limit
    const eligibleRequests = signedRequests.filter(r => {
      const retryCount = (r as any).retry_count || 0;
      return retryCount < MAX_RETRIES;
    });

    // Mark over-limit requests as failed
    const overLimitRequests = signedRequests.filter(r => {
      const retryCount = (r as any).retry_count || 0;
      return retryCount >= MAX_RETRIES;
    });

    for (const r of overLimitRequests) {
      await supabase
        .from('pplp_mint_requests')
        .update({
          status: 'failed',
          error_message: `Exceeded max retries (${MAX_RETRIES}). Last error: ${r.error_message || 'unknown'}. Cần ký lại với nonce mới.`,
        })
        .eq('id', r.id);
      console.log(`[PPLP Auto-Submit] Request ${r.id} exceeded max retries, marked as failed`);
    }

    if (eligibleRequests.length === 0) {
      return new Response(JSON.stringify({
        success: true, processed: 0,
        failed_permanently: overLimitRequests.length,
        message: 'No eligible requests to submit',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[PPLP Auto-Submit] Processing ${eligibleRequests.length} signed requests`);

    // Setup viem clients
    const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(formattedKey as `0x${string}`);
    
    const rpcUrl = 'https://data-seed-prebsc-1-s1.binance.org:8545';
    const publicClient = createPublicClient({
      chain: bscTestnet,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: bscTestnet,
      transport: http(rpcUrl),
    });

    let submitted = 0;
    let failed = 0;
    let nonceStale = 0;
    let throttled = 0;
    const results: Array<{ id: string; status: string; tx_hash?: string; error?: string }> = [];

    // === EPOCH_CAP THROTTLE GUARD ===
    // Contract cap = 1,000,000 FUN / action / UTC day. Buffer 50K → soft cap 950K.
    const SOFT_CAP_PER_ACTION = BigInt('950000') * BigInt('1000000000000000000'); // 950k * 1e18
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const todayUtcIso = todayUtc.toISOString();

    const { data: confirmedToday } = await supabase
      .from('pplp_mint_requests')
      .select('action_name, amount_wei')
      .eq('status', 'confirmed')
      .gte('confirmed_at', todayUtcIso);

    const mintedByAction = new Map<string, bigint>();
    for (const row of confirmedToday || []) {
      const act = (row as any).action_name || 'FUN_REWARD';
      const cur = mintedByAction.get(act) || 0n;
      mintedByAction.set(act, cur + BigInt((row as any).amount_wei || '0'));
    }
    const remainingByAction = new Map<string, bigint>();
    const allActions = new Set<string>(['FUN_REWARD','GRATITUDE','SERVICE','INNER_WORK','CHANNELING','HELPING','GIVING']);
    for (const a of allActions) {
      const used = mintedByAction.get(a) || 0n;
      const rem = SOFT_CAP_PER_ACTION > used ? SOFT_CAP_PER_ACTION - used : 0n;
      remainingByAction.set(a, rem);
    }
    console.log('[PPLP Auto-Submit] Throttle remaining per action (FUN):',
      Object.fromEntries(Array.from(remainingByAction.entries()).map(([k,v]) => [k, (v / BigInt('1000000000000000000')).toString()])));

    for (const mintReq of eligibleRequests) {
      // === B3-02 LỚP 2: reserve cap nguyên tử ở DB (không tự cộng ở bộ nhớ) ===
      const action = mintReq.action_name || 'FUN_REWARD';
      const amountWei = BigInt(mintReq.amount_wei || '0');
      let reserved = false;
      const releaseReservation = async () => {
        if (!reserved) return;
        reserved = false;
        const { error: relErr } = await supabase.rpc('pplp_release_daily_mint', {
          p_action_name: action,
          p_amount_wei: amountWei.toString(),
          p_source: 'auto-submit',
        });
        if (relErr) console.error(`[PPLP Auto-Submit] release cap failed for ${mintReq.id}:`, relErr.message);
      };

      const { data: reserveRes, error: reserveErr } = await supabase.rpc('pplp_reserve_daily_mint', {
        p_action_name: action,
        p_amount_wei: amountWei.toString(),
        p_source: 'auto-submit',
      });
      if (reserveErr) {
        failed++;
        results.push({ id: mintReq.id, status: 'failed', error: `RESERVE_ERROR: ${reserveErr.message}` });
        continue;
      }
      if (!reserveRes || (reserveRes as any).ok !== true) {
        throttled++;
        const reason = (reserveRes as any)?.reason || 'DAILY_CAP_EXCEEDED';
        const remaining = (reserveRes as any)?.remaining_wei ?? '0';
        results.push({
          id: mintReq.id,
          status: 'throttled',
          error: `EPOCH_CAP throttle (${reason}): action=${action} remaining=${remaining} need=${amountWei}`,
        });
        console.log(`[PPLP Auto-Submit] Throttled ${mintReq.id} (${action}): ${reason}, remaining=${remaining}, need=${amountWei}`);
        continue; // Keep status='signed', no retry increment, no gas spent
      }
      reserved = true;



      try {
        // === NONCE VERIFICATION: Check on-chain nonce matches signed nonce ===
        const onChainNonce = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'nonces',
          args: [mintReq.recipient_address as `0x${string}`],
        });

        const signedNonce = BigInt(mintReq.nonce || 0);
        
        if (onChainNonce !== signedNonce) {
          const errMsg = `Nonce stale: on-chain=${onChainNonce}, signed=${signedNonce}. Cần tạo lại mint request với nonce mới.`;
          console.error(`[PPLP Auto-Submit] ${mintReq.id}: ${errMsg}`);
          
          await supabase
            .from('pplp_mint_requests')
            .update({
              status: 'failed',
              error_message: errMsg,
            })
            .eq('id', mintReq.id);

          nonceStale++;
          results.push({ id: mintReq.id, status: 'nonce_stale', error: errMsg });
          continue;
        }

        // Extract signatures in GOV group order
        const sigs: string[] = [];
        const multisigSigs = mintReq.multisig_signatures || {};

        for (const group of GOV_GROUPS) {
          const groupSig = multisigSigs[group];
          if (!groupSig?.signature) {
            throw new Error(`Missing signature for group: ${group}`);
          }
          sigs.push(groupSig.signature);
        }

        // Increment retry count BEFORE attempting
        const currentRetryCount = (mintReq as any).retry_count || 0;
        await supabase
          .from('pplp_mint_requests')
          .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            retry_count: currentRetryCount + 1,
          })
          .eq('id', mintReq.id);

        // Call lockWithPPLP on contract
        const actionName = mintReq.action_name || 'FUN_REWARD';

        const txHash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'lockWithPPLP',
          args: [
            mintReq.recipient_address as `0x${string}`,
            actionName,
            BigInt(mintReq.amount_wei || '0'),
            mintReq.evidence_hash as `0x${string}`,
            sigs as `0x${string}`[],
          ],
        });

        console.log(`[PPLP Auto-Submit] TX sent for ${mintReq.id}: ${txHash}`);

        // Wait for confirmation (timeout 60s)
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 60_000,
        });

        if (receipt.status === 'success') {
          await supabase
            .from('pplp_mint_requests')
            .update({
              status: 'confirmed',
              tx_hash: txHash,
              confirmed_at: new Date().toISOString(),
            })
            .eq('id', mintReq.id);

          // Update linked light_actions
          if (mintReq.action_ids?.length) {
            await supabase
              .from('light_actions')
              .update({
                mint_status: 'minted',
                tx_hash: txHash,
                minted_at: new Date().toISOString(),
              })
              .in('id', mintReq.action_ids);
          }

          // === AUTO-SPLIT PROMOTION ===
          // Nếu vừa confirm 1 child của split request → promote sibling queued_split
          if (mintReq.parent_request_id) {
            const { data: siblings } = await supabase
              .from('pplp_mint_requests')
              .select('id, status')
              .eq('parent_request_id', mintReq.parent_request_id)
              .neq('id', mintReq.id);
            const queued = (siblings || []).find((s: any) => s.status === 'queued_split');
            if (queued) {
              const { error: promErr } = await supabase
                .from('pplp_mint_requests')
                .update({ status: 'pending_sig', updated_at: new Date().toISOString() })
                .eq('id', queued.id)
                .eq('status', 'queued_split');
              if (promErr) {
                console.error(`[PPLP Auto-Submit] Failed to promote sibling ${queued.id}:`, promErr);
              } else {
                console.log(`[PPLP Auto-Submit] Promoted split sibling ${queued.id} → pending_sig`);
              }
            }
          }

          // Nếu user còn hàng đợi orphan/split khác và không có lệnh active, mở tiếp 1 lệnh.
          const { count: activeAfterConfirm } = await supabase
            .from('pplp_mint_requests')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', mintReq.user_id)
            .in('status', [...ACTIVE_STATUSES]);
          if ((activeAfterConfirm ?? 0) === 0) {
            const { data: nextQueued } = await supabase
              .from('pplp_mint_requests')
              .select('id')
              .eq('user_id', mintReq.user_id)
              .eq('status', 'queued_split')
              .order('created_at', { ascending: true })
              .order('nonce', { ascending: true })
              .limit(1)
              .maybeSingle();
            if (nextQueued?.id) {
              const { error: queueErr } = await supabase
                .from('pplp_mint_requests')
                .update({ status: 'pending_sig', updated_at: new Date().toISOString() })
                .eq('id', nextQueued.id)
                .eq('status', 'queued_split');
              if (queueErr) {
                console.error(`[PPLP Auto-Submit] Failed to promote queued request ${nextQueued.id}:`, queueErr);
              } else {
                console.log(`[PPLP Auto-Submit] Promoted queued request ${nextQueued.id} → pending_sig`);
              }
            }
          }

          submitted++;
          reserved = false; // cap đã thực sự dùng → giữ nguyên phần đã reserve
          // Decrement remaining for action pool (chỉ để báo cáo)
          const curRem = remainingByAction.get(actionName) ?? 0n;
          remainingByAction.set(actionName, curRem > amountWei ? curRem - amountWei : 0n);
          results.push({ id: mintReq.id, status: 'confirmed', tx_hash: txHash });
        } else {
          // TX reverted on-chain → hoàn lại phần cap đã giữ
          await releaseReservation();
          await supabase
            .from('pplp_mint_requests')
            .update({ status: 'signed', error_message: 'Transaction reverted on-chain' })
            .eq('id', mintReq.id);

          failed++;
          results.push({ id: mintReq.id, status: 'failed', error: 'Transaction reverted' });
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[PPLP Auto-Submit] Failed for ${mintReq.id}:`, errMsg);
        await releaseReservation();


        // Rollback to signed if still in submitted state
        await supabase
          .from('pplp_mint_requests')
          .update({ status: 'signed', error_message: errMsg })
          .eq('id', mintReq.id)
          .eq('status', 'submitted');

        failed++;
        results.push({ id: mintReq.id, status: 'failed', error: errMsg });
      }
    }

    console.log(`[PPLP Auto-Submit] Done: ${submitted} submitted, ${failed} failed, ${nonceStale} nonce_stale, ${throttled} throttled`);

    const remainingFun = Object.fromEntries(
      Array.from(remainingByAction.entries()).map(([k, v]) => [k, (v / BigInt('1000000000000000000')).toString()])
    );

    return new Response(JSON.stringify({
      success: true,
      total: eligibleRequests.length,
      submitted,
      failed,
      nonce_stale: nonceStale,
      throttled,
      permanently_failed: overLimitRequests.length,
      hot_wallet: account.address,
      remaining_per_action_fun: remainingFun,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    } finally {
      await releaseLease();
    }

  } catch (error: unknown) {
    console.error('[PPLP Auto-Submit] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
