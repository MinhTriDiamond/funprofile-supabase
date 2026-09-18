// signupGate.ts — CỔNG CHẶN ĐĂNG KÝ TÀI KHOẢN MỚI (dùng cho cutover migrate).
//
// Nguồn sự thật duy nhất: `app_settings.key = 'signup_enabled'` (JSON boolean).
// - Thiếu key hoặc lỗi đọc ⇒ FAIL-SAFE MỞ (true) để không tự khoá đăng ký
//   ngoài ý muốn khi DB lỗi tạm thời.
// - Chỉ áp cho luồng TẠO TÀI KHOẢN MỚI. KHÔNG áp cho đăng nhập tài khoản cũ,
//   không áp cho gộp tài khoản (sso-merge-*) và không áp cho admin tạo tay.
//
// Cách dùng trong edge function, ngay TRƯỚC khi gọi `auth.admin.createUser`:
//
//   const gate = await assertSignupEnabled(admin);
//   if (gate) return gate;   // 403 kèm message tiếng Việt

// deno-lint-ignore no-explicit-any
type Client = any;

export const SIGNUP_DISABLED_MESSAGE =
  "Hệ thống đang tạm khoá việc tạo tài khoản mới để chuyển đổi hạ tầng. Vui lòng thử lại sau.";

export async function isSignupEnabled(admin: Client): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "signup_enabled")
      .maybeSingle();
    if (error || !data) return true; // fail-safe mở
    const v = data.value;
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return v !== "false";
    return true;
  } catch {
    return true;
  }
}

/** Trả về Response 403 nếu đang khoá, `null` nếu được phép đăng ký. */
export async function assertSignupEnabled(
  admin: Client,
  extraHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const enabled = await isSignupEnabled(admin);
  if (enabled) return null;
  return new Response(
    JSON.stringify({
      success: false,
      error: "signup_disabled",
      message: SIGNUP_DISABLED_MESSAGE,
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json", ...extraHeaders },
    },
  );
}
