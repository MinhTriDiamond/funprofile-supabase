/**
 * PPLP Rebalance Throttled Action
 *
 * Vấn đề: nhiều lệnh mint NHỎ cùng một on-chain action (vd GRATITUDE) dồn lại
 * vượt trần 950K FUN/action/UTC day ⇒ backlog `signed` nằm chờ nhiều ngày,
 * trong khi các action khác còn dư hạn mức.
 *
 * Giải pháp: với lệnh `signed` kẹt > MIN_STUCK_HOURS mà action hiện tại đã cạn
 * quota hôm nay, chuyển sang action còn dư hạn mức. Vì action nằm trong payload
 * EIP-712, lệnh phải được ký lại ⇒ đặt về `pending_sig`, xoá chữ ký cũ,
 * cập nhật action_hash + evidence_hash + nonce on-chain mới.
 *
 * KHÔNG thay đổi số tiền của bất kỳ lệnh nào.
 *
 * Auth: admin JWT | service key | x-cron-secret | internal cron token.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPublicClient, http, keccak256, toBytes } from "npm:viem@^2.38.0";
import { bscTestnet } from "npm:viem@^2.38.0/chains";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-cron-token',
};

const CONTRACT_ADDRESS = '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6' as const;
const ON_CHAIN_ACTIONS = ['INNER_WORK', 'CHANNELING', 'GIVING', 'HELPING', 'GRATITUDE', 'SERVICE'] as const;
const SOFT_CAP = BigInt('950000') * BigInt('1000000000000000000');
const WEI = BigInt('1000000000000000000');
const MIN_STUCK_HOURS = 24;
const INTERNAL_CRON_TOKEN = 'pplp-rebalance-action-cron-v1-2026-07-30';

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || '';
    const isService =
      token === serviceKey
      || (cronSecret !== '' && req.headers.get('x-cron-secret') === cronSecret)
      || req.headers.get('x-internal-cron-token') === INTERNAL_CRON_TOKEN;

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
      if (!(roles || []).some((r: any) => r.role === 'admin')) {
        return new Response(JSON.stringify({ error: 'Admin only' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run !== false; // mặc định dry-run
    const limit: number = Math.min(50, Math.max(1, Number(body?.limit) || 20));
    const minStuckHours: number = Math.max(1, Number(body?.min_stuck_hours) || MIN_STUCK_HOURS);

    const cutoff = new Date(Date.now() - minStuckHours * 3600_000).toISOString();

    const { data: stuck, error: fetchErr } = await admin
      .from('pplp_mint_requests')
      .select('*')
      .eq('status', 'signed')
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (fetchErr) throw fetchErr;

    if (!stuck || stuck.length === 0) {
      return new Response(JSON.stringify({ success: true, dry_run: dryRun, candidates: 0, rebalanced: 0, plan: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hạn mức còn lại theo action trong ngày UTC
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const { data: confirmedToday } = await admin
      .from('pplp_mint_requests')
      .select('action_name, amount_wei')
      .eq('status', 'confirmed')
      .gte('confirmed_at', todayUtc.toISOString());

    const usedByAction = new Map<string, bigint>();
    for (const r of confirmedToday || []) {
      const a = (r as any).action_name || 'FUN_REWARD';
      usedByAction.set(a, (usedByAction.get(a) || 0n) + BigInt((r as any).amount_wei || '0'));
    }

    // Trừ luôn phần đang xếp hàng (signed/submitted) để không đặt chồng lên nhau
    const { data: inFlight } = await admin
      .from('pplp_mint_requests')
      .select('id, action_name, amount_wei')
      .in('status', ['signed', 'submitted']);

    const reservedByAction = new Map<string, bigint>();
    for (const r of inFlight || []) {
      const a = (r as any).action_name || 'FUN_REWARD';
      reservedByAction.set(a, (reservedByAction.get(a) || 0n) + BigInt((r as any).amount_wei || '0'));
    }

    const remainingByAction = new Map<string, bigint>();
    for (const a of ON_CHAIN_ACTIONS) {
      const used = (usedByAction.get(a) || 0n) + (reservedByAction.get(a) || 0n);
      remainingByAction.set(a, SOFT_CAP > used ? SOFT_CAP - used : 0n);
    }

    const publicClient = createPublicClient({
      chain: bscTestnet,
      transport: http('https://data-seed-prebsc-1-s1.binance.org:8545'),
    });

    const plan: any[] = [];
    const skipped: any[] = [];

    for (const r of stuck) {
      const currentAction = (r as any).action_name || 'FUN_REWARD';
      const amountWei = BigInt((r as any).amount_wei || '0');

      // Nếu action hiện tại vẫn còn hạn mức đủ → không cần đổi, cứ để auto-submit xử lý
      const currentRemaining = remainingByAction.get(currentAction) ?? 0n;
      if (currentRemaining >= amountWei) {
        skipped.push({ id: r.id, reason: 'action hiện tại vẫn còn hạn mức' });
        continue;
      }

      const target = [...ON_CHAIN_ACTIONS]
        .filter(a => a !== currentAction)
        .map(a => ({ action: a, remaining: remainingByAction.get(a) || 0n }))
        .sort((x, y) => (y.remaining > x.remaining ? 1 : y.remaining < x.remaining ? -1 : 0))[0];

      if (!target || target.remaining < amountWei) {
        skipped.push({ id: r.id, reason: 'không action nào còn đủ hạn mức hôm nay' });
        continue;
      }

      const onChainNonce = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: NONCES_ABI,
        functionName: 'nonces',
        args: [(r as any).recipient_address as `0x${string}`],
      }) as bigint;

      const newEvidence = keccak256(toBytes(`rebalance:${r.id}:${target.action}:${onChainNonce}`));

      const item = {
        id: r.id,
        user_id: (r as any).user_id,
        amount_fun: Number(amountWei / WEI),
        from_action: currentAction,
        to_action: target.action,
        new_nonce: onChainNonce.toString(),
        evidence_hash: newEvidence,
      };

      if (!dryRun) {
        remainingByAction.set(target.action, target.remaining - amountWei);

        const { error: updErr } = await admin
          .from('pplp_mint_requests')
          .update({
            status: 'pending_sig',
            action_name: target.action,
            action_hash: actionHash(target.action),
            evidence_hash: newEvidence,
            nonce: Number(onChainNonce),
            multisig_signatures: {},
            multisig_completed_groups: [],
            retry_count: 0,
            error_message: `Rebalance action ${currentAction} → ${target.action} (hết hạn mức ngày). Cần ký lại.`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.id)
          .eq('status', 'signed');
        if (updErr) {
          skipped.push({ id: r.id, reason: updErr.message });
          continue;
        }

        try {
          await admin.from('admin_audit_log').insert({
            action: 'pplp_rebalance_throttled_action',
            entity_type: 'pplp_mint_requests',
            entity_id: r.id,
            metadata: item,
          });
        } catch (_) { /* audit best-effort */ }
      }

      plan.push(item);
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      candidates: stuck.length,
      rebalanced: dryRun ? 0 : plan.length,
      plan,
      skipped,
      remaining_after_fun: Object.fromEntries(
        Array.from(remainingByAction.entries()).map(([k, v]) => [k, (v / WEI).toString()]),
      ),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[pplp-rebalance-throttled-action] error', err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
