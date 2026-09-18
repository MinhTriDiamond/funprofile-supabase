import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getTodayVN, vnDateToUtcRange } from '@/lib/vnTimezone';
import { CASCADE_CONFIG } from '@/config/cascade-constants';

export interface EpochAllocation {
  id: string;
  epoch_id: string;
  light_score_total: number;
  share_percent: number;
  allocation_amount: number;
  allocation_amount_capped: number;
  is_eligible: boolean;
  reason_codes: string[];
  status: string;
  mint_request_id: string | null;
  created_at: string;
  // Joined from pplp_mint_requests for accurate UI status
  mint_request_status?: string | null;
  mint_tx_hash?: string | null;
  mint_confirmed_at?: string | null;
  mint_completed_groups?: string[] | null;
}

export interface EpochInfo {
  id: string;
  epoch_month: string;
  mint_pool: number;
  total_light_score: number;
  eligible_users: number;
  status: string; // open / snapshot / finalized
  snapshot_at: string | null;
  rules_version: string;
}

export interface CurrentMonthLight {
  total_light_score: number;
  actions_count: number;
  epoch_month: string;
}

export interface EpochWithAllocation {
  epoch: EpochInfo;
  allocation: EpochAllocation | null;
}

export interface EpochAllocationResult {
  // Current month accumulation (live)
  currentMonth: CurrentMonthLight;
  // Latest epoch with snapshot (claimable) — backward compat
  latestEpoch: EpochInfo | null;
  allocation: EpochAllocation | null;
  // All snapshot/finalized epochs
  allEpochs: EpochWithAllocation[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  claim: (allocationId: string) => Promise<ClaimResult>;
  isClaiming: boolean;
  /** Block thông tin lần claim gần nhất (nếu có), để UI hiển thị MintBlockedAlert */
  lastBlock: ClaimBlock | null;
  clearBlock: () => void;
}

export type MintBlockReason =
  | 'PENDING_REQUEST'
  | 'SOFT_CEILING'
  | 'NO_PUBLIC_WALLET'
  | 'GENERIC';

export interface ClaimBlock {
  reason: MintBlockReason;
  message: string;
  existingRequestId?: string;
  rawAmount?: number;
  cappedAmount?: number;
  softCeiling?: number;
}

export interface ClaimResult {
  success: boolean;
  requestId?: string;
  block?: ClaimBlock;
}

export const useEpochAllocation = (): EpochAllocationResult => {
  const [currentMonth, setCurrentMonth] = useState<CurrentMonthLight>({
    total_light_score: 0,
    actions_count: 0,
    epoch_month: getTodayVN().slice(0, 7),
  });
  const [latestEpoch, setLatestEpoch] = useState<EpochInfo | null>(null);
  const [allocation, setAllocation] = useState<EpochAllocation | null>(null);
  const [allEpochs, setAllEpochs] = useState<EpochWithAllocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [lastBlock, setLastBlock] = useState<ClaimBlock | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const clearBlock = useCallback(() => setLastBlock(null), []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setCurrentMonth({ total_light_score: 0, actions_count: 0, epoch_month: getTodayVN().slice(0, 7) });
        setLatestEpoch(null);
        setAllocation(null);
        return;
      }

      const userId = session.user.id;
      // Use VN timezone for epoch month calculation
      const todayVN = getTodayVN(); // YYYY-MM-DD in VN time
      const epochMonth = todayVN.slice(0, 7); // YYYY-MM
      const monthStartVN = `${epochMonth}-01`;
      const { start: monthStart } = vnDateToUtcRange(monthStartVN);
      // Calculate first day of next month in VN
      const [y, m] = epochMonth.split('-').map(Number);
      const nextMonthVN = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const { start: nextMonth } = vnDateToUtcRange(nextMonthVN);

      // 1. Current month light score accumulation
      const { data: monthActions, error: monthErr } = await supabase
        .from('light_actions')
        .select('light_score')
        .eq('user_id', userId)
        .eq('is_eligible', true)
        .gte('created_at', monthStart)
        .lt('created_at', nextMonth);

      if (monthErr) throw monthErr;

      const totalLight = (monthActions || []).reduce((sum, a) => sum + (a.light_score || 0), 0);
      setCurrentMonth({
        total_light_score: Math.round(totalLight * 100) / 100,
        actions_count: monthActions?.length || 0,
        epoch_month: epochMonth,
      });

      // 2. Find all epochs with snapshot/finalized status.
      // GATE: chỉ hiển thị epoch đã kết thúc trọn chu kỳ (snapshot/finalized
      // sau ngày đầu tháng kế tiếp). Tránh hiển thị nhầm epoch đang diễn ra.
      const { data: epochsRaw, error: epochErr } = await supabase
        .from('mint_epochs')
        .select('id, epoch_month, epoch_date, mint_pool, total_light_score, eligible_users, status, snapshot_at, rules_version')
        .in('status', ['snapshot', 'finalized'])
        .order('epoch_month', { ascending: false })
        .limit(10);

      if (epochErr) throw epochErr;

      const nowMs = Date.now();
      const epochs = (epochsRaw || []).filter((e) => {
        if (!e.epoch_date) return false;
        const [y, m] = String(e.epoch_date).slice(0, 7).split('-').map(Number);
        const nextMonthStart = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).getTime();
        return nowMs >= nextMonthStart;
      });

      if (epochs && epochs.length > 0) {
        let selectedEpoch = null;
        let selectedAlloc = null;
        const epochsWithAllocs: EpochWithAllocation[] = [];

        const { data: activeMintReq } = await supabase
          .from('pplp_mint_requests')
          .select('id, status')
          .eq('user_id', userId)
          .in('status', ['pending_sig', 'signing', 'signed', 'submitted'])
          .maybeSingle();

        for (const ep of epochs) {
          const { data: alloc, error: allocErr } = await supabase
            .from('mint_allocations')
            .select('*')
            .eq('epoch_id', ep.id)
            .eq('user_id', userId)
            .maybeSingle();

          if (allocErr) throw allocErr;

          const epochInfo: EpochInfo = {
            id: ep.id,
            epoch_month: ep.epoch_month || '',
            mint_pool: ep.mint_pool || 0,
            total_light_score: ep.total_light_score || 0,
            eligible_users: ep.eligible_users || 0,
            status: ep.status || 'open',
            snapshot_at: ep.snapshot_at || null,
            rules_version: ep.rules_version || 'LS-Math-v1.0',
          };

          let finalAlloc: EpochAllocation | null = alloc as EpochAllocation | null;

          // Enrich allocation with real mint_request status (fix: badge "chờ Admin ký" hiển thị sai)
          if (finalAlloc?.mint_request_id) {
            const { data: req } = await supabase
              .from('pplp_mint_requests')
              .select('status, tx_hash, confirmed_at, multisig_completed_groups')
              .eq('id', finalAlloc.mint_request_id)
              .maybeSingle();
            if (req) {
              finalAlloc = {
                ...finalAlloc,
                mint_request_status: req.status,
                mint_tx_hash: req.tx_hash,
                mint_confirmed_at: req.confirmed_at,
                mint_completed_groups: req.multisig_completed_groups,
              };
            }
          }

          if (finalAlloc && finalAlloc.status === 'pending' && finalAlloc.is_eligible && finalAlloc.allocation_amount_capped > 0) {
            if (activeMintReq) {
              finalAlloc = { ...finalAlloc, status: 'claimed', mint_request_id: activeMintReq.id, mint_request_status: activeMintReq.status };
            }
            if (!selectedEpoch) {
              selectedEpoch = epochInfo;
              selectedAlloc = finalAlloc;
            }
          }

          epochsWithAllocs.push({ epoch: epochInfo, allocation: finalAlloc });

          if (!selectedEpoch) {
            selectedEpoch = epochInfo;
            selectedAlloc = finalAlloc;
          }
        }

        setAllEpochs(epochsWithAllocs);

        if (selectedEpoch) {
          setLatestEpoch(selectedEpoch);
          setAllocation(selectedAlloc);
        } else {
          setLatestEpoch(null);
          setAllocation(null);
        }
      } else {
        setAllEpochs([]);
        setLatestEpoch(null);
        setAllocation(null);
      }
    } catch (err) {
      console.error('[useEpochAllocation] Error:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      await fetchData();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !isMounted) return;

      // Subscribe to allocation changes
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      const channel = supabase
        .channel(`epoch-alloc-${session.user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'mint_allocations',
          filter: `user_id=eq.${session.user.id}`,
        }, () => {
          if (isMounted) fetchData();
        })
        .subscribe();

      channelRef.current = channel;
    };

    setup();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchData]);

  const claim = useCallback(async (allocationId: string): Promise<ClaimResult> => {
    setIsClaiming(true);
    setLastBlock(null);
    try {
      const { data, error: claimErr } = await supabase.functions.invoke('pplp-mint-fun', {
        body: { allocation_id: allocationId },
      });

      // Edge function trả status 4xx → claimErr là FunctionsHttpError
      // Body chi tiết nằm trong claimErr.context.json() hoặc data tuỳ phiên bản
      let payload: any = data;
      if (claimErr && (claimErr as any).context) {
        try {
          payload = await (claimErr as any).context.json();
        } catch {
          /* ignore */
        }
      }

      if (claimErr || !payload?.success) {
        const errMsg: string = payload?.error || (claimErr instanceof Error ? claimErr.message : 'Claim failed');
        const errCode: string | undefined = payload?.error_code;

        let block: ClaimBlock;
        if (payload?.existing_request_id || /lệnh đang chờ ký/i.test(errMsg)) {
          block = {
            reason: 'PENDING_REQUEST',
            message: errMsg,
            existingRequestId: payload?.existing_request_id,
          };
        } else if (errCode === 'NO_PUBLIC_WALLET' || /ví công khai/i.test(errMsg)) {
          block = { reason: 'NO_PUBLIC_WALLET', message: errMsg };
        } else {
          block = { reason: 'GENERIC', message: errMsg };
        }

        setLastBlock(block);
        toast.error(block.reason === 'PENDING_REQUEST' ? 'Đang có lệnh chờ ký' : errMsg, {
          description: block.reason === 'PENDING_REQUEST'
            ? 'Vui lòng chờ nhóm GOV ký xong trước khi tạo lệnh mới.'
            : undefined,
        });
        return { success: false, block };
      }

      // Sau khi claim thành công, kiểm tra allocation có bị cắt bởi soft ceiling
      // (rawAmount > cappedAmount). Nếu có → set block info-only để UI show banner.
      const claimed = allocation;
      // Chỉ show banner nếu bị cắt > 1 FUN (bỏ qua sai số làm tròn sub-FUN)
      if (
        claimed &&
        claimed.allocation_amount - claimed.allocation_amount_capped > 1 &&
        claimed.id === allocationId
      ) {
        setLastBlock({
          reason: 'SOFT_CEILING',
          message: 'Allocation bị cắt theo SoftCeiling tháng',
          rawAmount: claimed.allocation_amount,
          cappedAmount: claimed.allocation_amount_capped,
          softCeiling: CASCADE_CONFIG.softCeiling,
        });
      }

      toast.success(`Đã tạo yêu cầu claim ${payload.mint_request?.amount || ''} FUN!`, {
        description: 'Chờ Admin ký để nhận tokens.',
      });

      await fetchData();
      return { success: true, requestId: payload.mint_request?.id };
    } catch (err: unknown) {
      console.error('[useEpochAllocation] Claim error:', err);
      const message = err instanceof Error ? err.message : 'Không thể claim rewards';
      const block: ClaimBlock = { reason: 'GENERIC', message };
      setLastBlock(block);
      toast.error(message);
      return { success: false, block };
    } finally {
      setIsClaiming(false);
    }
  }, [fetchData, allocation]);

  return {
    currentMonth,
    latestEpoch,
    allocation,
    allEpochs,
    isLoading,
    error,
    refetch: fetchData,
    claim,
    isClaiming,
    lastBlock,
    clearBlock,
  };
};
