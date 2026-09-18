/**
 * PPLP Validation Window — Daily cron
 * Tính validated score rolling 14 ngày + cập nhật trust/fraud factors
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
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const epochLabel = new Date().toISOString().slice(0, 7);

    const userMap = new Map<string, { score: number; days: Set<string>; count: number; firstWeek: number; secondWeek: number }>();
    const midpoint = new Date(Date.now() - 7 * 86400_000).getTime();

    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('pplp_v2_validations')
        .select('final_light_score, created_at, pplp_v2_user_actions!inner(user_id)')
        .eq('validation_status', 'validated')
        .gte('created_at', since)
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (error || !data || data.length === 0) break;
      for (const r of data) {
        const uid = (r as any).pplp_v2_user_actions?.user_id;
        if (!uid) continue;
        const ts = new Date(r.created_at).getTime();
        const cur = userMap.get(uid) || { score: 0, days: new Set(), count: 0, firstWeek: 0, secondWeek: 0 };
        const sc = Number(r.final_light_score) || 0;
        cur.score += sc;
        cur.days.add(r.created_at.slice(0, 10));
        cur.count++;
        if (ts < midpoint) cur.firstWeek += sc; else cur.secondWeek += sc;
        userMap.set(uid, cur);
      }
      if (data.length < 1000) break;
      page++;
    }

    // Fraud signals trong 14 ngày
    const { data: fraudData } = await supabase
      .from('pplp_v2_fraud_signals').select('actor_id, severity').gte('created_at', since);
    const fraudMap = new Map<string, number>();
    for (const f of fraudData || []) {
      fraudMap.set(f.actor_id, (fraudMap.get(f.actor_id) || 0) + Number(f.severity));
    }

    let upserted = 0;
    for (const [uid, s] of userMap) {
      const consistency = s.days.size / 14;
      // Cross-window continuity: cả 2 tuần đều có activity
      const continuity = (s.firstWeek > 0 && s.secondWeek > 0) ? 1.15 : 1.0;
      const fraudFactor = Math.min(1.0, (fraudMap.get(uid) || 0) / 10);
      const trustFactor = Math.max(0.3, 1.0 - fraudFactor);

      const validatedScore = s.score * consistency * continuity * trustFactor;

      await supabase.from('user_epoch_scores').upsert({
        user_id: uid,
        epoch_label: epochLabel,
        window_type: 'validation',
        validated_score: validatedScore,
        raw_activity_count: s.count,
        deduped_activity_count: s.count,
        active_days: s.days.size,
        total_window_days: 14,
        consistency_factor: consistency,
        cross_window_continuity_factor: continuity,
        trust_factor: trustFactor,
        fraud_factor: fraudFactor,
        weighted_score: validatedScore,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,epoch_label,window_type' });
      upserted++;
    }

    console.log(`[VALIDATION-WINDOW] users=${userMap.size} upserted=${upserted}`);
    return new Response(JSON.stringify({ success: true, users: userMap.size, upserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[VALIDATION-WINDOW] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
