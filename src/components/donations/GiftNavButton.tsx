import { Component, useState, memo, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Gift } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLanguage } from '@/i18n/LanguageContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { OptionalWeb3Provider } from '@/components/providers/OptionalWeb3Provider';

// Lazy load — chỉ tải khi user mở dialog (tránh kéo wagmi vào route non-Web3)
const UnifiedGiftSendDialog = lazyNamedWithChunkRecovery(
  () => import('./UnifiedGiftSendDialog'),
  'UnifiedGiftSendDialog',
);

class GiftDialogBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[GiftNavButton] Gift dialog unavailable.', error, errorInfo);
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

interface GiftNavButtonProps {
  variant: 'desktop' | 'mobile';
  className?: string;
}

export const GiftNavButton = memo(({ variant, className = '' }: GiftNavButtonProps) => {
  const { t } = useLanguage();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { userId, isAuthenticated } = useCurrentUser();

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isAuthenticated) return;
    setIsDialogOpen(true);
  };

  if (variant === 'desktop') {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleOpen}
              className={`fun-icon-btn-gold group relative ${className}`}
              aria-label={t('gift') || 'Tặng quà'}
            >
              <Gift className="w-5 h-5 text-gold drop-shadow-[0_0_6px_hsl(48_96%_53%/0.5)] group-hover:drop-shadow-[0_0_12px_hsl(48_96%_53%/0.8)] transition-all duration-300" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-card text-card-foreground border border-border">
            <p>{t('gift') || 'Tặng quà'}</p>
          </TooltipContent>
        </Tooltip>

        {isDialogOpen && (
          <GiftDialogBoundary>
            <Suspense fallback={null}>
              <OptionalWeb3Provider>
                <UnifiedGiftSendDialog
                  isOpen={isDialogOpen}
                  onClose={() => setIsDialogOpen(false)}
                  mode="navbar"
                />
              </OptionalWeb3Provider>
            </Suspense>
          </GiftDialogBoundary>
        )}
      </>
    );
  }

  // Mobile variant
  return (
    <>
      <button
        onClick={handleOpen}
        aria-label={t('gift') || 'Tặng quà'}
        className={`flex flex-col items-center justify-center min-w-[56px] min-h-[52px] rounded-full transition-all duration-300 touch-manipulation group border-[0.5px] text-gold hover:text-gold hover:bg-gold/10 border-transparent hover:border-gold/40 active:bg-gold/20 ${className}`}
      >
        <Gift className="w-6 h-6 transition-all duration-300 drop-shadow-[0_0_6px_hsl(48_96%_53%/0.5)] group-hover:drop-shadow-[0_0_10px_hsl(48_96%_53%/0.7)]" strokeWidth={1.8} />
        <span className="text-[10px] mt-1 font-medium truncate max-w-[52px]">{t('gift') || 'Tặng'}</span>
      </button>

      {isDialogOpen && (
        <GiftDialogBoundary>
          <Suspense fallback={null}>
            <OptionalWeb3Provider>
              <UnifiedGiftSendDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                mode="navbar"
              />
            </OptionalWeb3Provider>
          </Suspense>
        </GiftDialogBoundary>
      )}
    </>
  );
});

GiftNavButton.displayName = 'GiftNavButton';
