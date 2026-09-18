/**
 * PPLP Backlog History (admin-only)
 * Trả time-series 14 ngày: confirmed FUN/day per action,
 * cộng snapshot backlog hiện tại + ETA per action.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOFT_CAP_FUN = 950_000n;
const DAYS = 14;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (DAYS - 1));

    // Confirmed mints in last DAYS
    const { data: confirmed } = await supabase
      .from('pplp_mint_requests')
      .select('action_name, amount_wei, confirmed_at')
      .eq('status', 'confirmed')
      .gte('confirmed_at', since.toISOString())
      .limit(10000);

    // Backlog snapshot
    const { data: backlog } = await supabase
      .from('pplp_mint_requests')
      .select('action_name, amount_wei')
      .eq('status', 'signed')
      .limit(10000);

    const actionsSet = new Set<string>();
    const dayKeys: string[] = [];
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(since); d.setUTCDate(since.getUTCDate() + i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }

    // series[date][action] = bigint FUN
    const series = new Map<string, Map<string, bigint>>();
    for (const k of dayKeys) series.set(k, new Map());

    for (const r of confirmed || []) {
      const act = (r as any).action_name || 'FUN_REWARD';
      actionsSet.add(act);
      const day = ((r as any).confirmed_at as string).slice(0, 10);
      const m = series.get(day);
      if (!m) continue;
      const fun = BigInt((r as any).amount_wei || '0') / 10n ** 18n;
      m.set(act, (m.get(act) || 0n) + fun);
    }

    const backlogByAction = new Map<string, { count: number; fun: bigint }>();
    for (const r of backlog || []) {
      const act = (r as any).action_name || 'FUN_REWARD';
      actionsSet.add(act);
      const cur = backlogByAction.get(act) || { count: 0, fun: 0n };
      cur.count += 1;
      cur.fun += BigInt((r as any).amount_wei || '0') / 10n ** 18n;
      backlogByAction.set(act, cur);
    }

    // Today minted per action
    const todayKey = new Date(); todayKey.setUTCHours(0, 0, 0, 0);
    const todayStr = todayKey.toISOString().slice(0, 10);
    const todayRow = series.get(todayStr) || new Map();

    const actions = Array.from(actionsSet).sort();

    const days = dayKeys.map((d) => {
      const row: Record<string, string | number> = { date: d };
      const m = series.get(d) || new Map();
      let total = 0n;
      for (const a of actions) {
        const v = m.get(a) || 0n;
        row[a] = Number(v);
        total += v;
      }
      row.__total = Number(total);
      return row;
    });

    const summary = actions.map((a) => {
      const bk = backlogByAction.get(a) || { count: 0, fun: 0n };
      const usedToday = todayRow.get(a) || 0n;
      const remaining = SOFT_CAP_FUN > usedToday ? SOFT_CAP_FUN - usedToday : 0n;
      const etaDays = bk.fun === 0n ? 0 : Number((bk.fun + SOFT_CAP_FUN - 1n) / SOFT_CAP_FUN);
      return {
        action_name: a,
        backlog_count: bk.count,
        backlog_fun: bk.fun.toString(),
        minted_today_fun: usedToday.toString(),
        remaining_today_fun: remaining.toString(),
        eta_days: etaDays,
      };
    }).sort((a, b) => Number(BigInt(b.backlog_fun) - BigInt(a.backlog_fun)));

    return new Response(JSON.stringify({
      success: true,
      window_days: DAYS,
      soft_cap_per_action_fun: SOFT_CAP_FUN.toString(),
      actions,
      days,
      summary,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
