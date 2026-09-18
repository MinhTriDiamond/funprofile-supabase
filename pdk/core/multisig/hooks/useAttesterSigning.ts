// =============================================
// React Hook Template: useAttesterSigning
// Dùng cho GOV Attester ký EIP-712 off-chain
// Dependencies: wagmi, viem, @supabase/supabase-js
// =============================================
//
// HƯỚNG DẪN SỬ DỤNG:
// 1. Copy file này vào src/hooks/ của platform
// 2. Import supabase client từ đường dẫn tương ứng
// 3. Cài đặt: wagmi, viem (đã có sẵn nếu dùng RainbowKit)
// 4. Đảm bảo WagmiProvider đã bao bọc component tree
//
// CÁCH DÙNG TRONG COMPONENT:
// ```tsx
// const { pendingRequests, signRequest, myGroup, isAttester } = useAttesterSigning();
// ```
// =============================================

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useSignTypedData, useSwitchChain } from 'wagmi';
// import { supabase } from '@/integrations/supabase/client'; // ← THAY ĐỔI PATH

import {
  EIP712_DOMAIN,
  EIP712_PPLP_TYPES,
  GOV_GROUPS,
  getGovGroupForAddress,
  getGovMemberName,
  type GovGroupKey,
  type GovSignature,
} from '../pplp-config';

interface MintRequestRow {
  id: string;
  user_id: string;
  recipient_address: string;
  amount: number;
  amount_wei: string;
  action_hash: string;
  evidence_hash: string;
  nonce: string;
  status: string;
  multisig_signatures: Record<string, GovSignature>;
  multisig_completed_groups: string[];
  created_at: string;
  platform_id: string;
}

export function useAttesterSigning(supabase: any) {
  const { address, chainId } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();

  const [pendingRequests, setPendingRequests] = useState<MintRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [signing, setSigning] = useState<string | null>(null);

  // Xác định nhóm GOV của ví hiện tại
  const myGroup: GovGroupKey | null = address
    ? getGovGroupForAddress(address)
    : null;
  const myName: string | null = address ? getGovMemberName(address) : null;
  const isAttester = myGroup !== null;

  // Lấy danh sách request cần ký
  const fetchRequests = useCallback(async () => {
    if (!isAttester) return;

    const { data, error } = await supabase
      .from('pplp_mint_requests')
      .select('*')
      .in('status', ['pending_sig', 'signing'])
      .order('created_at', { ascending: true });

    if (!error && data) {
      // Lọc: chỉ hiện request mà nhóm mình chưa ký
      const filtered = data.filter((r: MintRequestRow) => {
        if (!myGroup) return false;
        return !r.multisig_completed_groups?.includes(myGroup);
      });
      setPendingRequests(filtered);
    }
  }, [isAttester, myGroup, supabase]);

  // Realtime subscription
  useEffect(() => {
    if (!isAttester) return;

    fetchRequests();

    const channel = supabase
      .channel('pplp-attester-signing')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pplp_mint_requests',
        },
        () => fetchRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAttester, fetchRequests, supabase]);

  // Ký một request
  const signRequest = useCallback(
    async (request: MintRequestRow) => {
      if (!address || !myGroup || !request.action_hash || !request.nonce) {
        throw new Error('Thiếu dữ liệu để ký');
      }

      setSigning(request.id);
      try {
        // Chuyển sang BSC Testnet nếu cần
        if (chainId !== 97) {
          await switchChainAsync({ chainId: 97 });
        }

        // Ký EIP-712
        const signature = await signTypedDataAsync({
          domain: EIP712_DOMAIN,
          types: EIP712_PPLP_TYPES,
          primaryType: 'PureLoveProof',
          message: {
            user: request.recipient_address as `0x${string}`,
            actionHash: request.action_hash as `0x${string}`,
            amount: BigInt(request.amount_wei),
            evidenceHash: request.evidence_hash as `0x${string}`,
            nonce: BigInt(request.nonce),
          },
        });

        // Cập nhật DB
        const newSig: GovSignature = {
          signer: address,
          signature,
          signed_at: new Date().toISOString(),
          signer_name: myName,
        };

        const updatedSigs = {
          ...request.multisig_signatures,
          [myGroup]: newSig,
        };
        const updatedGroups = [
          ...new Set([...request.multisig_completed_groups, myGroup]),
        ];

        // Kiểm tra đủ 3 nhóm chưa
        const allGroupsSigned = ['will', 'wisdom', 'love'].every((g) =>
          updatedGroups.includes(g)
        );

        const { error } = await supabase
          .from('pplp_mint_requests')
          .update({
            multisig_signatures: updatedSigs,
            multisig_completed_groups: updatedGroups,
            status: allGroupsSigned ? 'signed' : 'signing',
          })
          .eq('id', request.id);

        if (error) throw error;

        // Refresh
        await fetchRequests();

        return { success: true, allGroupsSigned };
      } finally {
        setSigning(null);
      }
    },
    [
      address,
      myGroup,
      myName,
      chainId,
      signTypedDataAsync,
      switchChainAsync,
      supabase,
      fetchRequests,
    ]
  );

  return {
    pendingRequests,
    loading,
    signing,
    signRequest,
    myGroup,
    myName,
    isAttester,
    govGroups: GOV_GROUPS,
    refreshRequests: fetchRequests,
  };
}
