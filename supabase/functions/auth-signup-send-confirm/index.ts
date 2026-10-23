// Tạo user mới (chưa confirm) qua admin API + gửi email xác nhận qua Resend.
// Body: { email, password, username, wallet_address? }
// Trả: { success, user_id? } — KHÔNG leak xem email đã tồn tại hay chưa khi đã confirm.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBrandedEmail, APP_URL } from "../_shared/resendClient.ts";
import { signupConfirmHtml } from "../_shared/emailTemplates.ts";
import { logSignupFailure } from '../_shared/signupFailureLog.ts';
import { assertSignupEnabled } from "../_shared/signupGate.ts";
import { checkTurnstile, CAPTCHA_ERROR_MESSAGE } from "../_shared/turnstile.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { email, password, username, wallet_address, captcha_token } = await req.json();
    if (!email || !password || !username) {
      return new Response(JSON.stringify({ error: "Thiếu thông tin" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return new Response(JSON.stringify({ error: "Email không hợp lệ" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (String(password).length < 8) {
      return new Response(JSON.stringify({ error: "Mật khẩu tối thiểu 8 ký tự" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // CAPTCHA (Cloudflare Turnstile): chi ep buoc khi da dat TURNSTILE_SECRET_KEY
    const captchaError = await checkTurnstile(captcha_token);
    if (captchaError) {
      return new Response(JSON.stringify({ error: CAPTCHA_ERROR_MESSAGE }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);

    // P1: Rate limit trước khi tạo user/token/gửi mail. 3 keys: email/hour, email/day, ip/hour.
    const ipRaw = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const friendly429 = "Bạn đã thử đăng ký quá nhiều lần. Vui lòng đợi một lúc rồi thử lại nhé 💛";
    const checks: Array<{ key: string; limit: number; window: number }> = [
      { key: `signup_email_hour:${normalizedEmail}`, limit: 3, window: 3_600_000 },
      { key: `signup_email_day:${normalizedEmail}`, limit: 10, window: 86_400_000 },
      { key: `signup_ip_hour:${ipRaw}`, limit: 20, window: 3_600_000 },
    ];
    for (const c of checks) {
      try {
        const { data: rl, error: rlErr } = await admin.rpc("check_rate_limit", {
          p_key: c.key, p_limit: c.limit, p_window_ms: c.window,
        });
        if (rlErr) {
          console.warn("[signup-send-confirm] rate limit RPC error (fail-open):", c.key, rlErr.message);
          continue;
        }
        if (rl && rl.allowed === false) {
          console.warn("[signup-send-confirm] 429 blocked:", c.key);
          return new Response(JSON.stringify({ error: friendly429 }), {
            status: 429,
            headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(Math.ceil(c.window / 1000)) },
          });
        }
      } catch (e) {
        console.warn("[signup-send-confirm] rate limit exception (fail-open):", c.key, e);
      }
    }

    // Cổng chặn đăng ký (cutover migrate)
    const signupGate = await assertSignupEnabled(admin, cors);
    if (signupGate) return signupGate;

    // Tạo user với email_confirm:false để Supabase KHÔNG gửi email built-in
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: false,
      user_metadata: {
        username: String(username).trim(),
        wallet_address: wallet_address ? String(wallet_address).toLowerCase() : undefined,
      },
    });

    if (createErr || !created.user) {
      const rawMsg = createErr?.message || "";
      const errStatus = (createErr as any)?.status;
      const errCode = (createErr as any)?.code || (createErr as any)?.name;
      console.error("[signup-send-confirm] createUser error full:", JSON.stringify({
        message: rawMsg, status: errStatus, code: errCode, raw: createErr,
      }));
      await logSignupFailure(admin, { source: "auth-signup-send-confirm", email: normalizedEmail, username: String(username ?? "").trim(), error: createErr });
      const lower = rawMsg.toLowerCase();
      if (lower.includes("already") || lower.includes("registered") || lower.includes("exists") || errCode === "email_exists") {
        return new Response(JSON.stringify({ error: "Email này đã được đăng ký. Hãy đăng nhập hoặc dùng Quên mật khẩu." }), { status: 409, headers: { ...cors, "Content-Type": "application/json" } });
      }
      const friendly = rawMsg && rawMsg !== "{}"
        ? rawMsg
        : `Không tạo được tài khoản (mã ${errStatus ?? "?"}/${errCode ?? "?"}). Vui lòng thử lại hoặc liên hệ hỗ trợ.`;
      return new Response(JSON.stringify({ error: friendly, debug: { status: errStatus, code: errCode } }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const userId = created.user.id;
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await admin.from("email_confirm_tokens").delete().eq("user_id", userId).is("used_at", null);
    const { error: insErr } = await admin.from("email_confirm_tokens").insert({
      user_id: userId, email: normalizedEmail, token, expires_at: expiresAt,
      request_ip: req.headers.get("x-forwarded-for") || null,
    });
    if (insErr) {
      console.error("[signup-send-confirm] token insert:", insErr);
      return new Response(JSON.stringify({ error: "Lỗi tạo token xác nhận" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const confirmUrl = `${APP_URL}/confirm-email?token=${token}`;
    const result = await sendBrandedEmail({
      to: normalizedEmail,
      subject: "Xác nhận tài khoản FUN Ecosystem 💖",
      html: signupConfirmHtml({ email: normalizedEmail, url: confirmUrl }),
      emailType: "signup_confirm",
      redirectTo: confirmUrl,
      metadata: { flow: "auth-signup-send-confirm" },
    });
    if (!result.ok) {
      return new Response(JSON.stringify({ error: "Không gửi được email xác nhận. Vui lòng thử lại." }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[signup-send-confirm] error:", err);
    return new Response(JSON.stringify({ error: "Lỗi hệ thống" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
