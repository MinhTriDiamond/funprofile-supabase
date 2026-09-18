// PPLP v2.5 — Intent Integrity Score (IIS) Calculator
// Tính IIS dựa trên consistency, farm_ratio, manipulation, purity (window 30 ngày)
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

    // Lấy danh sách user cần tính
    let userIds: string[] = [];
    if (target_user_id) {
      userIds = [target_user_id];
    } else {
      const { data } = await supabase
        .from('light_actions')
        .select('user_id')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());
      userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id))).filter(Boolean);
    }

    let processed = 0;
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    for (const user_id of userIds) {
      // Pull actions in window
      const { data: actions } = await supabase
        .from('light_actions')
        .select('id, created_at, integrity_score, integrity_penalty, is_eligible')
        .eq('user_id', user_id)
        .gte('created_at', since);

      const arr = actions ?? [];
      const total = arr.length;
      if (total === 0) continue;

      // Consistency: số ngày unique active / 30
      const days = new Set(arr.map((a: any) => a.created_at.slice(0, 10)));
      const consistency_score = Math.min(1.5, days.size / 15); // ~15 ngày active = 1.0

      // Farm ratio: actions có integrity_penalty > 0
      const flagged = arr.filter((a: any) => Number(a.integrity_penalty ?? 0) > 0).length;
      const farm_ratio = total > 0 ? flagged / total : 0;

      // Manipulation: từ pplp_v2_engagements
      const { count: manipCount } = await supabase
        .from('pplp_v2_engagements')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .gte('created_at', since)
        .gte('fraud_score', 0.5);
      const manipulation_score = total > 0 ? Math.min(1, (manipCount ?? 0) / total) : 0;

      // Purity bonus: nếu integrity_score trung bình cao và farm ratio thấp
      const avgIntegrity = arr.reduce((s: number, a: any) => s + Number(a.integrity_score ?? 1), 0) / total;
      const purity_bonus = (avgIntegrity > 1.1 && farm_ratio < 0.05) ? 0.3 : 0;

      // IIS = base × purity factors, clamp 0..1.5
      let iis_value = consistency_score * (1 - farm_ratio) * (1 - manipulation_score) + purity_bonus;
      iis_value = Math.max(0, Math.min(1.5, iis_value));

      await supabase.from('pplp_v25_intent_metrics').upsert({
        user_id,
        consistency_score,
        farm_ratio,
        manipulation_score,
        purity_bonus,
        iis_value,
        computed_window_days: 30,
        last_computed_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // Sync to profiles
      await supabase.from('profiles').update({ iis_value }).eq('id', user_id);

      processed++;
    }

    return new Response(JSON.stringify({ success: true, processed, total: userIds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
