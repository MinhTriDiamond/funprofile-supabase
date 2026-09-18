// PPLP v2.5 — Mint Preview
// Mint = ΔLS_window × mint_base_rate × TC^tc_weight × SI^stability_weight
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
    const user_id: string | undefined = body.user_id;
    if (!user_id) {
      // Try get from JWT
      const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
      if (!auth) {
        return new Response(JSON.stringify({ error: 'user_id or auth required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: user } = await supabase.auth.getUser(auth);
      if (!user.user) {
        return new Response(JSON.stringify({ error: 'invalid auth' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      body.user_id = user.user.id;
    }
    const uid = body.user_id;

    // 1. Active phase + mint linking
    const { data: phase } = await supabase
      .from('pplp_v25_phase_config')
      .select('phase_name, alpha, beta, gamma')
      .eq('is_active', true)
      .maybeSingle();
    const phaseName = phase?.phase_name ?? 'early';

    const { data: linking } = await supabase
      .from('pplp_v25_mint_linking_config')
      .select('*')
      .eq('phase_name', phaseName)
      .maybeSingle();

    const mint_base_rate = Number(linking?.mint_base_rate ?? 1.0);
    const tc_weight = Number(linking?.tc_weight ?? 1.0);
    const stability_weight = Number(linking?.stability_weight ?? 1.0);
    const window_days = Number(linking?.delta_ls_window_days ?? 7);
    const min_tc = Number(linking?.min_tc_to_mint ?? 0.8);
    const max_mint = Number(linking?.max_mint_per_epoch_per_user ?? 1000);

    // 2. ΔLS over window
    const sinceISO = new Date(Date.now() - window_days * 86400_000).toISOString();
    const { data: scores } = await supabase
      .from('pplp_v25_light_scores')
      .select('raw_ls, created_at')
      .eq('user_id', uid)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: true });

    let delta_ls = 0;
    if (scores && scores.length >= 2) {
      delta_ls = Math.max(0, Number(scores[scores.length - 1].raw_ls) - Number(scores[0].raw_ls));
    } else if (scores && scores.length === 1) {
      delta_ls = Number(scores[0].raw_ls);
    }

    // 3. TC + Trust Tier + Sybil Risk từ Identity+Trust Layer (fallback profile.trust_level)
    let tc = 1.0;
    let trust_tier: string = 'T1';
    let sybil_risk: string = 'low';
    let did_level: string = 'L0';
    const { data: didRow } = await supabase
      .from('did_registry')
      .select('did_id, did_level')
      .eq('owner_user_id', uid)
      .maybeSingle();
    if (didRow?.did_id) {
      did_level = String(didRow.did_level ?? 'L0');
      const { data: tp } = await supabase
        .from('trust_profile')
        .select('tc, trust_tier, sybil_risk')
        .eq('did_id', didRow.did_id)
        .maybeSingle();
      if (tp) {
        tc = Number(tp.tc ?? 1.0);
        trust_tier = String(tp.trust_tier ?? 'T1');
        sybil_risk = String(tp.sybil_risk ?? 'low');
      }
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('trust_level')
        .eq('id', uid)
        .maybeSingle();
      tc = Number(profile?.trust_level ?? 1.0);
    }
    tc = Math.max(0.3, Math.min(1.5, tc));

    // 4. SI mới nhất
    const { data: si } = await supabase
      .from('pplp_v25_stability_index')
      .select('stability_index')
      .eq('user_id', uid)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const stability_index = Number(si?.stability_index ?? 1.0);

    // 5. Identity gates (Phase 3 hook)
    const sybilBlocked = sybil_risk === 'critical';
    const sybilPenalty = sybil_risk === 'high' ? 0.5 : sybil_risk === 'medium' ? 0.85 : 1.0;
    const tierAllowed = ['T1', 'T2', 'T3', 'T4'].includes(trust_tier);

    // 6. Mint formula
    const eligible = tc >= min_tc && !sybilBlocked && tierAllowed;
    const raw_mint = delta_ls * mint_base_rate * Math.pow(tc, tc_weight) * Math.pow(stability_index, stability_weight) * sybilPenalty;
    const mint_estimate = eligible ? Math.min(max_mint, Math.max(0, raw_mint)) : 0;

    const gate_reason = !tierAllowed
      ? `Trust Tier ${trust_tier} chưa đủ để mint (cần ≥ T1)`
      : sybilBlocked
        ? 'Sybil risk critical — mint bị khoá, vui lòng review'
        : tc < min_tc
          ? `TC ${tc.toFixed(2)} < min ${min_tc}`
          : null;

    return new Response(JSON.stringify({
      success: true,
      data: {
        phase: phaseName,
        delta_ls, window_days,
        tc, stability_index,
        trust_tier, sybil_risk, did_level,
        mint_base_rate, tc_weight, stability_weight,
        min_tc_to_mint: min_tc, max_mint_per_epoch_per_user: max_mint,
        eligible, raw_mint, mint_estimate,
        gate_reason,
        formula: 'ΔLS × base_rate × TC^tc_w × SI^sta_w × SybilPenalty',
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
