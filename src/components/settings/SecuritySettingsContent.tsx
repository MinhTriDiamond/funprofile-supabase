import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoginMethods, TOTAL_METHODS, type RecommendedAction } from '@/hooks/useLoginMethods';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Key,
  Wallet,
  Chrome,
  ChevronRight,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { SetPasswordDialog } from '@/components/security/SetPasswordDialog';
import { ChangePasswordDialog } from '@/components/security/ChangePasswordDialog';
import { LinkEmailDialog } from '@/components/security/LinkEmailDialog';
import { LinkWalletDialog } from '@/components/security/LinkWalletDialog';
import { OptionalWeb3Provider } from '@/components/providers/OptionalWeb3Provider';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const SecuritySettingsContent = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const queryClient = useQueryClient();
  const loginMethods = useLoginMethods();

  const [showSetPassword, setShowSetPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showLinkEmail, setShowLinkEmail] = useState(false);
  const [showLinkWallet, setShowLinkWallet] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email_confirmed_at) {
        queryClient.invalidateQueries({ queryKey: ['fresh-auth-user'] });
      }
    });
  }, [queryClient]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'USER_UPDATED') {
        queryClient.invalidateQueries({ queryKey: ['fresh-auth-user'] });
        queryClient.invalidateQueries({ queryKey: ['profile-security'] });
        toast.success('Thông tin tài khoản đã được cập nhật');
      }
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading || loginMethods.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const {
    emailExists,
    emailVerified,
    hasEmailLoginMethod,
    hasGoogleIdentity,
    hasPassword,
    hasWalletLoginMethod,
    activeMethodCount,
    securityLevel,
    recommendedAction,
    isFullySecured,
    accountStatus,
  } = loginMethods;

  const securityProgress = Math.min(100, Math.round((activeMethodCount / TOTAL_METHODS) * 100));

  const securityConfig = {
    basic: { label: 'Cơ bản', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-950/30', icon: ShieldAlert },
    good: { label: 'Tốt', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-950/30', icon: Shield },
    strong: { label: 'Mạnh', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-950/30', icon: ShieldCheck },
  };

  const sc = securityConfig[securityLevel];

  const handleNextAction = (action: RecommendedAction) => {
    if (action === 'set_password') setShowSetPassword(true);
    else if (action === 'link_email') setShowLinkEmail(true);
    else if (action === 'link_wallet') setShowLinkWallet(true);
  };

  const methods = [
    {
      icon: Mail, label: 'Email OTP',
      description: 'Dùng email để nhận mã đăng nhập',
      status: hasEmailLoginMethod ? 'connected' : emailExists && !emailVerified ? 'pending' : 'disconnected',
      statusLabel: hasEmailLoginMethod ? 'Đã liên kết' : emailExists && !emailVerified ? 'Chờ xác thực' : 'Chưa liên kết',
      action: !hasEmailLoginMethod ? () => setShowLinkEmail(true) : undefined,
      actionLabel: emailExists && !emailVerified ? 'Xác thực' : 'Liên kết',
    },
    {
      icon: Chrome, label: 'Google',
      description: hasEmailLoginMethod
        ? 'Bạn đã liên kết email nên có thể đăng nhập vào tài khoản này bằng Google nhé'
        : 'Đăng nhập nhanh bằng tài khoản Google',
      status: hasGoogleIdentity ? 'connected' : 'disconnected',
      statusLabel: hasGoogleIdentity ? 'Đã liên kết' : 'Chưa liên kết',
      action: undefined, actionLabel: undefined,
    },
    {
      icon: Key, label: 'Mật khẩu',
      description: hasEmailLoginMethod
        ? 'Đăng nhập nhanh bằng email + mật khẩu'
        : 'Bạn cần liên kết email để đặt mật khẩu',
      status: hasPassword ? 'connected' : 'disconnected',
      statusLabel: hasPassword ? 'Đã đặt' : 'Chưa đặt',
      action: hasPassword
        ? () => setShowChangePassword(true)
        : (hasEmailLoginMethod ? () => setShowSetPassword(true) : undefined),
      actionLabel: hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu',
    },
    {
      icon: Wallet, label: 'Ví Web3',
      description: 'Đăng nhập bằng ví Web3 của bạn',
      status: hasWalletLoginMethod ? 'connected' : 'disconnected',
      statusLabel: hasWalletLoginMethod ? 'Đã liên kết' : 'Chưa liên kết',
      action: !hasWalletLoginMethod ? () => setShowLinkWallet(true) : undefined,
      actionLabel: 'Liên kết ví',
    },
  ];

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'connected') return <CheckCircle className="w-4 h-4 text-emerald-600" />;
    if (status === 'pending') return <Clock className="w-4 h-4 text-amber-600" />;
    return <XCircle className="w-4 h-4 text-muted-foreground" />;
  };

  const recommendedConfig: Record<string, { text: string; cta: string }> = {
    set_password: { text: 'Đặt mật khẩu để đăng nhập nhanh hơn và tăng bảo mật', cta: 'Đặt mật khẩu' },
    link_email: { text: 'Liên kết email để dễ khôi phục tài khoản', cta: 'Liên kết email' },
    verify_email: { text: 'Xác thực email để hoàn tất liên kết', cta: 'Kiểm tra email' },
    link_wallet: { text: 'Liên kết ví để tăng bảo mật tài khoản', cta: 'Liên kết ví' },
  };

  const getNextAction = (): RecommendedAction => {
    if (!hasWalletLoginMethod) return 'link_wallet';
    if (!emailExists) return 'link_email';
    return null;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Bảo mật tài khoản</h1>

      {/* Limited Account Badge for wallet-first users */}
      {accountStatus === 'limited' && (
        <div className="rounded-xl p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <Badge variant="secondary" className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
              Tài khoản giới hạn
            </Badge>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Mở khóa thưởng bằng cách xác thực email
          </p>
        </div>
      )}

      {/* Security Level Card */}
      <div className={`rounded-xl p-5 ${sc.bg} border`}>
        <div className="flex items-center gap-3 mb-3">
          <sc.icon className={`w-8 h-8 ${sc.color}`} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">Mức bảo mật</h2>
              <Badge variant={isFullySecured ? 'default' : 'secondary'} className="text-xs">
                {sc.label}
              </Badge>
            </div>
            {isFullySecured ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                Tài khoản của bạn đang được bảo vệ tốt. ✅
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {activeMethodCount}/{TOTAL_METHODS} phương thức đang hoạt động
              </p>
            )}
          </div>
        </div>
        <Progress value={securityProgress} className="h-2" />
      </div>

      {/* Recommended Next Step */}
      {recommendedAction && recommendedConfig[recommendedAction] && (
        <div className="rounded-xl p-4 bg-primary/5 border border-primary/20">
          <p className="text-sm font-medium text-foreground mb-2">📌 Bước tiếp theo được khuyên:</p>
          <p className="text-sm text-muted-foreground mb-3">{recommendedConfig[recommendedAction].text}</p>
          <Button size="sm" onClick={() => handleNextAction(recommendedAction)}>
            {recommendedConfig[recommendedAction].cta}
          </Button>
        </div>
      )}

      {/* Login Methods */}
      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-foreground">Phương thức đăng nhập</h3>
        </div>
        <div className="divide-y">
          {methods.map((method) => (
            <div key={method.label} className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <method.icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{method.label}</span>
                  <StatusIcon status={method.status} />
                </div>
                <p className="text-xs text-muted-foreground">{method.description}</p>
                <span className={`text-xs ${
                  method.status === 'connected' ? 'text-emerald-600' :
                  method.status === 'pending' ? 'text-amber-600' :
                  'text-muted-foreground'
                }`}>{method.statusLabel}</span>
              </div>
              {method.action && (
                <Button size="sm" variant="outline" onClick={method.action} className="flex-shrink-0">
                  {method.actionLabel}
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dialogs */}
      <SetPasswordDialog open={showSetPassword} onOpenChange={setShowSetPassword} nextAction={getNextAction()} onNextAction={handleNextAction} />
      <ChangePasswordDialog open={showChangePassword} onOpenChange={setShowChangePassword} />
      <LinkEmailDialog open={showLinkEmail} onOpenChange={setShowLinkEmail} />
      {showLinkWallet && (
        <OptionalWeb3Provider
          rescueFallback={
            <div className="fixed inset-x-4 bottom-20 z-[100] mx-auto max-w-sm rounded-xl border border-primary/20 bg-card p-4 text-sm text-card-foreground shadow-lg">
              Đang ở chế độ rescue. Tải lại bản mới để dùng ví.
            </div>
          }
        >
          <LinkWalletDialog open={showLinkWallet} onOpenChange={setShowLinkWallet} />
        </OptionalWeb3Provider>
      )}
    </div>
  );
};

export default SecuritySettingsContent;
