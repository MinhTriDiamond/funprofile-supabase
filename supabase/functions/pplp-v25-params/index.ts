// PPLP v2.5 — Aggregated Parameters API
// GET ?include=events,multipliers,legacy,phase,mint
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'public, max-age=300',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const url = new URL(req.url);
    const includeParam = url.searchParams.get('include') ?? 'events,multipliers,legacy,phase,mint';
    const include = new Set(includeParam.split(',').map(s => s.trim()));

    const result: Record<string, unknown> = {};

    if (include.has('events')) {
      const { data } = await supabase
        .from('pplp_v25_event_base_values')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      result.events = data ?? [];
    }
    if (include.has('multipliers')) {
      const { data } = await supabase
        .from('pplp_v25_multiplier_ranges')
        .select('*')
        .eq('is_active', true)
        .order('multiplier_code')
        .order('sort_order');
      result.multipliers = data ?? [];
    }
    if (include.has('legacy')) {
      const { data } = await supabase
        .from('pplp_v25_legacy_params')
        .select('*')
        .eq('is_active', true)
        .order('param_code')
        .order('sort_order');
      result.legacy = data ?? [];
    }
    if (include.has('phase')) {
      const { data } = await supabase
        .from('pplp_v25_phase_config')
        .select('*');
      result.phases = data ?? [];
      result.active_phase = (data ?? []).find((p: any) => p.is_active) ?? null;
    }
    if (include.has('mint')) {
      const { data } = await supabase
        .from('pplp_v25_mint_linking_config')
        .select('*');
      result.mint_linking = data ?? [];
    }

    result.fetched_at = new Date().toISOString();

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
