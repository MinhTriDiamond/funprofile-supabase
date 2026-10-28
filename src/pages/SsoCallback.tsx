// PILOT cua account.fun.rich - doi ma lay phien SSO (giong mau SSOCallback cua Farm).
// Luu phien PILOT vao localStorage key rieng (fun_pilot_sso), KHONG cham session
// native cua Supabase, KHONG sua trang Auth cu. Trang nay chi chung minh luong
// doi ma chay dung: phien pilot KHONG tu dang nhap native vao app.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const CLIENT_ID = 'fun_profile_pilot_client';
const TOKEN_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/sso-token`;

type Phase = 'loading' | 'success' | 'error';

interface PilotUser {
  id: string;
  fun_id: string;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

function explainError(code: string, description?: string): string {
  if (description) return description;
  switch (code) {
    case 'invalid_grant':
      return 'Mã đã hết hạn hoặc đã dùng rồi. Vui lòng bắt đầu lại từ /pilot-login.';
    case 'invalid_client':
      return 'Client pilot chưa đúng cấu hình (secret hoặc client chưa kích hoạt).';
    case 'missing_secret_config':
      return 'Thiếu cấu hình pilot: biến VITE_FUN_PROFILE_PILOT_CLIENT_SECRET chưa được đặt trong env của app.';
    default:
      return `Đổi mã thất bại (${code}).`;
  }
}

export default function SsoCallback() {
  const [params] = useSearchParams();
  const ran = useRef(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [user, setUser] = useState<PilotUser | null>(null);
  const [scope, setScope] = useState('');

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get('code');
    const state = params.get('state');
    const raw = sessionStorage.getItem('fun_pilot_pkce');
    sessionStorage.removeItem('fun_pilot_pkce');

    if (!code || !state) {
      setError('Thiếu mã code hoặc state từ cửa. Vui lòng bắt đầu lại từ /pilot-login.');
      setPhase('error');
      return;
    }

    let stored: { verifier: string; state: string } | null = null;
    try {
      stored = raw ? (JSON.parse(raw) as { verifier: string; state: string }) : null;
    } catch {
      stored = null;
    }

    if (!stored || stored.state !== state || !stored.verifier) {
      setError('State không khớp (có thể bị tấn công CSRF hoặc phiên pilot đã cũ). Vui lòng bắt đầu lại.');
      setPhase('error');
      return;
    }

    const clientSecret = import.meta.env.VITE_FUN_PROFILE_PILOT_CLIENT_SECRET as string | undefined;
    if (!clientSecret) {
      setError(explainError('missing_secret_config'));
      setPhase('error');
      return;
    }

    (async () => {
      let res: Response;
      try {
        res = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            client_id: CLIENT_ID,
            client_secret: clientSecret,
            redirect_uri: `${window.location.origin}/sso-callback`,
            code_verifier: stored.verifier,
          }),
        });
      } catch {
        setError('Không gọi được hàm sso-token. Kiểm tra mạng rồi thử lại.');
        setPhase('error');
        return;
      }

      let body: Record<string, unknown> = {};
      try {
        body = await res.json();
      } catch {
        // Không parse được JSON.
      }

      if (!res.ok || !body.access_token) {
        setError(
          explainError(
            (body.error as string) || 'server_error',
            body.error_description as string | undefined,
          ),
        );
        setPhase('error');
        return;
      }

      const pilotUser = body.user as PilotUser | null;
      localStorage.setItem(
        'fun_pilot_sso',
        JSON.stringify({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
          expires_at: Date.now() + Number(body.expires_in || 3600) * 1000,
          scope: body.scope,
          user: pilotUser,
        }),
      );
      setUser(pilotUser);
      setScope(typeof body.scope === 'string' ? body.scope : '');
      setPhase('success');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {phase === 'loading' && (
          <>
            <h1 className="text-2xl font-bold mb-2">Đang đổi mã lấy phiên...</h1>
            <p className="text-muted-foreground">Exchanging the code for a pilot session...</p>
          </>
        )}

        {phase === 'success' && (
          <>
            <h1 className="text-2xl font-bold mb-2">Xác thực qua cửa thành công!</h1>
            <p className="text-muted-foreground mb-4">
              Pilot SSO verified via account.fun.rich.
              {user && (
                <>
                  <br />
                  Tài khoản: {user.username || user.id} (FUN-ID: {user.fun_id})
                  <br />
                  Scope: {scope}
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Đây là phiên PILOT (lưu riêng), không phải phiên đăng nhập native của
              app. Muốn vào app native, bấm đăng nhập FUN Profile bên dưới.
            </p>
            <div className="flex flex-col gap-2">
              <Link to="/" className="underline">
                Về trang chính / Back to home
              </Link>
              <Link to="/auth" className="underline">
                Đăng nhập FUN Profile / Sign in to FUN Profile
              </Link>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1 className="text-2xl font-bold mb-2">Đổi mã thất bại</h1>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Link to="/pilot-login" className="underline">
              Thử lại từ đầu / Try again
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
