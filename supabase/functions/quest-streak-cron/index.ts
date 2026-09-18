// Daily streak cron — resets streaks for users who missed yesterday (consume freeze pass if any)
// Runs at 23:55 UTC. Refills 1 freeze pass per month for T2+ users.
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

    const today = new Date();
    const yesterdayStr = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1))
      .toISOString().slice(0, 10);
    const todayStr = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      .toISOString().slice(0, 10);

    // Find users whose last_active is older than yesterday and current_streak > 0
    const { data: stale } = await supabase
      .from('quest_streaks')
      .select('user_id, current_streak, freeze_passes_remaining, last_active_date')
      .gt('current_streak', 0)
      .lt('last_active_date', yesterdayStr);

    let consumed = 0, reset = 0;
    for (const row of stale ?? []) {
      // If freeze pass available AND missed exactly 1 day → consume
      const lastDate = row.last_active_date;
      const daysMissed = Math.floor((Date.parse(todayStr) - Date.parse(lastDate)) / 86400000);
      if (daysMissed === 1 && (row.freeze_passes_remaining ?? 0) > 0) {
        await supabase.from('quest_streaks').update({
          freeze_passes_remaining: row.freeze_passes_remaining - 1,
          last_active_date: yesterdayStr,
          updated_at: new Date().toISOString(),
        }).eq('user_id', row.user_id);
        consumed++;
      } else {
        await supabase.from('quest_streaks').update({
          current_streak: 0,
          updated_at: new Date().toISOString(),
        }).eq('user_id', row.user_id);
        reset++;
        // Pet event: streak_break (fire-and-forget)
        try {
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/pet-event-hook`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
            },
            body: JSON.stringify({ user_id: row.user_id, event: 'streak_break' }),
          }).catch(() => null);
        } catch { /* ignore */ }
      }
    }

    // Refill freeze pass monthly (1st of month)
    if (today.getUTCDate() === 1) {
      await supabase.rpc('quest_refill_freeze_passes' as any).catch(() => null);
      // Fallback: direct update if RPC not present
      await supabase
        .from('quest_streaks')
        .update({
          freeze_passes_remaining: 1,
          freeze_pass_refilled_at: new Date().toISOString(),
        })
        .lt('freeze_passes_remaining', 1);
    }

    return new Response(JSON.stringify({ ok: true, consumed, reset, checked: stale?.length ?? 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[quest-streak-cron] error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
