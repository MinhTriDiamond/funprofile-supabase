import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────
// pplp-attester-sign-external
//
// Cross-project webhook cho các dự án con (LoveHUB.fun, …) muốn
// mượn multisig GOV attester của FUN Profile để mint FUN Money.
//
// LoveHUB KHÔNG giữ private key attester. Luồng:
//   1. LoveHUB tính đủ payload mint → POST { action: "create" } (HMAC).
//   2. FUN Profile ghi row `pplp_mint_requests` với source_project='lovehub',
//      trả về request_id + trạng thái "pending_sig".
//   3. GOV team ký thủ công qua UI /admin của FUN Profile (endpoint
//      pplp-attester-sign hiện có — không đổi).
//   4. LoveHUB poll bằng POST { action: "status", request_id } (HMAC).
//      Khi đủ 3 nhóm → trả về multisig_signatures để LoveHUB tự submit
//      lên BSC bằng relayer riêng của họ.
//   5. LoveHUB submit xong gửi POST { action: "mark_submitted", tx_hash }
//      để FUN Profile khoá row và audit.
//
// KHÔNG gửi private key. KHÔNG cho LoveHUB đọc row khác project.
// ─────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lovehub-signature, x-lovehub-timestamp",
};

const ALLOWED_PROJECTS = new Set(["lovehub"]);
const MAX_CLOCK_SKEW_SEC = 300; // 5 phút

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyHmac(req: Request, rawBody: string): Promise<
  | { ok: true; project: string }
  | { ok: false; status: number; error: string }
> {
  const project = (req.headers.get("x-lovehub-project") || "lovehub").toLowerCase();
  if (!ALLOWED_PROJECTS.has(project)) {
    return { ok: false, status: 403, error: "Project không được phép" };
  }

  const secret = Deno.env.get(`ATTESTER_EXTERNAL_SECRET_${project.toUpperCase()}`);
  if (!secret) {
    return { ok: false, status: 500, error: `Chưa cấu hình ATTESTER_EXTERNAL_SECRET_${project.toUpperCase()}` };
  }

  const ts = req.headers.get("x-lovehub-timestamp");
  const sig = req.headers.get("x-lovehub-signature");
  if (!ts || !sig) {
    return { ok: false, status: 400, error: "Thiếu HMAC timestamp/signature" };
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, status: 400, error: "timestamp không hợp lệ" };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > MAX_CLOCK_SKEW_SEC) {
    return { ok: false, status: 401, error: "Timestamp lệch quá 5 phút" };
  }

  const expected = await hmacSha256Hex(secret, `${ts}.${rawBody}`);
  if (!timingSafeEqual(expected, sig.toLowerCase())) {
    return { ok: false, status: 401, error: "HMAC không hợp lệ" };
  }
  return { ok: true, project };
}

// ─────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────

interface CreatePayload {
  recipient_address: string;
  amount_wei: string;
  amount_display: number;
  evidence_hash: string;
  action_name: string;
  action_hash: string;
  nonce: number | string;
  external_ref: string; // ID phía LoveHUB để idempotent
  deadline?: number;
}

function isHexAddress(s: unknown): s is string {
  return typeof s === "string" && /^0x[a-fA-F0-9]{40}$/.test(s);
}
function isHex32(s: unknown): s is string {
  return typeof s === "string" && /^0x[a-fA-F0-9]{64}$/.test(s);
}
function isBigIntString(s: unknown): s is string {
  return typeof s === "string" && /^\d+$/.test(s);
}

async function handleCreate(
  project: string,
  payload: CreatePayload,
): Promise<Response> {
  if (
    !isHexAddress(payload.recipient_address) ||
    !isBigIntString(payload.amount_wei) ||
    typeof payload.amount_display !== "number" ||
    !isHex32(payload.evidence_hash) ||
    typeof payload.action_name !== "string" || payload.action_name.length === 0 ||
    !isHex32(payload.action_hash) ||
    (typeof payload.nonce !== "number" && !isBigIntString(payload.nonce)) ||
    typeof payload.external_ref !== "string" || payload.external_ref.length === 0
  ) {
    return jsonResponse({ success: false, error: "Payload không hợp lệ" }, 400);
  }

  const supabase = createAdminClient();

  // Idempotent theo (source_project, external_ref)
  const { data: existing } = await supabase
    .from("pplp_mint_requests")
    .select("id, status, multisig_completed_groups")
    .eq("source_project", project)
    .eq("external_ref", payload.external_ref)
    .maybeSingle();

  if (existing) {
    return jsonResponse({
      success: true,
      request_id: existing.id,
      status: existing.status,
      multisig_completed_groups: existing.multisig_completed_groups ?? [],
      idempotent: true,
    });
  }

  // Tạo row mới. user_id để NULL không được (NOT NULL) — dùng system user.
  const systemUserId = Deno.env.get("PPLP_EXTERNAL_SYSTEM_USER_ID");
  if (!systemUserId) {
    return jsonResponse({
      success: false,
      error: "Chưa cấu hình PPLP_EXTERNAL_SYSTEM_USER_ID",
    }, 500);
  }

  const { data: inserted, error } = await supabase
    .from("pplp_mint_requests")
    .insert({
      user_id: systemUserId,
      recipient_address: payload.recipient_address.toLowerCase(),
      amount_wei: payload.amount_wei,
      amount_display: payload.amount_display,
      evidence_hash: payload.evidence_hash,
      action_name: payload.action_name,
      action_hash: payload.action_hash,
      action_types: [payload.action_name],
      nonce: Number(payload.nonce),
      deadline: payload.deadline ?? null,
      status: "pending_sig",
      source_project: project,
      external_ref: payload.external_ref,
    })
    .select("id, status")
    .single();

  if (error) {
    console.error("[external-attester] insert error", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }

  return jsonResponse({
    success: true,
    request_id: inserted.id,
    status: inserted.status,
    multisig_completed_groups: [],
    idempotent: false,
  });
}

async function handleStatus(
  project: string,
  requestId: string,
): Promise<Response> {
  if (typeof requestId !== "string" || requestId.length === 0) {
    return jsonResponse({ success: false, error: "Thiếu request_id" }, 400);
  }

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("pplp_mint_requests")
    .select(
      "id, status, multisig_signatures, multisig_completed_groups, tx_hash, submitted_at, confirmed_at, error_message, source_project, external_ref",
    )
    .eq("id", requestId)
    .eq("source_project", project)
    .maybeSingle();

  if (error) {
    console.error("[external-attester] status error", error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
  if (!row) {
    return jsonResponse({ success: false, error: "Không tìm thấy request" }, 404);
  }

  const completed = (row.multisig_completed_groups ?? []) as string[];
  const isReady = completed.length >= 3;

  return jsonResponse({
    success: true,
    request_id: row.id,
    status: row.status,
    ready: isReady,
    multisig_completed_groups: completed,
    // Chỉ trả sigs khi đủ 3 nhóm — tránh leak partial
    multisig_signatures: isReady ? row.multisig_signatures : null,
    tx_hash: row.tx_hash,
    submitted_at: row.submitted_at,
    confirmed_at: row.confirmed_at,
    error_message: row.error_message,
  });
}

async function handleMarkSubmitted(
  project: string,
  requestId: string,
  txHash: string,
): Promise<Response> {
  if (!isHex32(txHash)) {
    return jsonResponse({ success: false, error: "tx_hash không hợp lệ" }, 400);
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("pplp_mint_requests")
    .update({
      status: "submitted",
      tx_hash: txHash,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("source_project", project);
  if (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
  return jsonResponse({ success: true });
}

// ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const rawBody = await req.text();
    const verified = await verifyHmac(req, rawBody);
    if (!verified.ok) {
      return jsonResponse({ success: false, error: verified.error }, verified.status);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ success: false, error: "Body không phải JSON" }, 400);
    }

    const action = String(parsed.action ?? "");
    switch (action) {
      case "create":
        return await handleCreate(verified.project, parsed.payload as CreatePayload);
      case "status":
        return await handleStatus(verified.project, String(parsed.request_id ?? ""));
      case "mark_submitted":
        return await handleMarkSubmitted(
          verified.project,
          String(parsed.request_id ?? ""),
          String(parsed.tx_hash ?? ""),
        );
      default:
        return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[PPLP-ATTESTER-SIGN-EXTERNAL]", message, err);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
