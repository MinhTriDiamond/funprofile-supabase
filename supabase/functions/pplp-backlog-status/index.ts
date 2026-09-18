/**
 * PPLP Backlog Status (admin-only)
 * Trả thống kê backlog `signed` theo action_name + ETA xả backlog
 * dựa trên SOFT cap 950K FUN/action/UTC day.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOFT_CAP_FUN = 950_000n;

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

    // Verify admin via JWT
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

    // Backlog by action
    const { data: backlog } = await supabase
      .from('pplp_mint_requests')
      .select('action_name, amount_wei')
      .eq('status', 'signed');

    const byAction = new Map<string, { count: number; fun: bigint }>();
    for (const r of backlog || []) {
      const act = (r as any).action_name || 'FUN_REWARD';
      const cur = byAction.get(act) || { count: 0, fun: 0n };
      cur.count += 1;
      cur.fun += BigInt((r as any).amount_wei || '0') / 10n ** 18n;
      byAction.set(act, cur);
    }

    // Confirmed today per action
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const { data: today_data } = await supabase
      .from('pplp_mint_requests')
      .select('action_name, amount_wei')
      .eq('status', 'confirmed')
      .gte('confirmed_at', today.toISOString());

    const mintedToday = new Map<string, bigint>();
    for (const r of today_data || []) {
      const act = (r as any).action_name || 'FUN_REWARD';
      const cur = mintedToday.get(act) || 0n;
      mintedToday.set(act, cur + BigInt((r as any).amount_wei || '0') / 10n ** 18n);
    }

    const breakdown = Array.from(byAction.entries()).map(([action, v]) => {
      const used = mintedToday.get(action) || 0n;
      const remaining = SOFT_CAP_FUN > used ? SOFT_CAP_FUN - used : 0n;
      const etaDays = Number((v.fun + SOFT_CAP_FUN - 1n) / SOFT_CAP_FUN);
      return {
        action_name: action,
        backlog_count: v.count,
        backlog_fun: v.fun.toString(),
        minted_today_fun: used.toString(),
        remaining_today_fun: remaining.toString(),
        eta_days: etaDays,
      };
    }).sort((a, b) => Number(BigInt(b.backlog_fun) - BigInt(a.backlog_fun)));

    const totalFun = breakdown.reduce((s, x) => s + BigInt(x.backlog_fun), 0n);
    const totalCount = breakdown.reduce((s, x) => s + x.backlog_count, 0);
    const maxEta = breakdown.reduce((m, x) => Math.max(m, x.eta_days), 0);

    return new Response(JSON.stringify({
      success: true,
      total_backlog_count: totalCount,
      total_backlog_fun: totalFun.toString(),
      max_eta_days: maxEta,
      soft_cap_per_action_fun: SOFT_CAP_FUN.toString(),
      breakdown,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
