import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, ShieldAlert } from 'lucide-react';
import { useLoginMethods, type RecommendedAction } from '@/hooks/useLoginMethods';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const COOLDOWN_DAYS = 7;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function getDismissKey(action: string) {
  return `dismiss_security_${action}`;
}

function isDismissed(action: string): boolean {
  try {
    const ts = localStorage.getItem(getDismissKey(action));
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function dismissAction(action: string) {
  try {
    localStorage.setItem(getDismissKey(action), Date.now().toString());
  } catch {
    // ignore
  }
}

const ACTION_CONFIG: Record<string, { text: string; cta: string }> = {
  reward_locked: {
    text: 'Liên kết email để mở khóa các hoạt động có thưởng',
    cta: 'Liên kết email ngay',
  },
  set_password: {
    text: 'Đặt mật khẩu để đăng nhập nhanh hơn và tăng bảo mật',
    cta: 'Đặt mật khẩu',
  },
  link_email: {
    text: 'Liên kết email để dễ khôi phục tài khoản',
    cta: 'Liên kết email',
  },
  verify_email: {
    text: 'Xác thực email để hoàn tất liên kết',
    cta: 'Kiểm tra email',
  },
  link_wallet: {
    text: 'Liên kết ví để tăng bảo mật tài khoản',
    cta: 'Liên kết ví',
  },
};

interface AccountUpgradeBannerProps {
  className?: string;
}

export function AccountUpgradeBanner({ className }: AccountUpgradeBannerProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useCurrentUser();
  const { recommendedAction, isFullySecured, isLoading, rewardLocked } = useLoginMethods();
  const [dismissed, setDismissed] = useState<string | null>(null);

  // reward_locked takes highest priority
  const effectiveAction = useMemo(() => {
    if (rewardLocked) return 'reward_locked';
    return recommendedAction;
  }, [rewardLocked, recommendedAction]);

  const shouldShow = useMemo(() => {
    if (!isAuthenticated || isLoading) return false;
    if (!rewardLocked && isFullySecured) return false;
    if (!effectiveAction) return false;
    if (isDismissed(effectiveAction)) return false;
    if (dismissed === effectiveAction) return false;
    return true;
  }, [isAuthenticated, isLoading, isFullySecured, effectiveAction, dismissed, rewardLocked]);

  if (!shouldShow || !effectiveAction) return null;

  const config = ACTION_CONFIG[effectiveAction];
  if (!config) return null;

  const handleDismiss = () => {
    dismissAction(effectiveAction);
    setDismissed(effectiveAction);
  };

  return (
    <div className={`fb-card p-3 mb-3 border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/10 ${className ?? ''}`}>
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground font-medium">{config.text}</p>
          <div className="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => navigate('/settings/security')}
              className="text-xs h-7"
            >
              {config.cta}
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
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
