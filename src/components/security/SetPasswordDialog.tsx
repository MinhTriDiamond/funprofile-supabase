import { useState } from 'react';
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
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, CheckCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { RecommendedAction } from '@/hooks/useLoginMethods';

interface SetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextAction?: RecommendedAction;
  onNextAction?: (action: RecommendedAction) => void;
}

export function SetPasswordDialog({ open, onOpenChange, nextAction, onNextAction }: SetPasswordDialogProps) {
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const isValid = checks.length && checks.uppercase && checks.number;
  const doMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !doMatch || !userId) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Update has_password in profile
      await supabase.from('profiles').update({ has_password: true }).eq('id', userId);

      // Log via trusted RPC
      await supabase.rpc('log_security_action', {
        p_user_id: userId,
        p_action: 'password_set',
        p_details: null,
      });

      // Invalidate cache
      queryClient.invalidateQueries({ queryKey: ['profile-security', userId] });

      setSuccess(true);
      toast.success('Đặt mật khẩu thành công!');
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setConfirmPassword('');
    setSuccess(false);
    onOpenChange(false);
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Đặt mật khẩu thành công!</h3>
            <p className="text-sm text-muted-foreground text-center">
              Bạn đã có thể đăng nhập bằng email + mật khẩu.
            </p>
            {nextAction && (
              <Button
                variant="outline"
                onClick={() => {
                  handleClose();
                  onNextAction?.(nextAction);
                }}
                className="mt-2"
              >
                {nextAction === 'link_wallet' ? 'Liên kết ví ngay' : 'Tiếp tục'}
              </Button>
            )}
            <Button variant="ghost" onClick={handleClose}>
              Đóng
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đặt mật khẩu</DialogTitle>
          <DialogDescription>
            Đặt mật khẩu để đăng nhập nhanh bằng email + mật khẩu
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Mật khẩu mới</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="space-y-1 text-xs">
              <p className={checks.length ? 'text-emerald-600' : 'text-muted-foreground'}>
                {checks.length ? '✓' : '○'} Ít nhất 8 ký tự
              </p>
              <p className={checks.uppercase ? 'text-emerald-600' : 'text-muted-foreground'}>
                {checks.uppercase ? '✓' : '○'} Ít nhất 1 chữ hoa
              </p>
              <p className={checks.number ? 'text-emerald-600' : 'text-muted-foreground'}>
                {checks.number ? '✓' : '○'} Ít nhất 1 số
              </p>
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
            {confirmPassword && !doMatch && (
              <p className="text-xs text-destructive">Mật khẩu không khớp</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!isValid || !doMatch || loading}
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
