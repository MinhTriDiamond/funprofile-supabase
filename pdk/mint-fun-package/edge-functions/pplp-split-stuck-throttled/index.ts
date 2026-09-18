/**
 * PPLP Split Stuck Throttled Requests
 * Admin-only. Tách các mint request > 950K FUN bị kẹt EPOCH_CAP thành 2 sub-request
 * với 2 on-chain action khác nhau, mỗi cái ≤ 950K.
 *
 * Cha duyệt 17/05/2026.
 *
 * Quy trình mỗi request kẹt:
 *  1) Parent: status='split_parent' (terminal, không còn active)
 *  2) Child #1: status='pending_sig', amount=min(950K, remaining_primary), action=primary, nonce=on-chain
 *  3) Child #2: status='queued_split', amount=remainder, action=secondary, nonce=on-chain+1
 *  4) Khi child #1 confirmed → pplp-auto-submit tự promote child #2 sang pending_sig
 *
 * Action selection: chọn action còn nhiều quota nhất trong ngày UTC.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPublicClient, http, keccak256, toBytes, toHex } from "npm:viem@^2.38.0";
import { bscTestnet } from "npm:viem@^2.38.0/chains";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONTRACT_ADDRESS = '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6' as const;
const ON_CHAIN_ACTIONS = ['INNER_WORK','CHANNELING','GIVING','HELPING','GRATITUDE','SERVICE'] as const;
const SOFT_CAP = BigInt('950000') * BigInt('1000000000000000000');
const WEI = BigInt('1000000000000000000');

const NONCES_ABI = [{
  name: 'nonces', type: 'function' as const,
  inputs: [{ name: 'account', type: 'address' as const }],
  outputs: [{ name: '', type: 'uint256' as const }],
  stateMutability: 'view' as const,
}] as const;

function actionHash(name: string): `0x${string}` {
  return keccak256(toBytes(name));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth: user must be admin
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const cronSecretHeader = req.headers.get('x-cron-secret') || '';
    const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || '';
    // Internal pg_cron token (project-scoped, source-private). Gateway vẫn verify JWT trước.
    const INTERNAL_CRON_TOKEN = 'pplp-split-stuck-cron-v1-2026-06-16';
    const internalTokenHeader = req.headers.get('x-internal-cron-token') || '';
    const isService =
      token === serviceKey
      || (cronSecret !== '' && cronSecretHeader === cronSecret)
      || internalTokenHeader === INTERNAL_CRON_TOKEN;


    const admin = createClient(supabaseUrl, serviceKey);

    if (!isService) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
      const isAdmin = (roles || []).some((r: any) => r.role === 'admin');
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Admin only' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run !== false; // default true
    const limit: number = Math.min(50, Math.max(1, Number(body?.limit) || 20));

    // Find stuck requests: status pending_sig/signing/signed, amount > 950K
    const { data: stuck, error: fetchErr } = await admin
      .from('pplp_mint_requests')
      .select('*')
      .in('status', ['pending_sig', 'signing', 'signed'])
      .gt('amount_display', 950000)
      .is('parent_request_id', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchErr) throw fetchErr;
    if (!stuck || stuck.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Không có lệnh kẹt > 950K', candidates: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Compute remaining per action today (UTC)
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const { data: confirmedToday } = await admin
      .from('pplp_mint_requests')
      .select('action_name, amount_wei')
      .eq('status', 'confirmed')
      .gte('confirmed_at', todayUtc.toISOString());

    const usedByAction = new Map<string, bigint>();
    for (const r of (confirmedToday || [])) {
      const a = (r as any).action_name || 'FUN_REWARD';
      usedByAction.set(a, (usedByAction.get(a) || 0n) + BigInt((r as any).amount_wei || '0'));
    }
    const remainingByAction = new Map<string, bigint>();
    for (const a of ON_CHAIN_ACTIONS) {
      const used = usedByAction.get(a) || 0n;
      remainingByAction.set(a, SOFT_CAP > used ? SOFT_CAP - used : 0n);
    }

    const publicClient = createPublicClient({ chain: bscTestnet, transport: http('https://data-seed-prebsc-1-s1.binance.org:8545') });

    const plan: any[] = [];
    const errors: any[] = [];

    for (const req of stuck) {
      try {
        const amountWei = BigInt(req.amount_wei);

        // Sort actions by remaining desc, exclude original FUN_REWARD/etc if no quota
        const ranked = [...ON_CHAIN_ACTIONS]
          .map(a => ({ action: a, remaining: remainingByAction.get(a) || 0n }))
          .sort((a, b) => (b.remaining > a.remaining ? 1 : b.remaining < a.remaining ? -1 : 0));

        // Child #1 takes up to SOFT_CAP from the action with most remaining
        const primary = ranked[0];
        if (primary.remaining < WEI) {
          errors.push({ id: req.id, reason: 'Tất cả action đều cạn quota hôm nay, thử lại ngày mai' });
          continue;
        }
        const child1Amount = amountWei <= primary.remaining ? amountWei : (primary.remaining > SOFT_CAP ? SOFT_CAP : primary.remaining);
        const child1Capped = child1Amount > SOFT_CAP ? SOFT_CAP : child1Amount;
        const remainder = amountWei - child1Capped;

        let child2: { action: string; amount: bigint } | null = null;
        if (remainder > 0n) {
          // Pick secondary action ≠ primary with remaining ≥ remainder
          const secondary = ranked.find(r => r.action !== primary.action && r.remaining >= remainder);
          if (!secondary) {
            errors.push({ id: req.id, reason: `Không tìm được action phụ đủ quota cho phần dư ${remainder / WEI} FUN` });
            continue;
          }
          child2 = { action: secondary.action, amount: remainder };
        }

        // Fetch on-chain nonce for user
        const onChainNonce = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: NONCES_ABI,
          functionName: 'nonces',
          args: [req.recipient_address as `0x${string}`],
        }) as bigint;

        const evidence1 = keccak256(toBytes(`split:${req.id}:1:${primary.action}`));
        const evidence2 = child2 ? keccak256(toBytes(`split:${req.id}:2:${child2.action}`)) : null;

        const planItem: any = {
          parent_id: req.id,
          user_id: req.user_id,
          original_amount_fun: Number(amountWei / WEI),
          on_chain_nonce: onChainNonce.toString(),
          child1: {
            action: primary.action,
            amount_fun: Number(child1Capped / WEI),
            amount_wei: child1Capped.toString(),
            nonce: onChainNonce.toString(),
            evidence_hash: evidence1,
            status: 'pending_sig',
          },
          child2: child2 ? {
            action: child2.action,
            amount_fun: Number(child2.amount / WEI),
            amount_wei: child2.amount.toString(),
            nonce: (onChainNonce + 1n).toString(),
            evidence_hash: evidence2,
            status: 'queued_split',
          } : null,
        };

        if (!dryRun) {
          // Reserve quota now so subsequent loop iterations see correct remaining
          remainingByAction.set(primary.action, (remainingByAction.get(primary.action) || 0n) - child1Capped);
          if (child2) {
            remainingByAction.set(child2.action, (remainingByAction.get(child2.action) || 0n) - child2.amount);
          }

          // 1) Mark parent as split_parent (terminal, frees active slot)
          const { error: pErr } = await admin
            .from('pplp_mint_requests')
            .update({
              status: 'split_parent',
              error_message: `Auto-split: child1=${primary.action}/${child1Capped / WEI}FUN${child2 ? `, child2=${child2.action}/${child2.amount / WEI}FUN` : ''}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', req.id)
            .in('status', ['pending_sig', 'signing', 'signed']);
          if (pErr) throw pErr;

          // 2) Insert child #1 (pending_sig — needs multisig re-sign)
          const child1Row = {
            user_id: req.user_id,
            recipient_address: req.recipient_address,
            amount_wei: child1Capped.toString(),
            amount_display: Number(child1Capped / WEI),
            evidence_hash: evidence1,
            action_types: req.action_types,
            action_ids: req.action_ids,
            nonce: Number(onChainNonce),
            deadline: req.deadline,
            status: 'pending_sig',
            action_name: primary.action,
            action_hash: actionHash(primary.action),
            multisig_signatures: {},
            multisig_required_groups: ['will', 'wisdom', 'love'],
            multisig_completed_groups: [],
            parent_request_id: req.id,
            retry_count: 0,
          };
          const { data: c1, error: c1Err } = await admin
            .from('pplp_mint_requests')
            .insert(child1Row)
            .select('id')
            .single();
          if (c1Err) throw c1Err;
          planItem.child1.id = c1.id;

          // 3) Insert child #2 (queued_split — promoted later)
          if (child2) {
            const child2Row = {
              user_id: req.user_id,
              recipient_address: req.recipient_address,
              amount_wei: child2.amount.toString(),
              amount_display: Number(child2.amount / WEI),
              evidence_hash: evidence2!,
              action_types: req.action_types,
              action_ids: [], // light_actions linked to child1 only to avoid double-mark
              nonce: Number(onChainNonce + 1n),
              deadline: req.deadline,
              status: 'queued_split',
              action_name: child2.action,
              action_hash: actionHash(child2.action),
              multisig_signatures: {},
              multisig_required_groups: ['will', 'wisdom', 'love'],
              multisig_completed_groups: [],
              parent_request_id: req.id,
              retry_count: 0,
            };
            const { data: c2, error: c2Err } = await admin
              .from('pplp_mint_requests')
              .insert(child2Row)
              .select('id')
              .single();
            if (c2Err) throw c2Err;
            planItem.child2.id = c2.id;
          }

          // 4) Notify admins (best-effort, không throw)
          try {
            await admin.from('admin_audit_log').insert({
              action: 'pplp_split_throttled',
              entity_type: 'pplp_mint_requests',
              entity_id: req.id,
              metadata: planItem,
            });
          } catch (_) { /* ignore audit failures */ }
        }

        plan.push(planItem);
      } catch (e: any) {
        errors.push({ id: req.id, error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      total_candidates: stuck.length,
      planned: plan.length,
      errors,
      plan,
      remaining_after_fun: Object.fromEntries(
        Array.from(remainingByAction.entries()).map(([k, v]) => [k, (v / WEI).toString()])
      ),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[pplp-split-stuck-throttled] error:', err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
