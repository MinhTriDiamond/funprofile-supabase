/**
 * useUnifiedTransactionHistory — single source of truth cho mọi UI History.
 *
 * - Đọc RPC `get_unified_transactions` (M4).
 * - Summary đọc RPC aggregate `get_unified_summary` (Phase 7A) — KHÔNG còn
 *   fetch 5000 rows để tính client-side.
 * - Facets đọc RPC `get_unified_facets` (Phase 7C) — options token/chain nhẹ.
 */

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getGiftTokenBaseSymbol, getGiftTokenChainFilter, getGiftTokenLabel } from '@/lib/giftTokenLabel';
import type {
  UnifiedFilters,
  UnifiedTransactionRow,
  UnifiedDetailResult,
  UnifiedCounterparty,
  UnifiedScope,
} from '@/components/transactions/types';
import { DEFAULT_PAGE_SIZE } from '@/components/transactions/types';

interface UseHistoryOpts {
  /** M6 SSOT — scope quyết định dataset. Mặc định 'self' để tương thích callsite cũ. */
  scope?: UnifiedScope;
  targetUserId?: string | null;
  filters?: UnifiedFilters;
  pageSize?: number;
  enabled?: boolean;
}

function normalizeStatus(s?: string) {
  if (!s || s === 'all') return undefined;
  // FE chỉ expose: success | pending | failed.
  if (s === 'confirmed' || s === 'completed') return 'success';
  if (s === 'processing') return 'pending';
  return s;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function sanitizeUuid(v?: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === 'all' || s === 'undefined' || s === 'null') return null;
  return UUID_RE.test(s) ? s : null;
}

function normalizeFilters(f?: UnifiedFilters) {
  const tokenChain = getGiftTokenChainFilter(f?.token);
  return {
    direction: f?.direction && f.direction !== 'all' ? f.direction : undefined,
    status: normalizeStatus(f?.status),
    chain: tokenChain ?? (f?.chain && f.chain !== 'all' ? f.chain : undefined),
    token: f?.token && f.token !== 'all' ? getGiftTokenBaseSymbol(f.token) : undefined,
    type: f?.type && f.type !== 'all' ? f.type : undefined,
    from: f?.dateFrom || undefined,
    to: f?.dateTo || undefined,
    search: f?.search && f.search.trim().length > 0 ? f.search.trim() : undefined,
    externalOnly: f?.externalOnly ? true : undefined,
    counterpartyUserId: sanitizeUuid(f?.counterpartyUserId),
  };
}

export function useUnifiedTransactionHistory(opts: UseHistoryOpts = {}) {
  const { scope = 'self', targetUserId, filters, pageSize = DEFAULT_PAGE_SIZE, enabled = true } = opts;
  const { userId, isLoading: isAuthLoading } = useCurrentUser();
  const n = normalizeFilters(filters);

  const queryKey = [
    'unified-tx',
    'list',
    scope,
    (scope === 'global' || scope === 'admin_all') ? scope : (targetUserId ?? userId ?? 'anon'),
    pageSize,
    n,
  ] as const;

  const query = useInfiniteQuery({
    queryKey,
    enabled: enabled && !isAuthLoading,
    initialPageParam: 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await supabase.rpc('get_unified_transactions', {
        _scope: scope,
        _target_user_id: (scope === 'global' || scope === 'admin_all') ? undefined : (targetUserId ?? undefined),
        _direction: n.direction,
        _status: n.status,
        _chain: n.chain,
        _token_symbol: n.token,
        _tx_type: n.type,
        _from_ts: n.from,
        _to_ts: n.to,
        _search: n.search,
        _limit: pageSize,
        _offset: pageParam as number,
        _external_only: n.externalOnly,
        _counterparty_user_id: n.counterpartyUserId,
      }).abortSignal(signal);
      if (error) throw error;
      const rows = (data || []) as UnifiedTransactionRow[];
      const total = rows[0]?.total_count ?? rows.length;
      return { rows, total, offset: pageParam as number };
    },
    getNextPageParam: (last) => {
      const nextOffset = last.offset + last.rows.length;
      return nextOffset < last.total ? nextOffset : undefined;
    },
  });

  const rows = useMemo<UnifiedTransactionRow[]>(
    () => query.data?.pages.flatMap((p) => p.rows) ?? [],
    [query.data]
  );
  const total = query.data?.pages[0]?.total ?? 0;

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [query]);

  return {
    rows,
    total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    error: query.error as Error | null,
    refetch: query.refetch,
    loadMore,
  };
}

/* -------------------------------------------------------------------------- */
/*                        Summary (RPC aggregate)                             */
/* -------------------------------------------------------------------------- */

export interface UnifiedSummaryTotals {
  count_in: number;
  count_out: number;
  count_unknown: number;
  count_pending: number;
  count_total: number;
  sum_in: number;
  sum_out: number;
  sum_unknown: number;
  net: number;
}

export interface UnifiedSummaryTokenRow {
  token_symbol: string;
  raw_token_symbol?: string;
  chain_id?: number | null;
  chain?: string | null;
  in: { count: number; sum: number };
  out: { count: number; sum: number };
  unknown: { count: number; sum: number };
}

export interface UnifiedSummaryAggregate {
  totals: UnifiedSummaryTotals;
  byToken: UnifiedSummaryTokenRow[];
  raw?: unknown;
}

interface RawSummary {
  totals?: Partial<UnifiedSummaryTotals>;
  by_token?: Array<{ token_symbol: string | null; chain_id?: number | string | null; chain?: string | null; direction: string; count: number | string; sum_amount: number | string }>;
}

function pivotSummary(raw: RawSummary | null | undefined): UnifiedSummaryAggregate {
  const t = raw?.totals ?? {};
  const totals: UnifiedSummaryTotals = {
    count_in: Number(t.count_in ?? 0),
    count_out: Number(t.count_out ?? 0),
    count_unknown: Number(t.count_unknown ?? 0),
    count_pending: Number(t.count_pending ?? 0),
    count_total: Number(t.count_total ?? 0),
    sum_in: Number(t.sum_in ?? 0),
    sum_out: Number(t.sum_out ?? 0),
    sum_unknown: Number(t.sum_unknown ?? 0),
    net: Number(t.net ?? 0),
  };
  const map = new Map<string, UnifiedSummaryTokenRow>();
  for (const row of raw?.by_token ?? []) {
    const rawSym = row.token_symbol || 'UNKNOWN';
    const parsedChainId = row.chain_id == null ? null : Number(row.chain_id);
    const safeChainId = typeof parsedChainId === 'number' && Number.isFinite(parsedChainId) ? parsedChainId : null;
    const sym = getGiftTokenLabel(rawSym, safeChainId);
    const cur = map.get(sym) ?? {
      token_symbol: sym,
      raw_token_symbol: rawSym,
      chain_id: safeChainId,
      chain: row.chain ?? null,
      in: { count: 0, sum: 0 },
      out: { count: 0, sum: 0 },
      unknown: { count: 0, sum: 0 },
    };
    const bucket = row.direction === 'in' ? cur.in : row.direction === 'out' ? cur.out : cur.unknown;
    bucket.count += Number(row.count ?? 0);
    bucket.sum += Number(row.sum_amount ?? 0);
    map.set(sym, cur);
  }
  return { totals, byToken: Array.from(map.values()), raw };
}

export function useUnifiedTransactionSummary(opts: {
  scope?: UnifiedScope;
  targetUserId?: string | null;
  filters?: UnifiedFilters;
  enabled?: boolean;
} = {}) {
  const { scope = 'self', targetUserId, filters, enabled = true } = opts;
  const { userId, isLoading: isAuthLoading } = useCurrentUser();
  const n = normalizeFilters(filters);

  return useQuery<UnifiedSummaryAggregate>({
    queryKey: [
      'unified-tx', 'summary', scope,
      (scope === 'global' || scope === 'admin_all') ? scope : (targetUserId ?? userId ?? 'anon'),
      n,
    ],
    enabled: enabled && !isAuthLoading,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_unified_summary', {
        _scope: scope,
        _target_user_id: (scope === 'global' || scope === 'admin_all') ? undefined : (targetUserId ?? undefined),
        _direction: n.direction,
        _status: n.status,
        _chain: n.chain,
        _token_symbol: n.token,
        _tx_type: n.type,
        _from_ts: n.from,
        _to_ts: n.to,
        _search: n.search,
        _external_only: n.externalOnly,
        _counterparty_user_id: n.counterpartyUserId,
      });
      if (error) throw error;
      return pivotSummary(data as RawSummary);
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                              Facets (nhẹ)                                  */
/* -------------------------------------------------------------------------- */

export interface UnifiedFacets {
  tokens: string[];
  chains: string[];
}

export function useUnifiedFacets(opts: {
  scope?: UnifiedScope;
  targetUserId?: string | null;
  enabled?: boolean;
} = {}) {
  const { scope = 'self', targetUserId, enabled = true } = opts;
  const { userId, isLoading: isAuthLoading } = useCurrentUser();

  return useQuery<UnifiedFacets>({
    queryKey: [
      'unified-tx', 'facets', scope,
      (scope === 'global' || scope === 'admin_all') ? scope : (targetUserId ?? userId ?? 'anon'),
    ],
    enabled: enabled && !isAuthLoading,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_unified_facets', {
        _scope: scope,
        _target_user_id: (scope === 'global' || scope === 'admin_all') ? undefined : (targetUserId ?? undefined),
      });
      if (error) throw error;
      const raw = (data ?? {}) as { tokens?: string[]; chains?: string[] };
      const chains = Array.isArray(raw.chains) ? raw.chains.filter(Boolean) : [];
      const tokenSet = new Set<string>();
      for (const token of Array.isArray(raw.tokens) ? raw.tokens.filter(Boolean) : []) {
        if (token.toUpperCase() === 'BNB') {
          if (chains.includes('bsc')) tokenSet.add(getGiftTokenLabel('BNB', 56));
          if (chains.includes('bsc_testnet')) tokenSet.add(getGiftTokenLabel('BNB', 97));
          if (!chains.includes('bsc') && !chains.includes('bsc_testnet')) tokenSet.add(getGiftTokenLabel('BNB', null));
        } else {
          tokenSet.add(token);
        }
      }
      return {
        tokens: Array.from(tokenSet),
        chains,
      };
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                                   Detail                                   */
/* -------------------------------------------------------------------------- */

export function useUnifiedTransactionDetail(args: {
  txHash?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  enabled?: boolean;
}) {
  const { txHash, sourceTable, sourceId, enabled = true } = args;
  const has = !!(txHash || sourceId);

  return useQuery<UnifiedDetailResult | null>({
    queryKey: ['unified-tx', 'detail', txHash ?? null, sourceTable ?? null, sourceId ?? null],
    enabled: enabled && has,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_unified_transaction_detail', {
        _tx_hash: txHash ?? undefined,
        _source_table: sourceTable ?? undefined,
        _source_id: sourceId ?? undefined,
      });
      if (error) throw error;
      return ((data as unknown) as UnifiedDetailResult) ?? null;
    },
  });
}

/* -------------------------------------------------------------------------- */
/*   Rows-for-Summary (legacy) — GIỮ LẠI cho callsite chưa migrate.           */
/*   TransactionHistoryPage KHÔNG còn dùng hook này (Phase 7A).               */
/* -------------------------------------------------------------------------- */

export function useUnifiedRowsForSummary(opts: {
  scope?: UnifiedScope;
  targetUserId?: string | null;
  filters?: UnifiedFilters;
  enabled?: boolean;
  limit?: number;
} = {}) {
  const { scope = 'self', targetUserId, filters, enabled = true, limit = 5000 } = opts;
  const { userId, isLoading: isAuthLoading } = useCurrentUser();
  const n = normalizeFilters(filters);

  return useQuery<{ rows: UnifiedTransactionRow[]; total: number }>({
    queryKey: ['unified-tx', 'summary-rows', scope, (scope === 'global' || scope === 'admin_all') ? scope : (targetUserId ?? userId ?? 'anon'), limit, n],
    enabled: enabled && !isAuthLoading,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_unified_transactions', {
        _scope: scope,
        _target_user_id: (scope === 'global' || scope === 'admin_all') ? undefined : (targetUserId ?? undefined),
        _direction: n.direction,
        _status: n.status,
        _chain: n.chain,
        _token_symbol: n.token,
        _tx_type: n.type,
        _from_ts: n.from,
        _to_ts: n.to,
        _search: n.search,
        _limit: limit,
        _offset: 0,
        _external_only: n.externalOnly,
        _counterparty_user_id: n.counterpartyUserId,
      });
      if (error) throw error;
      const rows = (data || []) as UnifiedTransactionRow[];
      const total = rows[0]?.total_count ?? rows.length;
      return { rows, total };
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                Counterparties (dynamic user filter options)                */
/* -------------------------------------------------------------------------- */

export function useUnifiedCounterparties(opts: {
  scope?: UnifiedScope;
  targetUserId?: string | null;
  filters?: UnifiedFilters;
  enabled?: boolean;
} = {}) {
  const { scope = 'self', targetUserId, filters, enabled = true } = opts;
  const { userId, isLoading: isAuthLoading } = useCurrentUser();
  const f: UnifiedFilters | undefined = filters ? { ...filters, counterpartyUserId: null } : undefined;
  const n = normalizeFilters(f);

  return useQuery<UnifiedCounterparty[]>({
    queryKey: ['unified-tx', 'counterparties', scope, (scope === 'global' || scope === 'admin_all') ? scope : (targetUserId ?? userId ?? 'anon'), n],
    enabled: enabled && !isAuthLoading,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_unified_counterparties', {
        _scope: scope,
        _target_user_id: (scope === 'global' || scope === 'admin_all') ? undefined : (targetUserId ?? undefined),
        _direction: n.direction,
        _status: n.status,
        _chain: n.chain,
        _token_symbol: n.token,
        _tx_type: n.type,
        _from_ts: n.from,
        _to_ts: n.to,
        _search: n.search,
        _external_only: n.externalOnly,
        _limit: 300,
      });
      if (error) throw error;
      return ((data || []) as Array<{
        user_id: string; display_name: string | null; username: string | null;
        avatar_url: string | null; tx_count: number;
      }>).map(r => ({
        user_id: r.user_id,
        display_name: r.display_name,
        username: r.username,
        avatar_url: r.avatar_url,
        tx_count: Number(r.tx_count ?? 0),
      }));
    },
  });
}
