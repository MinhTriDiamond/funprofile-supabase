import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { checkKycAccess, createSupabaseAdmin, getAuthedUserId } from "../_shared/kycAccess.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const userId = await getAuthedUserId(req);
    if (!userId) return json({ ctaVisible: false, reason: "UNAUTHORIZED", isTest: false, frozen: false }, 200);

    const supabase = createSupabaseAdmin();
    const gate = await checkKycAccess({ supabaseAdmin: supabase, userId, enforceFreeze: false });

    return json({
      ctaVisible: gate.allowed,
      reason: gate.error ?? null,
      message: gate.message ?? null,
      isTest: gate.isTest,
      frozen: gate.frozen,
    });
  } catch (e) {
    console.error("[kyc-access-check] error", e);
    return json({ ctaVisible: false, reason: "INTERNAL_ERROR", isTest: false, frozen: false }, 200);
  }
});
