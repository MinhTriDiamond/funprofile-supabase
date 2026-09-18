// FUN Core API read-only proxy
// Phase 1 — Federation Productization V1
//
// Endpoints (whitelist):
//   profile / badges / light-score           → admin-only, pilot allowlist (legacy Phase 2.8+2.9)
//   identity-by-platform                     → self HOẶC admin (user xem identity của mình)
//   identity-summary                         → admin-only (yêu cầu ecosystem_identity_id)
//   federation-stats                         → admin-only, không cần target
//   federation-candidates                    → admin-only, không cần target
//
// Mọi upstream lỗi/timeout/chưa-sẵn-sàng đều trả envelope { success:false, error:{ code, message } }.
// KHÔNG bao giờ fake data.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FUN_CORE_BASE = (Deno.env.get("FUN_CORE_API_BASE_URL") ?? "https://apifunrich.lovable.app").replace(/\/$/, "");
const SERVICE_IDENTITY = Deno.env.get("FUN_PROFILE_SERVICE_IDENTITY") ?? "fun-profile";
// Bearer API key dùng để auth với FUN Core (giống smoke test PASS).
// Ưu tiên FUN_CORE_API_KEY_FOR_FUN_PROFILE; fallback FUN_PROFILE_SERVICE_SECRET cho backward-compat.
const FUN_CORE_BEARER = Deno.env.get("FUN_CORE_API_KEY_FOR_FUN_PROFILE") ?? Deno.env.get("FUN_PROFILE_SERVICE_SECRET");

type EndpointScope = "self_or_admin" | "admin_only" | "admin_no_target";
type TargetKind = "user_uuid" | "ecosystem_id" | "none";

interface EndpointDef {
  buildPath: (target: string) => string;
  scope: EndpointScope;
  target: TargetKind;
  /** Bỏ qua pilot allowlist cho các endpoint mới (chỉ áp lên 3 endpoint legacy). */
  enforcePilotAllowlist: boolean;
}

const ENDPOINTS: Record<string, EndpointDef> = {
  // Legacy Phase 2.8 + 2.9
  "profile":        { buildPath: (u) => `/api/v1/profile/${u}`,                scope: "admin_only", target: "user_uuid",   enforcePilotAllowlist: true },
  "badges":         { buildPath: (u) => `/api/v1/profile/${u}/badges`,         scope: "admin_only", target: "user_uuid",   enforcePilotAllowlist: true },
  "light-score":    { buildPath: (u) => `/api/v1/profile/${u}/light-score`,    scope: "admin_only", target: "user_uuid",   enforcePilotAllowlist: true },

  // Phase 1 — Federation Productization V1
  "identity-by-platform":   { buildPath: (u) => `/api/v1/identity/by-platform/${SERVICE_IDENTITY}/${u}/summary`, scope: "self_or_admin",   target: "user_uuid",   enforcePilotAllowlist: false },
  "identity-summary":       { buildPath: (e) => `/api/v1/identity/${e}/summary`,                scope: "admin_only",      target: "ecosystem_id", enforcePilotAllowlist: false },
  "federation-stats":       { buildPath: ()  => `/api/v1/admin/federation/stats`,               scope: "admin_no_target", target: "none",         enforcePilotAllowlist: false },
  "federation-candidates":  { buildPath: ()  => `/api/v1/admin/identity/candidates`,            scope: "admin_no_target", target: "none",         enforcePilotAllowlist: false },

  // Phase 6D — Unified Ecosystem Dashboard (Trust + Light Score + PPLP + Rewards + Badges)
  "ecosystem-dashboard":    { buildPath: (u) => `/api/v1/ecosystem/by-platform/${SERVICE_IDENTITY}/${u}/dashboard`, scope: "self_or_admin", target: "user_uuid", enforcePilotAllowlist: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ecosystem_identity_id từ FUN Core hiện cũng là UUID — chấp nhận UUID hoặc chuỗi an toàn dạng id.
const SAFE_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logAudit(
  admin: ReturnType<typeof createClient>,
  row: {
    actor_id: string;
    endpoint: string;
    target_user_id: string;
    upstream_status: number | null;
    success: boolean;
    duration_ms: number;
    error_code: string | null;
    trace_id: string | null;
    denied_reason?: string | null;
  },
) {
  try {
    await admin.from("fun_core_proxy_audit").insert(row);
  } catch (e) {
    console.error("[fun-core-proxy] audit insert failed:", e);
  }
}

async function getPilotAllowlist(admin: ReturnType<typeof createClient>): Promise<string[] | null> {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "fun_core_pilot_allowed_user_ids")
      .maybeSingle();
    if (!data?.value) return null;
    const parsed = JSON.parse(data.value as string);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((s) => String(s).toLowerCase());
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Chỉ hỗ trợ POST." } }, 200);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = (Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY"))!;
  const SERVICE_ROLE_KEY = (Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;

  // 1. Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ success: false, error: { code: "UNAUTHORIZED", message: "Thiếu token đăng nhập." } });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return jsonResponse({ success: false, error: { code: "UNAUTHORIZED", message: "Token không hợp lệ." } });
  }
  const actorId = String(claims.claims.sub).toLowerCase();

  // 2. Body validation (sớm để biết endpoint)
  let body: { endpoint?: string; userId?: string; ecosystemIdentityId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: { code: "VALIDATION_ERROR", message: "Body phải là JSON." } });
  }
  const endpoint = String(body.endpoint ?? "").trim();
  const def = ENDPOINTS[endpoint];
  if (!def) {
    return jsonResponse({
      success: false,
      error: { code: "VALIDATION_ERROR", message: `endpoint phải là một trong: ${Object.keys(ENDPOINTS).join(", ")}` },
    });
  }

  // 3. Lấy & validate target
  let target = "";
  if (def.target === "user_uuid") {
    target = String(body.userId ?? "").trim().toLowerCase();
    if (!UUID_RE.test(target)) {
      return jsonResponse({ success: false, error: { code: "VALIDATION_ERROR", message: "userId phải là UUID hợp lệ." } });
    }
  } else if (def.target === "ecosystem_id") {
    target = String(body.ecosystemIdentityId ?? "").trim();
    if (!SAFE_ID_RE.test(target)) {
      return jsonResponse({ success: false, error: { code: "VALIDATION_ERROR", message: "ecosystemIdentityId không hợp lệ." } });
    }
  }

  // 4. Scope check
  let isAdmin = false;
  if (def.scope !== "self_or_admin" || target !== actorId) {
    const { data, error } = await adminClient.rpc("has_role", { _user_id: actorId, _role: "admin" });
    if (error) {
      return jsonResponse({ success: false, error: { code: "AUTHZ_ERROR", message: "Không kiểm tra được quyền admin." } });
    }
    isAdmin = !!data;
  }

  if (def.scope === "admin_only" || def.scope === "admin_no_target") {
    if (!isAdmin) {
      return jsonResponse({ success: false, error: { code: "FORBIDDEN_NOT_ADMIN", message: "Chỉ admin được dùng endpoint này." } });
    }
  } else if (def.scope === "self_or_admin") {
    if (target !== actorId && !isAdmin) {
      return jsonResponse({
        success: false,
        error: { code: "FORBIDDEN_NOT_SELF", message: "Chỉ được xem identity của chính mình (hoặc admin)." },
      });
    }
  }

  // 5. Config check
  if (!FUN_CORE_BEARER) {
    return jsonResponse({
      success: false,
      error: { code: "CONFIG_ERROR", message: "FUN_CORE_API_KEY_FOR_FUN_PROFILE chưa được cấu hình trên server." },
    });
  }

  // 6. Pilot allowlist (chỉ áp lên 3 endpoint legacy)
  if (def.enforcePilotAllowlist && def.target === "user_uuid") {
    const allowlist = await getPilotAllowlist(adminClient);
    if (allowlist && !allowlist.includes(target)) {
      await logAudit(adminClient, {
        actor_id: actorId,
        endpoint,
        target_user_id: target,
        upstream_status: null,
        success: false,
        duration_ms: 0,
        error_code: "FORBIDDEN_PILOT_SCOPE",
        trace_id: null,
        denied_reason: "user_not_in_pilot_allowlist",
      });
      return jsonResponse({
        success: false,
        error: {
          code: "FORBIDDEN_PILOT_SCOPE",
          message: "userId không nằm trong allowlist pilot.",
        },
        _http: { status: 0, durationMs: 0 },
      });
    }
  }

  // 7. Upstream call — auth bằng Bearer API key (giống smoke test PASS).
  const url = `${FUN_CORE_BASE}${def.buildPath(target)}`;
  const traceIdOut = crypto.randomUUID();
  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let upstreamStatus: number | null = null;
  let upstreamJson: any = null;
  let upstreamText: string | null = null;
  let errorCode: string | null = null;
  let traceId: string | null = null;

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${FUN_CORE_BEARER}`,
        "X-Fun-Service": SERVICE_IDENTITY,
        "X-Fun-Trace-Id": traceIdOut,
        "Accept": "application/json",
      },
    });
    upstreamStatus = res.status;
    const raw = await res.text();
    upstreamText = raw;
    try { upstreamJson = raw ? JSON.parse(raw) : null; } catch { /* not json */ }
    traceId = upstreamJson?.meta?.traceId ?? res.headers.get("x-trace-id") ?? traceIdOut;
    if (upstreamStatus >= 400) {
      // Log upstream body để debug auth/format (KHÔNG log bearer).
      console.error("[fun-core-proxy] upstream error", {
        endpoint, url, status: upstreamStatus, trace: traceIdOut,
        body: upstreamText?.slice(0, 800) ?? null,
      });
    }
  } catch (e) {
    const isAbort = (e as Error)?.name === "AbortError";
    errorCode = isAbort ? "TIMEOUT" : "FETCH_ERROR";
    console.error("[fun-core-proxy] fetch failed", { endpoint, url, errorCode, err: String(e) });
  } finally {
    clearTimeout(timeoutId);
  }


  const durationMs = Date.now() - started;

  // Phân biệt 2 nhóm 404:
  //  - 404 + body.error === "identity_not_found" → endpoint LIVE nhưng user chưa có Ecosystem Identity.
  //  - 404/405/501 thuần (route chưa expose)     → UPSTREAM_NOT_READY.
  let normalizedCode: string | null = null;
  const upstreamErrMarker = (upstreamJson?.error ?? upstreamJson?.code ?? "").toString().toLowerCase();
  if (upstreamStatus === 404 && upstreamErrMarker === "identity_not_found") {
    normalizedCode = "IDENTITY_NOT_FOUND";
  } else if (upstreamStatus === 404 || upstreamStatus === 501 || upstreamStatus === 405) {
    normalizedCode = "UPSTREAM_NOT_READY";
  }


  const ok = upstreamStatus !== null && upstreamStatus >= 200 && upstreamStatus < 300 && upstreamJson?.success !== false;

  await logAudit(adminClient, {
    actor_id: actorId,
    endpoint,
    target_user_id: target || actorId,
    upstream_status: upstreamStatus,
    success: ok,
    duration_ms: durationMs,
    error_code: ok ? null : (normalizedCode ?? errorCode ?? (upstreamJson?.error?.code ?? "UPSTREAM_ERROR")),
    trace_id: traceId,
    denied_reason: null,
  });

  if (ok && upstreamJson) {
    return jsonResponse({
      success: true,
      meta: upstreamJson.meta ?? null,
      data: upstreamJson.data ?? upstreamJson,
      _http: { status: upstreamStatus, durationMs },
    });
  }

  return jsonResponse({
    success: false,
    error: {
      code: normalizedCode ?? errorCode ?? upstreamJson?.error?.code ?? "UPSTREAM_ERROR",
      message:
        normalizedCode === "UPSTREAM_NOT_READY"
          ? "FUN Core chưa expose endpoint này. Sẽ tự bật khi sẵn sàng."
          : normalizedCode === "IDENTITY_NOT_FOUND"
            ? "Bạn chưa có Ecosystem Identity trên FUN Core. Hệ thống sẽ tự tạo khi bạn liên kết nền tảng đầu tiên."
            : (upstreamJson?.error?.message ??
              (errorCode === "TIMEOUT"
                ? "FUN Core không phản hồi trong 10 giây."
                : `FUN Core trả lỗi HTTP ${upstreamStatus ?? "?"}.`)),

      upstreamStatus: upstreamStatus,
      traceId,
      upstreamBody: upstreamJson ?? upstreamText?.slice(0, 500) ?? null,
    },
    _http: { status: upstreamStatus ?? 0, durationMs },
  });
});
