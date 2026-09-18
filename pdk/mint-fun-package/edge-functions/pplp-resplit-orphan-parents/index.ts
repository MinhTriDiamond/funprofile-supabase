/**
 * PPLP Resplit Orphan Parents
 * Admin-only. Sửa các mint request status='split_parent' không có dòng con nào.
 *
 * Bối cảnh: pplp-split-stuck-throttled flip parent → 'split_parent' TRƯỚC khi insert
 * 2 child. Nếu insert child fail (constraint, race...) parent bị mồ côi vĩnh viễn.
 *
 * Edge function này:
 *   - Tìm parent status='split_parent' không có child trỏ về (parent_request_id)
 *   - Tính lại split (primary/secondary action + amount + nonce on-chain)
 *   - Insert 2 child (pending_sig + queued_split) — KHÔNG đụng parent
 *   - Idempotent: nếu đã có >=1 child thì bỏ qua
 *
 * Output giống pplp-split-stuck-throttled (plan + errors).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createPublicClient, http, keccak256, toBytes } from "npm:viem@^2.38.0";
import { bscTestnet } from "npm:viem@^2.38.0/chains";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONTRACT_ADDRESS = '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6' as const;
const ON_CHAIN_ACTIONS = ['INNER_WORK', 'CHANNELING', 'GIVING', 'HELPING', 'GRATITUDE', 'SERVICE'] as const;
const ACTIVE_STATUSES = ['pending_sig', 'signing', 'signed', 'submitted'] as const;
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

function parsePlannedSplit(errorMsg: string | null): { primary?: string; primaryFun?: number; secondary?: string; secondaryFun?: number } {
  if (!errorMsg) return {};
  // Format: "Auto-split: child1=SERVICE/850000FUN, child2=HELPING/200000FUN"
  const re = /child(\d)=([A-Z_]+)\/(\d+)FUN/g;
  const out: any = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(errorMsg)) !== null) {
    if (m[1] === '1') { out.primary = m[2]; out.primaryFun = Number(m[3]); }
    if (m[1] === '2') { out.secondary = m[2]; out.secondaryFun = Number(m[3]); }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const cronSecretHeader = req.headers.get('x-cron-secret') || '';
    const cronSecret = Deno.env.get('CRON_SHARED_SECRET') || '';
    const isService = token === serviceKey || (cronSecret !== '' && cronSecretHeader === cronSecret);

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

    // Find orphan split_parent (no children)


    // Use direct query
    const { data: candidates, error: fetchErr } = await admin
      .from('pplp_mint_requests')
      .select('*')
      .eq('status', 'split_parent')
      .order('created_at', { ascending: true })
      .limit(200);

    if (fetchErr) throw fetchErr;

    // Filter to those with zero children
    const orphans: any[] = [];
    for (const p of candidates || []) {
      const { count } = await admin
        .from('pplp_mint_requests')
        .select('id', { count: 'exact', head: true })
        .eq('parent_request_id', p.id);
      if ((count ?? 0) === 0) orphans.push(p);
      if (orphans.length >= limit) break;
    }

    if (orphans.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Không có parent mồ côi', orphans: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Compute remaining per action today (UTC) — same logic as split-stuck
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

    const publicClient = createPublicClient({
      chain: bscTestnet,
      transport: http('https://data-seed-prebsc-1-s1.binance.org:8545'),
    });

    const plan: any[] = [];
    const errors: any[] = [];

    for (const parent of orphans) {
      try {
        const amountWei = BigInt(parent.amount_wei);

        // Prefer the originally-planned split parsed from error_message
        const planned = parsePlannedSplit(parent.error_message);
        const rankedAll = [...ON_CHAIN_ACTIONS]
          .map(a => ({ action: a, remaining: remainingByAction.get(a) || 0n }))
          .sort((a, b) => (b.remaining > a.remaining ? 1 : b.remaining < a.remaining ? -1 : 0));

        let primaryAction: string;
        let child1Capped: bigint;
        let secondaryAction: string | null = null;
        let child2Amount: bigint = 0n;

        if (planned.primary && planned.primaryFun) {
          primaryAction = planned.primary;
          child1Capped = BigInt(planned.primaryFun) * WEI;
          if (planned.secondary && planned.secondaryFun) {
            secondaryAction = planned.secondary;
            child2Amount = BigInt(planned.secondaryFun) * WEI;
          }
          // Giữ đúng split đã được tính trước đó. Quota ngày được pplp-auto-submit throttle khi submit on-chain,
          // không nên chặn khôi phục DB vì quota hôm nay có thể đã thay đổi.
        } else {
          // No planned split parsable — recompute from scratch
          const primary = rankedAll[0];
          if (primary.remaining < WEI) {
            errors.push({ id: parent.id, reason: 'Tất cả action cạn quota hôm nay' });
            continue;
          }
          primaryAction = primary.action;
          child1Capped = amountWei <= primary.remaining
            ? (amountWei > SOFT_CAP ? SOFT_CAP : amountWei)
            : (primary.remaining > SOFT_CAP ? SOFT_CAP : primary.remaining);
          const remainder = amountWei - child1Capped;
          if (remainder > 0n) {
            const secondary = rankedAll.find(r => r.action !== primary.action && r.remaining >= remainder);
            if (!secondary) {
              errors.push({ id: parent.id, reason: `Không có action phụ đủ quota cho phần dư ${remainder / WEI} FUN` });
              continue;
            }
            secondaryAction = secondary.action;
            child2Amount = remainder;
          }
        }

        // Fetch on-chain nonce
        const onChainNonce = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: NONCES_ABI,
          functionName: 'nonces',
          args: [parent.recipient_address as `0x${string}`],
        }) as bigint;

        const evidence1 = keccak256(toBytes(`split:${parent.id}:1:${primaryAction}`));
        const evidence2 = secondaryAction ? keccak256(toBytes(`split:${parent.id}:2:${secondaryAction}`)) : null;

        const { count: activeCount, error: activeErr } = await admin
          .from('pplp_mint_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', parent.user_id)
          .in('status', [...ACTIVE_STATUSES]);
        if (activeErr) throw activeErr;
        const child1Status = (activeCount ?? 0) > 0 ? 'queued_split' : 'pending_sig';

        const planItem: any = {
          parent_id: parent.id,
          user_id: parent.user_id,
          original_amount_fun: Number(amountWei / WEI),
          on_chain_nonce: onChainNonce.toString(),
          child1: {
            action: primaryAction,
            amount_fun: Number(child1Capped / WEI),
            amount_wei: child1Capped.toString(),
            nonce: onChainNonce.toString(),
            evidence_hash: evidence1,
            status: child1Status,
          },
          child2: secondaryAction ? {
            action: secondaryAction,
            amount_fun: Number(child2Amount / WEI),
            amount_wei: child2Amount.toString(),
            nonce: (onChainNonce + 1n).toString(),
            evidence_hash: evidence2,
            status: 'queued_split',
          } : null,
        };

        if (!dryRun) {
          // Reserve quota for next iterations
          remainingByAction.set(primaryAction, (remainingByAction.get(primaryAction) || 0n) - child1Capped);
          if (secondaryAction) {
            remainingByAction.set(secondaryAction, (remainingByAction.get(secondaryAction) || 0n) - child2Amount);
          }

          const child1Row = {
            user_id: parent.user_id,
            recipient_address: parent.recipient_address,
            created_at: parent.created_at,
            amount_wei: child1Capped.toString(),
            amount_display: Number(child1Capped / WEI),
            evidence_hash: evidence1,
            action_types: parent.action_types,
            action_ids: parent.action_ids,
            nonce: Number(onChainNonce),
            deadline: parent.deadline,
            status: child1Status,
            action_name: primaryAction,
            action_hash: actionHash(primaryAction),
            multisig_signatures: {},
            multisig_required_groups: ['will', 'wisdom', 'love'],
            multisig_completed_groups: [],
            parent_request_id: parent.id,
            retry_count: 0,
          };
          const { data: c1, error: c1Err } = await admin
            .from('pplp_mint_requests')
            .insert(child1Row)
            .select('id')
            .single();
          if (c1Err) throw c1Err;
          planItem.child1.id = c1.id;

          if (secondaryAction) {
            const child2Row = {
              user_id: parent.user_id,
              recipient_address: parent.recipient_address,
              created_at: parent.created_at,
              amount_wei: child2Amount.toString(),
              amount_display: Number(child2Amount / WEI),
              evidence_hash: evidence2!,
              action_types: parent.action_types,
              action_ids: [],
              nonce: Number(onChainNonce + 1n),
              deadline: parent.deadline,
              status: 'queued_split',
              action_name: secondaryAction,
              action_hash: actionHash(secondaryAction),
              multisig_signatures: {},
              multisig_required_groups: ['will', 'wisdom', 'love'],
              multisig_completed_groups: [],
              parent_request_id: parent.id,
              retry_count: 0,
            };
            const { data: c2, error: c2Err } = await admin
              .from('pplp_mint_requests')
              .insert(child2Row)
              .select('id')
              .single();
            if (c2Err) {
              // Cố gắng rollback child1
              await admin.from('pplp_mint_requests').delete().eq('id', c1.id);
              throw c2Err;
            }
            planItem.child2.id = c2.id;
          }

          try {
            await admin.from('admin_audit_log').insert({
              action: 'pplp_resplit_orphan_parent',
              entity_type: 'pplp_mint_requests',
              entity_id: parent.id,
              metadata: planItem,
            });
          } catch (_) { /* ignore audit */ }

          // Notify user — phần thưởng tiếp tục mint
          try {
            await admin.from('notifications').insert({
              user_id: parent.user_id,
              type: 'epoch_reset_info',
              title: 'Phần thưởng FUN đang tiếp tục được mint',
              message: `Lệnh mint ${Number(amountWei / WEI).toLocaleString('vi-VN')} FUN của bạn vừa được khôi phục${child1Status === 'queued_split' ? ' vào hàng đợi vì bạn đang có lệnh active khác' : ' và đang chờ Admin ký'}. Bạn sẽ nhận được thông báo khi hoàn tất on-chain.`,
              data: { parent_request_id: parent.id, amount_fun: Number(amountWei / WEI) },
            });
          } catch (_) { /* ignore */ }
        }

        plan.push(planItem);
      } catch (e: any) {
        errors.push({ id: parent.id, error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      orphans_found: orphans.length,
      planned: plan.length,
      errors,
      plan,
      remaining_after_fun: Object.fromEntries(
        Array.from(remainingByAction.entries()).map(([k, v]) => [k, (v / WEI).toString()])
      ),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[pplp-resplit-orphan-parents] error:', err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
