import { useState, useEffect, useRef, useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';
import { toast } from 'sonner';
import { FUN_MONEY_CONTRACT, FUN_MONEY_ABI, toWei, getTxUrl } from '@/config/pplp';

const CONFIRM_TIMEOUT_MS = 60_000;

interface UseClaimFunOptions {
  onSuccess?: () => void;
}

export const useClaimFun = (options?: UseClaimFunOptions) => {
  const { address } = useAccount();
  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Timeout guard: if confirmation takes too long, stop blocking UI
  useEffect(() => {
    if (isConfirming && txHash) {
      setTimedOut(false);
      timeoutRef.current = setTimeout(() => {
        setTimedOut(true);
        toast('Chưa nhận được xác nhận. Vui lòng kiểm tra trên BscScan.', {
          action: {
            label: 'Xem TX',
            onClick: () => window.open(getTxUrl(txHash), '_blank'),
          },
          duration: 8000,
        });
      }, CONFIRM_TIMEOUT_MS);
    } else {
      clearTimeout(timeoutRef.current);
    }
    return () => clearTimeout(timeoutRef.current);
  }, [isConfirming, txHash]);

  useEffect(() => {
    if (isSuccess && txHash) {
      setTimedOut(false);
      clearTimeout(timeoutRef.current);
      toast.success('Claim FUN thành công!', {
        description: 'FUN đã được chuyển vào ví của bạn.',
        action: {
          label: 'Xem TX',
          onClick: () => window.open(getTxUrl(txHash), '_blank'),
        },
      });
      options?.onSuccess?.();
    }
  }, [isSuccess, txHash]);

  const claimFun = useCallback(async (amount: number) => {
    if (!address || amount <= 0) return;
    setTimedOut(false);

    try {
      const amountWei = toWei(amount);

      await writeContractAsync({
        address: FUN_MONEY_CONTRACT.address,
        abi: FUN_MONEY_ABI,
        functionName: 'claim',
        args: [amountWei],
      } as any);
    } catch (error: any) {
      console.error('[useClaimFun] Error:', error);

      if (error.message?.includes('User rejected')) {
        toast.error('Đã hủy giao dịch');
      } else if (error.message?.includes('insufficient funds')) {
        toast.error('Không đủ BNB để trả gas');
      } else {
        toast.error(error.shortMessage || 'Không thể claim FUN');
      }
      throw error; // Re-throw để caller biết lỗi
    }
  }, [address, writeContractAsync]);

  // If timed out, don't report isProcessing to unblock UI
  const effectiveConfirming = isConfirming && !timedOut;

  return {
    claimFun,
    txHash,
    isPending,
    isConfirming: effectiveConfirming,
    isSuccess,
    isProcessing: isPending || effectiveConfirming,
  };
};
