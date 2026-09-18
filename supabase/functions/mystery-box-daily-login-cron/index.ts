// Daily-login cron: cấp 1 hộp Common cho mỗi user có hoạt động trong 24h qua.
// Nguồn "active user": DISTINCT user_id từ public.light_actions trong 24h (proxy đáng tin cậy,
// bao gồm mọi hành vi đóng góp Light Score). Fallback thêm DISTINCT actor_id từ reactions/comments
// nếu cần mở rộng sau này.
// Idempotent qua source_ref_id = `daily-{userId}-{YYYY-MM-DD}` (UTC).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
  );

  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Lấy user active 24h qua từ light_actions (mọi hành vi PPLP đều ghi nhận tại đây).
  const { data: actives, error } = await supabase
    .from("light_actions")
    .select("actor_id")
    .gte("created_at", since)
    .limit(50000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const uniqueIds = Array.from(
    new Set((actives ?? []).map((r: { actor_id: string | null }) => r.actor_id).filter(Boolean)),
  ) as string[];

  let granted = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const uid of uniqueIds) {
    const ref = `daily-${uid}-${today}`;
    const { error: gErr } = await supabase.rpc("mystery_box_grant", {
      _user_id: uid,
      _box_code: "common_box",
      _source_event: "daily_login",
      _source_ref: ref,
    });
    if (gErr) {
      skipped++;
      if (errors.length < 5) errors.push(`${uid}: ${gErr.message}`);
    } else {
      granted++;
    }
  }

  return new Response(
    JSON.stringify({ success: true, granted, skipped, total: uniqueIds.length, sample_errors: errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
