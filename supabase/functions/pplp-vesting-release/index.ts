/**
 * PPLP Vesting Release — Daily cron
 * Tự động mở dần phần locked thành claimable theo công thức:
 *   Unlockable = BaseVesting + ContributionUnlock + UsageUnlock + ConsistencyUnlock
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

    const { data: cfg } = await supabase
      .from('epoch_config').select('*').eq('config_key', 'default').single();
    if (!cfg) throw new Error('No epoch_config');

    const baseVestingDays = Number(cfg.base_vesting_days) || 28;
    const checkIntervalDays = Number(cfg.unlock_check_interval_days) || 7;
    const baseUnlockPerCheck = 1 / Math.ceil(baseVestingDays / checkIntervalDays); // ~25% mỗi tuần

    const now = new Date();

    // Lấy tất cả vesting đang active đến hạn check
    const { data: schedules, error } = await supabase
      .from('reward_vesting_schedules').select('*')
      .eq('status', 'active')
      .lte('next_unlock_check_at', now.toISOString())
      .gt('remaining_locked', 0)
      .limit(500);

    if (error) throw error;
    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let unlocked = 0, completed = 0;
    for (const s of schedules) {
      const remainingLocked = Number(s.remaining_locked);
      const lockedAmount = Number(s.locked_amount);

      // BaseVesting: % cố định mỗi check
      let unlockable = lockedAmount * baseUnlockPerCheck;

      // ContributionUnlock: bonus +20% nếu user có activity v2 trong 7 ngày qua
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const { count: recentActions } = await supabase
        .from('pplp_v2_user_actions').select('id', { count: 'exact', head: true })
        .eq('user_id', s.user_id).gte('created_at', since);
      if ((recentActions ?? 0) > 0) unlockable *= 1.2;

      // ConsistencyUnlock: bonus +10% nếu có >=3 ngày active
      if ((recentActions ?? 0) >= 3) unlockable *= 1.1;

      // Cap không vượt remaining
      unlockable = Math.min(unlockable, remainingLocked);
      if (unlockable < 1) continue;

      const newRemaining = remainingLocked - unlockable;
      const newReleased = Number(s.released_amount) + unlockable;
      const isComplete = newRemaining <= 0;

      const history = Array.isArray(s.unlock_history) ? s.unlock_history : [];
      history.push({
        at: now.toISOString(),
        amount: Math.floor(unlockable),
        bonus_applied: (recentActions ?? 0) > 0,
        consistency_bonus: (recentActions ?? 0) >= 3,
      });

      await supabase.from('reward_vesting_schedules').update({
        remaining_locked: newRemaining,
        released_amount: newReleased,
        unlock_history: history,
        next_unlock_check_at: new Date(Date.now() + checkIntervalDays * 86400_000).toISOString(),
        status: isComplete ? 'completed' : 'active',
      }).eq('id', s.id);

      if (isComplete) completed++;
      unlocked++;

      // Notification để user thấy
      await supabase.from('notifications').insert({
        user_id: s.user_id,
        type: 'vesting_unlocked',
        title: '🌟 Phần thưởng Ánh Sáng đang mở dần',
        message: `Bạn vừa mở thêm ${Math.floor(unlockable).toLocaleString()} FUN. Sẵn sàng sử dụng!`,
        metadata: { schedule_id: s.id, amount: Math.floor(unlockable), epoch_id: s.epoch_id },
      }).then(() => null).catch(() => null);
    }

    console.log(`[VESTING-RELEASE] processed=${schedules.length} unlocked=${unlocked} completed=${completed}`);
    return new Response(JSON.stringify({ success: true, processed: schedules.length, unlocked, completed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[VESTING-RELEASE] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
