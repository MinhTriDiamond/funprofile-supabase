// Cron daily: cộng growth bonus cho Connector khi user mới đạt cột mốc
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { persistSession: false } }
  );

  const { data: cfgRows } = await supabase.from("connector_config").select("key,value");
  const cfg = Object.fromEntries((cfgRows ?? []).map((r: any) => [r.key, r.value]));
  const bonus = cfg.growth_bonus ?? {
    profile_complete: 2,
    first_contribution: 5,
    level_1: 10,
    active_30d: 20,
  };

  const { data: links } = await supabase
    .from("connector_links")
    .select("id,new_user_id,connector_user_id,matched_at")
    .eq("status", "confirmed");

  let awarded = 0;

  for (const link of links ?? []) {
    const milestones = await detectMilestones(supabase, link.new_user_id, link.matched_at);

    for (const m of milestones) {
      const score = bonus[m] ?? 0;
      if (!score) continue;

      const { error } = await supabase
        .from("connector_growth_events")
        .insert({ link_id: link.id, milestone: m, score_delta: score });

      if (error) continue; // duplicate - đã award

      await supabase.from("light_actions").insert({
        user_id: link.connector_user_id,
        action_type: `CONNECTOR_GROWTH_${m.toUpperCase()}`,
        points: score,
        metadata: { link_id: link.id, milestone: m, new_user_id: link.new_user_id },
      });

      await supabase.from("notifications").insert({
        user_id: link.connector_user_id,
        type: "connector_growth_bonus",
        title: "🌱 Connector Growth Bonus",
        message: `User bạn dẫn dắt vừa đạt cột mốc "${milestoneVi(m)}". Bạn nhận +${score} Light Score.`,
        metadata: { link_id: link.id, milestone: m, score_delta: score },
      });

      awarded++;
    }
  }

  return new Response(JSON.stringify({ ok: true, awarded }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function milestoneVi(m: string): string {
  switch (m) {
    case "profile_complete": return "Hoàn thiện hồ sơ";
    case "first_contribution": return "Đóng góp đầu tiên";
    case "level_1": return "Đạt Level 1";
    case "active_30d": return "Active 30 ngày";
    default: return m;
  }
}

async function detectMilestones(supabase: any, userId: string, since: string): Promise<string[]> {
  const out: string[] = [];

  // profile_complete: avatar + bio + display_name
  const { data: p } = await supabase
    .from("profiles")
    .select("avatar_url,bio,display_name,full_name,soul_level,created_at")
    .eq("id", userId)
    .maybeSingle();
  if (p?.avatar_url && p?.bio && (p?.display_name || p?.full_name)) {
    out.push("profile_complete");
  }
  if (p?.soul_level && p.soul_level >= 1) {
    out.push("level_1");
  }

  // first_contribution: có ít nhất 1 light_actions thuộc category GIVING/HELPING/SERVICE sau matched_at
  const { count: contribCount } = await supabase
    .from("light_actions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((contribCount ?? 0) >= 1) out.push("first_contribution");

  // active_30d: có hoạt động (light_actions hoặc posts) ở ngày thứ 30+
  const days = (Date.now() - new Date(since).getTime()) / 86400000;
  if (days >= 30) {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: recent } = await supabase
      .from("light_actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", cutoff);
    if ((recent ?? 0) >= 1) out.push("active_30d");
  }

  return out;
}
