import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Admin-only listing of identity_verifications + per-user events.
// verify_jwt = false (default for Lovable edge functions) → we validate JWT + admin role in code.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "UNAUTHORIZED" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const ANON = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "UNAUTHORIZED" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: isAdminData } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdminData) return json({ error: "FORBIDDEN" }, 403);

    const body = await req.json().catch(() => ({} as any));
    const mode: string = body.mode ?? "list";

    if (mode === "detail") {
      const verificationId: string | undefined = body.verification_id;
      const applicantId: string | undefined = body.applicantId ?? body.provider_applicant_id;
      if (!verificationId && !applicantId) return json({ error: "BAD_REQUEST" }, 400);

      let verQuery = admin.from("identity_verifications").select("*");
      if (verificationId) verQuery = verQuery.eq("id", verificationId);
      else verQuery = verQuery.eq("provider_applicant_id", applicantId!);
      const { data: ver } = await verQuery.maybeSingle();
      if (!ver) return json({ verification: null, events: [], audits: [] });

      const [{ data: events }, { data: audits }] = await Promise.all([
        admin
          .from("identity_verification_events")
          .select(
            "id, event_type, status, signature_valid, processing_status, processed_at, received_at, webhook_event_hash, metadata_summary, error_message",
          )
          .eq("identity_verification_id", ver.id)
          .order("received_at", { ascending: false })
          .limit(100),
        admin
          .from("identity_audit_logs")
          .select("*")
          .eq("subject_user_id", ver.user_id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      return json({ verification: ver, events: events ?? [], audits: audits ?? [] });
    }


    // mode === "list"
    const status: string | undefined = body.status;
    const environment: string | undefined = body.environment;
    const isTest: boolean | undefined = typeof body.is_test === "boolean" ? body.is_test : undefined;
    const mismatchOnly: boolean = body.mismatch_only === true;
    const q: string | undefined = body.q?.trim() || undefined;
    const page: number = Math.max(1, Number(body.page ?? 1));
    const pageSize: number = Math.min(100, Math.max(10, Number(body.page_size ?? 50)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = admin
      .from("identity_verifications")
      .select(
        "id, user_id, provider, provider_applicant_id, status, level_name, verified_at, rejected_reason, is_test_verification, verification_environment, updated_at, created_at, actual_document_type, actual_issuing_country, selected_document_type, selected_country, doc_mismatch, kyc_risk_flag",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (environment) query = query.eq("verification_environment", environment);
    if (typeof isTest === "boolean") query = query.eq("is_test_verification", isTest);
    if (mismatchOnly) query = query.eq("doc_mismatch", true);
    if (q) {
      // search by applicantId; user lookup done separately
      query = query.or(`provider_applicant_id.ilike.%${q}%`);
    }

    const { data: items, count, error } = await query.range(from, to);
    if (error) return json({ error: "DB_ERROR", message: error.message }, 500);

    // Enrich with profiles + email
    const userIds = Array.from(new Set((items ?? []).map((r: any) => r.user_id)));
    let profileMap: Record<string, any> = {};
    let emailMap: Record<string, string | null> = {};
    if (userIds.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, identity_verified, identity_is_test, identity_level")
        .in("id", userIds);
      profileMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));

      // batch fetch emails — admin.auth.admin.getUserById per id (no batch API)
      await Promise.all(
        userIds.map(async (uid) => {
          try {
            const { data } = await admin.auth.admin.getUserById(uid);
            emailMap[uid] = data?.user?.email ?? null;
          } catch {
            emailMap[uid] = null;
          }
        }),
      );
    }

    // Summary — aggregate last 30 days of wide-column metrics
    const { data: summary } = await admin
      .from("identity_kyc_metrics")
      .select(
        "total_applicants, approved, in_review, pending, rejected, expired, duplicate_webhooks, invalid_signatures, frozen_skipped",
      )
      .eq("provider", "sumsub")
      .order("metric_date", { ascending: false })
      .limit(30);
    const summaryMap: Record<string, number> = {
      total_applicants: 0,
      approved: 0,
      in_review: 0,
      pending: 0,
      rejected: 0,
      expired: 0,
      duplicate_webhooks: 0,
      invalid_signatures: 0,
      frozen_skipped: 0,
    };
    for (const row of summary ?? []) {
      for (const k of Object.keys(summaryMap)) {
        summaryMap[k] += Number((row as any)[k] ?? 0);
      }
    }

    // Fallback: if no metrics rows yet, derive counts from identity_verifications
    if ((summary ?? []).length === 0) {
      const { data: vers } = await admin
        .from("identity_verifications")
        .select("status")
        .eq("provider", "sumsub");
      for (const v of vers ?? []) {
        summaryMap.total_applicants += 1;
        const s = (v as any).status as string;
        if (s in summaryMap) summaryMap[s] += 1;
      }
    }


    const enriched = (items ?? []).map((r: any) => ({
      ...r,
      profile: profileMap[r.user_id] ?? null,
      email: emailMap[r.user_id] ?? null,
    }));

    return json({
      items: enriched,
      total: count ?? 0,
      page,
      page_size: pageSize,
      summary: summaryMap,
    });
  } catch (e) {
    console.error("[admin-kyc-list] error", e);
    return json({ error: "INTERNAL_ERROR", message: String((e as Error)?.message ?? e) }, 500);
  }
});
