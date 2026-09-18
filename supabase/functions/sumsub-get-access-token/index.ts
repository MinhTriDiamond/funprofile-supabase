import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  checkKycAccess,
  createSupabaseAdmin,
  externalUserIdOf,
  getAuthedUserId,
  sumsubBaseUrl,
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
    const externalUserId = externalUserIdOf(userId);
    const ttl = 600;

    console.log("[sumsub-get-access-token] sending levelName to Sumsub:", levelName, "externalUserId:", externalUserId);
    const path = `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(levelName)}&ttlInSecs=${ttl}`;
    const signed = await sumsubSign({ method: "POST", path, body: "" });

    const res = await fetch(sumsubBaseUrl() + path, {
      method: "POST",
      headers: { ...signed, Accept: "application/json" },
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error("[sumsub-get-access-token] sumsub error", res.status, "levelName:", levelName, raw);
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
      return json(
        { error: "SUMSUB_API_ERROR", message: "Không lấy được phiên KYC. Vui lòng thử lại." },
        502,
      );
    }
    const { token, userId: extId } = JSON.parse(raw);
    return json({ token, userId: extId, ttl, levelName, isTest: gate.isTest });
  } catch (e) {
    console.error("[sumsub-get-access-token] error", e);
    return json({ error: "INTERNAL_ERROR", message: String((e as { message?: unknown })?.message ?? e) }, 500);
  }
});
