// =============================================
// React Hook Template: useMintSubmit
// Submit 3 chữ ký on-chain qua lockWithPPLP
// Dependencies: wagmi, viem, @supabase/supabase-js
// =============================================
//
// HƯỚNG DẪN SỬ DỤNG:
// 1. Copy file này vào src/hooks/ của platform
// 2. Import supabase client từ đường dẫn tương ứng
// 3. Đảm bảo WagmiProvider đã bao bọc component tree
//
// CÁCH DÙNG:
// ```tsx
// const { submitMint, verifyNonce, isSubmitting } = useMintSubmit();
// await submitMint(mintRequest);
// ```
// =============================================

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, usePublicClient, useSwitchChain } from 'wagmi';
import { keccak256, toHex, encodePacked } from 'viem';
// import { supabase } from '@/integrations/supabase/client'; // ← THAY ĐỔI PATH

import {
  FUN_MONEY_CONTRACT,
  type GovSignature,
} from '../pplp-config';
import { LOCK_WITH_PPLP_ABI } from '../pplp-eip712';

interface SignedMintRequest {
  id: string;
  recipient_address: string;
  amount: number;
  amount_wei: string;
  action_type: string;
  action_hash: string;
  evidence_hash: string;
  nonce: string;
  multisig_signatures: Record<string, GovSignature>;
  multisig_completed_groups: string[];
}

export function useMintSubmit(supabase: any) {
  const { address, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: 97 });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Kiểm tra nonce on-chain khớp với DB
  const verifyNonce = useCallback(
    async (recipientAddress: string, expectedNonce: string): Promise<boolean> => {
      if (!publicClient) return false;

      try {
        const onChainNonce = await publicClient.readContract({
          address: FUN_MONEY_CONTRACT.address as `0x${string}`,
          abi: LOCK_WITH_PPLP_ABI,
          functionName: 'nonces',
          args: [recipientAddress as `0x${string}`],
        });

        return BigInt(expectedNonce) === BigInt(onChainNonce as bigint);
      } catch {
        return false;
      }
    },
    [publicClient]
  );

  // Submit on-chain
  const submitMint = useCallback(
    async (request: SignedMintRequest) => {
      if (!address) throw new Error('Chưa kết nối ví');

      // Kiểm tra đủ 3 nhóm
      const requiredGroups = ['will', 'wisdom', 'love'];
      const missingGroups = requiredGroups.filter(
        (g) => !request.multisig_completed_groups.includes(g)
      );
      if (missingGroups.length > 0) {
        throw new Error(`Thiếu chữ ký từ nhóm: ${missingGroups.join(', ')}`);
      }

      setIsSubmitting(true);
      try {
        // Chuyển sang BSC Testnet
        if (chainId !== 97) {
          await switchChainAsync({ chainId: 97 });
        }

        // Kiểm tra nonce
        const nonceValid = await verifyNonce(
          request.recipient_address,
          request.nonce
        );
        if (!nonceValid) {
          // Cập nhật DB: nonce mismatch
          await supabase
            .from('pplp_mint_requests')
            .update({
              status: 'failed',
              on_chain_error: 'NONCE_MISMATCH: Nonce không khớp on-chain. Cần tạo lại request.',
            })
            .eq('id', request.id);

          throw new Error(
            'Nonce không khớp on-chain. Vui lòng tạo lại yêu cầu mint.'
          );
        }

        // Sắp xếp chữ ký theo thứ tự [WILL, WISDOM, LOVE]
        const sigs: `0x${string}`[] = requiredGroups.map((group) => {
          const sig = request.multisig_signatures[group];
          if (!sig) throw new Error(`Thiếu chữ ký nhóm ${group}`);
          return sig.signature as `0x${string}`;
        });

        // Cập nhật status = submitted
        await supabase
          .from('pplp_mint_requests')
          .update({ status: 'submitted', submitted_at: new Date().toISOString() })
          .eq('id', request.id);

        // Gọi lockWithPPLP on-chain
        const txHash = await writeContractAsync({
          address: FUN_MONEY_CONTRACT.address as `0x${string}`,
          abi: LOCK_WITH_PPLP_ABI,
          functionName: 'lockWithPPLP',
          args: [
            request.recipient_address as `0x${string}`,
            request.action_type,
            BigInt(request.amount_wei),
            request.evidence_hash as `0x${string}`,
            sigs,
          ],
          chainId: 97,
        });

        setLastTxHash(txHash);

        // Cập nhật tx_hash
        await supabase
          .from('pplp_mint_requests')
          .update({ tx_hash: txHash })
          .eq('id', request.id);

        // Poll cho đến khi TX confirmed
        if (publicClient) {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash as `0x${string}`,
            confirmations: 2,
            timeout: 60_000,
          });

          if (receipt.status === 'success') {
            await supabase
              .from('pplp_mint_requests')
              .update({
                status: 'confirmed',
                confirmed_at: new Date().toISOString(),
              })
              .eq('id', request.id);
          } else {
            await supabase
              .from('pplp_mint_requests')
              .update({
                status: 'failed',
                on_chain_error: 'CONTRACT_REVERT: Transaction reverted',
              })
              .eq('id', request.id);
          }
        }

        return { success: true, txHash };
      } catch (error: any) {
        // Cập nhật lỗi vào DB
        if (request.id) {
          await supabase
            .from('pplp_mint_requests')
            .update({
              status: 'failed',
              on_chain_error: error.message?.substring(0, 500),
            })
            .eq('id', request.id);
        }
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      address,
      chainId,
      writeContractAsync,
      switchChainAsync,
      publicClient,
      verifyNonce,
      supabase,
    ]
  );

  return {
    submitMint,
    verifyNonce,
    isSubmitting,
    lastTxHash,
  };
}
