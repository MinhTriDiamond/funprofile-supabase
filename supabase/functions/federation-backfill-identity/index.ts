// FP-2A: Push FUN Profile identity to FUN Core Identity Backbone
// Admin-only edge function — orchestrate dry_run / run_one / run_batch / retry_failed / pause / stop
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const FUN_CORE_BASE = (Deno.env.get("FUN_CORE_API_BASE_URL_PROD") ?? "https://api.fun.rich").replace(/\/+$/, "");
const FUN_CORE_KEY = Deno.env.get("FUN_CORE_API_KEY_FOR_FUN_PROFILE") ?? "";
const PLATFORM = "fun-profile";
const TIMEOUT_MS = 10_000;
const MAX_BATCH = 100;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface BodyShape {
  action: "dry_run" | "run_one" | "run_batch" | "retry_failed" | "pause" | "stop" | "status";
  job_id?: string;
  target_user_id?: string;
  batch_size?: number;
  filters?: {
    include_banned?: boolean;
    include_test?: boolean;
    include_unverified?: boolean;
  };
}

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pickDisplayName(p: any): string | null {
  const dn = (p.display_name ?? "").toString().trim();
  if (dn) return dn;
  const un = (p.username ?? "").toString().trim();
  if (un) return un;
  return null;
}

interface CandidateProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  profile_email: string | null;
  auth_email: string | null;
  is_banned: boolean;
  identity_is_test: boolean;
  email_confirmed_at: string | null;
}

async function fetchDidForUser(admin: any, userId: string): Promise<{ did: string | null; verified: boolean }> {
  const { data } = await admin
    .from("did_registry")
    .select("did_id,status,did_level")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (!data?.did_id) return { did: null, verified: false };
  const verified = data.status === "active" && ["L2", "L3", "L4"].includes(data.did_level);
  return { did: data.did_id, verified };
}

async function fetchEligibleList(admin: any, filters: BodyShape["filters"], limit: number): Promise<CandidateProfile[]> {
  const { data, error } = await admin.rpc("fp_backfill_eligible_profiles", {
    p_limit: limit,
    p_include_banned: !!filters?.include_banned,
    p_include_test: !!filters?.include_test,
    p_include_unverified: !!filters?.include_unverified,
  });
  if (error) throw new Error(`fp_backfill_eligible_profiles: ${error.message}`);
  return (data ?? []) as CandidateProfile[];
}

async function fetchEligibleCount(admin: any, filters: BodyShape["filters"]): Promise<number> {
  const { data, error } = await admin.rpc("fp_backfill_eligible_count", {
    p_include_banned: !!filters?.include_banned,
    p_include_test: !!filters?.include_test,
    p_include_unverified: !!filters?.include_unverified,
  });
  if (error) throw new Error(`fp_backfill_eligible_count: ${error.message}`);
  return Number(data ?? 0);
}

async function buildPayload(admin: any, p: CandidateProfile, traceId: string): Promise<any> {
  const { did, verified } = await fetchDidForUser(admin, p.id);
  const email = ((p.auth_email ?? p.profile_email) ?? "").trim().toLowerCase();
  const emailVerified = !!p.email_confirmed_at;
  const email_hash = email && emailVerified ? await sha256Hex(email) : null;
  const display_name = pickDisplayName(p);
  const idemKey = `fp-id-${p.id}`;
  return {
    schema_version: 1,
    platform_slug: PLATFORM,
    origin_platform: PLATFORM,
    source_platform: PLATFORM,
    platform_user_id: p.id,
    display_name,
    email_hash,
    email_verified: emailVerified,
    email_verified_at: p.email_confirmed_at,
    did,
    did_verified: !!did && verified,
    idempotency_key: idemKey,
    trace_id: traceId,
    source: { service: "fun-profile", version: "FP-2A" },
  };
}

async function postPlatformUser(payload: any, traceId: string): Promise<{ status: number; body: any; durationMs: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${FUN_CORE_BASE}/api/v1/identity/platform-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${FUN_CORE_KEY}`,
        "X-Fun-Trace-Id": traceId,
        "X-Fun-Service": "fun-profile",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: res.status, body, durationMs: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

async function pushOne(admin: any, jobId: string, p: CandidateProfile): Promise<{ ok: boolean; status: number; error?: string }> {
  const traceId = crypto.randomUUID();
  const payload = await buildPayload(admin, p, traceId);
  const idemKey = payload.idempotency_key;

  const logBase = {
    job_id: jobId,
    target_user_id: p.id,
    platform: PLATFORM,
    platform_user_id: p.id,
    idempotency_key: idemKey,
    trace_id: traceId,
    endpoint: "/api/v1/identity/platform-user",
    http_method: "POST",
    request_sample: { ...payload, email_hash: payload.email_hash ? `${payload.email_hash.slice(0, 12)}…` : null },
  };

  let attempts = 0;
  let lastStatus = 0;
  let lastBody: any = null;
  let lastErr: string | null = null;
  while (attempts < 3) {
    attempts += 1;
    try {
      const r = await postPlatformUser(payload, traceId);
      lastStatus = r.status;
      lastBody = r.body;
      if (r.status >= 200 && r.status < 300) {
        await admin.from("federation_sync_logs").upsert({
          ...logBase,
          attempts,
          http_status: r.status,
          response_sample: r.body,
          status: "ok",
          ecosystem_identity_id: r.body?.ecosystem_identity_id ?? null,
          last_error: null,
        }, { onConflict: "idempotency_key" });
        return { ok: true, status: r.status };
      }
      if (r.status >= 500 || r.status === 429) {
        lastErr = `HTTP ${r.status}`;
        await new Promise((res) => setTimeout(res, 500 * attempts));
        continue;
      }
      lastErr = `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`;
      break;
    } catch (e: any) {
      lastErr = e?.message ?? "fetch error";
      lastStatus = 0;
      await new Promise((res) => setTimeout(res, 500 * attempts));
    }
  }

  await admin.from("federation_sync_logs").upsert({
    ...logBase,
    attempts,
    http_status: lastStatus || null,
    response_sample: lastBody,
    status: "failed",
    last_error: lastErr,
  }, { onConflict: "idempotency_key" });
  return { ok: false, status: lastStatus, error: lastErr ?? "unknown" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!FUN_CORE_KEY) return json(500, { error: "CONFIG_ERROR", message: "FUN_CORE_API_KEY_FOR_FUN_PROFILE chưa cấu hình" });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "UNAUTHORIZED" });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(401, { error: "UNAUTHORIZED" });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "FORBIDDEN_NOT_ADMIN" });

    const body = (await req.json().catch(() => ({}))) as BodyShape;
    const action = body.action;
    const filters = body.filters ?? {};

    if (action === "status") {
      const { data: jobs } = await admin.from("federation_sync_jobs").select("*").order("created_at", { ascending: false }).limit(20);
      return json(200, { jobs });
    }

    if (action === "pause" || action === "stop") {
      if (!body.job_id) return json(400, { error: "job_id required" });
      const newStatus = action === "pause" ? "paused" : "stopped";
      const { data, error } = await admin.from("federation_sync_jobs").update({ status: newStatus, finished_at: action === "stop" ? new Date().toISOString() : null }).eq("id", body.job_id).select().maybeSingle();
      if (error) return json(500, { error: error.message });
      return json(200, { job: data });
    }

    if (action === "dry_run") {
      const batchSize = Math.min(Math.max(body.batch_size ?? 50, 1), MAX_BATCH);
      const [candidates, totalEligible] = await Promise.all([
        fetchEligibleList(admin, filters, batchSize),
        fetchEligibleCount(admin, filters),
      ]);
      const { data: job } = await admin.from("federation_sync_jobs").insert({
        mode: "dry_run",
        filters,
        batch_size: batchSize,
        status: "completed",
        total_count: totalEligible,
        processed_count: candidates.length,
        skipped_count: candidates.length,
        created_by: user.id,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      }).select().single();

      let samplePayload: any = null;
      if (candidates[0]) {
        const previewTrace = crypto.randomUUID();
        const real = await buildPayload(admin, candidates[0], previewTrace);
        // mask email hash for preview
        samplePayload = { ...real, email_hash: real.email_hash ? `${real.email_hash.slice(0, 12)}…` : null };
      }

      return json(200, {
        job,
        total_eligible: totalEligible,
        preview_count: candidates.length,
        sample_candidates: candidates.slice(0, 5).map((c) => ({
          id: c.id,
          username: c.username,
          display_name: c.display_name,
          email_verified: !!c.email_confirmed_at,
        })),
        sample_payload: samplePayload,
        endpoint: `${FUN_CORE_BASE}/api/v1/identity/platform-user`,
      });
    }

    if (action === "run_one") {
      if (!body.target_user_id) return json(400, { error: "target_user_id required" });
      const { data: rows, error: pe } = await admin.rpc("fp_backfill_lookup_one", { p_user_id: body.target_user_id });
      const prof = (rows ?? [])[0] as CandidateProfile | undefined;
      if (pe || !prof) return json(404, { error: "USER_NOT_FOUND", message: pe?.message });
      const { data: job } = await admin.from("federation_sync_jobs").insert({
        mode: "run_one",
        filters,
        batch_size: 1,
        status: "running",
        total_count: 1,
        created_by: user.id,
        started_at: new Date().toISOString(),
      }).select().single();
      const res = await pushOne(admin, job!.id, prof);
      await admin.from("federation_sync_jobs").update({
        status: res.ok ? "completed" : "failed",
        processed_count: 1,
        succeeded_count: res.ok ? 1 : 0,
        failed_count: res.ok ? 0 : 1,
        last_error: res.ok ? null : res.error,
        finished_at: new Date().toISOString(),
      }).eq("id", job!.id);
      const { data: log } = await admin.from("federation_sync_logs").select("*").eq("job_id", job!.id).maybeSingle();
      return json(200, { job_id: job!.id, result: res, log });
    }

    if (action === "run_batch") {
      const batchSize = Math.min(Math.max(body.batch_size ?? 10, 1), MAX_BATCH);
      const { data: doneIds } = await admin.from("federation_sync_logs").select("target_user_id").eq("status", "ok");
      const excludeSet = new Set((doneIds ?? []).map((r: any) => r.target_user_id));
      const candidates = await fetchEligibleList(admin, filters, batchSize * 3);
      const list = candidates.filter((c) => !excludeSet.has(c.id)).slice(0, batchSize);
      const { data: job } = await admin.from("federation_sync_jobs").insert({
        mode: "run_batch",
        filters,
        batch_size: batchSize,
        status: "running",
        total_count: list.length,
        created_by: user.id,
        started_at: new Date().toISOString(),
      }).select().single();
      let ok = 0; let fail = 0;
      for (const c of list) {
        const { data: cur } = await admin.from("federation_sync_jobs").select("status").eq("id", job!.id).maybeSingle();
        if (cur?.status === "paused" || cur?.status === "stopped") break;
        const r = await pushOne(admin, job!.id, c);
        if (r.ok) ok += 1; else fail += 1;
        await admin.from("federation_sync_jobs").update({
          processed_count: ok + fail, succeeded_count: ok, failed_count: fail,
        }).eq("id", job!.id);
      }
      await admin.from("federation_sync_jobs").update({
        status: fail === 0 ? "completed" : (ok === 0 ? "failed" : "completed"),
        finished_at: new Date().toISOString(),
      }).eq("id", job!.id);
      return json(200, { job_id: job!.id, processed: ok + fail, succeeded: ok, failed: fail });
    }

    if (action === "retry_failed") {
      if (!body.job_id) return json(400, { error: "job_id required" });
      const { data: failedLogs } = await admin.from("federation_sync_logs")
        .select("target_user_id").eq("job_id", body.job_id).eq("status", "failed");
      const ids = (failedLogs ?? []).map((r: any) => r.target_user_id).filter(Boolean);
      if (!ids.length) return json(200, { processed: 0, message: "no failed logs" });
      let ok = 0; let fail = 0;
      for (const uid of ids) {
        const { data: rows } = await admin.rpc("fp_backfill_lookup_one", { p_user_id: uid });
        const prof = (rows ?? [])[0] as CandidateProfile | undefined;
        if (!prof) { fail += 1; continue; }
        const r = await pushOne(admin, body.job_id, prof);
        if (r.ok) ok += 1; else fail += 1;
      }
      return json(200, { processed: ok + fail, succeeded: ok, failed: fail });
    }

    return json(400, { error: "UNKNOWN_ACTION" });
  } catch (e: any) {
    console.error("[federation-backfill-identity]", e);
    return json(500, { error: "INTERNAL", message: e?.message ?? String(e) });
  }
});
