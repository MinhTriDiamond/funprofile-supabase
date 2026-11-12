// signupBlockGuard.ts — CHỐT CHẶN ĐĂNG KÝ theo danh sách chặn + thiết bị bị gắn cờ.
//
// Nguồn sự thật nằm ở phía cơ sở dữ liệu (migration 20261023130000_signup_device_guard.sql):
//   - public.signup_blocklist: danh sách chặn hợp nhất (email | wallet | device)
//   - public.check_signup_block(email, device_hash, wallet): hàm kiểm tra gồm
//       (a) khớp danh sách chặn cứng;
//       (b) thiết bị có is_flagged=true trong pplp_device_registry VÀ vượt ngưỡng
//           (>= 10 tài khoản từng gắn với thiết bị, hoặc >= 3 tài khoản tạo trong 24h).
//   - public.signup_block_log: mỗi lần chặn đều ghi 1 dòng để admin xem lại.
//
// Cách dùng — giống hệt signupGate.ts, gọi NGAY TRƯỚC `auth.admin.createUser`:
//
//   const blocked = await assertNotSignupBlocked(admin, { email, deviceHash, source }, corsHeaders);
//   if (blocked) return blocked;   // 403 { success:false, error:"signup_blocked", message }
//
// Nguyên tắc an toàn:
//   - CHỈ áp cho luồng TẠO TÀI KHOẢN MỚI. Đăng nhập tài khoản hiện hữu không
//     đi qua chốt này, nên người thật dùng chung thiết bị bị gắn cờ (ví dụ máy
//     dùng chung ở cộng đồng) vẫn đăng nhập bình thường.
//   - FAIL-SAFE MỞ: lỗi đọc DB / migration chưa chạy ⇒ cho qua (blocked=false)
//     kèm console.error, để chốt không tự khoá toàn bộ đăng ký khi phần DB
//     chưa sẵn sàng — cùng triết lý với signupGate.ts.
//   - Thông báo cho người dùng KHÔNG lộ chi tiết kỹ thuật (không nêu giá trị
//     nào bị chặn, không nêu ngưỡng), chỉ hướng dẫn liên hệ hỗ trợ.

// deno-lint-ignore no-explicit-any
type Client = any;

export const SIGNUP_BLOCKED_MESSAGE =
  "Không thể tạo tài khoản mới với thông tin này. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ đội hỗ trợ FUN Profile để được xem xét.";

export interface SignupBlockInput {
  email?: string | null;
  deviceHash?: string | null;
  walletAddress?: string | null;
  /** Edge function đang thực thi việc chặn: 'sso-otp-verify' | 'sso-web3-auth' */
  source: string;
  ipAddress?: string | null;
}

export interface SignupBlockResult {
  blocked: boolean;
  blockType?: string;
  matchedValue?: string;
  rule?: string;
}

/** Kiểm tra + (nếu bị chặn) ghi log. Không bao giờ throw — lỗi hạ tầng ⇒ fail-open. */
export async function checkSignupBlock(
  admin: Client,
  input: SignupBlockInput,
): Promise<SignupBlockResult> {
  try {
    const { data, error } = await admin.rpc("check_signup_block", {
      p_email: input.email ?? null,
      p_device_hash: input.deviceHash ?? null,
      p_wallet: input.walletAddress ?? null,
    });
    if (error) {
      console.error("[SignupBlockGuard] check_signup_block error (fail-open):", error);
      return { blocked: false };
    }

    const result = (data ?? {}) as {
      blocked?: boolean;
      block_type?: string;
      matched_value?: string;
      rule?: string;
    };
    if (!result.blocked) return { blocked: false };

    const blockResult: SignupBlockResult = {
      blocked: true,
      blockType: result.block_type,
      matchedValue: result.matched_value,
      rule: result.rule,
    };

    // Ghi log để admin xem lại — best-effort, lỗi ghi log không làm hỏng luồng chính.
    try {
      await admin.from("signup_block_log").insert({
        attempted_email: input.email?.toLowerCase() ?? null,
        device_hash: input.deviceHash ?? null,
        wallet_address: input.walletAddress?.toLowerCase() ?? null,
        block_type: blockResult.blockType ?? null,
        matched_value: blockResult.matchedValue ?? null,
        rule: blockResult.rule ?? null,
        source: input.source,
        ip_address: input.ipAddress ?? null,
      });
    } catch (logError) {
      console.error("[SignupBlockGuard] failed to write signup_block_log:", logError);
    }

    console.warn("[SignupBlockGuard] Signup blocked:", {
      source: input.source,
      rule: blockResult.rule,
      blockType: blockResult.blockType,
      matchedValue: blockResult.matchedValue,
    });
    return blockResult;
  } catch (e) {
    console.error("[SignupBlockGuard] unexpected error (fail-open):", e);
    return { blocked: false };
  }
}

/** Trả về Response 403 nếu bị chặn, `null` nếu được phép tạo tài khoản. */
export async function assertNotSignupBlocked(
  admin: Client,
  input: SignupBlockInput,
  extraHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const result = await checkSignupBlock(admin, input);
  if (!result.blocked) return null;
  return new Response(
    JSON.stringify({
      success: false,
      error: "signup_blocked",
      message: SIGNUP_BLOCKED_MESSAGE,
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json", ...extraHeaders },
    },
  );
}
