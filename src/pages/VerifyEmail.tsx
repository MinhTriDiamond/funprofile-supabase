import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'expired' | 'error'>('loading');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('Thiếu token xác thực.');
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-email-link`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ token }),
          }
        );

        const data = await res.json();

        if (res.ok && data.success) {
          setStatus('success');
          setEmail(data.email || '');
        } else if (res.status === 410) {
          setStatus('expired');
          setErrorMsg(data.error || 'Token đã hết hạn.');
        } else {
          setStatus('error');
          setErrorMsg(data.error || 'Có lỗi xảy ra.');
        }
      } catch {
        setStatus('error');
        setErrorMsg('Không thể kết nối đến máy chủ.');
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card rounded-2xl border border-border p-8 text-center space-y-6">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Đang xác thực...</h1>
            <p className="text-muted-foreground">Vui lòng chờ trong giây lát.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Xác thực thành công! 🎉</h1>
            <p className="text-muted-foreground">
              Email <strong className="text-foreground">{email}</strong> đã được liên kết với tài khoản của bạn.
            </p>
            <Button onClick={() => navigate('/settings/security')} className="w-full">
              Về trang Bảo mật
            </Button>
          </>
        )}

        {status === 'expired' && (
          <>
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Liên kết đã hết hạn</h1>
            <p className="text-muted-foreground">{errorMsg}</p>
            <Button onClick={() => navigate('/settings/security')} variant="outline" className="w-full">
              Quay lại để thử lại
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Xác thực thất bại</h1>
            <p className="text-muted-foreground">{errorMsg}</p>
            <Button onClick={() => navigate('/settings/security')} variant="outline" className="w-full">
              Quay lại trang Bảo mật
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
