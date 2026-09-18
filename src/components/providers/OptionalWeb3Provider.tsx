import { Suspense, useContext, type ReactNode } from 'react';
import { WagmiContext } from 'wagmi';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { isWeb3Rescued } from '@/lib/rescueMode';

/**
 * OptionalWeb3Provider:
 * - Nếu cây React đã có `WagmiContext` (vì route hiện tại nằm trong
 *   `ConditionalWeb3Provider.WEB3_ROUTE_PREFIXES`), render children luôn —
 *   KHÔNG mount thêm `WagmiProvider` lồng nhau (sẽ gây Account Mismatch).
 * - Nếu chưa có và app KHÔNG ở chế độ rescue (`__fun_no_web3`), lazy-mount
 *   `Web3Provider` riêng cho modal.
 * - Nếu app đang ở chế độ rescue, không lazy import wagmi nữa — fallback
 *   được hiển thị bởi caller (xem `isWeb3Rescued()`).
 */

const Web3Provider = lazyNamedWithChunkRecovery(
  () => import('./Web3Provider'),
  'Web3Provider',
);

interface OptionalWeb3ProviderProps {
  children: ReactNode;
  /** Render khi đang ở rescue mode (không cho mount wagmi). */
  rescueFallback?: ReactNode;
  /** Suspense fallback khi đang lazy-load Web3Provider chunk. */
  suspenseFallback?: ReactNode;
}

export function OptionalWeb3Provider({
  children,
  rescueFallback = null,
  suspenseFallback = null,
}: OptionalWeb3ProviderProps) {
  const wagmi = useContext(WagmiContext);

  if (wagmi) {
    return <>{children}</>;
  }

  if (isWeb3Rescued()) {
    return <>{rescueFallback}</>;
  }

  return (
    <Suspense fallback={suspenseFallback}>
      <Web3Provider>{children}</Web3Provider>
    </Suspense>
  );
}
