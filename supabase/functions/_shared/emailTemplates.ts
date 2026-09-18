// HTML email templates branded FUN Ecosystem cho luồng tự-build qua Resend.
// Không phụ thuộc React Email để tránh JSX runtime; dùng template string thuần.

function shell(body: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:28px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">🌟 FUN Ecosystem</h1>
    </div>
    <div style="padding:36px 28px;color:#e2e8f0;">${body}</div>
    <div style="background:rgba(0,0,0,.35);padding:18px;text-align:center;color:#475569;font-size:11px;">
      © 2026 FUN Ecosystem · noreply@fun.rich
    </div>
  </div></body></html>`;
}

function ctaButton(url: string, label: string): string {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;text-decoration:none;padding:14px 40px;border-radius:12px;font-size:16px;font-weight:700;">${label}</a>
  </div>
  <p style="color:#64748b;font-size:12px;text-align:center;margin:8px 0 0;">Hoặc copy link vào trình duyệt:<br/><span style="color:#94a3b8;word-break:break-all;">${url}</span></p>`;
}

export function signupConfirmHtml(opts: { email: string; url: string }): string {
  return shell(`
    <h2 style="margin:0 0 16px;color:#f1f5f9;">Chào mừng đến FUN Ecosystem 💖</h2>
    <p style="line-height:1.6;color:#cbd5e1;">Nhấn nút bên dưới để xác nhận địa chỉ <strong style="color:#10b981;">${opts.email}</strong> và kích hoạt tài khoản. Link có hiệu lực <strong>30 phút</strong>.</p>
    ${ctaButton(opts.url, '✅ Xác nhận tài khoản')}
    <div style="background:rgba(239,68,68,.1);border-left:4px solid #ef4444;padding:14px;border-radius:0 8px 8px 0;margin:24px 0;">
      <p style="color:#fca5a5;margin:0;font-size:13px;">⚠️ Nếu bạn không đăng ký FUN Ecosystem, hãy bỏ qua email này.</p>
    </div>`);
}

export function passwordResetHtml(opts: { email: string; url: string }): string {
  return shell(`
    <h2 style="margin:0 0 16px;color:#f1f5f9;">Đặt lại mật khẩu FUN ID 🔐</h2>
    <p style="line-height:1.6;color:#cbd5e1;">Bạn yêu cầu đặt lại mật khẩu cho <strong style="color:#10b981;">${opts.email}</strong>. Nhấn nút bên dưới để tạo mật khẩu mới. Link có hiệu lực <strong>30 phút</strong> và chỉ dùng được 1 lần.</p>
    ${ctaButton(opts.url, '🔑 Đặt lại mật khẩu')}
    <div style="background:rgba(239,68,68,.1);border-left:4px solid #ef4444;padding:14px;border-radius:0 8px 8px 0;margin:24px 0;">
      <p style="color:#fca5a5;margin:0;font-size:13px;">⚠️ Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — tài khoản vẫn an toàn.</p>
    </div>`);
}

export function otpEmailHtml(opts: { otp: string }): string {
  return shell(`
    <h2 style="margin:0 0 16px;color:#f1f5f9;">Mã xác thực OTP 🔐</h2>
    <p style="line-height:1.6;color:#cbd5e1;">Đây là mã OTP để xác thực tài khoản của bạn. Mã có hiệu lực <strong style="color:#10b981;">10 phút</strong>.</p>
    <div style="background:rgba(16,185,129,.1);border:2px solid #10b981;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
      <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#10b981;font-family:'Courier New',monospace;">${opts.otp}</span>
    </div>
    <div style="background:rgba(239,68,68,.1);border-left:4px solid #ef4444;padding:14px;border-radius:0 8px 8px 0;margin:24px 0;">
      <p style="color:#fca5a5;margin:0;font-size:13px;">⚠️ <strong>Bảo mật:</strong> Không chia sẻ mã này với bất kỳ ai. Nhân viên FUN Ecosystem sẽ không bao giờ yêu cầu mã OTP của bạn.</p>
    </div>`);
}

/**
 * Email chức năng (transactional) nhắc hoàn tất ký Luật Ánh Sáng.
 * Giai đoạn 2 của chính sách dọn tài khoản treo cố ý — nói thẳng: quá 7 ngày sẽ XOÁ tài khoản.
 */
export function staleAccountReminderHtml(opts: { email: string; url: string; deadlineDays?: number }): string {
  const days = opts.deadlineDays ?? 7;
  return shell(`
    <h2 style="margin:0 0 16px;color:#f1f5f9;">Tài khoản của bạn chưa được kích hoạt</h2>
    <p style="line-height:1.6;color:#cbd5e1;">Bạn đã đăng ký FUN Profile với địa chỉ <strong style="color:#10b981;">${opts.email}</strong>, nhưng <strong>chưa hoàn tất bước ký Luật Ánh Sáng</strong> để kích hoạt tài khoản.</p>
    <p style="line-height:1.6;color:#cbd5e1;">Việc ký Luật Ánh Sáng chỉ mất khoảng 1 phút: đăng nhập lại và bấm đồng ý.</p>
    ${ctaButton(opts.url, '✍️ Ký Luật Ánh Sáng ngay')}
    <div style="background:rgba(239,68,68,.1);border-left:4px solid #ef4444;padding:14px;border-radius:0 8px 8px 0;margin:24px 0;">
      <p style="color:#fca5a5;margin:0;font-size:13px;">⚠️ Nếu bạn không hoàn tất trong <strong>${days} ngày</strong> kể từ email này, tài khoản của bạn sẽ bị <strong>XOÁ</strong> khỏi hệ thống.</p>
    </div>
    <p style="color:#64748b;font-size:12px;margin:0;">Đây là email chức năng liên quan tới tài khoản của bạn, không phải email quảng cáo.</p>`);
}
