// PPLP v2.5 — Stability Index daily calculator
// SI = clamp(0, 1.5, w_v*(1-volatility) + w_b*behavior + w_n*network)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const body = await req.json().catch(() => ({}));
    const target_user_id: string | undefined = body.user_id;

    let userIds: string[];
    if (target_user_id) {
      userIds = [target_user_id];
    } else {
      const { data } = await supabase
        .from('pplp_v25_vvu_log')
        .select('user_id');
      userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id))).filter(Boolean);
    }

    const today = new Date().toISOString().slice(0, 10);
    const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
    let processed = 0;

    for (const user_id of userIds) {
      // 1. Volatility = stddev(daily_vvu) trên 30 ngày
      const { data: rows } = await supabase
        .from('pplp_v25_vvu_log')
        .select('vvu_value, computed_at')
        .eq('user_id', user_id)
        .gte('computed_at', since30d);

      const dailyMap = new Map<string, number>();
      for (const r of rows ?? []) {
        const d = String(r.computed_at).slice(0, 10);
        dailyMap.set(d, (dailyMap.get(d) ?? 0) + Number(r.vvu_value ?? 0));
      }
      const values = Array.from(dailyMap.values());
      let volatility = 0;
      if (values.length > 1) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
        const std = Math.sqrt(variance);
        volatility = mean > 0 ? Math.min(1, std / mean) : 0;
      }

      // 2. Behavior consistency từ light_reputation
      const { data: rep } = await supabase
        .from('light_reputation')
        .select('consistency_streak, actions_count')
        .eq('user_id', user_id)
        .maybeSingle();
      const streak = Number(rep?.consistency_streak ?? 0);
      const behavior_consistency = Math.max(0, Math.min(1, streak / 30));

      // 3. Network stability — fallback 0.8
      const network_stability = 0.8;

      // 4. SI composite
      const si_raw = 0.4 * (1 - volatility) + 0.3 * behavior_consistency + 0.3 * network_stability;
      const stability_index = Math.max(0, Math.min(1.5, si_raw * 1.5));

      await supabase.from('pplp_v25_stability_index').upsert({
        user_id,
        snapshot_date: today,
        ls_volatility_30d: volatility,
        behavior_consistency,
        network_stability,
        stability_index,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,snapshot_date' });

      processed++;
    }

    return new Response(JSON.stringify({ success: true, processed, snapshot_date: today }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
