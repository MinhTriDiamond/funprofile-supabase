/**
 * TransactionExportMenu — Excel duy nhất từ unified source.
 * PDF đã bị loại bỏ.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminRole } from '@/hooks/useAdminRole';
import {
  exportTransactionsExcel,
  type TxExportRow,
  type ExportMeta,
  EXPORT_LIMITS,
} from '@/utils/export';
import { toast } from 'sonner';
import type { UnifiedFilters, UnifiedScope, UnifiedTransactionRow } from './types';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import { getExplorerTxUrl } from '@/lib/chainTokenMapping';
import { getGiftTokenBaseSymbol, getGiftTokenChainFilter, getGiftTokenLabel } from '@/lib/giftTokenLabel';


interface Props {
  scope: UnifiedScope;
  targetUserId?: string | null;
  filters: UnifiedFilters;
  surface: 'wallet_history' | 'profile_history' | 'donations' | 'admin_history';
  userDisplayName: string;
  userWalletAddress?: string | null;
  isOwner: boolean;
}

function rowsFromUnified(rows: UnifiedTransactionRow[]): TxExportRow[] {
  return rows.map((r, i) => {
    const isExt = !!r.is_external;
    const dir: TxExportRow['direction'] =
      isExt ? 'external'
      : r.direction === 'in' || r.direction === 'out' ? r.direction
      : 'unknown';
    const senderName = r.sender_display_name ?? r.sender_username ?? (r.direction === 'out' ? 'Bạn' : (isExt ? 'Ví ngoài' : 'Người gửi'));
    const recipientName = r.recipient_display_name ?? r.recipient_username ?? (r.direction === 'in' ? 'Bạn' : 'Người nhận');
    const senderAddr = r.sender_wallet_address ?? r.sender_address ?? null;
    const recipientAddr = r.recipient_wallet_address ?? r.recipient_address ?? null;
    const tokenLabel = getGiftTokenLabel(r.token_symbol ?? '', r.chain_id);
    return {
      stt: i + 1,
      transactionId: `${r.source_table}:${r.source_id}`,
      occurredAt: new Date(r.occurred_at),
      direction: dir,
      type: r.tx_type ?? '—',
      status: r.status ?? '—',
      fromLabel: senderName,
      fromUsername: r.sender_username ? `@${r.sender_username}` : null,
      fromAddress: senderAddr,
      toLabel: recipientName,
      toUsername: r.recipient_username ? `@${r.recipient_username}` : null,
      toAddress: recipientAddr,
      token: tokenLabel,
      amount: Number(r.amount_decimal ?? 0),
      fee: r.fee_raw ? Number(r.fee_raw) : null,
      network: r.network ?? null,
      chain: r.chain ?? null,
      txHash: r.tx_hash,
      explorerUrl: r.tx_hash ? (r.chain_id != null ? getExplorerTxUrl(r.tx_hash, r.chain_id) : getBscScanTxUrl(r.tx_hash, r.token_symbol ?? undefined)) : null,
      note: r.memo ?? '',
      source: r.source_table,
      sourceId: r.source_id,
    };
  });
}

function buildFilterParams(f: UnifiedFilters) {
  return {
    dateFrom: f.dateFrom ?? null,
    dateTo: f.dateTo ?? null,
    direction: f.direction ?? 'all',
    token: f.token ?? null,
    chain: f.chain ?? null,
    status: f.status ?? null,
    type: f.type ?? null,
    search: f.search ?? null,
    externalOnly: !!f.externalOnly,
    counterpartyUserId: f.counterpartyUserId ?? null,
  };
}

function normalizedChainFilter(f: UnifiedFilters): string | undefined {
  return getGiftTokenChainFilter(f.token) ?? (f.chain && f.chain !== 'all' ? f.chain : undefined);
}

function normalizedTokenFilter(f: UnifiedFilters): string | undefined {
  return f.token && f.token !== 'all' ? getGiftTokenBaseSymbol(f.token) : undefined;
}

function normStatus(s?: string) {
  if (!s || s === 'all') return undefined;
  if (s === 'confirmed' || s === 'completed') return 'success';
  if (s === 'processing') return 'pending';
  return s;
}

export function TransactionExportMenu({
  scope, targetUserId, filters, surface, userDisplayName, userWalletAddress, isOwner,
}: Props) {
  const [loading, setLoading] = useState(false);
  const { userId } = useCurrentUser();
  const { isAdmin } = useAdminRole();

  const run = async () => {
    setLoading(true);
    const toastId = toast.loading('Đang tải dữ liệu để xuất…');
    try {
      // P0: Export Layer tự phân trang. RPC giữ nguyên limit 5000/page.
      // Duyệt page1..pageN đến khi returned_rows < PAGE_SIZE thì dừng.
      const PAGE_SIZE = 5000;
      const HARD_CAP = EXPORT_LIMITS.excel; // 50k an toàn cho browser
      const commonParams = {
        _scope: scope,
        _target_user_id: scope === 'global' ? undefined : (targetUserId ?? undefined),
        _direction: filters.direction && filters.direction !== 'all' ? filters.direction : undefined,
        _status: normStatus(filters.status),
        _chain: normalizedChainFilter(filters),
        _token_symbol: normalizedTokenFilter(filters),
        _tx_type: filters.type && filters.type !== 'all' ? filters.type : undefined,
        _from_ts: filters.dateFrom || undefined,
        _to_ts: filters.dateTo || undefined,
        _search: filters.search || undefined,
        _external_only: filters.externalOnly ? true : undefined,
        _counterparty_user_id: filters.counterpartyUserId || undefined,
      } as const;

      const allRaw: UnifiedTransactionRow[] = [];
      let offset = 0;
      let totalAvailable = 0;
      let pageIndex = 0;
      // Cap số vòng lặp tránh loop bất tận nếu RPC lỗi lệch page
      const MAX_PAGES = Math.ceil(HARD_CAP / PAGE_SIZE) + 2;

      while (pageIndex < MAX_PAGES) {
        pageIndex += 1;
        const { data, error } = await supabase.rpc('get_unified_transactions', {
          ...commonParams,
          _limit: PAGE_SIZE,
          _offset: offset,
        });
        if (error) throw error;
        const chunk = (data || []) as UnifiedTransactionRow[];
        if (pageIndex === 1) {
          totalAvailable = Number(chunk[0]?.total_count ?? 0);
        }
        allRaw.push(...chunk);
        toast.loading(
          `Đang tải dữ liệu để xuất… ${allRaw.length.toLocaleString('vi-VN')}${totalAvailable ? '/' + totalAvailable.toLocaleString('vi-VN') : ''}`,
          { id: toastId },
        );
        if (chunk.length < PAGE_SIZE) break;
        if (allRaw.length >= HARD_CAP) break;
        offset += PAGE_SIZE;
      }

      if (allRaw.length === 0) {
        toast.error('Không có giao dịch để xuất.', { id: toastId });
        return;
      }

      // Nếu totalAvailable không có (RPC lỗi cột), fallback bằng số đã tải
      if (!totalAvailable) totalAvailable = allRaw.length;

      const rows = rowsFromUnified(allRaw);
      const meta: ExportMeta = {
        title: 'Lịch sử giao dịch',
        userDisplayName,
        userWalletAddress: userWalletAddress ?? null,
        isOwner,
        surface,
        filterParams: buildFilterParams(filters),
        totalAvailable,
      };
      toast.dismiss(toastId);
      await exportTransactionsExcel({
        rows,
        meta,
        filenameBase: `${surface}-${userDisplayName.replace(/\s+/g, '_')}`,
        currentUserId: userId,
        isAdminRole: isAdmin,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Xuất thất bại: ${msg}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={loading}>
      {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4 text-green-600" />}
      Xuất Excel
    </Button>
  );
}

