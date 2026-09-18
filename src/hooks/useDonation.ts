import { useState } from 'react';
import { useAccount, useSendTransaction, usePublicClient } from 'wagmi';
import { parseEther, parseUnits } from 'viem';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DonationCardData } from '@/components/donations/DonationSuccessCard';
import { validateMinSendValue, MIN_SEND_USD } from '@/lib/minSendValidation';

// ERC20 Transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

interface UseDonationOptions {
  onSuccess?: (data: DonationCardData) => void;
  onError?: (error: Error) => void;
}

export interface DonationParams {
  recipientId: string;
  recipientUsername: string;
  recipientWalletAddress: string;
  recipientAvatarUrl?: string | null;
  amount: string;
  tokenSymbol: string;
  tokenAddress: string | null;
  tokenDecimals: number;
  message?: string;
  messageTemplate?: string;
  postId?: string;
  senderDisplayName?: string;
  tokenPriceUSD?: number | null;
}

export function useDonation(options?: UseDonationOptions) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [isProcessing, setIsProcessing] = useState(false);
  
  // For native BNB transfers
  const { sendTransactionAsync, isPending: isSendPending } = useSendTransaction();

  const donate = async (params: DonationParams): Promise<DonationCardData | null> => {
    // Track txHash outside try block for error recovery
    let txHash: `0x${string}` | undefined;
    
    if (!isConnected || !address) {
      toast.error('Vui lòng kết nối ví trước');
      return null;
    }

    if (!params.recipientWalletAddress) {
      toast.error('Người nhận chưa có địa chỉ ví');
      return null;
    }

    // Validate amount
    const amount = parseFloat(params.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Số lượng không hợp lệ');
      return null;
    }

    // Check minimum USD value (skip on Testnet chainId 97)
    if (chainId !== 97) {
      const priceUSD = params.tokenPriceUSD ?? null;
      const minCheck = validateMinSendValue(amount, priceUSD);
      if (!minCheck.valid) {
        toast.error(minCheck.message || `Giá trị gửi tối thiểu là ${MIN_SEND_USD} USD`);
        return null;
      }
    }

    setIsProcessing(true);
    (window as any).__TX_IN_PROGRESS__ = true;

    try {
      // For simplicity, we'll use sendTransaction for all transfers
      // The recipient will receive native or we encode the ERC20 transfer call
      if (!params.tokenAddress) {
        // Native BNB transfer
        txHash = await sendTransactionAsync({
          to: params.recipientWalletAddress as `0x${string}`,
          value: parseEther(params.amount),
        });
      } else {
        // ERC20 token transfer - encode the transfer call data
        const { encodeFunctionData } = await import('viem');
        const data = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [
            params.recipientWalletAddress as `0x${string}`,
            parseUnits(params.amount, params.tokenDecimals),
          ],
        });
        
        txHash = await sendTransactionAsync({
          to: params.tokenAddress as `0x${string}`,
          data,
        });
      }

      // ✅ TX broadcasted - LƯU NGAY vào localStorage để recovery có thể retry
      // nếu mobile bị suspend giữa lúc đợi receipt hoặc invoke record-donation.
      const pendingDonation = {
        txHash,
        senderId: undefined as string | undefined, // sẽ set sau khi có session
        recipientId: params.recipientId,
        recipientUsername: params.recipientUsername,
        amount: params.amount,
        tokenSymbol: params.tokenSymbol,
        tokenAddress: params.tokenAddress,
        chainId: chainId || 56,
        message: params.message,
        messageTemplate: params.messageTemplate,
        postId: params.postId,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(`pending_donation_${txHash}`, JSON.stringify(pendingDonation));
      } catch (e) {
        console.warn('[useDonation] Cannot persist pending donation', e);
      }

      // Now wait for blockchain confirmation
      toast.loading('Đang chờ xác nhận từ blockchain...', { id: 'donation-tx' });

      let receiptConfirmed = false;
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
            timeout: 60_000,
          });
          receiptConfirmed = receipt.status === 'success';
        } catch {
          receiptConfirmed = false;
        }
      }

      if (!receiptConfirmed) {
        // KHÔNG xoá pending — recovery hook sẽ tự verify on-chain và retry sau.
        toast.error(
          'Chưa nhận được xác nhận trong 60 giây. Hệ thống sẽ tự khôi phục giao dịch khi cha mở lại app.',
          { id: 'donation-tx', duration: 10000 }
        );
        return null;
      }


      toast.loading('Đang ghi nhận giao dịch vào hệ thống...', { id: 'donation-tx' });

      // Get current user info
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Vui lòng đăng nhập');
      }

      // Cập nhật senderId vào pending để recovery hook biết chính xác sender
      try {
        const raw = localStorage.getItem(`pending_donation_${txHash}`);
        if (raw) {
          const obj = JSON.parse(raw);
          obj.senderId = session.user.id;
          localStorage.setItem(`pending_donation_${txHash}`, JSON.stringify(obj));
        }
      } catch { /* ignore */ }

      // Get sender profile
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('username, display_name, full_name, avatar_url')
        .eq('id', session.user.id)
        .single();

      // Record donation via edge function
      const { data: donationData, error } = await supabase.functions.invoke('record-donation', {
        body: {
          sender_id: session.user.id,
          recipient_id: params.recipientId,
          amount: params.amount,
          token_symbol: params.tokenSymbol,
          token_address: params.tokenAddress,
          chain_id: chainId || 56,
          tx_hash: txHash,
          message: params.message,
          message_template: params.messageTemplate,
          post_id: params.postId,
        },
      });

      if (error) {
        console.error('Error recording donation:', error);
        // Don't fail the whole process - tx is already on chain
        toast.warning('Giao dịch thành công nhưng chưa ghi nhận được vào hệ thống. TX: ' + txHash.slice(0, 18) + '...', { 
          id: 'donation-tx',
          duration: 10000,
        });
      } else {
        // ✅ Successfully recorded - remove from localStorage
        localStorage.removeItem(`pending_donation_${txHash}`);
        toast.success('Tặng thưởng thành công!', { id: 'donation-tx' });
      }

      const cardData: DonationCardData = {
        id: donationData?.donation?.id || crypto.randomUUID(),
        amount: params.amount,
        tokenSymbol: params.tokenSymbol,
        senderUsername: senderProfile?.username || 'Unknown',
        senderDisplayName: senderProfile?.display_name || senderProfile?.full_name || senderProfile?.username,
        senderAvatarUrl: senderProfile?.avatar_url,
        recipientUsername: params.recipientUsername,
        recipientDisplayName: params.senderDisplayName, // passed from caller if available
        recipientAvatarUrl: params.recipientAvatarUrl,
        message: params.message,
        txHash,
        lightScoreEarned: donationData?.light_score_earned || Math.floor(parseFloat(params.amount) / 100),
        createdAt: new Date().toISOString(),
      };

      options?.onSuccess?.(cardData);
      return cardData;

    } catch (error: any) {
      console.error('Donation error:', error);
      
      // CRITICAL: Always dismiss loading toast first
      toast.dismiss('donation-tx');
      
      // Check if TX was already sent successfully but recording failed
      if (txHash) {
        // TX is on chain but not recorded - show clear message with TX hash
        toast.error(
          `Giao dịch đã thành công trên blockchain nhưng chưa ghi nhận vào hệ thống. Vui lòng liên hệ Admin với TX: ${txHash.slice(0, 18)}...`,
          { duration: 15000 }
        );
        // Keep pending donation in localStorage for potential recovery
      } else {
        // TX never happened - show appropriate error
        const errMsg = (error?.message || '').toLowerCase();
        const errCode = error?.code;
        let errorMessage = 'Không thể thực hiện giao dịch';
        let isReject = false;
        if (errCode === 4001 || errMsg.includes('rejected') || errMsg.includes('denied') || errMsg.includes('user reject')) {
          errorMessage = 'Bạn đã huỷ giao dịch';
          isReject = true;
        } else if (errMsg.includes('insufficient')) {
          errorMessage = 'Số dư không đủ. Cần ít nhất ~0.001 BNB để trả phí gas.';
        } else if (errMsg.includes('chain') || errMsg.includes('network')) {
          errorMessage = 'Sai mạng. Vui lòng chuyển sang BNB Smart Chain trong ví.';
        } else if (errMsg.includes('đăng nhập')) {
          errorMessage = 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại';
        }
        if (isReject) {
          toast.info(errorMessage);
        } else {
          toast.error(errorMessage);
        }
      }
      
      options?.onError?.(error);
      return null;
    } finally {
      (window as any).__TX_IN_PROGRESS__ = false;
      setIsProcessing(false);
    }
  };

  return {
    donate,
    isProcessing: isProcessing || isSendPending,
    isConnected,
    walletAddress: address,
  };
}
