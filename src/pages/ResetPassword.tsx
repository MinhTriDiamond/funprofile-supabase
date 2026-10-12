import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, KeyRound, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { SetPasswordViaOtpDialog } from '@/components/auth/SetPasswordViaOtpDialog';

type PageState = 'loading' | 'valid' | 'invalid' | 'success';

const ResetPassword = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpFallbackOpen, setOtpFallbackOpen] = useState(false);

  // Plan B token (FUN-issued via Resend): nếu có thì dùng flow custom, ignore Supabase hash.
  const planBToken = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    // Plan B: có ?token=... -> luôn cho vào form, gọi password-reset-confirm khi submit.
    if (planBToken) {
      setPageState('valid');
      return;
    }

    // Fallback: flow Supabase recovery cũ (giữ tương thích link cũ nếu có).
    const url = new URL(window.location.href);
    const queryError = url.searchParams.get('error_description') || url.searchParams.get('error');
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
    const hashError = hashParams.get('error_description') || hashParams.get('error');
    const combinedError = queryError || hashError;
    if (combinedError) {
      const raw = decodeURIComponent(combinedError);
      const friendly = /expired|otp_expired/i.test(raw)
        ? t('rpwExpired')
        : /access_denied/i.test(raw)
          ? t('rpwInvalidUsed')
          : raw;
      setError(friendly);
      setPageState('invalid');
      return;
    }

    const hasRecoveryToken = hash.includes('type=recovery');
    if (hasRecoveryToken) { setPageState('valid'); return; }

    let settled = false;
    let invalidTimer: ReturnType<typeof setTimeout> | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        settled = true;
        if (invalidTimer) clearTimeout(invalidTimer);
        setPageState('valid');
      }
    });
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (settled) return;
      if (session) { settled = true; setPageState('valid'); }
      else {
        invalidTimer = setTimeout(() => { if (!settled) { settled = true; setPageState('invalid'); } }, 1500);
      }
    };
    checkSession();
    return () => { if (invalidTimer) clearTimeout(invalidTimer); subscription.unsubscribe(); };
  }, [planBToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError(t('rpwTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('rpwMismatch'));
      return;
    }

    setLoading(true);
    try {
      if (planBToken) {
        // Plan B: gọi edge function của FUN Profile
        const { data, error: invErr } = await supabase.functions.invoke('password-reset-confirm', {
          body: { token: planBToken, new_password: newPassword },
        });
        if (invErr || (data as any)?.error) {
          throw new Error((data as any)?.error || invErr?.message || t('rpwFailed'));
        }
      } else {
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) throw updateError;
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          await supabase.from('profiles').update({ has_password: true }).eq('id', currentUser.id);
        }
        await supabase.auth.signOut();
      }

      setPageState('success');
      toast.success(t('rpwSuccess'));
      setTimeout(() => navigate('/auth', { replace: true }), 2000);
    } catch (err: any) {
      const msg = err.message || t('rpwErrorRetry');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Loading state ---
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">{t('rpwVerifying')}</p>
        </div>
      </div>
    );
  }

  // --- Invalid / expired link ---
  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle size={32} className="text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {t('rpwInvalidTitle')}
          </h1>
          <p className="text-muted-foreground">
            {error || t('rpwInvalidDesc')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('rpwOtpHintA')}<strong>{t('rpwOtpHintStrong')}</strong>{t('rpwOtpHintB')}
          </p>
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => setOtpFallbackOpen(true)}
              className="w-full h-12 rounded-full font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #d97706 100%)',
                boxShadow: '0 4px 20px rgba(217, 119, 6, 0.4)',
              }}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {t('rpwOtpBtn')}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/auth', { replace: true })}
              className="w-full h-12 rounded-full font-bold"
            >
              {t('cemBackToLogin')}
            </Button>
          </div>
        </div>

        <SetPasswordViaOtpDialog
          open={otpFallbackOpen}
          onOpenChange={setOtpFallbackOpen}
          onSuccess={() => {
            setTimeout(() => navigate('/auth', { replace: true }), 1500);
          }}
        />
      </div>
    );
  }

  // --- Success state ---
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <ShieldCheck size={32} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {t('rpwSuccess')}
          </h1>
          <p className="text-muted-foreground">
            {t('rpwSuccessDesc')}
          </p>
          <div className="w-8 h-8 mx-auto border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // --- Valid: show form ---
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center space-y-3 mb-8">
          <div
            className="hologram-border p-[4px] rounded-full w-20 h-20 mx-auto"
            style={{
              boxShadow: '0 0 20px rgba(147, 51, 234, 0.2), 0 0 40px rgba(59, 130, 246, 0.15)',
            }}
          >
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <KeyRound size={32} className="text-emerald-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t('rpwTitle')}</h1>
          <p className="text-muted-foreground">{t('rpwSubtitle')}</p>
        </div>

        {/* Form */}
        <div
          className="hologram-border p-[2px] rounded-2xl"
          style={{
            boxShadow: '0 0 15px rgba(147, 51, 234, 0.1), 0 0 15px rgba(59, 130, 246, 0.1), 0 0 15px rgba(34, 197, 94, 0.1)',
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="bg-card rounded-2xl p-6 space-y-5"
          >
            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-foreground font-semibold text-sm uppercase tracking-wide">
                {t('spwNewLabel')}
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder={t('rpwNewPlaceholder')}
                  className="h-12 rounded-full pr-10 border-2 border-border bg-background focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-emerald-500 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-foreground font-semibold text-sm uppercase tracking-wide">
                {t('spwConfirmLabel')}
              </Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder={t('rpwConfirmPlaceholder')}
                  className="h-12 rounded-full pr-10 border-2 border-border bg-background focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-emerald-500 transition-colors"
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive font-medium text-center">{error}</p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-14 text-lg font-bold rounded-full text-white"
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #166534 0%, #15803d 50%, #166534 100%)',
                boxShadow: '0 4px 20px rgba(22, 101, 52, 0.4)',
              }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  {t('rpwUpdating')}
                </span>
              ) : (
                t('rpwUpdateBtn')
              )}
            </Button>
          </form>
        </div>

        {/* Back to login */}
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => navigate('/auth', { replace: true })}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-semibold hover:underline transition-colors"
          >
            {t('rpwBackLoginFull')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
