import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, KeyRound, Info, Sparkles } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { validateUsername, normalizeUsername, USERNAME_MAX_LENGTH } from '@/lib/username-validation';
import { SetPasswordViaOtpDialog } from './SetPasswordViaOtpDialog';
import { TurnstileWidget, TURNSTILE_ENABLED } from './TurnstileWidget';
import logger from '@/lib/logger';
import {
  SUPABASE_AUTH_TRANSIENT_MESSAGE,
  isTransientAuthError,
  withAuthTimeout,
} from '@/lib/authHealth';
interface ClassicEmailLoginProps {
  onSuccess: (userId: string, isNewUser: boolean) => void;
}
export const ClassicEmailLogin = ({
  onSuccess
}: ClassicEmailLoginProps) => {
  const {
    t
  } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [otpOnlyHint, setOtpOnlyHint] = useState(false);
  const [setPasswordDialogOpen, setSetPasswordDialogOpen] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  type AuthEmailFunctionName = 'auth-signup-send-confirm' | 'password-reset-request';
  const summarizeEdgeError = async (functionName: AuthEmailFunctionName, error: any, responseData?: any) => {
    let status = error?.context?.status || error?.status || error?.statusCode || responseData?.status || null;
    let message = responseData?.error || responseData?.message || error?.message || 'Unknown Edge Function error';
    let reason = error?.name || error?.code || error?.details || error?.hint || 'request_failed';
    if (error?.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.clone().json();
        status = status || error.context.status;
        message = body?.error || body?.message || message;
        reason = body?.code || body?.reason || reason;
      } catch {
        status = status || error.context.status;
      }
    }
    const summary = {
      function_name: functionName,
      status: status || 'network_or_unknown',
      message,
      reason,
    };
    logger.error('[Auth Email Edge Function failed]', summary);
    return summary;
  };
  const invokeAuthEmailFunction = async <T,>(functionName: AuthEmailFunctionName, body: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error || (data as any)?.error) {
      const summary = await summarizeEdgeError(functionName, error, data);
      throw Object.assign(new Error(String(summary.message)), { edgeSummary: summary, status: summary.status });
    }
    return data as T;
  };
  const getAuthSchema = (signupMode: boolean) => z.object({
    email: z.string().email(t('authErrorInvalidEmail')),
    password: signupMode
      ? z.string()
          .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
          .regex(/[A-Z]/, 'Mật khẩu phải có ít nhất 1 chữ hoa')
          .regex(/[0-9]/, 'Mật khẩu phải có ít nhất 1 số')
      : z.string().min(6, t('authErrorPasswordShort')),
    username: z.string().optional()
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Validate username with strict regex for signup
      if (!isLogin) {
        const normalized = normalizeUsername(username);
        const usernameError = validateUsername(normalized);
        if (usernameError) {
          toast.error(t(usernameError as never /* dynamic i18n key from validator */));
          setLoading(false);
          return;
        }
        // Validate wallet address format if provided
        if (walletAddress && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
          toast.error(t('authClassicInvalidWallet'));
          setLoading(false);
          return;
        }
      }

      const authSchema = getAuthSchema(!isLogin);
      const validation = authSchema.safeParse({
        email,
        password,
        username: isLogin ? undefined : normalizeUsername(username)
      });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        setLoading(false);
        return;
      }
      const makeTimeoutPromise = () => new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 25000)
      );

      // Retry helper: thử 1 lần nữa nếu gặp timeout/network/lock-broken — sự cố tạm thời
      // Im lặng retry sau 1.5s, không hiển thị toast nếu lần 1 fail vì lock contention.
      const runWithRetry = async <T,>(fn: () => Promise<T>): Promise<T> => {
        try {
          return await withAuthTimeout(fn, 25000);
        } catch (err: any) {
          if (isTransientAuthError(err)) {
            console.warn('[Auth] Transient/lock error, retrying once after 1.5s...', err?.name, err?.message);
            // Tạm bỏ loading khi đang chờ retry để nút không kẹt label "Initializing..."
            setLoading(false);
            await new Promise(r => setTimeout(r, 1500));
            setLoading(true);
            return await withAuthTimeout(fn, 25000);
          }
          throw err;
        }
      };

      if (isLogin) {
        const {
          data,
          error
        } = await runWithRetry(() => supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken ?? undefined } }));
        if (error) throw error;
        if (data.user) {
          await supabase.from('profiles').update({
            last_login_platform: 'FUN Profile',
            has_password: true,
          }).eq('id', data.user.id);
          toast.success(t('welcomeBack'));
          onSuccess(data.user.id, false);
        }
      } else {
        const normalizedUsername = normalizeUsername(username);
        const normalizedWallet = walletAddress ? walletAddress.toLowerCase() : undefined;
        // Plan B: gọi edge function của FUN Profile để tạo user + gửi email xác nhận qua Resend.
        await invokeAuthEmailFunction('auth-signup-send-confirm', {
          email,
          password,
          username: normalizedUsername,
          wallet_address: normalizedWallet,
          captcha_token: captchaToken ?? undefined,
        });
        toast.success(
          `Đã gửi email xác nhận tới ${email}. Vui lòng mở email (kiểm tra cả Spam) và bấm liên kết để kích hoạt tài khoản. Liên kết có hiệu lực 30 phút.`,
          { duration: 12000 }
        );
        setIsLogin(true);
        setPassword('');
        setLoading(false);
        return;
      }
    } catch (error: any) {
      // Xử lý lỗi trùng username
      if (error.message?.includes('profiles_username_key') ||
          error.message?.includes('unique_violation') ||
          error.message?.includes('duplicate key')) {
        const suggestion = username + '_' + Math.random().toString(36).substring(2, 6);
        setUsername(suggestion);
        toast.error(t('authClassicUsernameTaken', { username, suggestion }));
        setLoading(false);
        return;
      }
      // Xử lý email đã đăng ký trước đó
      const errMsg = String(error?.message || '').toLowerCase();
      if (
        errMsg.includes('already registered') ||
        errMsg.includes('user already') ||
        errMsg.includes('email address is already') ||
        error?.code === 'user_already_exists'
      ) {
        toast.error(
          `Email ${email} đã được đăng ký trước đó. Hãy đăng nhập, hoặc bấm "Quên mật khẩu" nếu bạn không nhớ mật khẩu.`,
          { duration: 8000 }
        );
        setIsLogin(true);
        setShowForgotPassword(true);
        setLoading(false);
        return;
      }
      if (error.message?.includes('rate limit') || 
          error.code === 'over_email_send_rate_limit' ||
          error.status === 429) {
        toast.error(t('authErrorRateLimit'), { duration: 8000 });
        setLoading(false);
        return;
      }
      // Lỗi tạm thời (timeout/lock/network) đã retry 1 lần ở runWithRetry mà vẫn fail.
      // Hiện thông báo nhẹ nhàng, đề nghị thử lại; KHÔNG đổ tại "quá tải máy chủ" vì
      // backend đa phần khoẻ — chủ yếu là lock contention phía trình duyệt.
      const msg = String(error?.message || '').toLowerCase();
      const status = error?.status || error?.statusCode;
      if (error?.edgeSummary) {
        const s = error.edgeSummary;
        toast.error(
          `Lỗi ${s.function_name} (${s.status}): ${s.message}. Lý do: ${s.reason}`,
          { duration: 12000 }
        );
        return;
      }
      if (isTransientAuthError(error) || status === 522) {
        toast.error(
          'Đăng nhập bị gián đoạn tạm thời. Vui lòng bấm "Đăng nhập" lại sau vài giây.',
          { duration: 6000 }
        );
        return;
      }
      // Lỗi sai mật khẩu khi đăng nhập — kiểm tra xem tài khoản có đặt mật khẩu chưa
      const invalidCred =
        msg.includes('invalid login credentials') ||
        msg.includes('invalid_credentials') ||
        error?.code === 'invalid_credentials';
      if (isLogin && invalidCred && email) {
        try {
          // Gọi qua edge function (RPC check_login_method đã bị REVOKE cho anon/authenticated)
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-check-login-method`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({ email }),
              signal: controller.signal,
            },
          ).finally(() => clearTimeout(timer));

          if (res.status === 429) {
            toast.error('Bạn thử đăng nhập quá nhiều lần. Vui lòng đợi khoảng 1 phút rồi thử lại.', {
              duration: 8000,
            });
            return;
          }
          const m = res.ok
            ? ((await res.json()) as { exists?: boolean; has_password?: boolean } | null)
            : null;
          if (m?.exists && m.has_password === false) {
            setOtpOnlyHint(true);
            toast.info('Tài khoản này chưa có mật khẩu (đăng ký bằng OTP). Hãy đặt mật khẩu mới.', {
              duration: 6000,
            });
            return;
          }
          if (m?.exists === false) {
            toast.error('Email này chưa được đăng ký. Vui lòng đăng ký tài khoản mới.', {
              duration: 6000,
            });
            return;
          }
        } catch (rpcErr) {
          console.warn('[Auth] auth-check-login-method failed:', rpcErr);
        }
        toast.error('Sai mật khẩu. Bấm "Quên mật khẩu" để đặt lại.');
        return;
      }

      toast.error(error.message || t('authErrorGeneric'));
    } finally {
      setLoading(false);
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    }
  };
  const handleForgotPassword = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t('authErrorInvalidEmail'));
      return;
    }
    setLoading(true);
    try {
      // Plan B: gọi edge function FUN Profile (Resend, không leak user existence)
      await invokeAuthEmailFunction('password-reset-request', { email, captcha_token: captchaToken ?? undefined });
      toast.success(
        `Nếu ${email} có trong hệ thống, một email đặt lại mật khẩu vừa được gửi đi. Kiểm tra hộp thư (cả Spam) và bấm liên kết trong vòng 30 phút.`,
        { duration: 10000 }
      );
      setShowForgotPassword(false);
    } catch (error: any) {
      const m = String(error?.message || '').toLowerCase();
      if (error?.edgeSummary) {
        const s = error.edgeSummary;
        toast.error(
          `Lỗi ${s.function_name} (${s.status}): ${s.message}. Lý do: ${s.reason}`,
          { duration: 12000 }
        );
        return;
      }
      if (isTransientAuthError(error) || error?.status >= 500) {
        toast.error(SUPABASE_AUTH_TRANSIENT_MESSAGE, { duration: 9000 });
        return;
      }
      if (m.includes('rate limit') || error?.status === 429) {
        toast.error('Bạn đã yêu cầu quá nhanh. Vui lòng đợi vài phút rồi thử lại.', { duration: 8000 });
      } else if (m.includes('timeout') || m.includes('failed to fetch') || m.includes('network') || error?.status >= 500) {
        toast.error('Hệ thống đang quá tải, vui lòng thử lại sau 1–2 phút.', { duration: 8000 });
      } else if (m.includes('user not found') || m.includes('email not found')) {
        toast.error('Email này chưa được đăng ký trong hệ thống.', { duration: 6000 });
      } else {
        toast.error(error.message || t('authErrorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  };
  return <div className="space-y-5">
      <div className="text-center space-y-2">
        
        <h3 className="text-lg font-bold text-slate-800">
          {isLogin ? t('authWelcomeBack') : t('authCreateAccount')}
        </h3>
        <p className="text-sm text-slate-500">
          {isLogin ? t('authSignInTitle') : t('authJoinUs')}
        </p>
      </div>

      {otpOnlyHint && isLogin && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex gap-2">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">Tài khoản này chưa có mật khẩu</p>
              <p>Bạn đã đăng ký bằng <strong>mã OTP qua email</strong> trước đây. Hãy đặt mật khẩu mới ngay để lần sau đăng nhập nhanh hơn.</p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setSetPasswordDialogOpen(true)}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Đặt mật khẩu qua OTP
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && <div className="space-y-2">
            <Label htmlFor="classic-username" className="text-slate-700 font-semibold text-sm uppercase tracking-wide">
              {t('authUsername')}
            </Label>
            <Input id="classic-username" type="text" value={username} onChange={e => setUsername(normalizeUsername(e.target.value).slice(0, USERNAME_MAX_LENGTH))} required={!isLogin} placeholder={t('authUsernamePlaceholder')} className="h-12 rounded-full border-2 border-slate-300 bg-gradient-to-br from-white to-slate-50 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/30 transition-all" />
          </div>}
        
        {!isLogin && <div className="space-y-2">
            <Label htmlFor="classic-wallet" className="text-slate-700 font-semibold text-sm uppercase tracking-wide">
              {t('authClassicWalletLabel')}
            </Label>
            <Input id="classic-wallet" type="text" value={walletAddress} onChange={e => setWalletAddress(e.target.value.trim())} placeholder="0x..." className="h-12 rounded-full border-2 border-slate-300 bg-gradient-to-br from-white to-slate-50 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/30 transition-all font-mono text-sm" />
            <p className="text-xs text-muted-foreground">{t('authClassicWalletHint')}</p>
          </div>}
        
        <div className="space-y-2">
          <Label htmlFor="classic-email" className="text-slate-700 font-semibold text-sm uppercase tracking-wide">
            {t('authEmail')}
          </Label>
          <Input id="classic-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder={t('authEmailPlaceholder')} className="h-12 rounded-full border-2 border-slate-300 bg-gradient-to-br from-white to-slate-50 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/30 transition-all" />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="classic-password" className="text-slate-700 font-semibold text-sm uppercase tracking-wide">
            {t('authPassword')}
          </Label>
          <div className="relative">
            <Input id="classic-password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder={t('authPasswordPlaceholder')} className="h-12 rounded-full pr-10 border-2 border-slate-300 bg-gradient-to-br from-white to-slate-50 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/30 transition-all" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-emerald-500 transition-colors">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        
        <TurnstileWidget onToken={setCaptchaToken} resetSignal={captchaReset} />
        <Button type="submit" className="w-full h-14 text-lg font-bold rounded-full relative overflow-hidden text-white" disabled={loading || (TURNSTILE_ENABLED && !captchaToken)} style={{
        background: 'linear-gradient(135deg, #166534 0%, #15803d 50%, #166534 100%)',
        boxShadow: '0 4px 20px rgba(22, 101, 52, 0.4)'
      }}>
          <span className="relative z-10 flex items-center justify-center gap-2">
            {loading ? <>
                <Loader2 className="animate-spin" size={20} />
                {t('authInitializing')}
              </> : isLogin ? t('authSignIn') : t('authSignUp')}
          </span>
        </Button>
      </form>
      
      <div className="space-y-3">
        {isLogin && <div className="text-center text-sm">
            <button type="button" onClick={() => setShowForgotPassword(!showForgotPassword)} className="text-emerald-600 hover:text-emerald-700 font-semibold hover:underline transition-colors">
              {t('authForgotPassword')}
            </button>
          </div>}
        
        {showForgotPassword && <div className="space-y-2">
            <Input type="email" placeholder={t('authEmailPlaceholder')} value={email} onChange={e => setEmail(e.target.value)} className="border-2 border-slate-400 bg-white/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-400/50" />
            <Button onClick={handleForgotPassword} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700" disabled={loading}>
              {t('authSendResetEmail')}
            </Button>
          </div>}
        
        <div className="text-center text-sm">
          <button type="button" onClick={() => {
          setIsLogin(!isLogin);
          setShowForgotPassword(false);
        }} className="text-emerald-600 hover:text-emerald-700 font-semibold hover:underline transition-colors">
            {isLogin ? t('authNoAccount') : t('authHaveAccount')}{' '}
            <span className="font-bold">{isLogin ? t('authSignUpLink') : t('authSignInLink')}</span>
          </button>
        </div>
      </div>

      <SetPasswordViaOtpDialog
        open={setPasswordDialogOpen}
        onOpenChange={setSetPasswordDialogOpen}
        initialEmail={email}
        onSuccess={() => setOtpOnlyHint(false)}
      />
    </div>;
};
