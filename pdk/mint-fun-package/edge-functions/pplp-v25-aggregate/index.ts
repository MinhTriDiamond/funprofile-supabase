// PPLP v2.5 — Light Score Aggregator
// PLS = Σ VVU_personal × C × R; NLS = Σ VVU_network × QN × TN × DN; LLS = Σ VVU_legacy
// TLS = α·PLS + β·NLS + γ·LLS; RawLS = TLS; DisplayLS = 100·log(1+RawLS)
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

    // Load active phase config (α/β/γ) — fallback v25_config legacy
    const { data: activePhase } = await supabase
      .from('pplp_v25_phase_config')
      .select('alpha, beta, gamma')
      .eq('is_active', true)
      .maybeSingle();

    const { data: cfg } = await supabase
      .from('pplp_v25_config')
      .select('alpha, beta, gamma, display_compression')
      .eq('config_key', 'default')
      .maybeSingle();
    const alpha = Number(activePhase?.alpha ?? cfg?.alpha ?? 0.4);
    const beta  = Number(activePhase?.beta  ?? cfg?.beta  ?? 0.3);
    const gamma = Number(activePhase?.gamma ?? cfg?.gamma ?? 0.3);

    // Get user list
    let userIds: string[] = [];
    if (target_user_id) {
      userIds = [target_user_id];
    } else {
      const { data } = await supabase
        .from('pplp_v25_vvu_log')
        .select('user_id');
      userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id))).filter(Boolean);
    }

    let processed = 0;
    const epoch_label = new Date().toISOString().slice(0, 10);

    for (const user_id of userIds) {
      // Sum VVU by type
      const { data: vvuRows } = await supabase
        .from('pplp_v25_vvu_log')
        .select('vvu_type, vvu_value')
        .eq('user_id', user_id);

      let sumPersonal = 0, sumNetwork = 0, sumLegacy = 0;
      for (const r of vvuRows ?? []) {
        const v = Number(r.vvu_value ?? 0);
        if (r.vvu_type === 'network') sumNetwork += v;
        else if (r.vvu_type === 'legacy') sumLegacy += v;
        else sumPersonal += v;
      }

      // Consistency & Reliability multipliers from light_reputation
      const { data: rep } = await supabase
        .from('light_reputation')
        .select('consistency_streak, sequence_bonus, actions_count')
        .eq('user_id', user_id)
        .maybeSingle();

      const streak = Number(rep?.consistency_streak ?? 0);
      const consistency_multiplier = Math.max(0.9, Math.min(1.3, 1 + Math.log(1 + streak) / 10));
      const reliability_multiplier = Math.max(0.5, Math.min(1.2, 1 + Number(rep?.sequence_bonus ?? 0)));

      const pls = sumPersonal * consistency_multiplier * reliability_multiplier;
      const nls = sumNetwork * consistency_multiplier;
      const lls = sumLegacy;

      const tls = alpha * pls + beta * nls + gamma * lls;
      const raw_ls = tls;
      const display_ls = 100 * Math.log(1 + Math.max(0, raw_ls));

      // Mark old current as not current
      await supabase
        .from('pplp_v25_light_scores')
        .update({ is_current: false })
        .eq('user_id', user_id)
        .eq('is_current', true);

      await supabase.from('pplp_v25_light_scores').insert({
        user_id,
        epoch_label,
        pls, nls, lls, tls,
        raw_ls, display_ls,
        consistency_multiplier, reliability_multiplier,
        alpha, beta, gamma,
        is_current: true,
      });

      // Sync to profiles
      await supabase.from('profiles').update({
        raw_light_score: raw_ls,
        display_light_score: display_ls,
      }).eq('id', user_id);

      processed++;
    }

    return new Response(JSON.stringify({ success: true, processed, alpha, beta, gamma }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
