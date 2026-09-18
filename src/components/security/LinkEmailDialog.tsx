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
import { Loader2, Mail, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface LinkEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkEmailDialog({ open, onOpenChange }: LinkEmailDialogProps) {
  const { userId } = useCurrentUser();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);

  const normalizeEmail = (e: string) => e.trim().toLowerCase();

  const checkEmailExists = async (normalizedEmail: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-email-exists`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: normalizedEmail }),
        }
      );

      if (!res.ok) return false;
      const data = await res.json();
      return data.exists === true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const normalized = normalizeEmail(email);
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      toast.error('Email không hợp lệ');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
        setLoading(false);
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-link-verification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: normalized }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Có lỗi xảy ra');
        setLoading(false);
        return;
      }

      setSent(true);
      toast.success('Đã gửi email xác thực qua Resend. Vui lòng kiểm tra hộp thư.');
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Phiên đăng nhập hết hạn.');
        setResending(false);
        return;
      }

      const normalized = normalizeEmail(email);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-link-verification`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: normalized }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Không thể gửi lại');
      }

      toast.success('Đã gửi lại email xác thực.');
    } catch (err: any) {
      toast.error(err.message || 'Không thể gửi lại');
    } finally {
      setResending(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setSent(false);
    onOpenChange(false);
  };

  if (sent) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Chờ xác thực email</h3>
            <p className="text-sm text-muted-foreground text-center">
              Chúng tôi đã gửi email xác thực đến <strong>{email}</strong>.
              <br />
              Vui lòng mở email và nhấn vào liên kết xác thực.
            </p>
            <p className="text-xs text-muted-foreground">
              Không thấy email? Kiểm tra thư mục spam.
            </p>
            <Button
              variant="outline"
              onClick={handleResend}
              disabled={resending}
              size="sm"
            >
              {resending ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                'Gửi lại email xác thực'
              )}
            </Button>
            <Button variant="ghost" onClick={handleClose} size="sm">
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
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Liên kết email
          </DialogTitle>
          <DialogDescription>
            Liên kết email để nhận mã đăng nhập và khôi phục tài khoản
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Một email xác thực sẽ được gửi đến địa chỉ này. Bạn cần nhấn vào liên kết trong email để hoàn tất.
            </p>
          </div>

          {loading && (
            <p className="text-xs text-muted-foreground text-center animate-pulse">
              ⏳ Quá trình gửi email có thể mất 5-10 giây...
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang gửi email xác thực...
              </>
            ) : (
              'Gửi email xác thực'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
