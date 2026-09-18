/**
 * usePublicDonationHistoryAuto — Batch 2.3.1 router hook.
 *
 * Gate bằng `app_settings.unified_public_history_ready`:
 *  - ON  → V2 (SSOT get_unified_transactions/summary + adapter)
 *  - OFF → V1 legacy (3-source direct read)
 *
 * Cả 2 hook đều được gọi (rule-of-hooks) nhưng chỉ 1 kết quả được return; V2
 * dùng react-query auto fetch, V1 chỉ fetch khi consumer chủ động gọi
 * `changeFilter/changeDateRange/fetchDonations` — vì vậy overhead OFF-branch
 * là ~1 lightweight RPC.
 */
import { useCallback, useMemo } from 'react';
import { usePublicDonationHistory } from '@/hooks/usePublicDonationHistory';
import { usePublicDonationHistoryV2 } from '@/hooks/usePublicDonationHistoryV2';
import { useUnifiedPublicHistoryReady } from '@/hooks/useUnifiedPublicHistoryReady';
import type { DonationFilter } from '@/hooks/usePublicDonationHistory';

type V1Return = ReturnType<typeof usePublicDonationHistory>;

function useV2Compat(userId: string | undefined, userCreatedAt?: string | null): V1Return {
  const v2 = usePublicDonationHistoryV2(userId, userCreatedAt);

  const changeFilter = useCallback((f: DonationFilter) => {
    v2.setFilter(f);
  }, [v2]);

  const changeDateRange = useCallback((from: string | null, to: string | null) => {
    v2.setDateFrom(from);
    v2.setDateTo(to);
  }, [v2]);

  const loadMore = useCallback(() => {
    v2.fetchDonations(v2.page + 1);
  }, [v2]);

  const fetchDonationsCompat = useCallback(
    (pageNum = 1, currentFilter?: DonationFilter, fromDate?: string | null, toDate?: string | null) => {
      if (currentFilter !== undefined) v2.setFilter(currentFilter);
      if (fromDate !== undefined) v2.setDateFrom(fromDate);
      if (toDate !== undefined) v2.setDateTo(toDate);
      v2.fetchDonations(pageNum);
    },
    [v2],
  );

  const fetchSummaryCompat = useCallback(
    async (_fromDate?: string | null, _toDate?: string | null) => {
      await v2.fetchSummary();
    },
    [v2],
  );

  return useMemo(() => ({
    donations: v2.donations,
    loading: v2.loading,
    error: v2.error,
    filter: v2.filter,
    hasMore: v2.hasMore,
    summary: v2.summary,
    summaryLoading: v2.summaryLoading,
    dateFrom: v2.dateFrom,
    dateTo: v2.dateTo,
    changeFilter,
    changeDateRange,
    fetchDonations: fetchDonationsCompat,
    fetchSummary: fetchSummaryCompat,
    loadMore,
  }) as V1Return, [v2, changeFilter, changeDateRange, fetchDonationsCompat, fetchSummaryCompat, loadMore]);
}

export function usePublicDonationHistoryAuto(
  userId: string | undefined,
  userCreatedAt?: string | null,
): V1Return {
  const { enabled } = useUnifiedPublicHistoryReady();
  const v1 = usePublicDonationHistory(userId, userCreatedAt);
  const v2 = useV2Compat(userId, userCreatedAt);
  return enabled ? v2 : v1;
}
