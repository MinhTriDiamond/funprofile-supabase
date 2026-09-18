// pet-tick: cron mood drift
//  - inactive_24h cho user không tương tác > 24h
//  - midnight_utc cho user có hoạt động trong 4h vừa qua khi giờ UTC = 0
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const BATCH_LIMIT = 5000;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const sb = createAdminClient();
  const now = new Date();
  const isMidnight = now.getUTCHours() === 0;

  let inactiveCount = 0;
  let midnightCount = 0;
  const errors: string[] = [];

  // 1) inactive_24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: inactives, error: e1 } = await sb
    .from('pet_states')
    .select('user_id')
    .lt('last_interaction_at', cutoff)
    .neq('mood', 'hungry')
    .limit(BATCH_LIMIT);

  if (e1) errors.push(`inactive_query: ${e1.message}`);
  for (const row of inactives ?? []) {
    const { error } = await sb.rpc('apply_pet_event', {
      _user_id: row.user_id,
      _event: 'inactive_24h',
    });
    if (!error) inactiveCount++;
  }

  // 2) midnight_utc — chỉ chạy vào giờ UTC 0
  if (isMidnight) {
    const recentCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: actives, error: e2 } = await sb
      .from('pet_states')
      .select('user_id')
      .gte('last_interaction_at', recentCutoff)
      .neq('mood', 'sleepy')
      .limit(BATCH_LIMIT);
    if (e2) errors.push(`midnight_query: ${e2.message}`);
    for (const row of actives ?? []) {
      const { error } = await sb.rpc('apply_pet_event', {
        _user_id: row.user_id,
        _event: 'midnight_utc',
      });
      if (!error) midnightCount++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, inactiveCount, midnightCount, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
