// PPLP v2.5 — Backfill Engine
// Quét toàn bộ light_actions + pplp_v2_user_actions → tính VVU lùi → aggregate → assign tier
// Admin only
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FN_URL = Deno.env.get('SUPABASE_URL')!;
const SR_KEY = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

async function callFn(name: string, body: any) {
  const res = await fetch(`${FN_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SR_KEY}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(FN_URL, SR_KEY);

    // Verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: corsHeaders });

    const { data: roleCheck } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleCheck) return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run === true;
    const batch_size = Math.min(500, Number(body.batch_size ?? 200));
    const max_batches = Math.max(1, Number(body.max_batches ?? 25)); // tránh timeout
    const resume_from: string | null = body.resume_from ?? null;
    const skip_v2: boolean = body.skip_v2 === true;

    // 1. Refresh intent + impact for ALL users
    const intentRes = await callFn('pplp-v25-intent-calculator', {});
    const impactRes = await callFn('pplp-v25-impact-calculator', {});

    if (dry_run) {
      const { count: lightCount } = await supabase
        .from('light_actions')
        .select('id', { count: 'exact', head: true })
        .eq('is_eligible', true);
      const { count: v2Count } = await supabase
        .from('pplp_v2_user_actions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'validated');

      return new Response(JSON.stringify({
        dry_run: true,
        will_process: { light_actions: lightCount, pplp_v2_user_actions: v2Count },
        intent: intentRes,
        impact: impactRes,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Process light_actions in batches
    let processed_actions = 0;
    let last_id: string | null = resume_from;
    let batches = 0;
    while (batches < max_batches) {
      let q = supabase
        .from('light_actions')
        .select('id')
        .eq('is_eligible', true)
        .order('id', { ascending: true })
        .limit(batch_size);
      if (last_id) q = q.gt('id', last_id);
      const { data: rows } = await q;
      if (!rows || rows.length === 0) break;

      const inputs = rows.map(r => ({ source_table: 'light_actions', source_id: r.id, vvu_type: 'personal' }));
      await callFn('pplp-v25-vvu-calculate', inputs);
      processed_actions += rows.length;
      last_id = rows[rows.length - 1].id;
      batches++;
      if (rows.length < batch_size) break;
    }
    const last_processed_id = last_id;
    const has_more = batches >= max_batches;

    // 3. Process pplp_v2_user_actions (chỉ khi không skip)
    let processed_v2 = 0;
    if (!skip_v2) {
      last_id = null;
      while (true) {
        let q = supabase
          .from('pplp_v2_user_actions')
          .select('id')
          .eq('status', 'validated')
          .order('id', { ascending: true })
          .limit(batch_size);
        if (last_id) q = q.gt('id', last_id);
        const { data: rows } = await q;
        if (!rows || rows.length === 0) break;

        const inputs = rows.map(r => ({ source_table: 'pplp_v2_user_actions', source_id: r.id, vvu_type: 'personal' }));
        await callFn('pplp-v25-vvu-calculate', inputs);
        processed_v2 += rows.length;
        last_id = rows[rows.length - 1].id;
        if (rows.length < batch_size) break;
      }
    }

    // 4. Aggregate + assign tiers (chỉ chạy khi đã backfill xong toàn bộ light_actions)
    let aggRes: any = null;
    let tierRes: any = null;
    if (!has_more) {
      aggRes = await callFn('pplp-v25-aggregate', {});
      tierRes = await callFn('pplp-v25-tier-assigner', {});
    }

    await supabase.from('pplp_v2_event_log').insert({
      event_type: 'pplp_v25_backfill_progress',
      payload: {
        admin_id: user.id,
        processed_actions,
        processed_v2,
        last_processed_id,
        has_more,
        batches,
        aggregate: aggRes,
        tiers: tierRes,
      },
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({
      success: true,
      processed: { light_actions: processed_actions, pplp_v2_user_actions: processed_v2 },
      last_processed_id,
      has_more,
      next_resume_from: last_processed_id,
      aggregate: aggRes,
      tiers: tierRes,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
