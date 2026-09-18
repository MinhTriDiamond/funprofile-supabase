// Quest evaluator batch — chạy cron mỗi 4h cho user có hoạt động 24h gần nhất.
// Gọi quest-evaluate cho từng user (tối đa N user/lần để tránh timeout).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_USERS_PER_RUN = 500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Lấy union user_id từ light_actions, donations(sender), reactions, posts trong 24h
    const userSet = new Set<string>();
    const tasks = [
      supabase.from('light_actions').select('user_id').gte('created_at', since).limit(2000),
      supabase.from('donations').select('sender_id').gte('created_at', since).limit(2000),
      supabase.from('reactions').select('user_id').gte('created_at', since).limit(2000),
      supabase.from('posts').select('user_id').gte('created_at', since).limit(2000),
    ];
    const results = await Promise.all(tasks);
    for (const r of results) {
      for (const row of (r.data ?? []) as any[]) {
        const id = row.user_id ?? row.sender_id;
        if (id) userSet.add(id);
      }
    }

    const userIds = Array.from(userSet).slice(0, MAX_USERS_PER_RUN);
    let ok = 0, fail = 0;
    for (const uid of userIds) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/quest-evaluate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey': SERVICE_KEY,
          },
          body: JSON.stringify({ user_id: uid }),
        });
        if (res.ok) ok++; else fail++;
      } catch {
        fail++;
      }
    }

    return new Response(JSON.stringify({
      total_active: userSet.size,
      evaluated: userIds.length,
      ok, fail,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
