// Mystery Box Stats Recompute - daily 04:30 UTC
// Tính số mở thực tế per (box_def, reward_code) trong 24h gần nhất,
// so với expected_pct trong drop_table → upsert mystery_box_stats_daily.
// Cảnh báo admin nếu sai số > ±5% (insert vào admin_notifications nếu có).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface DropEntry { reward_code: string; pct: number }
interface BoxDef { id: string; code: string; drop_table: DropEntry[] | null }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: admin JWT hoặc x-cron-secret
  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = !!cronSecret && cronSecret === Deno.env.get('CRON_SHARED_SECRET');

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
  );

  if (!isCron) {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: ok } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!ok) return json({ error: 'forbidden' }, 403);
  }

  try {
    const since = new Date(Date.now() - 86400_000);
    const today = new Date().toISOString().slice(0, 10);

    // 1. Đọc tất cả definitions
    const { data: defs } = await supabase
      .from('mystery_box_definitions')
      .select('id, code, drop_table');

    // 2. Đọc open_log 24h
    const { data: logs } = await supabase
      .from('mystery_box_open_log')
      .select('box_def_id, reward_code')
      .gte('opened_at', since.toISOString());

    if (!defs || !logs) return json({ ok: true, processed: 0 });

    let upserts = 0;
    const alerts: string[] = [];

    for (const def of defs as BoxDef[]) {
      const drop: DropEntry[] = Array.isArray(def.drop_table) ? def.drop_table : [];
      const defLogs = logs.filter((l: { box_def_id: string }) => l.box_def_id === def.id);
      const total = defLogs.length;
      if (total === 0) continue;

      // Aggregate actual count per reward_code
      const counts: Record<string, number> = {};
      for (const l of defLogs as { reward_code: string }[]) {
        counts[l.reward_code] = (counts[l.reward_code] ?? 0) + 1;
      }

      for (const entry of drop) {
        const actual_pct = ((counts[entry.reward_code] ?? 0) / total) * 100;
        const delta = actual_pct - entry.pct;

        await supabase.from('mystery_box_stats_daily').upsert({
          stat_date: today,
          box_def_id: def.id,
          reward_code: entry.reward_code,
          opens_count: counts[entry.reward_code] ?? 0,
          expected_pct: entry.pct,
          actual_pct: Number(actual_pct.toFixed(2)),
        } as never, { onConflict: 'stat_date,box_def_id,reward_code' } as never);

        upserts++;

        if (total >= 30 && Math.abs(delta) > 5) {
          alerts.push(`[${def.code}] ${entry.reward_code}: expected ${entry.pct}%, actual ${actual_pct.toFixed(1)}% (Δ${delta.toFixed(1)}, n=${total})`);
        }
      }
    }

    return json({ ok: true, upserts, alerts });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});

function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
