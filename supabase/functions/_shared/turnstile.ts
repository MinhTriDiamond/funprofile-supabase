// Xác thực Cloudflare Turnstile phía server cho các hàm cổng xác thực
// (sso-otp-request, auth-signup-send-confirm, password-reset-request).
// Chỉ ÉP BUỘC khi secret TURNSTILE_SECRET_KEY đã được đặt trong Edge
// Function secrets; chưa đặt thì cho qua để triển khai từng bước an toàn:
// frontend lên trước, đặt secret sau, không khóa người dùng thật giữa chừng.
export async function checkTurnstile(captchaToken: unknown): Promise<string | null> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return null;
  if (!captchaToken || typeof captchaToken !== "string") return "captcha_required";
  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: captchaToken }),
    });
    const data = await resp.json();
    return data?.success ? null : "captcha_failed";
  } catch (err) {
    console.error("[turnstile] siteverify error:", err);
    return "captcha_failed";
  }
}

export const CAPTCHA_ERROR_MESSAGE =
  "Security check (CAPTCHA) failed or missing. Please complete the challenge and try again.";
