// PPLP v2.5 — VVU Calculator
// Tính Verified Value Unit cho mỗi action: VVU = B × Q × TC × IIS × IM × AAF × ERP
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalcInput {
  source_table: 'light_actions' | 'pplp_v2_user_actions';
  source_id: string;
  vvu_type?: 'personal' | 'network' | 'legacy';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const body = await req.json();
    const inputs: CalcInput[] = Array.isArray(body) ? body : [body];

    const results: any[] = [];

    for (const input of inputs) {
      const { source_table, source_id, vvu_type = 'personal' } = input;

      // 1. Fetch action
      let action: any = null;
      let user_id: string | null = null;
      let base_value = 0;
      let quality_score = 1.0;

      let action_type: string | null = null;
      if (source_table === 'light_actions') {
        const { data } = await supabase
          .from('light_actions')
          .select('user_id, action_type, base_reward, light_score, quality_score, integrity_score, impact_score, unity_score, is_eligible')
          .eq('id', source_id)
          .maybeSingle();
        if (!data || !data.is_eligible) continue;
        action = data;
        user_id = data.user_id;
        action_type = (data as any).action_type ?? null;
        base_value = Number(data.base_reward ?? data.light_score ?? 0);
        quality_score = Math.min(1.5, (Number(data.quality_score ?? 1) +
          Number(data.integrity_score ?? 1) +
          Number(data.impact_score ?? 1) +
          Number(data.unity_score ?? 1)) / 4);
      } else if (source_table === 'pplp_v2_user_actions') {
        const { data } = await supabase
          .from('pplp_v2_user_actions')
          .select('user_id, action_type_code, status')
          .eq('id', source_id)
          .maybeSingle();
        if (!data || data.status !== 'validated') continue;
        action = data;
        user_id = data.user_id;
        action_type = (data as any).action_type_code ?? null;
        base_value = 50; // default base value cho v2 actions chưa có light_score
        quality_score = 1.0;
      }

      if (!user_id) continue;

      // 1.5. Apply action override (multiplier + daily cap)
      let over_cap_factor = 1.0;
      if (action_type) {
        const { data: ovr } = await supabase
          .from('pplp_v25_action_overrides')
          .select('base_multiplier, quality_bonus, daily_cap, over_cap_multiplier, is_active')
          .eq('action_type', action_type)
          .maybeSingle();
        if (ovr && ovr.is_active !== false) {
          base_value = base_value * Number(ovr.base_multiplier ?? 1);
          quality_score = Math.min(1.5, quality_score + Number(ovr.quality_bonus ?? 0));
          if (ovr.daily_cap != null && source_table === 'light_actions') {
            const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
            const { count } = await supabase
              .from('light_actions')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user_id)
              .eq('action_type', action_type)
              .gte('created_at', since);
            if ((count ?? 0) > Number(ovr.daily_cap)) {
              over_cap_factor = Number(ovr.over_cap_multiplier ?? 0.3);
            }
          }
        }
      }

      // 2. Trust Context (TC) — ưu tiên trust_profile (Identity+Trust Layer v1.0), fallback profile.trust_level
      let trust_context = 1.0;
      const { data: didRow } = await supabase
        .from('did_registry')
        .select('did_id')
        .eq('owner_user_id', user_id)
        .maybeSingle();
      if (didRow?.did_id) {
        const { data: tp } = await supabase
          .from('trust_profile')
          .select('tc')
          .eq('did_id', didRow.did_id)
          .maybeSingle();
        if (tp?.tc != null) {
          trust_context = Number(tp.tc);
        }
      }
      if (trust_context === 1.0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('trust_level')
          .eq('id', user_id)
          .maybeSingle();
        if (profile?.trust_level != null) {
          trust_context = Number(profile.trust_level);
        }
      }
      trust_context = Math.max(0.3, Math.min(1.5, trust_context));

      // 3. IIS từ intent_metrics
      const { data: intent } = await supabase
        .from('pplp_v25_intent_metrics')
        .select('iis_value')
        .eq('user_id', user_id)
        .maybeSingle();
      const iis_value = Number(intent?.iis_value ?? 1.0);

      // 4. IM từ impact_metrics (mới nhất cho action này, fallback 1.0)
      const { data: impact } = await supabase
        .from('pplp_v25_impact_metrics')
        .select('im_value')
        .eq('user_id', user_id)
        .eq('source_id', source_id)
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const im_value = Number(impact?.im_value ?? 1.0);

      // 5. Anti-Abuse Factor — từ pplp_v2_engagements.fraud_score nếu có
      let anti_abuse_factor = 1.0;
      const { data: eng } = await supabase
        .from('pplp_v2_engagements')
        .select('fraud_score')
        .eq('action_id', source_id)
        .limit(1)
        .maybeSingle();
      if (eng?.fraud_score != null) {
        anti_abuse_factor = Math.max(0, 1 - Number(eng.fraud_score));
      }

      // 6. ERP factor — placeholder, default 1.0
      const erp_factor = 1.0;

      // 7. VVU (× over_cap_factor)
      const vvu_value = base_value * quality_score * trust_context * iis_value * im_value * anti_abuse_factor * erp_factor * over_cap_factor;

      // 8. Upsert
      const { data: logged, error } = await supabase
        .from('pplp_v25_vvu_log')
        .upsert({
          user_id,
          source_table,
          source_id,
          vvu_type,
          base_value,
          quality_score,
          trust_context,
          iis_value,
          im_value,
          anti_abuse_factor,
          erp_factor,
          vvu_value,
          computed_at: new Date().toISOString(),
        }, { onConflict: 'source_table,source_id,vvu_type' })
        .select()
        .single();

      if (error) {
        results.push({ source_id, error: error.message });
      } else {
        results.push({ source_id, vvu_value, log_id: logged.id });
      }
    }

    return new Response(JSON.stringify({ success: true, count: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
