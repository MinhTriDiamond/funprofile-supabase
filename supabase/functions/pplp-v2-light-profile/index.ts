import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch all actions
    const { data: actions } = await supabase.from('pplp_v2_user_actions')
      .select('id, action_type_code, title, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const validatedActions = (actions || []).filter(a => ['validated', 'minted'].includes(a.status));
    const totalActions = actions?.length || 0;

    // 2. Fetch validations for pillar summary
    const actionIds = validatedActions.map(a => a.id);
    let pillarSummary = { serving_life: 0, transparent_truth: 0, healing_love: 0, long_term_value: 0, unity_over_separation: 0 };

    if (actionIds.length > 0) {
      const { data: validations } = await supabase.from('pplp_v2_validations')
        .select('serving_life, transparent_truth, healing_love, long_term_value, unity_over_separation, final_light_score')
        .in('action_id', actionIds)
        .eq('validation_status', 'validated');

      if (validations && validations.length > 0) {
        for (const v of validations) {
          pillarSummary.serving_life += Number(v.serving_life);
          pillarSummary.transparent_truth += Number(v.transparent_truth);
          pillarSummary.healing_love += Number(v.healing_love);
          pillarSummary.long_term_value += Number(v.long_term_value);
          pillarSummary.unity_over_separation += Number(v.unity_over_separation);
        }
        const count = validations.length;
        pillarSummary.serving_life = Math.round((pillarSummary.serving_life / count) * 100) / 100;
        pillarSummary.transparent_truth = Math.round((pillarSummary.transparent_truth / count) * 100) / 100;
        pillarSummary.healing_love = Math.round((pillarSummary.healing_love / count) * 100) / 100;
        pillarSummary.long_term_value = Math.round((pillarSummary.long_term_value / count) * 100) / 100;
        pillarSummary.unity_over_separation = Math.round((pillarSummary.unity_over_separation / count) * 100) / 100;
      }
    }

    // 3. Total FUN minted
    const { data: mintRecords } = await supabase.from('pplp_v2_mint_records')
      .select('mint_amount_user, mint_amount_total')
      .eq('user_id', user.id);

    const totalFunMinted = (mintRecords || []).reduce((s, r) => s + Number(r.mint_amount_user), 0);

    // 4. Streak calculation
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase.from('pplp_v2_user_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['validated', 'minted'])
      .gte('created_at', sevenDaysAgo);

    // 5. Trust level + lifetime score from profiles (NEW: read from DB columns)
    const { data: profile } = await supabase.from('profiles')
      .select('created_at, trust_level, total_light_score').eq('id', user.id).single();
    
    const accountAgeDays = profile
      ? (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    const trustLevelNumeric = Number(profile?.trust_level) || 1.0;
    const lifetimeLightScore = Number(profile?.total_light_score) || 0;

    // Derive human-readable trust level label
    let trustLevelLabel = 'newcomer';
    if (trustLevelNumeric >= 1.20 && validatedActions.length > 50) trustLevelLabel = 'trusted';
    else if (trustLevelNumeric >= 1.10 && validatedActions.length > 20) trustLevelLabel = 'established';
    else if (trustLevelNumeric >= 1.05 && validatedActions.length > 5) trustLevelLabel = 'active';

    // 6. Balance ledger summary
    const { data: ledger } = await supabase.from('pplp_v2_balance_ledger')
      .select('entry_type, amount')
      .eq('user_id', user.id);

    const ledgerSummary: Record<string, number> = {};
    for (const entry of (ledger || [])) {
      ledgerSummary[entry.entry_type] = (ledgerSummary[entry.entry_type] || 0) + Number(entry.amount);
    }

    // 7. Attendance count
    const { count: attendanceCount } = await supabase.from('pplp_v2_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return new Response(JSON.stringify({
      user_id: user.id,
      trust_level: trustLevelNumeric,
      total_light_score: Math.round(lifetimeLightScore * 100) / 100,
      total_fun_minted: Math.round(totalFunMinted * 100) / 100,
      streak_days: recentCount || 0,
      recent_actions: totalActions,
      pillar_summary: {
        serving_life_avg: pillarSummary.serving_life,
        transparent_truth_avg: pillarSummary.transparent_truth,
        healing_love_avg: pillarSummary.healing_love,
        long_term_value_avg: pillarSummary.long_term_value,
        unity_over_separation_avg: pillarSummary.unity_over_separation,
      },
      total_actions: totalActions,
      validated_actions: validatedActions.length,
      trust_level_label: trustLevelLabel,
      ledger_summary: ledgerSummary,
      attendance_count: attendanceCount || 0,
      account_age_days: Math.round(accountAgeDays),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[LightProfile] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
