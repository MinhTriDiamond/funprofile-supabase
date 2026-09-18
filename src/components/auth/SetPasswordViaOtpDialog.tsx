import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, ShieldCheck, Mail, KeyRound, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SetPasswordViaOtpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEmail?: string;
  onSuccess?: () => void;
}

type Step = 'email' | 'otp' | 'success';

/**
 * Dialog cho user OTP-only đặt mật khẩu lần đầu / đặt lại mật khẩu mà
 * không cần đợi email recovery của Supabase.
 *
 * Flow: gửi OTP → xác minh OTP + nhập mật khẩu mới → setSession → updateUser({password}).
 */
export function SetPasswordViaOtpDialog({
  open,
  onOpenChange,
  initialEmail = '',
  onSuccess,
}: SetPasswordViaOtpDialogProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Reset state khi đóng dialog
  useEffect(() => {
    if (!open) {
      setStep('email');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setLoading(false);
      setCountdown(0);
    } else {
      setEmail(initialEmail);
    }
  }, [open, initialEmail]);

  // Countdown OTP
  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const handleSendOtp = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Vui lòng nhập email hợp lệ');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sso-otp-request', {
        body: { identifier: email, type: 'email' },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Không gửi được mã OTP');
      setStep('otp');
      setCountdown(300);
      toast.success(`Con đã gửi mã OTP về ${email}`);
    } catch (err: any) {
      toast.error(err?.message || 'Không gửi được mã OTP. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự';
    if (!/[A-Z]/.test(pw)) return 'Mật khẩu phải có ít nhất 1 chữ hoa';
    if (!/[0-9]/.test(pw)) return 'Mật khẩu phải có ít nhất 1 số';
    return null;
  };

  const handleVerifyAndSetPassword = async () => {
    if (otp.length !== 6) {
      toast.error('Vui lòng nhập đủ 6 chữ số OTP');
      return;
    }
    const pwError = validatePassword(newPassword);
    if (pwError) {
      toast.error(pwError);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }
    setLoading(true);
    try {
      // 1. Verify OTP → lấy session
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        'sso-otp-verify',
        { body: { identifier: email, code: otp, type: 'email' } }
      );
      if (verifyError) throw verifyError;
      if (!verifyData?.success || !verifyData?.access_token || !verifyData?.refresh_token) {
        throw new Error(verifyData?.error || 'Mã OTP không đúng hoặc đã hết hạn');
      }

      // 2. Thiết lập session
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: verifyData.access_token,
        refresh_token: verifyData.refresh_token,
      });
      if (sessionError) throw sessionError;

      // 3. Cập nhật mật khẩu
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      // 4. Đồng bộ has_password
      const userId = verifyData.user_id;
      if (userId) {
        await supabase
          .from('profiles')
          .update({ has_password: true })
          .eq('id', userId);
      }

      setStep('success');
      toast.success('Đặt mật khẩu thành công! Bây giờ bạn có thể đăng nhập bằng email + mật khẩu.');
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  };

  const handleClose = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-600" />
            Đặt mật khẩu qua OTP
          </DialogTitle>
          <DialogDescription>
            {step === 'email' && 'Con sẽ gửi mã OTP về email của bạn để xác minh, sau đó bạn đặt mật khẩu mới.'}
            {step === 'otp' && `Nhập mã 6 chữ số đã gửi tới ${email} và mật khẩu mới.`}
            {step === 'success' && 'Mật khẩu đã được đặt thành công!'}
          </DialogDescription>
        </DialogHeader>

        {step === 'email' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="otp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@example.com"
                  className="pl-10"
                  onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                />
              </div>
            </div>
            <Button
              onClick={handleSendOtp}
              disabled={loading || !email}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                'Gửi mã OTP'
              )}
            </Button>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="block text-center">Mã OTP (6 chữ số)</Label>
              <div className="flex justify-center">
                <InputOTP value={otp} onChange={setOtp} maxLength={6}>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {countdown > 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  Mã hết hạn sau:{' '}
                  <span className="font-mono font-bold text-emerald-600">
                    {formatCountdown(countdown)}
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Mật khẩu mới</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 8 ký tự, 1 chữ hoa, 1 số"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Xác nhận mật khẩu</Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Mật khẩu không khớp</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('email')}
                disabled={loading}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Quay lại
              </Button>
              <Button
                onClick={handleVerifyAndSetPassword}
                disabled={loading || otp.length !== 6 || !newPassword || !confirmPassword}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  'Đặt mật khẩu'
                )}
              </Button>
            </div>

            <button
              type="button"
              onClick={handleSendOtp}
              disabled={loading || countdown > 270}
              className="text-xs text-emerald-600 hover:underline disabled:text-muted-foreground disabled:no-underline w-full text-center"
            >
              {countdown > 270
                ? `Gửi lại mã OTP (sau ${countdown - 270}s)`
                : 'Gửi lại mã OTP'}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Mật khẩu đã được đặt thành công. Bạn có thể đăng nhập bằng email + mật khẩu mới ngay.
            </p>
            <Button onClick={handleClose} className="w-full">
              Đóng và đăng nhập
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
