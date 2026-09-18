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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authenticate user with their token
    const userSupabase = createClient(supabaseUrl, (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    console.log(`[PPLP] Getting light score for user ${userId}`);

    // Call the RPC function to get user light score (v1)
    const { data, error } = await supabase.rpc('get_user_light_score', {
      p_user_id: userId
    });

    if (error) {
      console.error('[PPLP] RPC error:', error);
      return new Response(JSON.stringify({ error: 'Failed to get light score' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current epoch stats (VN timezone)
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowVN = new Date(Date.now() + VN_OFFSET_MS);
    const today = `${nowVN.getUTCFullYear()}-${String(nowVN.getUTCMonth()+1).padStart(2,'0')}-${String(nowVN.getUTCDate()).padStart(2,'0')}`;
    const { data: epochData } = await supabase
      .from('mint_epochs')
      .select('*')
      .eq('epoch_date', today)
      .single();

    // Get streak data from light_reputation
    const { data: repData } = await supabase
      .from('light_reputation')
      .select('consistency_streak, last_active_date, sequence_bonus')
      .eq('user_id', userId)
      .single();

    // Get dimension scores
    const { data: dimensionData } = await supabase
      .from('user_dimension_scores')
      .select('*')
      .eq('user_id', userId)
      .single();

    // ===== PHASE 4: Unified v1+v2 data =====
    const { data: unifiedData } = await supabase
      .rpc('get_unified_light_score', { p_user_id: userId });

    const unified = unifiedData?.[0] ?? null;

    // Get recent v2 actions for display
    const { data: v2Actions } = await supabase
      .from('pplp_v2_user_actions')
      .select('id, action_code, action_group, description, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get v2 validations for those actions
    let v2Validations: any[] = [];
    if (v2Actions && v2Actions.length > 0) {
      const actionIds = v2Actions.map(a => a.id);
      const { data: vals } = await supabase
        .from('pplp_v2_validations')
        .select('action_id, validation_status, final_light_score, pillar_scores, created_at')
        .in('action_id', actionIds);
      v2Validations = vals || [];
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        ...data,
        consistency_streak: repData?.consistency_streak ?? 0,
        sequence_bonus: repData?.sequence_bonus ?? 0,
        epoch: epochData || {
          epoch_date: today,
          total_minted: 0,
          total_cap: 10000000,
        },
        dimensions: dimensionData ? {
          identity: Number(dimensionData.identity_score),
          activity: Number(dimensionData.activity_score),
          onchain: Number(dimensionData.onchain_score),
          transparency: Number(dimensionData.transparency_score),
          ecosystem: Number(dimensionData.ecosystem_score),
        } : null,
        dimension_total: dimensionData ? Number(dimensionData.total_light_score) : null,
        dimension_level: dimensionData?.level_name ?? null,
        risk_penalty: dimensionData ? Number(dimensionData.risk_penalty) : 0,
        streak_bonus_pct: dimensionData ? Number(dimensionData.streak_bonus_pct) : 0,
        inactive_days: dimensionData?.inactive_days ?? 0,
        decay_applied: dimensionData?.decay_applied ?? false,
        // ===== v2 unified data =====
        v2: unified ? {
          v2_light_score: Number(unified.v2_light_score),
          v2_actions_count: Number(unified.v2_actions_count),
          v2_minted_amount: Number(unified.v2_minted_amount),
          combined_light_score: Number(unified.combined_light_score),
          combined_actions_count: Number(unified.combined_actions_count),
          recent_v2_actions: (v2Actions || []).map(a => {
            const val = v2Validations.find((v: any) => v.action_id === a.id);
            return {
              id: a.id,
              action_code: a.action_code,
              action_group: a.action_group,
              description: a.description,
              status: a.status,
              created_at: a.created_at,
              validation: val ? {
                status: val.validation_status,
                light_score: Number(val.final_light_score),
                pillar_scores: val.pillar_scores,
              } : null,
            };
          }),
        } : null,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[PPLP] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
