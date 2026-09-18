// SBT trigger — checks 5 quest SBT criteria for a user and issues if eligible
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function issueSbt(supabase: any, did_id: string, sbt_type: string, metadata: Record<string, any> = {}) {
  try {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/identity-sbt-issue`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
      },
      body: JSON.stringify({ did_id, sbt_type, issuer: 'quest_system', metadata }),
    });
    return await r.json();
  } catch (e) {
    console.error('[quest-sbt] issue failed', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: didRow } = await supabase
      .from('did_registry').select('did_id').eq('owner_user_id', user_id).maybeSingle();
    if (!didRow?.did_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_did' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const did_id = didRow.did_id;

    const { data: streak } = await supabase
      .from('quest_streaks').select('*').eq('user_id', user_id).maybeSingle();
    const totalCompleted = streak?.total_quests_completed ?? 0;
    const totalLs = Number(streak?.total_ls_from_quests ?? 0);
    const longest = streak?.longest_streak ?? 0;

    const issued: string[] = [];

    // 1. First Light
    if (totalCompleted >= 1) {
      const r = await issueSbt(supabase, did_id, 'quest_first_light', { total_completed: totalCompleted });
      if (r?.success && !r.existed) issued.push('quest_first_light');
    }
    // 2. 7-Day Pilgrim
    if (longest >= 7) {
      const r = await issueSbt(supabase, did_id, 'quest_pilgrim_7d', { longest_streak: longest });
      if (r?.success && !r.existed) issued.push('quest_pilgrim_7d');
    }
    // 3. 30-Day Devotee
    if (longest >= 30) {
      const r = await issueSbt(supabase, did_id, 'quest_devotee_30d', { longest_streak: longest });
      if (r?.success && !r.existed) issued.push('quest_devotee_30d');
    }
    // 4. Founding Quester (limit 1000)
    if (longest >= 7) {
      const { count } = await supabase
        .from('sbt_registry')
        .select('token_id', { count: 'exact', head: true })
        .eq('sbt_type', 'quest_founding')
        .eq('status', 'active');
      if ((count ?? 0) < 1000) {
        const r = await issueSbt(supabase, did_id, 'quest_founding', {
          longest_streak: longest, founding_index: (count ?? 0) + 1,
        });
        if (r?.success && !r.existed) issued.push('quest_founding');
      }
    }
    // 5. Light Bringer
    if (totalLs >= 1000) {
      const r = await issueSbt(supabase, did_id, 'quest_light_bringer', { total_ls: totalLs });
      if (r?.success && !r.existed) issued.push('quest_light_bringer');
    }

    // Notify each newly issued SBT
    for (const sbt_type of issued) {
      try {
        await supabase.from('notifications').insert({
          user_id, actor_id: user_id, type: 'sbt_issued_quest', read: false,
          metadata: { sbt_type },
        });
      } catch (_) {}
    }

    return new Response(JSON.stringify({ ok: true, issued }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[quest-sbt-trigger] error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
