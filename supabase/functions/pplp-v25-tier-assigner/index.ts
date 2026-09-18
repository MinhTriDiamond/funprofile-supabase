// PPLP v2.5 — Tier Assigner
// Gán tier theo RawLS: Seed/Pure/Guiding/Radiant/Legacy/Cosmic
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function pickTier(raw_ls: number, thresholds: Record<string, number>, multipliers: Record<string, number>) {
  const sorted = Object.entries(thresholds).sort((a, b) => a[1] - b[1]);
  let chosen = sorted[0];
  for (const t of sorted) {
    if (raw_ls >= t[1]) chosen = t;
  }
  const tier_name = chosen[0];
  const tier_level = sorted.findIndex(([n]) => n === tier_name);
  const tier_multiplier = Number(multipliers[tier_name] ?? 1.0);
  return { tier_name, tier_level, tier_multiplier };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const body = await req.json().catch(() => ({}));
    const target_user_id: string | undefined = body.user_id;

    // Load config
    const { data: cfg } = await supabase
      .from('pplp_v25_config')
      .select('tier_thresholds, tier_multipliers')
      .eq('config_key', 'default')
      .maybeSingle();
    const thresholds = cfg?.tier_thresholds ?? {};
    const multipliers = cfg?.tier_multipliers ?? {};

    // Get users with current light_scores
    let query = supabase
      .from('pplp_v25_light_scores')
      .select('user_id, raw_ls')
      .eq('is_current', true);
    if (target_user_id) query = query.eq('user_id', target_user_id);

    const { data: scores } = await query;
    let processed = 0;

    for (const row of scores ?? []) {
      const { user_id, raw_ls } = row;
      const { tier_name, tier_level, tier_multiplier } = pickTier(Number(raw_ls ?? 0), thresholds, multipliers);

      // Check if changed
      const { data: current } = await supabase
        .from('pplp_v25_tier_assignments')
        .select('tier_name')
        .eq('user_id', user_id)
        .eq('is_current', true)
        .maybeSingle();

      if (current?.tier_name === tier_name) {
        // Just update profile to be safe
        await supabase.from('profiles').update({ light_tier: tier_name }).eq('id', user_id);
        continue;
      }

      // Promote/demote: mark old as not current, insert new
      await supabase
        .from('pplp_v25_tier_assignments')
        .update({ is_current: false })
        .eq('user_id', user_id)
        .eq('is_current', true);

      await supabase.from('pplp_v25_tier_assignments').insert({
        user_id,
        tier_name,
        tier_level,
        tier_multiplier,
        raw_ls_at_assignment: raw_ls,
        is_current: true,
      });

      await supabase.from('profiles').update({ light_tier: tier_name }).eq('id', user_id);

      processed++;
    }

    return new Response(JSON.stringify({ success: true, processed, total: (scores ?? []).length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
