// FP-2A Smoke Test: GET FUN Core /api/v1/identity/by-platform/fun-profile/<id>
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const FUN_CORE_BASE = (Deno.env.get("FUN_CORE_API_BASE_URL_PROD") ?? "https://api.fun.rich").replace(/\/+$/, "");
const FUN_CORE_KEY = Deno.env.get("FUN_CORE_API_KEY_FOR_FUN_PROFILE") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!FUN_CORE_KEY) return json(500, { error: "CONFIG_ERROR" });
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "UNAUTHORIZED" });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "UNAUTHORIZED" });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "FORBIDDEN_NOT_ADMIN" });

    const { platform_user_id } = await req.json().catch(() => ({} as any));
    if (!platform_user_id) return json(400, { error: "platform_user_id required" });

    const traceId = crypto.randomUUID();
    const url = `${FUN_CORE_BASE}/api/v1/identity/by-platform/fun-profile/${encodeURIComponent(platform_user_id)}`;
    const started = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    let status = 0; let body: any = null;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${FUN_CORE_KEY}`,
          "X-Fun-Trace-Id": traceId,
          "X-Fun-Service": "fun-profile",
        },
        signal: ctrl.signal,
      });
      status = res.status;
      const txt = await res.text();
      try { body = txt ? JSON.parse(txt) : null; } catch { body = { raw: txt }; }
    } finally { clearTimeout(t); }

    const ok200 = status === 200;
    const hasEcoId = !!body?.ecosystem_identity_id;
    const linkedOk = Array.isArray(body?.linked_platforms) && body.linked_platforms.some(
      (p: any) => (typeof p === "string" ? p : p?.platform_slug) === "fun-profile"
    );
    const pass = ok200 && hasEcoId && linkedOk;

    return json(200, {
      pass,
      checks: { http_200: ok200, has_ecosystem_identity_id: hasEcoId, linked_includes_fun_profile: linkedOk },
      trace_id: traceId,
      endpoint: url,
      duration_ms: Date.now() - started,
      http_status: status,
      response: body,
    });
  } catch (e: any) {
    console.error("[federation-backfill-smoke]", e);
    return json(500, { error: "INTERNAL", message: e?.message ?? String(e) });
  }
});
