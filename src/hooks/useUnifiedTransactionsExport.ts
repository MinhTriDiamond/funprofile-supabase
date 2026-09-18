/**
 * useUnifiedTransactionsExport — nguồn dữ liệu export ĐÚNG (SSOT).
 *
 * Vì sao tồn tại: export hiện tại đọc thẳng `donations` nên bỏ sót
 * `wallet_transfers` / `transactions` / `swap_transactions` và chỉ hiện 1 chân
 * của mỗi khoản quà. Hook này đọc RPC `get_unified_transactions` (nguồn của
 * `v_unified_transactions`), phân trang tới hết rồi map sang `TxExportRow`.
 *
 * Build SONG SONG với luồng cũ — chưa thay consumer. Chỉ fetch khi gọi
 * `fetchRows()` (lazy, không tự chạy khi mount).
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { mapUnifiedToRows } from '@/utils/export/mapUnifiedRows';
import type { TxExportRow } from '@/utils/export/types';
import type {
  UnifiedFilters,
  UnifiedScope,
  UnifiedTransactionRow,
} from '@/components/transactions/types';

const PAGE = 500;
const HARD_CAP = 50_000;

export interface UseUnifiedExportOpts {
  scope?: UnifiedScope;
  targetUserId?: string | null;
  filters?: UnifiedFilters;
}

function normalize(f?: UnifiedFilters) {
  const status = f?.status && f.status !== 'all' ? f.status : undefined;
  return {
    direction: f?.direction && f.direction !== 'all' ? f.direction : undefined,
    status:
      status === 'confirmed' || status === 'completed'
        ? 'success'
        : status === 'processing'
          ? 'pending'
          : status,
    chain: f?.chain && f.chain !== 'all' ? f.chain : undefined,
    token: f?.token && f.token !== 'all' ? f.token : undefined,
    type: f?.type && f.type !== 'all' ? f.type : undefined,
    from: f?.dateFrom || undefined,
    to: f?.dateTo || undefined,
    search: f?.search?.trim() || undefined,
    externalOnly: f?.externalOnly ? true : undefined,
    counterpartyUserId: f?.counterpartyUserId || undefined,
  };
}

export function useUnifiedTransactionsExport(opts: UseUnifiedExportOpts = {}) {
  const { scope = 'self', targetUserId, filters } = opts;
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRaw = useCallback(async (): Promise<UnifiedTransactionRow[]> => {
    const n = normalize(filters);
    const all: UnifiedTransactionRow[] = [];
    let offset = 0;

    for (;;) {
      const { data, error: rpcError } = await supabase.rpc('get_unified_transactions', {
        _scope: scope,
        _target_user_id:
          scope === 'global' || scope === 'admin_all' ? undefined : (targetUserId ?? undefined),
        _direction: n.direction,
        _status: n.status,
        _chain: n.chain,
        _token_symbol: n.token,
        _tx_type: n.type,
        _from_ts: n.from,
        _to_ts: n.to,
        _search: n.search,
        _limit: PAGE,
        _offset: offset,
        _external_only: n.externalOnly,
        _counterparty_user_id: n.counterpartyUserId,
      });
      if (rpcError) throw rpcError;

      const page = (data || []) as UnifiedTransactionRow[];
      all.push(...page);
      const total = page[0]?.total_count ?? all.length;
      offset += page.length;
      if (page.length === 0 || offset >= total || all.length >= HARD_CAP) break;
    }
    return all;
  }, [scope, targetUserId, filters]);

  /** Trả về rows đã map sẵn cho `exportTransactionsExcel`. */
  const fetchRows = useCallback(async (): Promise<TxExportRow[]> => {
    setIsFetching(true);
    setError(null);
    try {
      const raw = await fetchRaw();
      return mapUnifiedToRows(raw);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      setIsFetching(false);
    }
  }, [fetchRaw]);

  return { fetchRows, fetchRaw, isFetching, error };
}
