// Quest evaluator — pull-based reconciliation
// Scans recent user activity and calls quest_set_progress / quest_record_progress for each quest.
// Called from /quests page on load and from streak cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function todayUtcStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}
function weekUtcStart(): string {
  const d = new Date();
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day - 1)));
  return monday.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    let user_id: string | undefined;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      user_id = body.user_id;
    }

    // Allow self-evaluation via JWT
    if (!user_id) {
      const auth = req.headers.get('Authorization');
      if (auth?.startsWith('Bearer ')) {
        const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
        user_id = user?.id;
      }
    }
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const today = todayUtcStart();
    const week = weekUtcStart();
    const results: Record<string, any> = {};

    // 1. DAILY_INNER_WORK_POST
    const { count: innerCount } = await supabase
      .from('light_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('action_type', 'INNER_WORK')
      .gte('created_at', today);
    if ((innerCount ?? 0) > 0) {
      const { data } = await supabase.rpc('quest_set_progress', {
        p_user_id: user_id, p_quest_code: 'DAILY_INNER_WORK_POST', p_set_to: innerCount,
      });
      results.DAILY_INNER_WORK_POST = data;
    }

    // 2. DAILY_GIFT_ANY (donations sender today, status=confirmed)
    const { count: giftCount } = await supabase
      .from('donations')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', user_id)
      .gte('created_at', today)
      .in('status', ['confirmed', 'success', 'completed']);
    if ((giftCount ?? 0) > 0) {
      const { data } = await supabase.rpc('quest_set_progress', {
        p_user_id: user_id, p_quest_code: 'DAILY_GIFT_ANY', p_set_to: giftCount,
      });
      results.DAILY_GIFT_ANY = data;
    }

    // 3. DAILY_REACT_5 (reactions on others' posts) — count chính xác via join filter
    const { count: reactCount } = await supabase
      .from('reactions')
      .select('id, posts!inner(user_id)', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .neq('posts.user_id', user_id)
      .gte('created_at', today);
    if ((reactCount ?? 0) > 0) {
      const { data } = await supabase.rpc('quest_set_progress', {
        p_user_id: user_id, p_quest_code: 'DAILY_REACT_5', p_set_to: Math.min(reactCount!, 5),
      });
      results.DAILY_REACT_5 = data;
    }

    // 4. DAILY_COMMENT_3
    const { count: commentCount } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .gte('created_at', today);
    if ((commentCount ?? 0) > 0) {
      const { data } = await supabase.rpc('quest_set_progress', {
        p_user_id: user_id, p_quest_code: 'DAILY_COMMENT_3', p_set_to: Math.min(commentCount, 3),
      });
      results.DAILY_COMMENT_3 = data;
    }

    // 5. ONCE_IDENTITY_ONBOARD: check identity_events for onboarding_complete
    const { data: didRow } = await supabase
      .from('did_registry').select('did_id').eq('owner_user_id', user_id).maybeSingle();
    if (didRow?.did_id) {
      const { count: onbCount } = await supabase
        .from('identity_events')
        .select('id', { count: 'exact', head: true })
        .eq('did_id', didRow.did_id)
        .eq('event_type', 'onboarding_complete');
      if ((onbCount ?? 0) > 0) {
        const { data } = await supabase.rpc('quest_set_progress', {
          p_user_id: user_id, p_quest_code: 'ONCE_IDENTITY_ONBOARD', p_set_to: 1,
        });
        results.ONCE_IDENTITY_ONBOARD = data;
      }
    }

    // 6. WEEKLY_LOGIN_STREAK_7 (distinct days with login this week)
    const { data: logins } = await supabase
      .from('login_ip_logs')
      .select('created_at')
      .eq('user_id', user_id)
      .gte('created_at', week);
    const distinctDays = new Set((logins ?? []).map((r: any) => (r.created_at as string).slice(0, 10))).size;
    if (distinctDays > 0) {
      const { data } = await supabase.rpc('quest_set_progress', {
        p_user_id: user_id, p_quest_code: 'WEEKLY_LOGIN_STREAK_7', p_set_to: Math.min(distinctDays, 7),
      });
      results.WEEKLY_LOGIN_STREAK_7 = data;
    }

    // 7. Trigger SBT check after evaluation
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/quest-sbt-trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
        },
        body: JSON.stringify({ user_id }),
      });
    } catch (e) {
      console.error('[quest-evaluate] sbt-trigger failed:', e);
    }

    // Fire pet event (fire-and-forget) — login/active signal
    try {
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/pet-event-hook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
        },
        body: JSON.stringify({ user_id, event: 'quest_completed' }),
      }).catch(() => null);
    } catch { /* ignore */ }

    // Mystery Box: quest_complete (1 lần / quest_code / ngày, RPC tự dedupe)
    try {
      const { grantMysteryBox } = await import('../_shared/grantMysteryBox.ts');
      const today = new Date().toISOString().slice(0, 10);
      for (const code of Object.keys(results)) {
        grantMysteryBox({
          user_id,
          source: 'quest_complete',
          source_ref_id: `${code}:${today}`,
        }).catch(() => null);
      }

      // Streak 7d / 30d theo quest_streaks.current_streak
      const { data: streak } = await supabase
        .from('quest_streaks')
        .select('current_streak')
        .eq('user_id', user_id)
        .maybeSingle();
      const cs = streak?.current_streak ?? 0;
      if (cs === 7 || cs === 30) {
        grantMysteryBox({
          user_id,
          source: cs === 7 ? 'streak_7d' : 'streak_30d',
          source_ref_id: `streak:${cs}:${today}`,
          box_code: cs === 30 ? 'epic' : 'rare',
        }).catch(() => null);
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ ok: true, user_id, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[quest-evaluate] error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
