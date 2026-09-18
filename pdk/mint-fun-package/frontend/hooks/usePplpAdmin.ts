import { useState, useCallback } from 'react';
import { useAccount, useSignTypedData, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, usePublicClient } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logger from '@/lib/logger';
import {
  EIP712_DOMAIN,
  EIP712_PPLP_TYPES,
  FUN_MONEY_CONTRACT,
  FUN_MONEY_ABI,
  MINT_REQUEST_STATUS,
  getTxUrl,
  GOV_GROUPS,
  GovGroupKey,
  MultisigSignatures,
  getGovGroupForAddress,
  getGovMemberName,
} from '@/config/pplp';

// Types - Updated for contract v1.2.1 + Multisig GOV-COMMUNITY
export interface MintRequest {
  id: string;
  user_id: string;
  recipient_address: string;
  amount_wei: string;
  amount_display: number;
  evidence_hash: string;
  action_types: string[];
  action_name: string;        // Action name string (e.g., "light_action")
  action_hash: string | null; // keccak256(bytes(action_name))
  nonce: number;
  deadline: number | null;    // No longer used by contract v1.2.1
  status: string;
  signature: string | null;
  signed_at: string | null;
  signed_by: string | null;
  tx_hash: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  error_message: string | null;
  retry_count: number;
  action_ids: string[];
  created_at: string;
  updated_at: string;
  // Multisig GOV-COMMUNITY fields
  multisig_signatures: MultisigSignatures | null;
  multisig_required_groups: string[] | null;
  multisig_completed_groups: string[] | null;
  // Joined data
  profiles?: {
    username: string;
    avatar_url: string | null;
  } | null;
}

export interface ActionDetail {
  id: string;
  action_type: string;
  content_preview: string | null;
  mint_amount: number;
  created_at: string;
  reference_id: string | null;
}

export interface ActionBreakdown {
  action_type: string;
  count: number;
  total_amount: number;
  items: ActionDetail[];
}

export interface MintStats {
  pending_sig: number;
  signing: number;
  signed: number;
  submitted: number;
  confirmed: number;
  failed: number;
  rejected: number;
  total_minted: number;
}

export interface EcosystemTopUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_fun: number;
  action_count: number;
  has_wallet: boolean;
  public_wallet_address: string | null;
  wallet_address: string | null;
}

export interface EcosystemStats {
  total_approved_fun: number;
  total_approved_actions: number;
  total_minted_fun: number;
  total_minted_requests: number;
  pending_sig_fun: number;
  pending_sig_count: number;
  users_with_wallet: { count: number; total_fun: number };
  users_without_wallet: { count: number; total_fun: number };
  top_users: EcosystemTopUser[];
}

export const usePplpAdmin = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: 97 });
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, data: writeHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: writeHash,
  });
  const [ecosystemStats, setEcosystemStats] = useState<EcosystemStats | null>(null);
  const [isLoadingEcosystem, setIsLoadingEcosystem] = useState(false);
  const [isBatchCreating, setIsBatchCreating] = useState(false);
  const [isMergingRequests, setIsMergingRequests] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [mintRequests, setMintRequests] = useState<MintRequest[]>([]);
  const [stats, setStats] = useState<MintStats>({
    pending_sig: 0,
    signing: 0,
    signed: 0,
    submitted: 0,
    confirmed: 0,
    failed: 0,
    rejected: 0,
    total_minted: 0,
  });

  // Fetch all mint requests
  const fetchMintRequests = useCallback(async (statusFilter?: string) => {
    setIsLoading(true);
    try {
      // Fetch mint requests
      let query = supabase
        .from('pplp_mint_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data: requests, error } = await query;

      if (error) throw error;

      // Fetch profiles for each user
      const userIds = [...new Set((requests || []).map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, is_banned')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      // Merge data — filter out:
      //  - banned users
      //  - epoch chưa hết chu kỳ (created_at thuộc tháng hiện tại): tránh
      //    ký nhầm các yêu cầu mint phát sinh trước khi chu kỳ đóng.
      const now = new Date();
      const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();

      const enrichedRequests: MintRequest[] = (requests || [])
        .filter(req => {
          const profile = profileMap.get(req.user_id);
          if (profile?.is_banned) return false;
          // Ẩn pending/signing/signed của epoch chưa hết chu kỳ.
          const createdMs = req.created_at ? new Date(req.created_at).getTime() : 0;
          const isInProgressEpoch = createdMs >= currentMonthStart;
          const isUnsignedStatus = ['pending_sig', 'signing', 'signed'].includes(req.status);
          if (isInProgressEpoch && isUnsignedStatus) return false;
          return true;
        })
        .map(req => ({
        ...req,
        multisig_signatures: (req.multisig_signatures as MultisigSignatures) ?? null,
        profiles: profileMap.get(req.user_id) || null,
      }));

      setMintRequests(enrichedRequests);

      // Calculate stats
      const newStats: MintStats = {
        pending_sig: 0,
        signing: 0,
        signed: 0,
        submitted: 0,
        confirmed: 0,
        failed: 0,
        rejected: 0,
        total_minted: 0,
      };

      enrichedRequests.forEach((req) => {
        if (req.status === MINT_REQUEST_STATUS.PENDING_SIG) newStats.pending_sig++;
        else if (req.status === 'signing') newStats.signing++;
        else if (req.status === MINT_REQUEST_STATUS.SIGNED) newStats.signed++;
        else if (req.status === MINT_REQUEST_STATUS.SUBMITTED) newStats.submitted++;
        else if (req.status === MINT_REQUEST_STATUS.CONFIRMED) {
          newStats.confirmed++;
          newStats.total_minted += req.amount_display;
        }
        else if (req.status === MINT_REQUEST_STATUS.FAILED) newStats.failed++;
        else if (req.status === 'rejected') newStats.rejected++;
      });

      setStats(newStats);
    } catch (error) {
      console.error('[usePplpAdmin] fetchMintRequests error:', error);
      toast.error('Không thể tải danh sách mint requests');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch ecosystem-wide stats via RPC
  const fetchEcosystemStats = useCallback(async () => {
    setIsLoadingEcosystem(true);
    try {
      const { data, error } = await supabase.rpc('get_pplp_admin_stats');
      if (error) throw error;
      setEcosystemStats(data as unknown as EcosystemStats);
    } catch (error) {
      console.error('[usePplpAdmin] fetchEcosystemStats error:', error);
    } finally {
      setIsLoadingEcosystem(false);
    }
  }, []);

  // Helper: Đảm bảo đang ở BSC Testnet trước khi thực hiện action
  const ensureBscTestnet = useCallback(async (): Promise<boolean> => {
    const targetChainId = 97; // BSC Testnet
    
    if (chainId === targetChainId) {
      return true; // Đã đúng chain
    }
    
    try {
      toast.info('Đang chuyển sang BSC Testnet...');
      await switchChainAsync({ chainId: targetChainId });
      toast.success('Đã chuyển sang BSC Testnet!');
      return true;
    } catch (error: unknown) {
      console.error('[usePplpAdmin] Switch chain error:', error);
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('User rejected')) {
        toast.error('Bé đã từ chối chuyển mạng');
      } else {
        toast.error('Không thể chuyển sang BSC Testnet. Vui lòng chuyển thủ công trong ví.');
      }
      return false;
    }
  }, [chainId, switchChainAsync]);

  // Sign a single mint request — Multisig GOV-COMMUNITY (WILL + WISDOM + LOVE)
  const signMintRequest = useCallback(async (request: MintRequest): Promise<string | null> => {
    if (!isConnected || !address) {
      toast.error('Vui lòng kết nối ví GOV trước');
      return null;
    }

    // 1. Xác định nhóm GOV của ví đang kết nối
    const groupKey = getGovGroupForAddress(address);
    if (!groupKey) {
      toast.error('Ví của bạn không thuộc nhóm GOV-COMMUNITY nào. Vui lòng dùng ví được ủy quyền.');
      return null;
    }

    // 2. Kiểm tra nhóm này đã ký chưa
    const currentSigs: MultisigSignatures = request.multisig_signatures ?? {};
    if (currentSigs[groupKey]) {
      toast.warning(`Nhóm ${GOV_GROUPS[groupKey].nameVi} (${GOV_GROUPS[groupKey].emoji}) đã ký request này rồi!`);
      return null;
    }

    // Kiểm tra và switch chain sang BSC Testnet
    const isCorrectChain = await ensureBscTestnet();
    if (!isCorrectChain) {
      return null;
    }

    try {
      logger.debug(`[usePplpAdmin] Signing request ${request.id} as group: ${groupKey} (${getGovMemberName(address)})`);

      // Validate action_hash exists
      if (!request.action_hash) {
        toast.error('Request thiếu action_hash. Vui lòng tạo lại claim request.');
        return null;
      }

      // Create the typed data message - MUST match contract PPLP_TYPEHASH exactly
      const message = {
        user: request.recipient_address as `0x${string}`,
        actionHash: request.action_hash as `0x${string}`,
        amount: BigInt(request.amount_wei),
        evidenceHash: request.evidence_hash as `0x${string}`,
        nonce: BigInt(request.nonce),
      };

      logger.debug('[usePplpAdmin] EIP-712 PureLoveProof message:', message);

      // 3. Ký EIP-712 (gasless, off-chain)
      const signature = await signTypedDataAsync({
        account: address,
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

      logger.debug(`[usePplpAdmin] Signature from ${groupKey}:`, signature);

      // 4. Cập nhật multisig_signatures trong DB
      const newSigs: MultisigSignatures = {
        ...currentSigs,
        [groupKey]: {
          signer: address,
          signature,
          signed_at: new Date().toISOString(),
          signer_name: getGovMemberName(address),
        },
      };

      const completedGroups = Object.keys(newSigs) as GovGroupKey[];
      const isFullySigned = completedGroups.length === 3;

      const { error: updateError } = await supabase
        .from('pplp_mint_requests')
        .update({
          multisig_signatures: newSigs as unknown as import('@/integrations/supabase/types').Json,
          multisig_completed_groups: completedGroups,
          // Backward compat: lưu chữ ký cuối cùng vào cột signature cũ
          signature: isFullySigned ? signature : (request.signature ?? null),
          signed_by: address,
          signed_at: new Date().toISOString(),
          // Đủ 3 nhóm → signed, chưa đủ → signing
          status: isFullySigned ? MINT_REQUEST_STATUS.SIGNED : 'signing',
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      if (isFullySigned) {
        toast.success('🎉 Đã đủ 3 chữ ký GOV! Request sẵn sàng Submit lên blockchain.');
      } else {
        const remaining = 3 - completedGroups.length;
        toast.success(`${GOV_GROUPS[groupKey].emoji} Nhóm ${GOV_GROUPS[groupKey].nameVi} đã ký! Cần thêm ${remaining} nhóm nữa.`);
      }
      return signature;
    } catch (error: unknown) {
      console.error('[usePplpAdmin] signMintRequest error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (msg.includes('User rejected')) {
        toast.error('Bạn đã từ chối ký');
      } else {
        toast.error(`Lỗi ký: ${msg}`);
      }
      return null;
    }
  }, [isConnected, address, signTypedDataAsync, ensureBscTestnet]);

  // Batch sign multiple requests
  const batchSignMintRequests = useCallback(async (requests: MintRequest[]): Promise<number> => {
    let successCount = 0;

    for (const request of requests) {
      const signature = await signMintRequest(request);
      if (signature) successCount++;
    }

    if (successCount > 0) {
      toast.success(`Đã ký ${successCount}/${requests.length} requests`);
    }

    return successCount;
  }, [signMintRequest]);

  // Confirm a submitted transaction
  const confirmTransaction = useCallback(async (request: MintRequest): Promise<boolean> => {
    if (!request.tx_hash) return false;

    try {
      const { error } = await supabase
        .from('pplp_mint_requests')
        .update({
          status: MINT_REQUEST_STATUS.CONFIRMED,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (error) throw error;

      if (request.action_ids && request.action_ids.length > 0) {
        await supabase
          .from('light_actions')
          .update({
            mint_status: 'minted',
            minted_at: new Date().toISOString(),
          })
          .in('id', request.action_ids);
      }

      return true;
    } catch (error) {
      console.error('[usePplpAdmin] confirmTransaction error:', error);
      return false;
    }
  }, []);

  // Submit a signed request to blockchain — dùng đủ 3 chữ ký multisig GOV
  const submitToChain = useCallback(async (request: MintRequest): Promise<string | null> => {
    if (!isConnected || !address) {
      toast.error('Vui lòng kết nối ví trước');
      return null;
    }

    // Kiểm tra đủ 3 nhóm đã ký chưa
    const multisig = request.multisig_signatures ?? {};
    const completedGroups = Object.keys(multisig) as GovGroupKey[];
    const isMultisigReady = completedGroups.length === 3 && 
      completedGroups.includes('will') && 
      completedGroups.includes('wisdom') && 
      completedGroups.includes('love');

    // Fallback: nếu không có multisig nhưng có signature đơn (backward compat)
    if (!isMultisigReady && !request.signature) {
      toast.error('Request chưa đủ 3 chữ ký GOV (WILL + WISDOM + LOVE)');
      return null;
    }

    const isCorrectChain = await ensureBscTestnet();
    if (!isCorrectChain) return null;

    try {
      logger.debug('[usePplpAdmin] Submitting to chain:', request.id);

      if (!request.action_name) {
        toast.error('Request thiếu action_name');
        return null;
      }

      // Kiểm tra nonce on-chain trước khi submit để tránh lỗi SIGS_LOW
      if (publicClient) {
        try {
          const onChainNonce = await publicClient.readContract({
            address: FUN_MONEY_CONTRACT.address,
            abi: FUN_MONEY_ABI,
            functionName: 'nonces',
            args: [request.recipient_address as `0x${string}`],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any) as bigint;

          const dbNonce = BigInt(request.nonce);
          if (onChainNonce !== dbNonce) {
            console.error(`[usePplpAdmin] Nonce mismatch! On-chain: ${onChainNonce}, DB: ${dbNonce}`);
            toast.error(
              `Nonce không khớp! On-chain: ${onChainNonce}, DB: ${dbNonce}. Cần tạo lại request với nonce đúng.`,
              { duration: 8000 }
            );
            return null;
          }
          logger.debug(`[usePplpAdmin] Nonce verified: ${onChainNonce}`);
        } catch (nonceErr) {
          console.warn('[usePplpAdmin] Could not verify nonce, proceeding anyway:', nonceErr);
        }
      }

      // Lấy 3 chữ ký theo thứ tự will → wisdom → love
      let orderedSigs: `0x${string}`[];
      if (isMultisigReady) {
        orderedSigs = (['will', 'wisdom', 'love'] as GovGroupKey[])
          .map(group => multisig[group]?.signature)
          .filter(Boolean) as `0x${string}`[];
        logger.debug(`[usePplpAdmin] Multisig: ${orderedSigs.length} signatures [WILL, WISDOM, LOVE]`);
      } else {
        // Backward compat: dùng 1 chữ ký cũ
        orderedSigs = [request.signature as `0x${string}`];
        logger.debug('[usePplpAdmin] Fallback: using single legacy signature');
      }

      const txHash = await writeContractAsync({
        address: FUN_MONEY_CONTRACT.address,
        abi: FUN_MONEY_ABI,
        functionName: 'lockWithPPLP',
        args: [
          request.recipient_address as `0x${string}`,
          request.action_name,
          BigInt(request.amount_wei),
          request.evidence_hash as `0x${string}`,
          orderedSigs,
        ],
      } as any);

      logger.debug('[usePplpAdmin] Transaction hash:', txHash);

      const { error: updateError } = await supabase
        .from('pplp_mint_requests')
        .update({
          tx_hash: txHash,
          submitted_at: new Date().toISOString(),
          status: MINT_REQUEST_STATUS.SUBMITTED,
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      if (request.action_ids && request.action_ids.length > 0) {
        await supabase
          .from('light_actions')
          .update({ tx_hash: txHash, mint_status: 'submitted' })
          .in('id', request.action_ids);
      }

      toast.success(`Transaction đã gửi! Đang chờ xác nhận on-chain...`);

      // B7: Auto-confirm - poll for transaction receipt
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ 
            hash: txHash, confirmations: 2, timeout: 120_000,
          });

          if (receipt.status === 'success') {
            await confirmTransaction({ ...request, tx_hash: txHash });
            toast.success(`✅ TX xác nhận on-chain! Block #${receipt.blockNumber}`);
          } else {
            await supabase.from('pplp_mint_requests').update({
              status: MINT_REQUEST_STATUS.FAILED,
              error_message: 'Transaction reverted on-chain',
              retry_count: (request.retry_count || 0) + 1,
            }).eq('id', request.id);
            toast.error('Transaction bị revert on-chain');
          }
        } catch (receiptError: unknown) {
          console.warn('[usePplpAdmin] Auto-confirm polling failed:', receiptError instanceof Error ? receiptError.message : receiptError);
          toast.info('TX đã gửi nhưng chưa xác nhận tự động. Kiểm tra BSCScan.');
        }
      }

      return txHash;
    } catch (error: unknown) {
      console.error('[usePplpAdmin] submitToChain error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      const shortMsg = (error as { shortMessage?: string })?.shortMessage;

      await supabase.from('pplp_mint_requests').update({
        status: MINT_REQUEST_STATUS.FAILED,
        error_message: msg,
        retry_count: (request.retry_count || 0) + 1,
      }).eq('id', request.id);

      if (msg.includes('User rejected')) {
        toast.error('Bé đã từ chối giao dịch');
      } else if (msg.includes('insufficient funds')) {
        toast.error('Ví không đủ BNB để trả gas');
      } else {
        toast.error(`Lỗi gửi transaction: ${shortMsg || msg}`);
      }
      return null;
    }
  }, [isConnected, address, writeContractAsync, ensureBscTestnet, publicClient, confirmTransaction]);

  // Reset a failed request back to pending
  const resetToPending = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('pplp_mint_requests')
        .update({
          status: MINT_REQUEST_STATUS.PENDING_SIG,
          signature: null,
          signed_at: null,
          signed_by: null,
          tx_hash: null,
          submitted_at: null,
          error_message: null,
          multisig_signatures: {} as unknown as import('@/integrations/supabase/types').Json,
          multisig_completed_groups: [],
        })
        .eq('id', requestId);

      if (error) throw error;

      toast.success('Đã reset request về trạng thái chờ ký');
      return true;
    } catch (error) {
      console.error('[usePplpAdmin] resetToPending error:', error);
      toast.error('Không thể reset request');
      return false;
    }
  }, []);

  // Fetch action details for a mint request
  const fetchActionDetails = useCallback(async (actionIds: string[]): Promise<ActionBreakdown[]> => {
    if (!actionIds || actionIds.length === 0) return [];

    try {
      const { data: actions, error } = await supabase
        .from('light_actions')
        .select('id, action_type, content_preview, mint_amount, created_at, reference_id')
        .in('id', actionIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by action_type
      const breakdown: Record<string, ActionBreakdown> = {};
      
      for (const action of actions || []) {
        const type = action.action_type;
        if (!breakdown[type]) {
          breakdown[type] = {
            action_type: type,
            count: 0,
            total_amount: 0,
            items: [],
          };
        }
        breakdown[type].count++;
        breakdown[type].total_amount += action.mint_amount || 0;
        breakdown[type].items.push({
          id: action.id,
          action_type: action.action_type,
          content_preview: action.content_preview,
          mint_amount: action.mint_amount,
          created_at: action.created_at,
          reference_id: action.reference_id,
        });
      }

      return Object.values(breakdown);
    } catch (error) {
      console.error('[usePplpAdmin] fetchActionDetails error:', error);
      return [];
    }
  }, []);

  // Reject a mint request
  const rejectRequest = useCallback(async (requestId: string, reason: string): Promise<boolean> => {
    try {
      // Get the request first to get action_ids
      const { data: request } = await supabase
        .from('pplp_mint_requests')
        .select('action_ids')
        .eq('id', requestId)
        .single();

      // Update request status to rejected
      const { error } = await supabase
        .from('pplp_mint_requests')
        .update({
          status: 'rejected',
          error_message: reason,
        })
        .eq('id', requestId);

      if (error) throw error;

      // Reset light_actions back to approved so user can try again (or mark as rejected if spam)
      if (request?.action_ids && request.action_ids.length > 0) {
        await supabase
          .from('light_actions')
          .update({
            mint_status: 'rejected',
            mint_request_id: null,
          })
          .in('id', request.action_ids);
      }

      toast.success('Đã từ chối mint request');
      return true;
    } catch (error) {
      console.error('[usePplpAdmin] rejectRequest error:', error);
      toast.error('Không thể từ chối request');
      return false;
    }
  }, []);

  // Delete a mint request
  const deleteRequest = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      // Get the request first to get action_ids
      const { data: request } = await supabase
        .from('pplp_mint_requests')
        .select('action_ids')
        .eq('id', requestId)
        .single();

      // Reset light_actions first
      if (request?.action_ids && request.action_ids.length > 0) {
        await supabase
          .from('light_actions')
          .update({
            mint_status: 'approved',
            mint_request_id: null,
          })
          .in('id', request.action_ids);
      }

      // Delete the request
      const { error } = await supabase
        .from('pplp_mint_requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;

      toast.success('Đã xóa mint request');
      return true;
    } catch (error) {
      console.error('[usePplpAdmin] deleteRequest error:', error);
      toast.error('Không thể xóa request');
      return false;
    }
  }, []);

  // B8: Batch submit multiple signed requests to chain (SEQUENTIAL with delay)
  const batchSubmitToChain = useCallback(async (
    requests: MintRequest[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<number> => {
    let successCount = 0;

    for (let i = 0; i < requests.length; i++) {
      onProgress?.(i, requests.length);
      const txHash = await submitToChain(requests[i]);
      if (txHash) successCount++;

      // Wait 3 seconds between transactions to avoid nonce race conditions
      if (i < requests.length - 1) {
        logger.debug(`[usePplpAdmin] Waiting 3s before next TX (${i + 1}/${requests.length})...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    onProgress?.(requests.length, requests.length);

    if (successCount > 0) {
      toast.success(`Đã submit ${successCount}/${requests.length} transactions`);
    }

    return successCount;
  }, [submitToChain]);

  // Reconcile failed requests by checking on-chain status
  const reconcileFailedRequests = useCallback(async (
    onProgress?: (current: number, total: number, reconciled: number) => void,
  ): Promise<{ reconciled: number; genuinelyFailed: number; noReceipt: number }> => {
    const result = { reconciled: 0, genuinelyFailed: 0, noReceipt: 0 };

    try {
      // Fetch all failed requests that have a tx_hash
      const { data: failedRequests, error } = await supabase
        .from('pplp_mint_requests')
        .select('*')
        .eq('status', MINT_REQUEST_STATUS.FAILED)
        .not('tx_hash', 'is', null);

      if (error) throw error;
      if (!failedRequests || failedRequests.length === 0) {
        toast.info('Không có request thất bại nào có tx_hash để kiểm tra');
        return result;
      }

      toast.info(`Đang kiểm tra ${failedRequests.length} failed requests on-chain...`);

      for (let i = 0; i < failedRequests.length; i++) {
        const req = failedRequests[i];
        onProgress?.(i + 1, failedRequests.length, result.reconciled);

        if (!req.tx_hash || !publicClient) {
          result.noReceipt++;
          continue;
        }

        try {
          const receipt = await publicClient.getTransactionReceipt({
            hash: req.tx_hash as `0x${string}`,
          });

          if (receipt.status === 'success') {
            // TX actually succeeded on-chain! Fix DB
            await supabase
              .from('pplp_mint_requests')
              .update({
                status: MINT_REQUEST_STATUS.CONFIRMED,
                confirmed_at: new Date().toISOString(),
                block_number: Number(receipt.blockNumber),
                error_message: null,
              })
              .eq('id', req.id);

            // Update light_actions to minted
            if (req.action_ids && req.action_ids.length > 0) {
              await supabase
                .from('light_actions')
                .update({
                  mint_status: 'minted',
                  minted_at: new Date().toISOString(),
                })
                .in('id', req.action_ids);
            }

            result.reconciled++;
            logger.debug(`[Reconcile] ✅ Request ${req.id} was actually successful! Block #${receipt.blockNumber}`);
          } else {
            // Genuinely reverted
            result.genuinelyFailed++;
            logger.debug(`[Reconcile] ❌ Request ${req.id} genuinely reverted on-chain`);
          }
        } catch (receiptError: unknown) {
          // No receipt found (TX may not exist or was dropped)
          result.noReceipt++;
          logger.debug(`[Reconcile] ⚠️ No receipt for ${req.id}: ${receiptError instanceof Error ? receiptError.message : receiptError}`);
        }
      }

      if (result.reconciled > 0) {
        toast.success(`✅ Đã khôi phục ${result.reconciled} requests thành công on-chain!`);
      } else {
        toast.info('Không có request nào cần khôi phục');
      }

      return result;
    } catch (error: unknown) {
      console.error('[usePplpAdmin] reconcileFailedRequests error:', error);
      toast.error(`Lỗi reconcile: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }, [publicClient]);

  // Batch create mint requests — chạy lặp theo lô đến khi hết pending
  const batchCreateMintRequests = useCallback(async (): Promise<{ created: number; merged: number; skipped_no_wallet: number; skipped_active_request: number; rejected_cleaned: number; batches: number } | null> => {
    setIsBatchCreating(true);
    const totals = { created: 0, merged: 0, skipped_no_wallet: 0, skipped_active_request: 0, rejected_cleaned: 0, batches: 0 };
    const MAX_BATCHES = 30; // an toàn: 30 × 100 = 3000 allocations/lần bấm
    const BATCH_SIZE = 100;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Vui lòng đăng nhập lại');
        return null;
      }

      const toastId = toast.loading('Bắt đầu tạo mint requests theo lô...');

      for (let i = 0; i < MAX_BATCHES; i++) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-batch-mint-requests`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              batch_size: BATCH_SIZE,
              cleanup_rejected: i === 0, // chỉ cleanup ở lô đầu
            }),
          }
        );

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Failed to batch create');
        }

        const s = result.summary || {};
        totals.created += s.created || 0;
        totals.merged += s.merged || 0;
        totals.skipped_no_wallet += s.skipped_no_wallet || 0;
        totals.skipped_active_request += s.skipped_active_request || 0;
        if (i === 0) totals.rejected_cleaned = s.rejected_cleaned || 0;
        totals.batches += 1;

        toast.loading(
          `Lô ${i + 1}: tạo ${totals.created}, gộp ${totals.merged} | còn ~${s.remaining ?? 0} pending`,
          { id: toastId }
        );

        if (result.done || (s.batch_processed || 0) === 0) {
          const processed = totals.created + totals.merged;
          const message = processed > 0
            ? `✅ Đã xử lý ${processed} allocations qua ${totals.batches} lô: tạo ${totals.created}, gộp ${totals.merged}. ${totals.skipped_no_wallet} thiếu ví, ${totals.skipped_active_request} đang có request đã ký/chờ submit.`
            : `Không còn allocation có thể tạo ngay. ${totals.skipped_no_wallet} thiếu ví, ${totals.skipped_active_request} đang có request đã ký/chờ submit.`;
          const toastFn = processed > 0 ? toast.success : toast.warning;
          toastFn(message, { id: toastId, duration: 8000 });
          break;
        }

        if ((s.actionable_processed || 0) === 0) {
          toast.loading(
            `Lô ${i + 1}: chưa gặp user có thể xử lý, đang quét tiếp...`,
            { id: toastId }
          );
        }

        // nghỉ ngắn giữa các lô để tránh quá tải
        await new Promise(r => setTimeout(r, 800));

        if (i === MAX_BATCHES - 1) {
          toast.warning(
            `Đã xử lý ${totals.batches} lô. Vẫn còn pending — bấm lại để tiếp tục.`,
            { id: toastId, duration: 6000 }
          );
        }
      }

      return totals;
    } catch (error: unknown) {
      console.error('[usePplpAdmin] batchCreateMintRequests error:', error);
      toast.error(`Lỗi: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return totals.batches > 0 ? totals : null;
    } finally {
      setIsBatchCreating(false);
    }
  }, []);

  // Merge multiple pending_sig requests per user into one
  const mergeMintRequests = useCallback(async (): Promise<{ merged_users: number; old_requests_removed: number; new_requests_created: number } | null> => {
    setIsMergingRequests(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Vui lòng đăng nhập lại');
        return null;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-merge-mint-requests`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to merge requests');
      }

      if ((result.summary?.merged_users ?? 0) > 0) {
        toast.success(result.message, { duration: 6000 });
      } else {
        toast.info(result.message, { duration: 8000 });
      }
      return result.summary;
    } catch (error: unknown) {
      console.error('[usePplpAdmin] mergeMintRequests error:', error);
      toast.error(`Lỗi: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setIsMergingRequests(false);
    }
  }, []);

  return {
    // State
    isLoading,
    mintRequests,
    stats,
    isConnected,
    address,
    isWritePending,
    isConfirming,
    chainId,
    isSwitching,
    ecosystemStats,
    isLoadingEcosystem,
    isBatchCreating,
    isMergingRequests,
    
    // Actions
    fetchMintRequests,
    fetchEcosystemStats,
    signMintRequest,
    batchSignMintRequests,
    submitToChain,
    batchSubmitToChain,
    confirmTransaction,
    resetToPending,
    fetchActionDetails,
    rejectRequest,
    deleteRequest,
    ensureBscTestnet,
    batchCreateMintRequests,
    reconcileFailedRequests,
    mergeMintRequests,
  };
};
