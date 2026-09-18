import { Component, type ReactNode } from 'react';
import { MemoizedLightScoreDashboard } from '../LightScoreDashboard';
import { AttesterSigningPanel } from '../AttesterSigningPanel';
import { FunMoneyGuide } from '../FunMoneyGuide';
import { ClaimRewardsCard } from '../ClaimRewardsCard';
import { LockedGrantsPanel } from '../LockedGrantsPanel';
import { useAttesterSigning } from '@/hooks/useAttesterSigning';
import { Button } from '@/components/ui/button';
import { RefreshCw, Coins, Globe2 } from 'lucide-react';
import { CrossPlatformBanner } from '../CrossPlatformBanner';
import { AddFunTokenButton } from '../AddFunTokenButton';
import { GetTestBnbButton } from '../GetTestBnbButton';

class Web3ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[Web3ErrorBoundary] Caught wagmi/web3 error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
          <p className="text-muted-foreground text-sm">Kết nối Web3 bị gián đoạn. Vui lòng tải lại trang.</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Tải lại trang
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface FunMoneyTabProps {
  externalAddress?: `0x${string}`;
  onActivate: () => void;
  onClaim: () => void;
  onClaimSuccess: () => void;
}

function FunMoneyTabInner({
  externalAddress,
  onActivate,
  onClaim,
  onClaimSuccess,
}: FunMoneyTabProps) {
  const {
    isAttester,
    attesterGroup,
    attesterName,
    requests,
    isLoading: isAttesterLoading,
    signingRequestId,
    signRequest,
  } = useAttesterSigning(externalAddress);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Coins className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">FUN Money</h1>
          <p className="text-xs text-muted-foreground">Quản lý phần thưởng & đúc token FUN của bạn</p>
        </div>
      </div>
      {/* Cross-Platform Banner */}
      <CrossPlatformBanner />

      {/* Attester Panel — GOV Multisig Dashboard */}
      {isAttester && attesterGroup && (
        <AttesterSigningPanel
          attesterGroup={attesterGroup}
          attesterName={attesterName}
          requests={requests}
          isLoading={isAttesterLoading}
          signingRequestId={signingRequestId}
          onSign={signRequest}
        />
      )}

      {/* Two-column layout for Claim + Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ClaimRewardsCard onClaimSuccess={(requestId) => onClaimSuccess?.()} />
        <FunMoneyGuide />
      </div>

      {/* Locked Grants Panel */}
      <LockedGrantsPanel walletAddress={externalAddress} />

      {/* Add FUN token to wallet */}
      <AddFunTokenButton />

      {/* Get free tBNB for gas */}
      <GetTestBnbButton />

      {/* Light Score Dashboard */}
      <MemoizedLightScoreDashboard
        walletAddress={externalAddress}
        onActivate={onActivate}
        onClaim={onClaim}
      />
    </div>
  );
}

export function FunMoneyTab(props: FunMoneyTabProps) {
  return (
    <Web3ErrorBoundary>
      <FunMoneyTabInner {...props} />
    </Web3ErrorBoundary>
  );
}
