import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { OptionalWeb3Provider } from '@/components/providers/OptionalWeb3Provider';

// Lazy load — chỉ tải wagmi/Web3 khi user thực sự mở modal
const UnifiedGiftSendDialog = lazyNamedWithChunkRecovery(
  () => import('@/components/donations/UnifiedGiftSendDialog'),
  'UnifiedGiftSendDialog',
);

class SendCryptoBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[SendCryptoModal] Crypto modal unavailable.', error, errorInfo);
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

interface SendCryptoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientUserId: string;
  recipientUsername: string;
  recipientWalletAddress: string | null;
  recipientBtcAddress?: string | null;
  conversationId: string;
  recipientAvatarUrl?: string | null;
  recipientDisplayName?: string | null;
}

export function SendCryptoModal({
  open,
  onOpenChange,
  recipientUserId,
  recipientUsername,
  recipientWalletAddress,
  recipientBtcAddress,
  recipientAvatarUrl,
  recipientDisplayName,
}: SendCryptoModalProps) {
  if (!open) return null;
  return (
    <SendCryptoBoundary>
      <Suspense fallback={null}>
        <OptionalWeb3Provider
          rescueFallback={
            <div className="fixed inset-x-4 bottom-20 z-[100] mx-auto max-w-sm rounded-xl border border-primary/20 bg-card p-4 text-sm text-card-foreground shadow-lg">
              Đang ở chế độ rescue. Tải lại bản mới để dùng ví.
            </div>
          }
        >
          <UnifiedGiftSendDialog
            isOpen={open}
            onClose={() => onOpenChange(false)}
            mode="wallet"
            presetRecipient={{
              id: recipientUserId,
              username: recipientUsername,
              displayName: recipientDisplayName,
              avatarUrl: recipientAvatarUrl,
              walletAddress: recipientWalletAddress,
              btcAddress: recipientBtcAddress,
            }}
          />
        </OptionalWeb3Provider>
      </Suspense>
    </SendCryptoBoundary>
  );
}
