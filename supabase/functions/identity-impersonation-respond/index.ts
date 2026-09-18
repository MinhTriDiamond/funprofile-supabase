// identity-impersonation-respond
// Nạn nhân xác nhận: 'impersonator' (đúng là kẻ mạo danh) hoặc 'self' (tài khoản khác của tôi)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabase = createAdminClient();
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: aErr } = await supabase.auth.getUser(token);
    if (aErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { alert_id, response } = await req.json();
    if (!alert_id || !["impersonator", "self"].includes(response)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: alert, error: lErr } = await supabase
      .from("impersonation_alerts")
      .select("*")
      .eq("id", alert_id)
      .maybeSingle();
    if (lErr || !alert) {
      return new Response(JSON.stringify({ error: "Alert not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (alert.victim_user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (alert.status !== "pending") {
      return new Response(JSON.stringify({ error: "Already resolved" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newStatus = response === "impersonator"
      ? "victim_confirmed_impersonator"
      : "victim_confirmed_self";

    await supabase
      .from("impersonation_alerts")
      .update({
        status: newStatus,
        victim_response_at: new Date().toISOString(),
      })
      .eq("id", alert_id);

    if (response === "impersonator") {
      // Restrict suspect account, queue admin review
      await supabase
        .from("profiles")
        .update({
          is_restricted: true,
          admin_notes:
            (alert.details as Record<string, unknown> ?? {}).suspect
              ? `Bị nạn nhân ${user.id} báo cáo mạo danh (alert ${alert_id})`
              : "Báo cáo mạo danh",
        })
        .eq("id", alert.suspect_user_id);

      // Identity event: hạ tc của suspect
      try {
        await supabase.from("identity_events").insert({
          subject_user_id: alert.suspect_user_id,
          event_type: "impersonation_reported",
          tc_delta: -0.15,
          risk_delta: 0.2,
          source: "impersonation_respond",
          details: { alert_id, reported_by: user.id },
        });
      } catch (_) { /* table optional */ }

      // Notify all admins
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (admins?.length) {
        await supabase.from("notifications").insert(
          admins.map((a) => ({
            user_id: a.user_id,
            actor_id: user.id,
            type: "impersonation_confirmed",
            read: false,
            metadata: {
              alert_id,
              suspect_id: alert.suspect_user_id,
              victim_id: user.id,
            },
          })),
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, status: newStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[respond] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
