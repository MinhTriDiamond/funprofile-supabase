import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  checkKycAccess,
  createSupabaseAdmin,
  externalUserIdOf,
  getAuthedUserId,
  sumsubBaseUrl,
  sumsubEnvironment,
  sumsubSign,
} from "../_shared/kycAccess.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const userId = await getAuthedUserId(req);
    if (!userId) return json({ error: "UNAUTHORIZED" }, 401);

    const supabase = createSupabaseAdmin();
    const gate = await checkKycAccess({ supabaseAdmin: supabase, userId, enforceFreeze: true });
    if (!gate.allowed) return json({ error: gate.error, message: gate.message }, gate.status);

    const levelName = Deno.env.get("SUMSUB_LEVEL_NAME") || "basic-kyc-level";
    const env = sumsubEnvironment();
    const externalUserId = externalUserIdOf(userId);

    // Reuse existing verification row if any.
    const { data: existing } = await supabase
      .from("identity_verifications")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "sumsub")
      .maybeSingle();

    if (existing?.provider_applicant_id) {
      return json({
        applicantId: existing.provider_applicant_id,
        status: existing.status,
        reused: true,
        isTest: gate.isTest,
        environment: existing.verification_environment,
      });
    }

    // Create applicant on Sumsub.
    console.log("[sumsub-create-applicant] sending levelName to Sumsub:", levelName, "env:", env);
    const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;
    const body = JSON.stringify({ externalUserId });
    const signedHeaders = await sumsubSign({ method: "POST", path, body });

    const res = await fetch(sumsubBaseUrl() + path, {
      method: "POST",
      headers: { ...signedHeaders, "Content-Type": "application/json", Accept: "application/json" },
      body,
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error("[sumsub-create-applicant] sumsub error", res.status, "levelName:", levelName, raw);
      const lower = raw.toLowerCase();
      const isLevelMissing =
        lower.includes("level") &&
        (lower.includes("not found") || lower.includes("does not exist") || lower.includes("no such level") || lower.includes("unknown level"));
      if (isLevelMissing) {
        return json(
          {
            error: "LEVEL_NOT_FOUND",
            message: `Sumsub level chưa được cấu hình hoặc không tồn tại: ${levelName}`,
            levelName,
          },
          422,
        );
      }
      return json({ error: "SUMSUB_API_ERROR", message: "Không tạo được hồ sơ KYC. Vui lòng thử lại sau.", details: raw }, 502);
    }
    const applicant = JSON.parse(raw);
    const applicantId = applicant.id as string;

    // Upsert verification row.
    const verRow = {
      user_id: userId,
      provider: "sumsub",
      provider_applicant_id: applicantId,
      external_user_id: externalUserId,
      status: "pending" as const,
      level_name: levelName,
      is_test_verification: gate.isTest,
      verification_environment: env,
      source_platform: "fun-profile",
    };
    const { data: upserted, error: upErr } = await supabase
      .from("identity_verifications")
      .upsert(verRow, { onConflict: "user_id,provider" })
      .select()
      .single();
    if (upErr) console.error("[sumsub-create-applicant] upsert error", upErr);

    await supabase.rpc("kyc_metrics_increment", {
      _provider: "sumsub",
      _field: "total_applicants",
      _delta: 1,
    });

    // Audit event
    await supabase.from("identity_verification_events").insert({
      identity_verification_id: upserted?.id,
      user_id: userId,
      provider: "sumsub",
      provider_applicant_id: applicantId,
      external_user_id: externalUserId,
      webhook_event_hash: `local:created:${applicantId}`,
      event_type: "identity.verification.started",
      status: "pending",
      signature_valid: true,
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      metadata_summary: { environment: env, test_mode: gate.isTest, levelName },
    });

    // Identity audit log (Phase B)
    try {
      await supabase.from("identity_audit_logs").insert({
        subject_user_id: userId,
        actor_type: "user",
        actor_user_id: userId,
        source: "sumsub-create-applicant",
        action: "applicant_created",
        old_status: null,
        new_status: "pending",
        metadata: {
          provider: "sumsub",
          applicantId,
          environment: env,
          is_test: gate.isTest,
          levelName,
        },
      });
    } catch (e) {
      console.warn("[sumsub-create-applicant] audit insert failed (non-fatal)", e);
    }

    return json({
      applicantId,
      status: "pending",
      reused: false,
      isTest: gate.isTest,
      environment: env,
    });
  } catch (e) {
    console.error("[sumsub-create-applicant] error", e);
    return json({ error: "INTERNAL_ERROR", message: String(e?.message ?? e) }, 500);
  }
});
