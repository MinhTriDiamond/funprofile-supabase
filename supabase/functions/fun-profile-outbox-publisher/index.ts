// FUN Profile → FUN Core Federation Publisher Worker (Phase 4B)
// Claims a batch of outbox events and POSTs to FUN Core /api/v1/federation/events/ingest.
// Backoff & dead handled by RPC fun_profile_outbox_publisher_ack.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FUN_CORE_BASE = (Deno.env.get("FUN_CORE_API_BASE_URL_PROD") ?? "https://api.fun.rich").replace(/\/+$/, "");
const FUN_CORE_KEY = Deno.env.get("FUN_CORE_API_KEY_FOR_FUN_PROFILE") ?? "";

const PRIVACY_BY_EVENT: Record<string, "public" | "platform_internal" | "user_private"> = {
  // Phase 4B
  PLATFORM_USER_CREATED: "platform_internal",
  PROFILE_UPDATED: "platform_internal",
  DID_PROMOTED: "public",
  TRUST_UPDATED: "platform_internal",
  SBT_ISSUED: "public",
  SBT_REVOKED: "public",
  WALLET_LINKED: "user_private",
  WALLET_UNLINKED: "user_private",
  // Phase 6B — Activity events
  FUN_PROFILE_POST_CREATED: "public",
  FUN_PROFILE_POST_UPDATED: "public",
  FUN_PROFILE_POST_DELETED: "public",
  FUN_PROFILE_POST_LIKED: "public",
  FUN_PROFILE_POST_SHARED: "public",
  FUN_PROFILE_COMMENT_CREATED: "public",
  FUN_PROFILE_COMMENT_LIKED: "public",
  FUN_PROFILE_LIVESTREAM_STARTED: "public",
  FUN_PROFILE_LIVESTREAM_COMPLETED: "public",
  FUN_PROFILE_LIVESTREAM_ATTENDED: "platform_internal",
  FUN_PROFILE_FOLLOWED_USER: "public",
  FUN_PROFILE_PROFILE_COMPLETED: "public",
  FUN_PROFILE_DAILY_ACTIVE: "platform_internal",
};

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function buildEnvelope(row: any) {
  const eventId = crypto.randomUUID();
  const traceId = row.trace_id ?? `fp-${crypto.randomUUID()}`;
  const privacy = PRIVACY_BY_EVENT[row.event_type] ?? "platform_internal";
  return {
    schema_version: 1,
    event_id: eventId,
    event_type: row.event_type,
    event_version: 1,
    occurred_at: new Date(row.created_at).toISOString(),
    // Slug thống nhất: fun-profile (KHÔNG dùng fun_profile).
    origin_platform: "fun-profile",
    source_platform: "fun-profile",
    causation_id: null,
    correlation_id: null,
    hop_count: 0,
    idempotency_key: String(row.idempotency_key).slice(0, 128),
    privacy_level: privacy,
    subject: {
      platform_user_id: row.aggregate_id,
      user_id: row.aggregate_id,
      did_id: row.payload?.did_id ?? null,
      platform_slug: "fun-profile",
    },
    payload: row.payload ?? {},
    trace_id: traceId,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!SERVICE_KEY) return json(500, { error: "CONFIG_ERROR", message: "missing service key" });
    if (!FUN_CORE_KEY) return json(500, { error: "CONFIG_ERROR", message: "missing FUN_CORE_API_KEY_FOR_FUN_PROFILE" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({} as any));
    const limit = Math.max(1, Math.min(50, Number(body?.limit) || 20));

    // Claim a batch (skip locked + atomic in_flight)
    const { data: rows, error: claimErr } = await admin.rpc("fun_profile_outbox_publisher_claim", {
      p_limit: limit,
    });
    if (claimErr) return json(500, { error: "CLAIM_FAILED", message: claimErr.message });

    const claimed = (rows ?? []) as any[];
    if (!claimed.length) {
      return json(200, { ok: true, claimed: 0, sent: 0, failed: 0, dead: 0, note: "no work or publisher disabled" });
    }

    const ingestUrl = `${FUN_CORE_BASE}/api/v1/federation/events/ingest`;
    let sent = 0, failed = 0, dead = 0;
    const results: Array<{ id: string; status: string; http?: number; error?: string }> = [];

    for (const row of claimed) {
      const envelope = buildEnvelope(row);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      let httpStatus = 0;
      let errMsg: string | null = null;
      let ok = false;

      try {
        const res = await fetch(ingestUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${FUN_CORE_KEY}`,
            "Content-Type": "application/json",
            "X-Fun-Trace-Id": envelope.trace_id,
            "X-Fun-Service": "fun-profile",
            "X-Idempotency-Key": envelope.idempotency_key,
          },
          body: JSON.stringify(envelope),
          signal: ctrl.signal,
        });
        httpStatus = res.status;
        const txt = await res.text().catch(() => "");
        if (res.status >= 200 && res.status < 300) {
          ok = true;
        } else {
          errMsg = `HTTP ${res.status}: ${txt.slice(0, 500)}`;
        }
      } catch (e: any) {
        errMsg = `FETCH_ERROR: ${e?.message ?? String(e)}`;
      } finally {
        clearTimeout(timer);
      }

      const { data: ackData, error: ackErr } = await admin.rpc("fun_profile_outbox_publisher_ack", {
        p_id: row.id,
        p_success: ok,
        p_error: ok ? null : errMsg,
      });
      if (ackErr) {
        results.push({ id: row.id, status: "ACK_FAILED", error: ackErr.message });
        failed++;
        continue;
      }
      const st = (ackData as any)?.status ?? (ok ? "sent" : "failed");
      results.push({ id: row.id, status: st, http: httpStatus, error: errMsg ?? undefined });
      if (st === "sent") sent++;
      else if (st === "dead") dead++;
      else failed++;
    }

    return json(200, {
      ok: true,
      claimed: claimed.length,
      sent,
      failed,
      dead,
      endpoint: ingestUrl,
      results,
    });
  } catch (e: any) {
    console.error("[fun-profile-outbox-publisher]", e);
    return json(500, { error: "INTERNAL", message: e?.message ?? String(e) });
  }
});
