/**
 * Ghi log mọi lần tạo tài khoản thất bại vào bảng `public.signup_failure_log`
 * TRƯỚC khi trả lỗi về client. Đây là lưới an toàn duy nhất để truy nguyên
 * nguyên nhân khi sự cố đăng ký tái diễn (log GoTrue bị rotate rất nhanh).
 *
 * Best-effort: không bao giờ throw, không bao giờ chặn luồng trả lỗi.
 */
export async function logSignupFailure(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }> },
  params: {
    source: string;
    email?: string | null;
    username?: string | null;
    error?: unknown;
    context?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const err = params.error as
      | { message?: string; code?: string; status?: number; name?: string }
      | undefined;
    const message = err?.message ?? (typeof params.error === 'string' ? params.error : '');
    // GoTrue bọc SQLSTATE trong message; cố gắng bóc ra để phân loại nhánh lỗi
    const sqlstate = /SQLSTATE ([0-9A-Z]{5})/.exec(message ?? '')?.[1] ?? err?.code ?? null;

    const { error: rpcError } = await admin.rpc('log_signup_failure', {
      _source: params.source,
      _email: params.email ?? null,
      _username: params.username ?? null,
      _sqlstate: sqlstate,
      _error_message: message || JSON.stringify(params.error ?? null),
      _context: {
        ...(params.context ?? {}),
        http_status: err?.status ?? null,
        error_code: err?.code ?? err?.name ?? null,
      },
    });
    if (rpcError) console.error('[signup-failure-log] rpc failed:', rpcError);

    // GoTrue chỉ trả message chung chung ("Database error creating new user"),
    // không lộ SQLSTATE thật. Chạy probe (luôn rollback, không để lại dữ liệu)
    // để ghi đúng SQLSTATE + message gốc của Postgres vào bảng log.
    if (!sqlstate && /database error/i.test(message ?? '')) {
      const { error: probeError } = await admin.rpc('diagnose_signup_failure', {
        _source: params.source,
        _email: params.email ?? null,
        _username: params.username ?? null,
      });
      if (probeError) console.error('[signup-failure-log] probe failed:', probeError);
    }
  } catch (e) {
    console.error('[signup-failure-log] unexpected:', e);
  }
}
