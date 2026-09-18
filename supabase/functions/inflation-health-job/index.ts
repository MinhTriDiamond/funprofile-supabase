/**
 * Inflation Health Job — Daily cron
 * Tính 5 health ratios + safe mode triggers
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
    if (!authHeader || (authHeader !== `Bearer ${serviceKey}` && authHeader !== `Bearer ${anonKey}`)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey!);
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();

    // 1. Total supply (sum mint_amount_user from v2 mint records)
    const { data: mintData } = await supabase
      .from('pplp_v2_mint_records').select('mint_amount_user, mint_amount_platform');
    const totalSupply = (mintData || []).reduce((s, r) =>
      s + Number(r.mint_amount_user) + Number(r.mint_amount_platform), 0);

    // 2. Locked supply
    const { data: vesting } = await supabase
      .from('reward_vesting_schedules').select('remaining_locked').eq('status', 'active');
    const lockedSupply = (vesting || []).reduce((s, r) => s + Number(r.remaining_locked), 0);
    const circulatingSupply = totalSupply - lockedSupply;

    // 3. Verified value growth (30d)
    const { data: recentValidations } = await supabase
      .from('pplp_v2_validations').select('final_light_score').gte('created_at', since);
    const verifiedValue = (recentValidations || []).reduce((s, r) => s + Number(r.final_light_score), 0);

    // 4. Recent supply growth (30d)
    const { data: recentMints } = await supabase
      .from('pplp_v2_mint_records').select('mint_amount_user').gte('created_at', since);
    const supplyGrowth = (recentMints || []).reduce((s, r) => s + Number(r.mint_amount_user), 1);

    // 5. Active quality users (30d)
    const { data: activeUsers } = await supabase
      .from('pplp_v2_user_actions').select('user_id').gte('created_at', since);
    const uniqueActive = new Set((activeUsers || []).map(r => r.user_id)).size;

    // 6. Claiming users
    const { count: claimingUsers } = await supabase
      .from('reward_vesting_schedules').select('user_id', { count: 'exact', head: true }).eq('status', 'active');

    // 7. Fraud signals 30d
    const { data: fraudSignals } = await supabase
      .from('pplp_v2_fraud_signals').select('id').gte('created_at', since);
    const totalActivity = (activeUsers || []).length;

    // === Compute ratios ===
    const valueExpansionRatio = verifiedValue / Math.max(1, supplyGrowth);
    const utilityAbsorptionRatio = 1.0; // placeholder — requires service usage tracking
    const retentionQualityRatio = uniqueActive / Math.max(1, claimingUsers || 1);
    const fraudPressureRatio = (fraudSignals?.length || 0) / Math.max(1, totalActivity);
    const lockedStabilityRatio = lockedSupply / Math.max(1, totalSupply);

    // Safe mode
    let safeMode = 'normal';
    const alerts: string[] = [];
    if (fraudPressureRatio > 0.15) { safeMode = 'higher_lock_mode'; alerts.push('Fraud pressure cao'); }
    if (valueExpansionRatio < 0.3) { safeMode = 'low_issuance_mode'; alerts.push('Value expansion thấp'); }
    if (lockedStabilityRatio < 0.3) alerts.push('Locked stability thấp');

    await supabase.from('inflation_health_metrics').insert({
      value_expansion_ratio: valueExpansionRatio,
      utility_absorption_ratio: utilityAbsorptionRatio,
      retention_quality_ratio: retentionQualityRatio,
      fraud_pressure_ratio: fraudPressureRatio,
      locked_stability_ratio: lockedStabilityRatio,
      total_supply: totalSupply,
      circulating_supply: circulatingSupply,
      locked_supply: lockedSupply,
      safe_mode: safeMode,
      alerts,
    });

    console.log(`[INFLATION-HEALTH] supply=${totalSupply} locked=${lockedSupply} mode=${safeMode}`);
    return new Response(JSON.stringify({
      success: true,
      ratios: { valueExpansionRatio, utilityAbsorptionRatio, retentionQualityRatio, fraudPressureRatio, lockedStabilityRatio },
      supply: { total: totalSupply, circulating: circulatingSupply, locked: lockedSupply },
      safe_mode: safeMode,
      alerts,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[INFLATION-HEALTH] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
