/**
 * PPLP Micro Preview — Daily cron
 * Tính preview score 7-day rolling cho user dashboard
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
    const since = new Date(Date.now() - 7 * 86400_000);
    const sinceIso = since.toISOString();
    const epochLabel = new Date().toISOString().slice(0, 7);

    // Aggregate v2 scores trong 7 ngày
    const userScores = new Map<string, { score: number; days: Set<string>; count: number }>();

    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('pplp_v2_validations')
        .select('final_light_score, created_at, pplp_v2_user_actions!inner(user_id)')
        .eq('validation_status', 'validated')
        .gte('created_at', sinceIso)
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data) {
        const uid = (r as any).pplp_v2_user_actions?.user_id;
        if (!uid) continue;
        const day = r.created_at.slice(0, 10);
        const cur = userScores.get(uid) || { score: 0, days: new Set(), count: 0 };
        cur.score += Number(r.final_light_score) || 0;
        cur.days.add(day);
        cur.count++;
        userScores.set(uid, cur);
      }
      if (data.length < 1000) break;
      page++;
    }

    // Burst detection: nếu count > avg×3 trong 1 ngày → burst penalty
    let upserted = 0;
    for (const [uid, s] of userScores) {
      const activeDays = s.days.size;
      const consistency = activeDays / 7;
      const avgPerDay = s.count / Math.max(1, activeDays);
      const burstPenalty = avgPerDay > 10 ? 0.7 : avgPerDay > 5 ? 0.85 : 1.0;

      // Trust ramp: account < 14 ngày → 0.7
      const { data: profile } = await supabase
        .from('profiles').select('created_at').eq('id', uid).single();
      const accountAge = profile ? (Date.now() - new Date(profile.created_at).getTime()) / 86400_000 : 0;
      const trustRamp = accountAge < 14 ? 0.7 : accountAge < 30 ? 0.85 : 1.0;

      const previewScore = s.score * consistency * burstPenalty * trustRamp;

      await supabase.from('user_epoch_scores').upsert({
        user_id: uid,
        epoch_label: epochLabel,
        window_type: 'preview',
        preview_score: previewScore,
        raw_activity_count: s.count,
        deduped_activity_count: s.count,
        active_days: activeDays,
        total_window_days: 7,
        consistency_factor: consistency,
        burst_penalty_factor: burstPenalty,
        trust_ramp_factor: trustRamp,
        weighted_score: previewScore,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,epoch_label,window_type' });
      upserted++;
    }

    console.log(`[MICRO-PREVIEW] users=${userScores.size} upserted=${upserted}`);
    return new Response(JSON.stringify({ success: true, users: userScores.size, upserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[MICRO-PREVIEW] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
