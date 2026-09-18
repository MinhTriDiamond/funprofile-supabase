import { useState, useEffect, useCallback } from 'react';
import { useAccount, useSignTypedData, useChainId, useSwitchChain } from 'wagmi';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  EIP712_DOMAIN,
  EIP712_PPLP_TYPES,
  GOV_GROUPS,
  GovGroupKey,
  MultisigSignatures,
  getGovGroupForAddress,
  getGovMemberName,
} from '@/config/pplp';

export interface AttesterMintRequest {
  id: string;
  user_id: string;
  recipient_address: string;
  amount_wei: string;
  amount_display: number;
  evidence_hash: string;
  action_types: string[];
  action_name: string;
  action_hash: string | null;
  nonce: number;
  status: string;
  multisig_signatures: MultisigSignatures | null;
  multisig_required_groups: string[] | null;
  multisig_completed_groups: string[] | null;
  created_at: string;
  updated_at: string;
  error_message?: string | null;
  // Joined
  profiles?: { username: string; full_name: string | null; avatar_url: string | null } | null;
}

export interface UseAttesterSigningResult {
  // State
  isAttester: boolean;
  attesterGroup: GovGroupKey | null;
  attesterName: string | null;
  requests: AttesterMintRequest[];
  isLoading: boolean;
  signingRequestId: string | null;
  // Actions
  signRequest: (requestId: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

const SOFT_SIGN_CODES = new Set([
  'ALREADY_SIGNED',
  'ALREADY_COMPLETED',
  'UPDATE_CONFLICT',
  'INVALID_STATUS',
  'NOT_FOUND',
  'REQUEST_NOT_FOUND',
  'REQUEST_STATUS_CHANGED',
]);

const isStateDriftMessage = (message: string) => {
  const normalized = message.toLowerCase();
  return normalized.includes('request đã thay đổi trạng thái')
    || normalized.includes('đã thay đổi trạng thái')
    || normalized.includes('vui lòng tải lại danh sách')
    || normalized.includes('already signed')
    || normalized.includes('already completed')
    || normalized.includes('invalid_status')
    || normalized.includes('update_conflict')
    || normalized.includes('request_status_changed');
};

export const useAttesterSigning = (connectedAddress?: string): UseAttesterSigningResult => {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const effectiveAddress = connectedAddress || address;

  // Detect if connected wallet is a GOV attester
  const attesterGroup = effectiveAddress ? getGovGroupForAddress(effectiveAddress) : null;
  const attesterName = effectiveAddress ? getGovMemberName(effectiveAddress) : null;
  const isAttester = !!attesterGroup;

  const [requests, setRequests] = useState<AttesterMintRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [signingRequestId, setSigningRequestId] = useState<string | null>(null);

  // Fetch pending/signing requests via RPC (bypasses RLS mismatch)
  const fetchRequests = useCallback(async () => {
    if (!isAttester || !effectiveAddress) {
      console.log('[useAttesterSigning] skip fetch:', { isAttester, effectiveAddress, attesterGroup });
      setRequests([]);
      return;
    }

    setIsLoading(true);
    try {
      console.log('[useAttesterSigning] fetching for:', effectiveAddress, 'group:', attesterGroup);
      const { data, error } = await supabase
        .rpc('get_attester_mint_requests', { wallet_addr: effectiveAddress });

      if (error) {
        console.error('[useAttesterSigning] RPC error:', error);
        throw error;
      }

      const rows = (data || [])
        // Loại bỏ lệnh đã bị từ chối/huỷ khỏi thanh cần ký để tránh hiểu lầm và tốn phí gas
        .filter((r: any) => r.status !== 'rejected' && r.status !== 'cancelled' && r.status !== 'failed')
        .map((r: any) => ({
          ...r,
          multisig_signatures: (r.multisig_signatures as MultisigSignatures) ?? null,
          profiles: r.profile_username ? { username: r.profile_username, full_name: r.profile_full_name || null, avatar_url: r.profile_avatar_url } : null,
        }));
      console.log(`[useAttesterSigning] received ${rows.length} requests (rejected filtered)`);
      setRequests(rows);
    } catch (err) {
      console.error('[useAttesterSigning] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAttester, effectiveAddress, attesterGroup]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!isAttester) return;

    fetchRequests();

    const channel = supabase
      .channel('attester-mint-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pplp_mint_requests',
        },
        () => {
          // Refetch on any change
          fetchRequests();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isAttester, fetchRequests]);

  // Sign a request
  const signRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (!isConnected || !effectiveAddress || !attesterGroup) {
      toast.error('Vui lòng kết nối ví GOV trước');
      return false;
    }

    // Guard: chặn double-click khi đang xử lý bất kỳ request nào
    if (signingRequestId) {
      toast.info('Đang xử lý ký, vui lòng đợi...');
      return false;
    }

    // Khoá nút ngay từ đầu để tránh bấm lặp gây timeout
    setSigningRequestId(requestId);

    try {
      // Fetch fresh data via RPC (chỉ 1 request) để tránh timeout khi danh sách lớn
      const { data: rpcData, error: rpcErr } = await supabase
        .rpc('get_attester_mint_requests', { wallet_addr: effectiveAddress, p_request_id: requestId });

      if (rpcErr) {
        console.error('[useAttesterSigning] RPC error:', rpcErr);
        toast.error('Lỗi truy vấn dữ liệu ký');
        setSigningRequestId(null);
        return false;
      }

      const freshRequest = (rpcData || [])[0];
      if (!freshRequest) {
        toast.error('Không tìm thấy request hoặc đã hoàn tất');
        setSigningRequestId(null);
        return false;
      }

      // Check duplicate using fresh DB data
      const currentSigs: MultisigSignatures = (freshRequest.multisig_signatures as MultisigSignatures) ?? {};
      if (currentSigs[attesterGroup]) {
        toast.warning(`Nhóm ${GOV_GROUPS[attesterGroup].nameVi} đã ký request này rồi! Bỏ qua.`);
        await fetchRequests();
        setSigningRequestId(null);
        return false;
      }

      // Also check status
      if (freshRequest.status === 'signed' || freshRequest.status === 'minted') {
        toast.warning('Request này đã hoàn tất, không cần ký thêm.');
        await fetchRequests();
        setSigningRequestId(null);
        return false;
      }

      // Ensure BSC Testnet
      if (chainId !== 97) {
        try {
          toast.info('Đang chuyển sang BSC Testnet...');
          await switchChainAsync({ chainId: 97 });
        } catch {
          toast.error('Không thể chuyển sang BSC Testnet');
          setSigningRequestId(null);
          return false;
        }
      }

      if (!freshRequest.action_hash) {
        toast.error('Request thiếu action_hash');
        return false;
      }

      const message = {
        user: freshRequest.recipient_address as `0x${string}`,
        actionHash: freshRequest.action_hash as `0x${string}`,
        amount: BigInt(freshRequest.amount_wei),
        evidenceHash: freshRequest.evidence_hash as `0x${string}`,
        nonce: BigInt(freshRequest.nonce),
      };

      const signature = await signTypedDataAsync({
        account: effectiveAddress as `0x${string}`,
        types: EIP712_PPLP_TYPES,
        primaryType: 'PureLoveProof',
        message,
        domain: {
          name: EIP712_DOMAIN.name,
          version: EIP712_DOMAIN.version,
          chainId: EIP712_DOMAIN.chainId,
          verifyingContract: EIP712_DOMAIN.verifyingContract,
        },
      });

      const { data: signResult, error: signError } = await supabase.functions.invoke('pplp-attester-sign', {
        body: {
          request_id: requestId,
          signature,
          connected_address: effectiveAddress,
        },
      });

      if (signError) throw signError;

      if (!signResult?.success) {
        // Các code "trạng thái" không phải lỗi thật — chỉ cần refetch danh sách
        const resultCode = typeof signResult?.code === 'string' ? signResult.code : '';
        const resultMessage = signResult?.error || signResult?.message || '';
        if (SOFT_SIGN_CODES.has(resultCode) || isStateDriftMessage(resultMessage)) {
          toast.info(signResult.message || signResult.error || 'Request đã được cập nhật, đang tải lại...');
          await fetchRequests();
          return true;
        }

        throw new Error(resultMessage || 'Không thể lưu chữ ký');
      }

      // Refresh immediately after successful sign
      await fetchRequests();

      const completedGroups = Array.isArray(signResult?.request?.multisig_completed_groups)
        ? signResult.request.multisig_completed_groups as string[]
        : [];
      const isFullySigned = signResult?.request?.status === 'signed';

      if (isFullySigned) {
        toast.success('🎉 Đủ 3 chữ ký GOV! Request sẵn sàng Submit.');
      } else {
        toast.success(`${GOV_GROUPS[attesterGroup].emoji} Nhóm ${GOV_GROUPS[attesterGroup].nameVi} đã ký! Cần thêm ${3 - completedGroups.length} nhóm.`);
      }

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('User rejected')) {
        toast.error('Đã từ chối ký');
      } else if (isStateDriftMessage(msg)) {
        toast.info('Request đã được cập nhật, đang tải lại danh sách...');
        await fetchRequests();
        return true;
      } else {
        toast.error(`Lỗi ký: ${msg}`);
      }
      return false;
    } finally {
      setSigningRequestId(null);
    }
  }, [isConnected, effectiveAddress, attesterGroup, attesterName, chainId, switchChainAsync, signTypedDataAsync, signingRequestId, fetchRequests]);

  return {
    isAttester,
    attesterGroup,
    attesterName,
    requests,
    isLoading,
    signingRequestId,
    signRequest,
    refetch: fetchRequests,
  };
};
