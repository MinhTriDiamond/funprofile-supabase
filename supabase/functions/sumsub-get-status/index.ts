import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  checkKycAccess,
  createSupabaseAdmin,
  getAuthedUserId,
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
    const gate = await checkKycAccess({ supabaseAdmin: supabase, userId, enforceFreeze: false });
    if (!gate.allowed) return json({ error: gate.error, message: gate.message }, gate.status);

    const { data, error } = await supabase
      .from("identity_verifications")
      .select(
        "id, status, level_name, verified_at, rejected_reason, is_test_verification, verification_environment, provider_applicant_id, updated_at",
      )
      .eq("user_id", userId)
      .eq("provider", "sumsub")
      .maybeSingle();
    if (error) {
      console.error("[sumsub-get-status] db error", error);
      return json({ error: "DB_ERROR", message: error.message }, 500);
    }

    return json({
      verification: data ?? null,
      isTest: gate.isTest,
      frozen: gate.frozen,
    });
  } catch (e) {
    console.error("[sumsub-get-status] error", e);
    return json({ error: "INTERNAL_ERROR", message: String((e as { message?: unknown })?.message ?? e) }, 500);
  }
});
