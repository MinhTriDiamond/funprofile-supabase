import { Component, useState, Suspense, useCallback, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Gift, HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { OptionalWeb3Provider } from '@/components/providers/OptionalWeb3Provider';

// Lazy load — chỉ tải khi user mở dialog (tránh kéo wagmi vào route non-Web3)
const UnifiedGiftSendDialog = lazyNamedWithChunkRecovery(
  () => import('./UnifiedGiftSendDialog'),
  'UnifiedGiftSendDialog',
);

// Preload Web3 + dialog khi user hover/focus nút Tặng → mở dialog gần như tức thời.
let giftPreloadStarted = false;
const preloadGiftStack = () => {
  if (giftPreloadStarted) return;
  giftPreloadStarted = true;
  Promise.all([
    import('./UnifiedGiftSendDialog'),
    import('@/components/providers/Web3Provider'),
  ]).catch(() => {
    giftPreloadStarted = false;
  });
};

class DonationDialogBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[DonationButton] Donation dialog unavailable.', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-x-4 bottom-20 z-[100] mx-auto max-w-sm rounded-xl border border-primary/20 bg-card p-4 text-sm text-card-foreground shadow-lg">
          Tính năng ví đang cần cập nhật, vui lòng tải lại trang.
        </div>
      );
    }

    return this.props.children;
  }
}

interface DonationButtonProps {
  recipientId: string;
  recipientUsername: string;
  recipientDisplayName?: string | null;
  recipientWalletAddress?: string | null;
  recipientBtcAddress?: string | null;
  recipientAvatarUrl?: string | null;
  postId?: string;
  variant?: 'default' | 'profile' | 'post' | 'icon' | 'footer';
  className?: string;
}

export const DonationButton = ({
  recipientId,
  recipientUsername,
  recipientDisplayName,
  recipientWalletAddress,
  recipientBtcAddress,
  recipientAvatarUrl,
  postId,
  variant = 'default',
  className,
}: DonationButtonProps) => {
  const { t } = useLanguage();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const openDialog = useCallback(() => {
    preloadGiftStack();
    setIsDialogOpen(true);
  }, []);
  const preloadProps = {
    onMouseEnter: preloadGiftStack,
    onFocus: preloadGiftStack,
    onTouchStart: preloadGiftStack,
  };

  const presetRecipient = {
    id: recipientId,
    username: recipientUsername,
    displayName: recipientDisplayName,
    walletAddress: recipientWalletAddress,
    btcAddress: recipientBtcAddress,
    avatarUrl: recipientAvatarUrl,
  };

  const dialog = isDialogOpen ? (
    <DonationDialogBoundary>
      <Suspense fallback={null}>
        <OptionalWeb3Provider
          rescueFallback={
            <div className="fixed inset-x-4 bottom-20 z-[100] mx-auto max-w-sm rounded-xl border border-primary/20 bg-card p-4 text-sm text-card-foreground shadow-lg">
              Đang ở chế độ rescue. Tải lại bản mới để dùng ví.
            </div>
          }
        >
          <UnifiedGiftSendDialog
            isOpen={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            mode="post"
            presetRecipient={presetRecipient}
            postId={postId}
          />
        </OptionalWeb3Provider>
      </Suspense>
    </DonationDialogBoundary>
  ) : null;

  if (variant === 'footer') {
    return (
      <>
        <button
          onClick={openDialog}
          {...preloadProps}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md transition-colors hover:bg-secondary text-muted-foreground active:bg-secondary/80 text-sm font-medium',
            className
          )}
        >
          <HandCoins className="w-[18px] h-[18px] text-gold" />
          <span>{t('gift')}</span>
        </button>
        {dialog}
      </>
    );
  }

  if (variant === 'icon' || variant === 'post') {
    return (
      <>
        <button
          onClick={openDialog}
          {...preloadProps}
          className={cn(
            'p-2.5 rounded-full transition-colors hover:bg-secondary text-muted-foreground active:bg-secondary/80',
            className
          )}
        >
          <HandCoins className="w-5 h-5 text-gold" />
        </button>
        {dialog}
      </>
    );
  }

  if (variant === 'profile') {
    return (
      <>
        <Button
          onClick={openDialog}
          {...preloadProps}
          className={cn(
            'font-semibold px-4 h-10 bg-gradient-to-r from-gold/90 to-amber-500/90 hover:from-gold hover:to-amber-500 text-primary-foreground border-0 shadow-md hover:shadow-lg transition-all duration-300',
            className
          )}
        >
          <Gift className="w-4 h-4 mr-2" />
          {t('gift')}
        </Button>
        {dialog}
      </>
    );
  }

  return (
    <>
      <Button
        onClick={openDialog}
        {...preloadProps}
        variant="outline"
        className={cn(
          'border-gold/50 hover:border-gold hover:bg-gold/10 text-gold',
          className
        )}
      >
        <Gift className="w-4 h-4 mr-2" />
        {t('gift')}
      </Button>
      {dialog}
    </>
  );
};
