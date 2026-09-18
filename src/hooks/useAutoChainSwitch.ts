import { useEffect, useRef, useCallback } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { toast } from 'sonner';

/**
 * Auto-switches wallet to BSC Mainnet (or allowed chain) on connect.
 * - On mobile wallets, chainId is often Ethereum Mainnet by default.
 * - This hook detects wrong chain and auto-requests switch.
 * - Only shows warning if user rejects the switch.
 * 
 * @param targetChainId - Default: BSC Mainnet (56). Set to bscTestnet.id for testnet.
 * @param allowedChainIds - Additional allowed chain IDs (default: [bsc.id, bscTestnet.id])
 */
export function useAutoChainSwitch(
  targetChainId: number = bsc.id,
  allowedChainIds: number[] = [bsc.id, bscTestnet.id]
) {
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const hasSwitchedRef = useRef(false);
  const isSwitchingRef = useRef(false);

  // Reset flag when disconnected or chain changes to an allowed one
  useEffect(() => {
    if (!isConnected) {
      hasSwitchedRef.current = false;
      isSwitchingRef.current = false;
    }
    if (chainId && allowedChainIds.includes(chainId)) {
      hasSwitchedRef.current = true; // Already on correct chain
      isSwitchingRef.current = false;
    }
  }, [isConnected, chainId, allowedChainIds]);

  // Auto-switch on connect if wrong chain
  useEffect(() => {
    if (
      isConnected &&
      chainId &&
      !allowedChainIds.includes(chainId) &&
      !hasSwitchedRef.current &&
      !isSwitchingRef.current
    ) {
      isSwitchingRef.current = true;
      hasSwitchedRef.current = true;

      switchChain(
        { chainId: targetChainId },
        {
          onSuccess: () => {
            isSwitchingRef.current = false;
            toast.success('Đã chuyển sang BNB Smart Chain');
          },
          onError: (error) => {
            isSwitchingRef.current = false;
            console.warn('[AutoChainSwitch] User rejected or failed:', error);
            toast.warning('Ví đang ở chain khác. Vui lòng chuyển sang BNB Mainnet.', {
              duration: 8000,
            });
          },
        }
      );
    }
  }, [isConnected, chainId, targetChainId, allowedChainIds, switchChain]);

  const isOnAllowedChain = chainId ? allowedChainIds.includes(chainId) : false;
  const isWrongChain = isConnected && chainId ? !allowedChainIds.includes(chainId) : false;

  const manualSwitch = useCallback(() => {
    if (!switchChain) return;
    switchChain(
      { chainId: targetChainId },
      {
        onSuccess: () => toast.success('Đã chuyển sang BNB Smart Chain'),
        onError: () => toast.error('Không thể chuyển chain. Vui lòng chuyển thủ công trong ví.'),
      }
    );
  }, [switchChain, targetChainId]);

  return { isOnAllowedChain, isWrongChain, manualSwitch, isSwitching: isSwitchingRef.current };
}
