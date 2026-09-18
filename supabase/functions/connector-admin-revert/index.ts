// Connector Admin Revert — gọi RPC connector_revert_link (no reopen policy)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, reason: "missing_auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { persistSession: false } }
    );

    // Resolve caller
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );
    const { data: userRes } = await userClient.auth.getUser();
    const adminId = userRes?.user?.id;
    if (!adminId) return json({ ok: false, reason: "invalid_token" }, 401);

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: adminId, _role: "admin" });
    if (!isAdmin) return json({ ok: false, reason: "forbidden" }, 403);

    const body = await req.json();
    const linkId = String(body?.link_id ?? "");
    const reason = String(body?.reason ?? "").trim();
    if (!linkId || !reason || reason.length < 5) {
      return json({ ok: false, reason: "missing_fields", hint: "link_id + reason (>=5 chars)" }, 400);
    }

    const { data, error } = await supabase.rpc("connector_revert_link", {
      _link_id: linkId,
      _admin_id: adminId,
      _reason: reason,
    });
    if (error) return json({ ok: false, reason: "rpc_error", error: error.message }, 500);
    return json(data ?? { ok: true });
  } catch (e) {
    return json({ ok: false, reason: "exception", error: String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
