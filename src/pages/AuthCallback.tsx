import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import logger from '@/lib/logger';
import {
  SUPABASE_AUTH_TRANSIENT_MESSAGE,
  isTransientAuthError,
  withAuthTimeout,
} from '@/lib/authHealth';

/**
 * Trang xử lý callback xác thực email từ Supabase Auth.
 * Supabase sẽ chuyển user về URL: /auth/callback?token_hash=...&type=signup|recovery|magiclink|invite
 * Hoặc dạng cũ: /auth/callback#access_token=...&refresh_token=...
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const params = url.searchParams;
        const runAuthStep = async <T,>(fn: () => Promise<T>): Promise<T> => {
          try {
            return await withAuthTimeout(fn, 15000);
          } catch (error) {
            if (isTransientAuthError(error)) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              return await withAuthTimeout(fn, 15000);
            }
            throw error;
          }
        };

        const tokenHash = params.get('token_hash') || params.get('token');
        const type = (params.get('type') as
          | 'signup'
          | 'recovery'
          | 'magiclink'
          | 'invite'
          | 'email_change'
          | null) || null;

        // Lỗi từ Supabase (token sai/hết hạn)
        const errorParam = params.get('error') || hash.get('error');
        const errorDesc = params.get('error_description') || hash.get('error_description');
        if (errorParam) {
          setStatus('error');
          setErrorMsg(errorDesc || errorParam);
          return;
        }

        // Trường hợp 1: PKCE / OTP token_hash → cần verifyOtp
        if (tokenHash && type) {
          const { error } = await runAuthStep(() => supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          }));
          if (error) {
            logger.error('[AuthCallback] verifyOtp failed:', error);
            setStatus('error');
            setErrorMsg(isTransientAuthError(error) ? SUPABASE_AUTH_TRANSIENT_MESSAGE : (error.message || 'Xác thực không thành công.'));
            return;
          }

          if (type === 'recovery') {
            navigate('/reset-password', { replace: true });
            return;
          }

          setStatus('success');
          setTimeout(() => navigate('/', { replace: true }), 1200);
          return;
        }

        // Trường hợp 2: Implicit flow (#access_token=...) — Supabase tự set session
        const accessToken = hash.get('access_token');
        if (accessToken) {
          // Đợi Supabase xử lý hash
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: { session } } = await runAuthStep(() => supabase.auth.getSession());
          if (session) {
            setStatus('success');
            setTimeout(() => navigate('/', { replace: true }), 1200);
            return;
          }
        }

        // Trường hợp 3: Không có token — kiểm tra session hiện có
        const { data: { session } } = await runAuthStep(() => supabase.auth.getSession());
        if (session) {
          setStatus('success');
          setTimeout(() => navigate('/', { replace: true }), 800);
          return;
        }

        setStatus('error');
        setErrorMsg('Liên kết xác thực không hợp lệ hoặc đã hết hạn.');
      } catch (err) {
        logger.error('[AuthCallback] Unexpected error:', err);
        setStatus('error');
        setErrorMsg(isTransientAuthError(err) ? SUPABASE_AUTH_TRANSIENT_MESSAGE : (err instanceof Error ? err.message : 'Có lỗi xảy ra.'));
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card rounded-2xl border border-border p-8 text-center space-y-6 shadow-lg">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Đang xác thực email...</h1>
            <p className="text-muted-foreground">Chỉ một chút nữa thôi 💖</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Xác thực thành công! 🎉</h1>
            <p className="text-muted-foreground">
              Đang chuyển bạn vào FUN Ecosystem...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Xác thực thất bại</h1>
            <p className="text-muted-foreground">{errorMsg}</p>
            <Button onClick={() => navigate('/auth', { replace: true })} className="w-full">
              Quay lại đăng nhập
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
