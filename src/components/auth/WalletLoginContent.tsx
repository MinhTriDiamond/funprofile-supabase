/**
 * WalletLoginContent — Full mobile-optimized wallet login UI
 * Features: Step progress, deep links, dApp browser detection, pending sign handling
 */

import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  Wallet, CheckCircle2, Loader2, Mail, ShieldAlert,
  AlertCircle, ExternalLink, RefreshCw, ArrowLeft, Copy,
} from 'lucide-react';
import { useWalletAuth, type WalletLoginResult } from '@/hooks/useWalletAuth';
import {
  isMobileDevice,
  isMetaMaskMobileBrowser,
  isTrustWalletMobileBrowser,
  isBitgetMobileBrowser,
  isInjectedMobileBrowser,
  getMetaMaskDeepLink,
  getTrustWalletDeepLink,
  getBitgetDeepLink,
  getChainName,
} from '@/utils/mobileWalletConnect';
import { useState } from 'react';

interface WalletLoginContentProps {
  onSuccess: (userId: string, isNewUser: boolean) => void;
}

// ─── Step Progress Bar ───

const STEP_KEYS = [
  { key: 'connect', labelKey: 'authWalletStepConnect' },
  { key: 'network', labelKey: 'authWalletStepNetwork' },
  { key: 'sign', labelKey: 'authWalletStepSign' },
  { key: 'done', labelKey: 'authWalletStepDone' },
] as const;

function getActiveStep(phase: string) {
  switch (phase) {
    case 'idle': case 'connecting': return 0;
    case 'connected': case 'wrong_chain': return 1;
    case 'ready_to_sign': case 'signing': case 'signing_pending_wallet':
    case 'verifying': case 'error': return 2;
    case 'authenticated': return 3;
    default: return 0;
  }
}

function StepProgressBar({ phase }: { phase: string }) {
  const { t } = useLanguage();
  const activeStep = getActiveStep(phase);
  return (
    <div className="flex items-center justify-between gap-1 px-2 mb-4">
      {STEP_KEYS.map((step, index) => {
        const isActive = index === activeStep;
        const isDone = index < activeStep;
        return (
          <div key={step.key} className="flex flex-col items-center flex-1 gap-1">
            <div
              className={`w-full h-1.5 rounded-full transition-all duration-300 ${
                isDone ? 'bg-emerald-500' : isActive ? 'bg-emerald-400' : 'bg-muted'
              }`}
            />
            <span className={`text-[10px] font-medium ${
              isDone ? 'text-emerald-500' : isActive ? 'text-foreground' : 'text-muted-foreground'
            }`}>
              {t(step.labelKey)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───

export const WalletLoginContent = ({ onSuccess }: WalletLoginContentProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { openConnectModal } = useConnectModal();
  const auth = useWalletAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newUserId, setNewUserId] = useState<string | null>(null);
  const [showWalletSheet, setShowWalletSheet] = useState(false);
  const [walletConnectPending, setWalletConnectPending] = useState(false);
  const [walletConnectTimedOut, setWalletConnectTimedOut] = useState(false);
  const walletConnectTimerRef = useRef<number | null>(null);
  const signTimerRef = useRef<number | null>(null);

  const isMobile = isMobileDevice();
  const inMetaMaskMobile = isMetaMaskMobileBrowser();
  const inTrustWalletMobile = isTrustWalletMobileBrowser();
  const inBitgetMobile = isBitgetMobileBrowser();
  const inInjectedMobileBrowser = isInjectedMobileBrowser();

  useEffect(() => {
    if (!walletConnectPending) return;
    if (!['idle', 'connecting'].includes(auth.phase)) {
      if (walletConnectTimerRef.current) {
        window.clearTimeout(walletConnectTimerRef.current);
        walletConnectTimerRef.current = null;
      }
      setWalletConnectPending(false);
      setWalletConnectTimedOut(false);
    }
  }, [auth.phase, walletConnectPending]);

  useEffect(() => () => {
    if (walletConnectTimerRef.current) window.clearTimeout(walletConnectTimerRef.current);
    if (signTimerRef.current) window.clearTimeout(signTimerRef.current);
  }, []);

  useEffect(() => {
    if (!['signing', 'signing_pending_wallet'].includes(auth.phase)) {
      if (signTimerRef.current) {
        window.clearTimeout(signTimerRef.current);
        signTimerRef.current = null;
      }
      return;
    }
    if (signTimerRef.current) return;
    signTimerRef.current = window.setTimeout(() => {
      signTimerRef.current = null;
      setWalletConnectTimedOut(true);
      auth.resetWalletAuthFlow('timeout');
      toast.warning('Kết nối ví chưa hoàn tất. Vui lòng thử lại hoặc mở trực tiếp trong ví bạn đang dùng.');
    }, 75_000);
  }, [auth]);

  const shortAddr = auth.connectedAddress
    ? `${auth.connectedAddress.slice(0, 6)}...${auth.connectedAddress.slice(-4)}`
    : '';

  const helperText = useMemo(() => {
    if (auth.phase === 'connecting') {
      return inMetaMaskMobile
        ? t('authWalletHelperInMetaMask')
        : inTrustWalletMobile
        ? t('authWalletHelperInTrustWallet')
        : inBitgetMobile
        ? t('authWalletHelperInBitget')
        : t('authWalletHelperConnecting');
    }
    if (auth.phase === 'signing') {
      return auth.wasBackgroundedDuringSign
        ? t('authWalletHelperSignBackgrounded')
        : t('authWalletHelperOpeningWallet');
    }
    if (auth.phase === 'signing_pending_wallet' || auth.pendingRequestDetected) {
      return t('authWalletHelperPendingSign');
    }
    if (auth.phase === 'verifying') {
      return t('authWalletHelperVerifying');
    }
    return null;
  }, [t, auth.phase, auth.wasBackgroundedDuringSign, auth.pendingRequestDetected, inMetaMaskMobile, inTrustWalletMobile, inBitgetMobile]);

  // ─── Handlers ───

  const copyConnectionLink = async () => {
    const link = typeof window !== 'undefined' ? window.location.href : 'https://fun.rich/auth';
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Đã sao chép link kết nối.');
    } catch {
      toast.error('Không thể sao chép link. Vui lòng thử lại.');
    }
  };

  const clearWalletConnectTimer = () => {
    if (walletConnectTimerRef.current) {
      window.clearTimeout(walletConnectTimerRef.current);
      walletConnectTimerRef.current = null;
    }
  };

  const openWalletConnectModal = async () => {
    clearWalletConnectTimer();
    setWalletConnectTimedOut(false);
    setWalletConnectPending(true);
    setShowWalletSheet(false);
    try {
      await auth.beginWalletConnectSession();
      if (openConnectModal) openConnectModal();
      else await auth.connectWallet();
      walletConnectTimerRef.current = window.setTimeout(() => {
        setWalletConnectTimedOut(true);
        setWalletConnectPending(false);
        void auth.cancelWalletConnectSession('timeout');
        toast.warning('Kết nối ví chưa hoàn tất. Vui lòng thử lại hoặc mở trực tiếp trong ví bạn đang dùng.');
      }, 75_000);
    } catch (error: any) {
      setWalletConnectPending(false);
      setWalletConnectTimedOut(true);
      toast.error(error?.message || 'Không thể mở WalletConnect. Vui lòng thử lại.');
    }
  };

  const openMobileWalletSheet = () => {
    setWalletConnectTimedOut(false);
    setShowWalletSheet(true);
  };

  const handleConnectInjected = async () => {
    try {
      await auth.connectWallet();
      toast.success(
        inMetaMaskMobile ? t('authWalletToastConnectedMetaMask')
        : inTrustWalletMobile ? t('authWalletToastConnectedTrust')
        : inBitgetMobile ? t('authWalletToastConnectedBitget')
        : t('authWalletToastConnectedGeneric')
      );
    } catch (error: any) {
      toast.error(error?.message || t('authWalletToastErrorConnect'));
    }
  };

  const handleLogin = async () => {
    try {
      const result: WalletLoginResult = await auth.startWalletLoginFlow();
      toast.success(t('authWalletLoginSuccess'));
      if (result.isNewUser) {
        setNewUserId(result.user_id);
        setShowOnboarding(true);
      } else {
        toast.success(t('welcomeBack'));
      }
      onSuccess(result.user_id, result.isNewUser);
    } catch (error: any) {
      if (auth.phase === 'signing_pending_wallet' || auth.pendingRequestDetected) {
        toast.warning(t('authWalletToastPendingSign'));
        return;
      }
      toast.error(error?.message || t('authWalletToastErrorLogin'));
    }
  };

  const handleRetry = async () => {
    try {
      const result = await auth.retryCurrentStep();
      if (result) {
        toast.success(t('authWalletLoginSuccess'));
        if (result.isNewUser) { setNewUserId(result.user_id); setShowOnboarding(true); }
        onSuccess(result.user_id, result.isNewUser);
      }
    } catch (error: any) {
      toast.error(error?.message || t('authWalletToastErrorRetry'));
    }
  };

  const handleResumeCheck = async () => {
    try {
      const result = await auth.resumePendingFlowCheck();
      if (result) {
        toast.success(t('authWalletLoginSuccess'));
        if (result.isNewUser) { setNewUserId(result.user_id); setShowOnboarding(true); }
        onSuccess(result.user_id, result.isNewUser);
      } else {
        toast.info(t('authWalletToastConfirmInWallet'));
      }
    } catch (error: any) {
      toast.error(error?.message || t('authWalletToastErrorRecheck'));
    }
  };

  const handleSwitchWallet = async () => {
    try {
      const result = await auth.switchWalletAccount();
      if (result.cancelled) { toast.info(t('authWalletToastSwitchCancelled')); return; }
      if (result.switched) { toast.success(t('authWalletToastSwitched')); return; }
      if (result.fallbackUsed) { toast(t('authWalletToastFallbackPick'), { duration: 6000 }); return; }
    } catch (error: any) {
      toast.error(error?.message || t('authWalletToastErrorSwitch'));
    }
  };

  // ─── Render: Idle / Connecting ───

  if (auth.phase === 'idle' || auth.phase === 'connecting') {
    // Inside dApp browser (MetaMask / Trust / Bitget)
    if (inInjectedMobileBrowser) {
      return (
        <div className="space-y-4">
          <StepProgressBar phase={auth.phase} />
          <p className="text-sm text-muted-foreground text-center">
            {inMetaMaskMobile ? t('authWalletInMetaMaskShort') : inTrustWalletMobile ? t('authWalletInTrustWalletShort') : t('authWalletInBitgetShort')} {t('authWalletInjectedHint')}
          </p>
          <Button
            onClick={() => void handleConnectInjected()}
            disabled={auth.phase === 'connecting'}
            className="w-full h-12 rounded-full font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #166534 0%, #15803d 50%, #166534 100%)' }}
          >
            {auth.phase === 'connecting' ? (
              <><Loader2 className="mr-2 animate-spin" size={16} /> {t('authWalletConnecting')}</>
            ) : (
              <><Wallet className="mr-2" size={16} /> {inMetaMaskMobile ? t('authWalletConnectMetaMask') : inTrustWalletMobile ? t('authWalletConnectTrust') : t('authWalletConnectBitget')}</>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t('authWalletInjectedNoReopen')}</p>
        </div>
      );
    }

    // Standard flow (desktop or mobile without dApp browser)
    return (
      <div className="space-y-4">
        <StepProgressBar phase={auth.phase} />
        <div className="text-center space-y-2">
          <h3 className="text-lg font-bold text-foreground">{t('walletConnect')}</h3>
          <p className="text-sm text-muted-foreground">
            {isMobile ? t('authWalletDescMobile') : t('authWalletDescDesktop')}
          </p>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Không tốn phí gas. Chỉ ký xác nhận đăng nhập.
          </p>
          {!isMobile && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              Mở ví trên điện thoại → chọn WalletConnect → quét mã QR.
            </p>
          )}
        </div>

        {isMobile && (
          <div className="space-y-2">
            <a href={getMetaMaskDeepLink()} className="block">
              <Button variant="outline" className="w-full h-11 justify-between rounded-full">
                <span className="flex items-center gap-2"><Wallet size={16} /> {t('authWalletOpenInMetaMask')}</span>
                <ExternalLink size={14} className="text-muted-foreground" />
              </Button>
            </a>
            <a href={getTrustWalletDeepLink()} className="block">
              <Button variant="outline" className="w-full h-11 justify-between rounded-full">
                <span className="flex items-center gap-2"><Wallet size={16} /> {t('authWalletOpenInTrust')}</span>
                <ExternalLink size={14} className="text-muted-foreground" />
              </Button>
            </a>
            <a href={getBitgetDeepLink()} className="block">
              <Button variant="outline" className="w-full h-11 justify-between rounded-full">
                <span className="flex items-center gap-2"><Wallet size={16} /> {t('authWalletOpenInBitget')}</span>
                <ExternalLink size={14} className="text-muted-foreground" />
              </Button>
            </a>
          </div>
        )}

        <Button
          onClick={() => {
            if (isMobile) openMobileWalletSheet();
            else void openWalletConnectModal();
          }}
          disabled={auth.phase === 'connecting' || walletConnectPending}
          className="w-full h-12 rounded-full font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #166534 0%, #15803d 50%, #166534 100%)', boxShadow: '0 4px 20px rgba(22, 101, 52, 0.4)' }}
        >
          {auth.phase === 'connecting' || walletConnectPending ? (
            <><Loader2 className="mr-2 animate-spin" size={16} /> Đang mở ví...</>
          ) : (
            <><Wallet className="mr-2" size={16} /> Kết nối ví</>
          )}
        </Button>

        {walletConnectTimedOut && (
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
            <p className="font-medium">Kết nối ví chưa hoàn tất.</p>
            <p className="text-xs">Vui lòng thử lại hoặc chọn mở trực tiếp trong MetaMask, Trust Wallet, Bitget Wallet.</p>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => void openWalletConnectModal()}>
                Thử lại WalletConnect
              </Button>
              <Button variant="ghost" size="sm" className="rounded-full" onClick={() => void copyConnectionLink()}>
                <Copy size={14} className="mr-1" /> Sao chép link kết nối
              </Button>
            </div>
          </div>
        )}

        <Sheet open={showWalletSheet} onOpenChange={(open) => {
          setShowWalletSheet(open);
          if (!open && walletConnectPending) void auth.cancelWalletConnectSession('walletconnect_cancel');
        }}>
          <SheetContent side="bottom" className="rounded-t-3xl pb-8">
            <SheetHeader>
              <SheetTitle>Chọn ví của bạn</SheetTitle>
              <SheetDescription>
                Nếu đang dùng điện thoại, hãy chọn ví bạn đã cài. WalletConnect dành cho các ví khác.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5 space-y-2">
              <a href={getMetaMaskDeepLink()} className="block" onClick={() => setShowWalletSheet(false)}>
                <Button variant="outline" className="w-full h-12 justify-between rounded-full">
                  <span className="flex items-center gap-2"><Wallet size={16} /> Mở trong MetaMask</span>
                  <ExternalLink size={14} className="text-muted-foreground" />
                </Button>
              </a>
              <a href={getTrustWalletDeepLink()} className="block" onClick={() => setShowWalletSheet(false)}>
                <Button variant="outline" className="w-full h-12 justify-between rounded-full">
                  <span className="flex items-center gap-2"><Wallet size={16} /> Mở trong Trust Wallet</span>
                  <ExternalLink size={14} className="text-muted-foreground" />
                </Button>
              </a>
              <a href={getBitgetDeepLink()} className="block" onClick={() => setShowWalletSheet(false)}>
                <Button variant="outline" className="w-full h-12 justify-between rounded-full">
                  <span className="flex items-center gap-2"><Wallet size={16} /> Mở trong Bitget Wallet</span>
                  <ExternalLink size={14} className="text-muted-foreground" />
                </Button>
              </a>
              <Button className="w-full h-12 rounded-full font-bold" onClick={() => void openWalletConnectModal()} disabled={walletConnectPending}>
                {walletConnectPending ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Wallet className="mr-2" size={16} />}
                WalletConnect / Ví khác
              </Button>
              <Button variant="ghost" className="w-full rounded-full" onClick={() => void copyConnectionLink()}>
                <Copy size={14} className="mr-2" /> Sao chép link kết nối
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <p className="text-center text-xs text-muted-foreground">
          {t('authWalletSupportedNote')}
        </p>
      </div>
    );
  }

  // ─── Render: Wrong Chain ───

  if (auth.phase === 'wrong_chain') {
    return (
      <div className="space-y-4">
        <StepProgressBar phase={auth.phase} />
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle size={18} className="shrink-0" />
          <span>{t('authWalletSwitchToBSC')}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <Wallet size={16} className="shrink-0 text-muted-foreground" />
          <span className="text-sm font-mono truncate">{shortAddr}</span>
        </div>
        <Button
          onClick={() => void auth.ensureSupportedChain()}
          disabled={auth.isSwitchingChain}
          className="w-full h-11 rounded-full font-bold"
        >
          {auth.isSwitchingChain ? (
            <><Loader2 className="mr-2 animate-spin" size={16} /> {t('authWalletSwitchingChain')}</>
          ) : (
            t('authWalletSwitchToBSCBtn')
          )}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => void handleSwitchWallet()} disabled={auth.isSwitchingWallet}>
            <RefreshCw size={14} className="mr-1" /> {t('authWalletSwitchOther')}
          </Button>
        </div>
        <button onClick={() => void auth.disconnectWallet()} className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
          {t('authWalletDisconnect')}
        </button>
      </div>
    );
  }

  // ─── Render: Signing / Pending / Verifying ───

  if (auth.phase === 'signing' || auth.phase === 'signing_pending_wallet' || auth.phase === 'verifying') {
    return (
      <div className="space-y-4">
        <StepProgressBar phase={auth.phase} />
        <div className="text-center py-4">
          <Loader2 className="animate-spin mx-auto text-emerald-500 mb-3" size={40} />
          {helperText && <p className="text-sm text-muted-foreground">{helperText}</p>}
          {auth.phase === 'signing_pending_wallet' && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {t('authWalletPendingMetaMaskWarn')}
            </p>
          )}
        </div>

        {isMobile && (auth.phase === 'signing' || auth.phase === 'signing_pending_wallet') && (
          <div className="space-y-2">
            <a href={getMetaMaskDeepLink()} className="block">
              <Button variant="outline" size="sm" className="w-full rounded-full">
                <Wallet size={14} className="mr-1" /> {t('authWalletReopenMetaMask')}
              </Button>
            </a>
            {!inMetaMaskMobile && (
              <a href={getTrustWalletDeepLink()} className="block">
                <Button variant="outline" size="sm" className="w-full rounded-full">
                  <Wallet size={14} className="mr-1" /> {t('authWalletReopenTrust')}
                </Button>
              </a>
            )}
            {!inMetaMaskMobile && !inTrustWalletMobile && (
              <a href={getBitgetDeepLink()} className="block">
                <Button variant="outline" size="sm" className="w-full rounded-full">
                  <Wallet size={14} className="mr-1" /> {t('authWalletReopenBitget')}
                </Button>
              </a>
            )}
          </div>
        )}

        <Button onClick={() => void handleResumeCheck()} variant="secondary" className="w-full rounded-full">
          {t('authWalletConfirmedMyself')}
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => void handleSwitchWallet()} disabled={auth.isSwitchingWallet}>
            {t('authWalletSwitchOther')}
          </Button>
        </div>

        <button onClick={() => void auth.disconnectWallet()} className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
          {t('authWalletDisconnect')}
        </button>

        <button onClick={() => auth.resetWalletAuthFlow('retry')} className="flex items-center justify-center gap-1 w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={12} /> {t('authWalletBack')}
        </button>
      </div>
    );
  }

  // ─── Render: Authenticated ───

  if (auth.phase === 'authenticated') {
    return (
      <div className="space-y-4">
        <StepProgressBar phase={auth.phase} />
        <div className="text-center py-4">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={40} />
          <p className="text-sm font-medium text-foreground">{t('authWalletLoginSuccess')}</p>
        </div>
      </div>
    );
  }

  // ─── Render: Error ───

  if (auth.phase === 'error') {
    return (
      <div className="space-y-4">
        <StepProgressBar phase={auth.phase} />
        <div className="text-center py-4">
          <AlertCircle className="mx-auto text-destructive mb-2" size={40} />
          <p className="text-sm font-medium text-destructive">{t('authWalletAuthFailed')}</p>
          {auth.error?.message && <p className="text-xs text-muted-foreground mt-1">{auth.error.message}</p>}
        </div>

        {auth.pendingRequestDetected ? (
          <div className="space-y-2">
            <Button onClick={() => void handleResumeCheck()} className="w-full rounded-full">{t('authWalletRecheck')}</Button>
            <Button variant="outline" onClick={() => void handleSwitchWallet()} disabled={auth.isSwitchingWallet} className="w-full rounded-full">
              {t('authWalletSwitchOther')}
            </Button>
          </div>
        ) : (
          <Button onClick={() => void handleRetry()} disabled={auth.isSigning || auth.isVerifying} className="w-full rounded-full">
            {t('authWalletRetry')}
          </Button>
        )}

        <button onClick={() => void auth.disconnectWallet()} className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
          {t('authWalletDisconnect')}
        </button>
      </div>
    );
  }

  // ─── Render: Connected (ready to sign) ───

  return (
    <div className="space-y-4">
      <StepProgressBar phase={auth.phase} />

      <div className="flex items-center gap-2 rounded-lg border p-3">
        <Wallet size={16} className="shrink-0 text-muted-foreground" />
        <span className="text-sm font-mono truncate flex-1">{shortAddr}</span>
        <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
      </div>

      <div className="text-xs text-muted-foreground text-center">
        {t('authWalletNetworkLabel')}: <strong className="text-foreground">{getChainName(auth.chainId)}</strong>
      </div>

      <Button
        onClick={() => void handleLogin()}
        disabled={auth.isSigning || auth.isVerifying}
        className="w-full h-12 rounded-full font-bold text-white"
        style={{ background: 'linear-gradient(135deg, #166534 0%, #15803d 50%, #166534 100%)', boxShadow: '0 4px 20px rgba(22, 101, 52, 0.4)' }}
      >
        {auth.isSigning || auth.isVerifying ? t('authWalletProcessing') : t('authWalletSignAndLogin')}
      </Button>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => void handleSwitchWallet()} disabled={auth.isSwitchingWallet}>
          <RefreshCw size={14} className="mr-1" /> {t('authWalletSwitchOther')}
        </Button>
      </div>

      <button onClick={() => void auth.disconnectWallet()} className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
        {t('authWalletDisconnect')}
      </button>

      {/* Onboarding Dialog for new users */}
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="text-emerald-600" size={32} />
              </div>
            </div>
            <DialogTitle className="text-xl">{t('authWalletOnboardingTitle')}</DialogTitle>
            <Badge variant="secondary" className="mx-auto w-fit">
              <ShieldAlert className="w-3 h-3 mr-1" />
              {t('authWalletOnboardingBadge')}
            </Badge>
            <DialogDescription className="text-sm space-y-2">
              <span className="block">{t('authWalletOnboardingExplore')}</span>
              <span className="block font-medium text-foreground">
                {t('authWalletOnboardingLinkEmailHint')}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button onClick={() => { setShowOnboarding(false); navigate('/settings/security'); }} className="w-full">
              <Mail className="w-4 h-4 mr-2" /> {t('authWalletOnboardingLinkEmailBtn')}
            </Button>
            <Button variant="ghost" onClick={() => setShowOnboarding(false)} className="w-full text-muted-foreground">
              {t('authWalletOnboardingLater')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
