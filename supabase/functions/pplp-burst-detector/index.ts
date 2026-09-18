/**
 * PPLP Burst Detector — Daily cron
 * Phát hiện activity spike bất thường, ghi vào pplp_v2_fraud_signals
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
    const last24h = new Date(Date.now() - 86400_000).toISOString();

    // Đếm actions/user trong 24h gần nhất
    const userCounts = new Map<string, number>();
    let page = 0;
    while (true) {
      const { data } = await supabase
        .from('pplp_v2_user_actions').select('user_id, created_at')
        .gte('created_at', last24h)
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (!data || data.length === 0) break;
      for (const r of data) userCounts.set(r.user_id, (userCounts.get(r.user_id) || 0) + 1);
      if (data.length < 1000) break;
      page++;
    }

    let burstUsers = 0;
    for (const [uid, count] of userCounts) {
      // Threshold: > 30 actions/24h là burst nghi ngờ
      if (count >= 30) {
        const severity = Math.min(10, count / 10);
        await supabase.from('pplp_v2_fraud_signals').insert({
          actor_id: uid,
          signal_type: 'BOT',
          severity,
          source: 'burst_detector',
          details: { actions_24h: count, threshold: 30 },
        }).then(() => null).catch(() => null);
        burstUsers++;
      }
    }

    console.log(`[BURST-DETECTOR] checked=${userCounts.size} burst=${burstUsers}`);
    return new Response(JSON.stringify({ success: true, checked: userCounts.size, burst_users: burstUsers }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[BURST-DETECTOR] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
