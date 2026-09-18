import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createSupabaseAdmin, sumsubBaseUrl, sumsubEnvironment, sumsubSign } from "../_shared/kycAccess.ts";

/**
 * Phase B Hardening: Fetch applicant detail from Sumsub to extract
 * actual document type / issuing country and compare with what user selected.
 * Returns null if any API call fails — never blocks webhook processing.
 */
async function fetchSumsubApplicantMetadata(applicantId: string): Promise<{
  actualDocumentType: string | null;
  actualIssuingCountry: string | null;
  selectedDocumentType: string | null;
  selectedCountry: string | null;
  moderationComment: string | null;
  clientComment: string | null;
} | null> {
  try {
    const base = sumsubBaseUrl();
    const path = `/resources/applicants/${applicantId}/one`;
    const headers = await sumsubSign({ method: "GET", path });
    const res = await fetch(base + path, { method: "GET", headers });
    if (!res.ok) {
      console.warn("[sumsub-webhook] applicant detail fetch failed", res.status);
      return null;
    }
    const data = await res.json();
    const idDocs: any[] = data?.info?.idDocs ?? [];
    // "Actual" = first uploaded/verified doc; "selected" = requiredIdDocs setup
    const actualDoc = idDocs[0] ?? {};
    const actualDocumentType = actualDoc?.idDocType ?? null;
    const actualIssuingCountry = actualDoc?.country ?? null;

    // Selected: from requiredIdDocs (user's chosen setup)
    const required = data?.requiredIdDocs?.docSets?.[0] ?? {};
    const selectedDocumentType: string | null =
      (required?.types && required.types[0]) || null;
    const selectedCountry: string | null =
      (required?.countries && required.countries[0]) || null;

    const review = data?.review?.reviewResult ?? {};
    return {
      actualDocumentType,
      actualIssuingCountry,
      selectedDocumentType,
      selectedCountry,
      moderationComment: review?.moderationComment ?? null,
      clientComment: review?.clientComment ?? null,
    };
  } catch (e) {
    console.warn("[sumsub-webhook] applicant detail error (non-fatal)", e);
    return null;
  }
}

async function hmacHex(secret: string, raw: string, algo: "SHA-256" | "SHA-1"): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: algo },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabase = createSupabaseAdmin();
  const env = sumsubEnvironment();
  let raw = "";
  try {
    raw = await req.text();
    const webhookSecret = Deno.env.get("SUMSUB_WEBHOOK_SECRET") || "";
    const digestHeader = req.headers.get("x-payload-digest") || "";
    const algHeader = (req.headers.get("x-payload-digest-alg") || "HMAC_SHA256_HEX").toUpperCase();

    let computed = "";
    if (algHeader.includes("SHA256")) computed = await hmacHex(webhookSecret, raw, "SHA-256");
    else if (algHeader.includes("SHA1")) computed = await hmacHex(webhookSecret, raw, "SHA-1");
    else computed = await hmacHex(webhookSecret, raw, "SHA-256");

    const signatureValid = !!webhookSecret && !!digestHeader &&
      digestHeader.toLowerCase() === computed.toLowerCase();

    let payload: any = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    const applicantId: string | undefined = payload.applicantId;
    const externalUserId: string | undefined = payload.externalUserId;
    const eventType: string | undefined = payload.type;
    const reviewStatus: string | undefined = payload.reviewStatus;
    const review = payload.reviewResult ?? {};
    const reviewAnswer: string | undefined = review.reviewAnswer;
    const rejectLabels: string[] = review.rejectLabels || [];
    const rejectType: string | undefined = review.reviewRejectType;
    const eventId: string | undefined = payload.applicantActionId || payload.eventId;
    const createdAtMs = payload.createdAtMs ?? payload.createdAt ?? Date.now();
    const inspectionId: string | undefined = payload.inspectionId;
    const levelName: string | undefined = payload.levelName;

    const webhookHash = eventId
      ? `id:${eventId}`
      : await sha256Hex(
        `sumsub|${applicantId ?? ""}|${eventType ?? ""}|${reviewStatus ?? ""}|${createdAtMs}|${inspectionId ?? ""}`,
      );

    // Look up verification by applicantId
    const { data: verification } = await supabase
      .from("identity_verifications")
      .select("*")
      .eq("provider", "sumsub")
      .eq("provider_applicant_id", applicantId ?? "__none__")
      .maybeSingle();

    const metadataSummary = {
      type: eventType,
      reviewAnswer,
      reviewRejectType: rejectType,
      levelName: levelName ?? verification?.level_name ?? null,
      createdAt: createdAtMs,
      environment: env,
      test_mode: verification?.is_test_verification ?? false,
    };

    // Invalid signature → log + 401, no state change.
    if (!signatureValid) {
      await supabase.from("identity_verification_events").insert({
        identity_verification_id: verification?.id ?? null,
        user_id: verification?.user_id ?? null,
        provider: "sumsub",
        provider_applicant_id: applicantId ?? null,
        external_user_id: externalUserId ?? verification?.external_user_id ?? null,
        provider_event_id: eventId ?? null,
        webhook_event_hash: webhookHash,
        event_type: eventType ?? null,
        status: reviewStatus ?? null,
        review_status: reviewStatus ?? null,
        signature_valid: false,
        processing_status: "failed",
        error_message: "Invalid signature",
        metadata_summary: metadataSummary,
        received_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      });
      await supabase.rpc("kyc_metrics_increment", {
        _provider: "sumsub",
        _field: "invalid_signatures",
        _delta: 1,
      });
      return json({ error: "INVALID_SIGNATURE" }, 401);
    }

    // Insert event row (idempotent via UNIQUE constraint).
    const { error: insertErr } = await supabase
      .from("identity_verification_events")
      .insert({
        identity_verification_id: verification?.id ?? null,
        user_id: verification?.user_id ?? null,
        provider: "sumsub",
        provider_applicant_id: applicantId ?? null,
        external_user_id: externalUserId ?? verification?.external_user_id ?? null,
        provider_event_id: eventId ?? null,
        webhook_event_hash: webhookHash,
        event_type: eventType ?? null,
        status: reviewStatus ?? null,
        review_status: reviewStatus ?? null,
        signature_valid: true,
        processing_status: "received",
        metadata_summary: metadataSummary,
        received_at: new Date().toISOString(),
      });

    if (insertErr) {
      // Unique violation → duplicate
      if ((insertErr as any).code === "23505") {
        await supabase.rpc("kyc_metrics_increment", {
          _provider: "sumsub",
          _field: "duplicate_webhooks",
          _delta: 1,
        });
        return json({ ok: true, duplicate: true });
      }
      console.error("[sumsub-webhook] insert error", insertErr);
      return json({ error: "DB_ERROR" }, 500);
    }

    // Freeze + unknown applicant → skip state change.
    if (!verification) {
      const { data: freezeCfg } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "sumsub_kyc_freeze")
        .maybeSingle();
      const frozen = String(freezeCfg?.value ?? "false").toLowerCase() === "true";
      if (frozen) {
        await supabase
          .from("identity_verification_events")
          .update({
            processing_status: "frozen_skipped",
            processed_at: new Date().toISOString(),
          })
          .eq("provider", "sumsub")
          .eq("webhook_event_hash", webhookHash);
        await supabase.rpc("kyc_metrics_increment", {
          _provider: "sumsub",
          _field: "frozen_skipped",
          _delta: 1,
        });
        return json({ ok: true, frozen: true });
      }
      // Unknown applicant, no verification row to update.
      await supabase
        .from("identity_verification_events")
        .update({
          processing_status: "ignored_duplicate",
          processed_at: new Date().toISOString(),
          error_message: "Unknown applicant",
        })
        .eq("provider", "sumsub")
        .eq("webhook_event_hash", webhookHash);
      return json({ ok: true, unknown_applicant: true });
    }

    // Process state transitions.
    let newStatus: string | null = null;
    let coreEventType: string | null = null;
    let rejectedReason: string | null = null;
    let verifiedAt: string | null = null;

    if (eventType === "applicantPending") {
      newStatus = "in_review";
      coreEventType = "identity.verification.pending";
    } else if (eventType === "applicantReviewed") {
      if (reviewAnswer === "GREEN") {
        newStatus = "approved";
        coreEventType = "identity.verification.approved";
        verifiedAt = new Date().toISOString();
      } else if (reviewAnswer === "RED") {
        newStatus = "rejected";
        coreEventType = "identity.verification.rejected";
        rejectedReason = rejectLabels.length ? rejectLabels.join(",") : (rejectType ?? "rejected");
      }
    } else if (eventType === "applicantOnHold") {
      newStatus = "in_review";
      coreEventType = "identity.verification.pending";
    }

    if (newStatus) {
      const oldStatus = verification.status as string | null;

      // Phase B Hardening: fetch applicant metadata to detect document/country mismatch.
      // Only on approved — for rejected we already know it failed.
      let docMeta: Awaited<ReturnType<typeof fetchSumsubApplicantMetadata>> = null;
      let docMismatch = false;
      let kycRiskFlag: string | null = null;
      if (newStatus === "approved" && applicantId) {
        docMeta = await fetchSumsubApplicantMetadata(applicantId);
        if (docMeta) {
          const selT = (docMeta.selectedDocumentType || "").toUpperCase();
          const actT = (docMeta.actualDocumentType || "").toUpperCase();
          const selC = (docMeta.selectedCountry || "").toUpperCase();
          const actC = (docMeta.actualIssuingCountry || "").toUpperCase();
          const typeMismatch = !!selT && !!actT && selT !== actT;
          const countryMismatch = !!selC && !!actC && selC !== actC;
          docMismatch = typeMismatch || countryMismatch;
          if (docMismatch) kycRiskFlag = "document_mismatch";
        }
      }

      const updatePatch: Record<string, unknown> = {
        status: newStatus,
        review_result_summary: {
          reviewAnswer: reviewAnswer ?? null,
          rejectLabels,
          rejectType: rejectType ?? null,
          moderationComment: docMeta?.moderationComment ?? null,
          clientComment: docMeta?.clientComment ?? null,
          kyc_risk_flag: kycRiskFlag,
        },
      };
      if (verifiedAt) updatePatch.verified_at = verifiedAt;
      if (rejectedReason) updatePatch.rejected_reason = rejectedReason;
      if (docMeta) {
        updatePatch.actual_document_type = docMeta.actualDocumentType;
        updatePatch.actual_issuing_country = docMeta.actualIssuingCountry;
        updatePatch.selected_document_type = docMeta.selectedDocumentType;
        updatePatch.selected_country = docMeta.selectedCountry;
      }
      updatePatch.doc_mismatch = docMismatch;
      updatePatch.kyc_risk_flag = kycRiskFlag;

      await supabase
        .from("identity_verifications")
        .update(updatePatch)
        .eq("id", verification.id);

      // Cache update on profiles — giữ identity_verified=true cho cả Sandbox approved.
      // UI dùng identity_is_test để phân biệt Sandbox vs Production.
      // Trust/Tier/DID/SBT TUYỆT ĐỐI không được đọc identity_verified mà bỏ qua identity_is_test.
      if (newStatus === "approved") {
        await supabase
          .from("profiles")
          .update({
            identity_verified: true,
            identity_verified_at: verifiedAt,
            identity_level: verification.level_name,
            identity_is_test: !!verification.is_test_verification,
          })
          .eq("id", verification.user_id);
      } else if (newStatus === "rejected" || newStatus === "expired") {
        await supabase
          .from("profiles")
          .update({
            identity_verified: false,
            identity_verified_at: null,
          })
          .eq("id", verification.user_id);
      }

      // Risk audit — separate log when mismatch detected
      if (docMismatch) {
        try {
          await supabase.from("identity_audit_logs").insert({
            subject_user_id: verification.user_id,
            actor_type: "webhook",
            source: "sumsub-webhook",
            action: "kyc_risk_flagged",
            old_status: oldStatus,
            new_status: newStatus,
            metadata: {
              provider: "sumsub",
              applicantId,
              risk_flag: "document_mismatch",
              selected_document_type: docMeta?.selectedDocumentType,
              actual_document_type: docMeta?.actualDocumentType,
              selected_country: docMeta?.selectedCountry,
              actual_issuing_country: docMeta?.actualIssuingCountry,
              environment: env,
              is_test: !!verification.is_test_verification,
            },
          });
        } catch (e) {
          console.warn("[sumsub-webhook] risk audit insert failed", e);
        }
      }


      // Counters
      const counterField = newStatus === "approved"
        ? "approved"
        : newStatus === "rejected"
        ? "rejected"
        : "in_review";
      await supabase.rpc("kyc_metrics_increment", {
        _provider: "sumsub",
        _field: counterField,
        _delta: 1,
      });

      // Identity audit log — non-PII
      try {
        await supabase.from("identity_audit_logs").insert({
          subject_user_id: verification.user_id,
          actor_type: "webhook",
          source: "sumsub-webhook",
          action: "status_changed",
          old_status: oldStatus,
          new_status: newStatus,
          metadata: {
            provider: "sumsub",
            applicantId,
            levelName: verification.level_name,
            environment: env,
            is_test: !!verification.is_test_verification,
            reviewAnswer: reviewAnswer ?? null,
            reviewRejectType: rejectType ?? null,
            event_type: eventType ?? null,
            doc_mismatch: docMismatch,
            kyc_risk_flag: kycRiskFlag,
          },
        });
      } catch (e) {
        console.warn("[sumsub-webhook] identity_audit_logs insert failed (non-fatal)", e);
      }


      // identity_events mirror (dotted lowercase) — best-effort
      if (coreEventType) {
        try {
          await supabase.from("identity_events").insert({
            user_id: verification.user_id,
            event_type: coreEventType,
            event_data: {
              provider: "sumsub",
              applicantId,
              status: newStatus,
              environment: env,
              test_mode: verification.is_test_verification,
            },
            source: "sumsub-webhook",
          });
        } catch (e) {
          console.warn("[sumsub-webhook] identity_events insert failed (non-fatal)", e);
        }
      }
    }

    await supabase
      .from("identity_verification_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("provider", "sumsub")
      .eq("webhook_event_hash", webhookHash);

    return json({ ok: true, status: newStatus });
  } catch (e) {
    console.error("[sumsub-webhook] error", e, "raw:", raw.slice(0, 500));
    return json({ error: "INTERNAL_ERROR", message: String((e as { message?: unknown })?.message ?? e) }, 500);
  }
});
