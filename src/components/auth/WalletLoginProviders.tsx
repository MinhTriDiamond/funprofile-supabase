import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OptionalWeb3Provider } from '@/components/providers/OptionalWeb3Provider';
import { WalletLoginContent } from './WalletLoginContent';

interface WalletLoginProvidersProps {
  onSuccess: (userId: string, isNewUser: boolean) => void;
}

interface WalletLoginBoundaryState {
  hasError: boolean;
}

function WalletLoginUnavailable({
  onRetry,
  rescue = false,
}: {
  onRetry?: () => void;
  rescue?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5 text-center text-amber-950">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
        <Wallet className="h-5 w-5 text-amber-700" />
      </div>
      <h3 className="text-base font-semibold">
        {rescue
          ? 'Ch\u1ebf \u0111\u1ed9 nh\u1eb9 \u0111ang t\u1eaft \u0111\u0103ng nh\u1eadp b\u1eb1ng v\u00ed'
          : 'Kh\u00f4ng th\u1ec3 m\u1edf \u0111\u0103ng nh\u1eadp b\u1eb1ng v\u00ed'}
      </h3>
      <p className="mt-2 text-sm text-amber-800">
        {rescue
          ? 'Vui l\u00f2ng t\u1ea3i l\u1ea1i trang \u1edf ch\u1ebf \u0111\u1ed9 th\u01b0\u1eddng, ho\u1eb7c d\u00f9ng OTP/Google \u0111\u1ec3 \u0111\u0103ng nh\u1eadp.'
          : 'Vui l\u00f2ng t\u1ea3i l\u1ea1i ho\u1eb7c d\u00f9ng OTP/Google.'}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={onRetry}>
          T\u1ea3i l\u1ea1i
        </Button>
      )}
    </div>
  );
}

class WalletLoginBoundary extends Component<{ children: ReactNode }, WalletLoginBoundaryState> {
  state: WalletLoginBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WalletLoginBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[WalletLogin] Wallet provider failed to mount.', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <WalletLoginUnavailable onRetry={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}

export const WalletLoginProviders = ({ onSuccess }: WalletLoginProvidersProps) => {
  return (
    <WalletLoginBoundary>
      <OptionalWeb3Provider
        rescueFallback={<WalletLoginUnavailable rescue />}
        suspenseFallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" size={32} />
          </div>
        }
      >
        <WalletLoginContent onSuccess={onSuccess} />
      </OptionalWeb3Provider>
    </WalletLoginBoundary>
  );
};
