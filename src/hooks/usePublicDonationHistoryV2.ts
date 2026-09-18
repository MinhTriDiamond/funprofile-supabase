/**
 * usePublicDonationHistoryV2 — Batch 2.3.1
 *
 * Wrapper trên SSOT (`useUnifiedTransactionHistory` scope=profile + `useUnifiedTransactionSummary`)
 * ánh xạ về shape `DonationRecord` để thay `usePublicDonationHistory` mà KHÔNG break consumer.
 *
 * KHÔNG cutover trong batch này — file mới, chưa ai import. Cutover có cờ
 * `app_settings.unified_public_history_ready` sẽ làm ở batch riêng sau 48h shadow probe.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useUnifiedTransactionHistory,
  useUnifiedTransactionSummary,
} from '@/hooks/useUnifiedTransactionHistory';
import type { UnifiedFilters } from '@/components/transactions/types';
import { unifiedRowToDonationRecord } from '@/hooks/adapters/unifiedToDonation';
import { getGiftTokenLabel } from '@/lib/giftTokenLabel';
import type {
  DonationFilter,
  DonationRecord,
  DonationSummary,
} from '@/hooks/usePublicDonationHistory';

function filterToUnified(f: DonationFilter): Partial<UnifiedFilters> {
  switch (f) {
    case 'sent': return { direction: 'out' };
    case 'received': return { direction: 'in' };
    case 'swap': return { type: 'swap' };
    case 'transfer': return { type: 'transfer' };
    default: return {};
  }
}

function computeSummary(records: DonationRecord[], targetUserId?: string): DonationSummary {
  const received: DonationSummary['received'] = {};
  const sent: DonationSummary['sent'] = {};
  let receivedCount = 0;
  let sentCount = 0;
  for (const d of records) {
    if (d.type === 'swap') {
      const fromSym = getGiftTokenLabel(d.from_symbol || d.token_symbol, d.chain_id);
      const toSym = getGiftTokenLabel(d.to_symbol || d.token_symbol, d.chain_id);
      if (fromSym) {
        sent[fromSym] ??= { amount: 0, count: 0 };
        sent[fromSym].amount += Number(d.from_amount || d.amount) || 0;
        sent[fromSym].count += 1;
        sentCount++;
      }
      if (toSym && d.to_amount != null) {
        received[toSym] ??= { amount: 0, count: 0 };
        received[toSym].amount += Number(d.to_amount) || 0;
        received[toSym].count += 1;
        receivedCount++;
      }
    } else if (d.type === 'transfer') {
      const sym = getGiftTokenLabel(d.token_symbol, d.chain_id);
      const bucket = d.direction === 'in' ? received : sent;
      bucket[sym] ??= { amount: 0, count: 0 };
      bucket[sym].amount += Number(d.amount) || 0;
      bucket[sym].count += 1;
      if (d.direction === 'in') receivedCount++; else sentCount++;
    } else {
      const sym = getGiftTokenLabel(d.token_symbol, d.chain_id);
      const amt = Number(d.amount) || 0;
      const isSent = targetUserId ? d.sender_id === targetUserId : d.direction === 'out';
      const bucket = isSent ? sent : received;
      bucket[sym] ??= { amount: 0, count: 0 };
      bucket[sym].amount += amt;
      bucket[sym].count += 1;
      if (isSent) sentCount++; else receivedCount++;
    }
  }
  return { received, sent, receivedCount, sentCount, totalCount: receivedCount + sentCount };
}

export function usePublicDonationHistoryV2(
  userId: string | undefined,
  _userCreatedAt?: string | null,
) {
  const [filter, setFilter] = useState<DonationFilter>('all');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  const filters = useMemo<UnifiedFilters>(() => ({
    ...filterToUnified(filter),
    dateFrom: dateFrom ?? undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
  }), [filter, dateFrom, dateTo]);

  const list = useUnifiedTransactionHistory({
    scope: 'profile',
    targetUserId: userId ?? null,
    filters,
    pageSize: 200,
    enabled: !!userId,
  });

  const summaryQ = useUnifiedTransactionSummary({
    scope: 'profile',
    targetUserId: userId ?? null,
    filters,
    enabled: !!userId,
  });

  const donations = useMemo<DonationRecord[]>(
    () => list.rows.map((r) => unifiedRowToDonationRecord(r, { targetUserId: userId ?? null })),
    [list.rows, userId],
  );

  // Nếu có date filter → tính summary client-side (legacy parity); nếu không, pivot từ RPC summary.
  const summary = useMemo<DonationSummary>(() => {
    if (dateFrom || dateTo) return computeSummary(donations, userId);
    const totals = summaryQ.data?.totals;
    const byToken = summaryQ.data?.byToken ?? [];
    const received: DonationSummary['received'] = {};
    const sent: DonationSummary['sent'] = {};
    for (const t of byToken) {
      if (t.in.count) received[t.token_symbol] = { amount: t.in.sum, count: t.in.count };
      if (t.out.count) sent[t.token_symbol] = { amount: t.out.sum, count: t.out.count };
    }
    return {
      received, sent,
      receivedCount: Number(totals?.count_in ?? 0),
      sentCount: Number(totals?.count_out ?? 0),
      totalCount: Number(totals?.count_total ?? 0),
    };
  }, [summaryQ.data, donations, dateFrom, dateTo, userId]);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter, dateFrom, dateTo, userId]);

  const fetchDonations = useCallback((pageNum = 1) => {
    if (pageNum > page) list.loadMore();
    setPage(pageNum);
  }, [list, page]);

  const refetch = useCallback(() => {
    void list.refetch();
    void summaryQ.refetch();
  }, [list, summaryQ]);

  return {
    donations,
    loading: list.isLoading || list.isFetchingNextPage,
    error: (list.error?.message ?? null) as string | null,
    filter,
    setFilter,
    page,
    hasMore: list.hasNextPage,
    summary,
    summaryLoading: summaryQ.isLoading,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    fetchDonations,
    fetchSummary: () => summaryQ.refetch().then(() => undefined),
    refetch,
  };
}

export type { DonationRecord, DonationSummary, DonationFilter };
