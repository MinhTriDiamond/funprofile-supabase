import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, UserCog } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const COOLDOWN_DAYS = 3;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'dismiss_display_name_reminder';

function isDismissed(): boolean {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function DisplayNameReminderBanner({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { userId, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const [dismissed, setDismissed] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile-display-name-check', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', userId!)
        .single();
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const shouldShow = useMemo(() => {
    if (!isAuthenticated || authLoading || profileLoading) return false;
    if (dismissed || isDismissed()) return false;
    if (!profile) return false;
    const isWalletUsername = profile.username?.startsWith('wallet_0x') ?? false;
    const noFullName = !profile.full_name || !profile.full_name.trim();
    return isWalletUsername && noFullName;
  }, [isAuthenticated, authLoading, profileLoading, dismissed, profile]);

  if (!shouldShow) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, Date.now().toString()); } catch {}
    setDismissed(true);
  };

  const handleCta = () => {
    try { localStorage.setItem('profile-tab', 'edit'); } catch {}
    navigate('/profile');
  };

  return (
    <div className={`fb-card p-3 mb-3 border-l-4 border-l-amber-400 bg-amber-50/60 dark:bg-amber-950/10 ${className ?? ''}`}>
      <div className="flex items-start gap-3">
        <UserCog className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground font-medium">
            Bạn đang dùng tên mặc định từ ví Web3. Hãy đặt tên hiển thị để mọi người dễ nhận ra bạn hơn.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" variant="default" onClick={handleCta} className="text-xs h-7">
              Đặt tên hiển thị
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="text-xs h-7 text-muted-foreground"
            >
              Để sau
            </Button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Đóng">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
