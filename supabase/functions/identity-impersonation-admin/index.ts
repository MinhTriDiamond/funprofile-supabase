// identity-impersonation-admin
// Admin: ban_suspect | restore_suspect | dismiss
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
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { alert_id, action, note } = await req.json();
    if (
      !alert_id ||
      !["ban_suspect", "restore_suspect", "dismiss"].includes(action)
    ) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: alert } = await supabase
      .from("impersonation_alerts")
      .select("*")
      .eq("id", alert_id)
      .maybeSingle();
    if (!alert) {
      return new Response(JSON.stringify({ error: "Alert not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ban_suspect") {
      await supabase
        .from("profiles")
        .update({
          is_banned: true,
          banned_at: new Date().toISOString(),
          ban_reason: `Mạo danh (alert ${alert_id})`,
        })
        .eq("id", alert.suspect_user_id);
    } else if (action === "restore_suspect") {
      await supabase
        .from("profiles")
        .update({ is_restricted: false, is_banned: false, ban_reason: null })
        .eq("id", alert.suspect_user_id);
    }

    await supabase
      .from("impersonation_alerts")
      .update({
        status: action === "dismiss" ? "dismissed_by_admin" : alert.status,
        admin_action: action,
        admin_id: user.id,
        admin_note: note ?? null,
      })
      .eq("id", alert_id);

    // Notify victim that admin acted
    await supabase.from("notifications").insert({
      user_id: alert.victim_user_id,
      actor_id: user.id,
      type: action === "dismiss"
        ? "impersonation_dismissed"
        : "impersonation_confirmed",
      read: false,
      metadata: { alert_id, action, suspect_id: alert.suspect_user_id },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[admin] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
