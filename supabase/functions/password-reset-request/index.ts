// Gửi email reset password qua Resend. Luôn trả success để không leak user existence.
// Body: { email }
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBrandedEmail, APP_URL } from "../_shared/resendClient.ts";
import { passwordResetHtml } from "../_shared/emailTemplates.ts";
import { checkTurnstile, CAPTCHA_ERROR_MESSAGE } from "../_shared/turnstile.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { email, captcha_token } = await req.json();
    const normalized = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return new Response(JSON.stringify({ error: "Email không hợp lệ" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    // CAPTCHA (Cloudflare Turnstile): chi ep buoc khi da dat TURNSTILE_SECRET_KEY
    const captchaError = await checkTurnstile(captcha_token);
    if (captchaError) {
      return new Response(JSON.stringify({ error: CAPTCHA_ERROR_MESSAGE }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);

    // Rate limit theo email: 3/giờ
    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `pwd_reset:${normalized}`, p_limit: 3, p_window_ms: 3600000,
    });
    if (rl && rl.allowed === false) {
      return new Response(JSON.stringify({ error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Tìm user trực tiếp trong backend auth bằng RPC service-role để không phụ thuộc profiles.email của user cũ.
    const { data: userId, error: userLookupError } = await admin.rpc("get_auth_user_id_by_email", {
      p_email: normalized,
    });
    if (userLookupError) {
      console.error("[password-reset] user lookup failed:", userLookupError.message);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (userId) {
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await admin.from("password_reset_tokens").delete().eq("user_id", userId).is("used_at", null);
      await admin.from("password_reset_tokens").insert({
        user_id: userId, email: normalized, token, expires_at: expiresAt,
        request_ip: req.headers.get("x-forwarded-for") || null,
      });
      const url = `${APP_URL}/reset-password?token=${token}`;
      await sendBrandedEmail({
        to: normalized,
        subject: "Đặt lại mật khẩu FUN ID 🔐",
        html: passwordResetHtml({ email: normalized, url }),
        emailType: "password_reset",
        redirectTo: url,
        metadata: { flow: "password-reset-request" },
      });
    } else {
      console.log("[password-reset] email không tồn tại (im lặng):", normalized.slice(0,3)+"***");
    }

    // Luôn 200, không leak
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[password-reset] error:", err);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
