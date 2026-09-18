// Pet Risk Engine cron — quét hành vi 7 ngày, sinh signals, recompute scores.
// verify_jwt = false (gọi từ pg_cron). Bảo vệ bằng header X-Cron-Secret nếu cần.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

interface SignalInsert {
  user_id: string;
  signal_type: string;
  severity: number;
  evidence: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const signals: SignalInsert[] = [];
  const usersTouched = new Set<string>();
  const errors: string[] = [];
  const dayAgo = new Date(Date.now() - 86400 * 1000).toISOString();
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

  // Fail-safe: mỗi nhánh tín hiệu chạy độc lập, 1 nhánh lỗi không làm chết cả cron.
  const branch = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { errors.push(`${name}: ${String(e)}`); console.error(`${name} branch failed`, e); }
  };

  await branch('xp_burst', async () => {
    // 1) xp_burst — pet_interactions xp_delta > 500 trong 10 phút
    const { data: xpRows } = await sb
      .from('pet_interactions')
      .select('user_id, xp_delta, created_at')
      .gt('xp_delta', 0)
      .gte('created_at', since);
    const xpByUser = new Map<string, { ts: number; xp: number }[]>();
    for (const r of (xpRows ?? []) as any[]) {
      if (!r.user_id) continue;
      const arr = xpByUser.get(r.user_id) ?? [];
      arr.push({ ts: new Date(r.created_at).getTime(), xp: r.xp_delta });
      xpByUser.set(r.user_id, arr);
    }
    for (const [user_id, arr] of xpByUser) {
      arr.sort((a, b) => a.ts - b.ts);
      let l = 0, sum = 0, maxSum = 0;
      for (let r = 0; r < arr.length; r++) {
        sum += arr[r].xp;
        while (arr[r].ts - arr[l].ts > 10 * 60 * 1000) { sum -= arr[l].xp; l++; }
        if (sum > maxSum) maxSum = sum;
      }
      if (maxSum > 500) {
        signals.push({ user_id, signal_type: 'xp_burst', severity: Math.min(1, maxSum / 2000), evidence: { max_window_xp: maxSum } });
        usersTouched.add(user_id);
      }
    }
  });

  await branch('cheer_loop', async () => {
    // 2) cheer_loop — A↔B ≥ 10 lần / 24h
    const { data: cheers } = await sb
      .from('pet_cheers')
      .select('from_user_id, to_user_id, created_at')
      .gte('created_at', dayAgo);
    const pairCount = new Map<string, number>();
    for (const c of (cheers ?? []) as any[]) {
      const a = c.from_user_id, b = c.to_user_id;
      if (!a || !b || a === b) continue;
      const key = [a, b].sort().join('|');
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    }
    for (const [pair, count] of pairCount) {
      if (count >= 10) {
        const [a, b] = pair.split('|');
        const severity = Math.min(1, count / 30);
        signals.push({ user_id: a, signal_type: 'cheer_loop', severity, evidence: { partner: b, count } });
        signals.push({ user_id: b, signal_type: 'cheer_loop', severity, evidence: { partner: a, count } });
        usersTouched.add(a); usersTouched.add(b);
      }
    }
  });

  await branch('shop_velocity', async () => {
    // 3) shop_velocity — > 5 đơn completed / 1h hoặc > 50k CAMLY / 24h
    const { data: orders24 } = await sb
      .from('pet_shop_orders')
      .select('user_id, price_camly, status, created_at')
      .eq('status', 'completed')
      .gte('created_at', dayAgo);
    const shopByUser = new Map<string, { recent: number; total: number }>();
    for (const o of (orders24 ?? []) as any[]) {
      const cur = shopByUser.get(o.user_id) ?? { recent: 0, total: 0 };
      cur.total += Number(o.price_camly ?? 0);
      if (o.created_at >= hourAgo) cur.recent += 1;
      shopByUser.set(o.user_id, cur);
    }
    for (const [user_id, v] of shopByUser) {
      if (v.recent > 5 || v.total > 50_000_000) {
        signals.push({
          user_id, signal_type: 'shop_velocity',
          severity: Math.min(1, Math.max(v.recent / 10, v.total / 200_000_000)),
          evidence: { orders_1h: v.recent, camly_24h: v.total },
        });
        usersTouched.add(user_id);
      }
    }
  });

  // 4) tc_low — đọc TC thật từ trust_profile qua did_registry (P1-4: trước đây query
  //    bảng 'trust_scores' KHÔNG tồn tại nên nhánh này luôn lỗi im lặng).
  if (usersTouched.size > 0) {
    try {
      const uids = Array.from(usersTouched);
      const { data: dids, error: didErr } = await sb
        .from('did_registry')
        .select('did_id, owner_user_id')
        .in('owner_user_id', uids);
      if (didErr) throw didErr;
      const didToUser = new Map<string, string>();
      for (const d of (dids ?? []) as any[]) didToUser.set(d.did_id, d.owner_user_id);

      if (didToUser.size > 0) {
        const { data: trusts, error: tpErr } = await sb
          .from('trust_profile')
          .select('did_id, tc')
          .in('did_id', Array.from(didToUser.keys()));
        if (tpErr) throw tpErr;

        const otherSignalCount = new Map<string, number>();
        for (const s2 of signals) otherSignalCount.set(s2.user_id, (otherSignalCount.get(s2.user_id) ?? 0) + 1);

        for (const t of (trusts ?? []) as any[]) {
          const uid = didToUser.get(t.did_id);
          if (!uid) continue;
          const tc = Number(t.tc ?? 0);
          if (tc < 0.30 && (otherSignalCount.get(uid) ?? 0) >= 2) {
            signals.push({ user_id: uid, signal_type: 'tc_low', severity: 0.3, evidence: { tc } });
          }
        }
      }
    } catch (e) {
      errors.push(`tc_low: ${String(e)}`);
      console.error('tc_low branch failed', e);
    }
  }

  // Insert signals (idempotency: chấp nhận trùng vì cron chạy hàng ngày)
  if (signals.length > 0) {
    const { error: insErr } = await sb.from('pet_risk_signals').insert(signals as never);
    if (insErr) { errors.push(`insert_signals: ${insErr.message}`); console.error('insert signals failed', insErr); }
  }

  // Recompute scores cho mọi user có signal trong 7 ngày
  const { data: usersWithSignals } = await sb
    .from('pet_risk_signals')
    .select('user_id')
    .gte('created_at', since);
  const uniqueUsers = Array.from(new Set((usersWithSignals ?? []).map((r: any) => r.user_id)));
  let recomputed = 0;
  for (const uid of uniqueUsers) {
    const { error } = await sb.rpc('pet_risk_recompute' as never, { _user_id: uid } as never);
    if (error) console.error('recompute failed', uid, error);
    else recomputed++;
  }

  return new Response(JSON.stringify({
    ok: true,
    signals_inserted: signals.length,
    users_recomputed: recomputed,
    errors,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
