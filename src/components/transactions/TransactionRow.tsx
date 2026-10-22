/**
 * TransactionRow — Legacy-feel row: avatar sender → avatar recipient,
 * amount xanh/đỏ, badge trạng thái, network, thời gian.
 */
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PartyChip } from './PartyChip';
import { CardButton } from './CardButton';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import { getExplorerTxUrl } from '@/lib/chainTokenMapping';
import { formatTokenAmount } from '@/lib/formatTokenAmount';
import { getGiftTokenBaseSymbol, getGiftTokenLabel } from '@/lib/giftTokenLabel';
import type { UnifiedTransactionRow } from './types';

function shortHash(h?: string | null) {
  if (!h) return '';
  return h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function directionBadge(row: UnifiedTransactionRow) {
  if (row.is_external && !row.counterparty_user_id) {
    return { label: 'Ví ngoài', cls: 'border-slate-300 text-slate-600 bg-slate-50 dark:bg-slate-900/30' };
  }
  if (row.direction === 'in') {
    return { label: 'Đã nhận', cls: 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300' };
  }
  if (row.direction === 'out') {
    return { label: 'Đã tặng', cls: 'border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300' };
  }
  return { label: 'Chưa rõ chiều', cls: 'border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300' };
}

function statusBadge(status?: string | null) {
  const s = (status ?? '').toLowerCase();
  const ok = s === 'confirmed' || s === 'success' || s === 'completed';
  // Luồng xác thực quà tặng (2026-10-22): dòng chờ server đối chiếu on-chain.
  const verifying = s === 'pending_verification';
  const rejected = s === 'rejected_unverified';
  const pending = s === 'pending' || s === 'processing';
  const failed = s === 'failed' || s === 'error';
  const cls = ok ? 'border-emerald-300 text-emerald-600'
    : verifying ? 'border-sky-300 text-sky-600'
    : pending ? 'border-amber-300 text-amber-600'
    : (failed || rejected) ? 'border-rose-300 text-rose-600'
    : 'text-muted-foreground';
  const label = ok ? '✅ Thành công'
    : verifying ? '⏳ Đang xác thực'
    : rejected ? 'Không xác thực được'
    : pending ? 'Đang xử lý'
    : failed ? 'Thất bại'
    : (status ?? '—');
  return { label, cls };
}

function explorerUrlFor(row: UnifiedTransactionRow): string | null {
  if (!row.tx_hash) return null;
  if (row.chain_id != null) return getExplorerTxUrl(row.tx_hash, row.chain_id);
  return getBscScanTxUrl(row.tx_hash, row.token_symbol ?? undefined);
}

interface Props {
  row: UnifiedTransactionRow;
  onClick?: (row: UnifiedTransactionRow) => void;
  onCardClick?: (row: UnifiedTransactionRow) => void;
}

export const TransactionRow = memo(function TransactionRow({ row, onClick, onCardClick }: Props) {
  const dir = row.direction;
  const sign = dir === 'in' ? '+' : dir === 'out' ? '−' : '';
  const amtCls =
    dir === 'in' ? 'text-emerald-600 dark:text-emerald-400'
    : dir === 'out' ? 'text-rose-600 dark:text-rose-400'
    : 'text-muted-foreground';

  const dirBadge = directionBadge(row);
  const stBadge = statusBadge(row.status);
  const tokenLabel = getGiftTokenLabel(row.token_symbol ?? '', row.chain_id);
  const baseTokenSymbol = getGiftTokenBaseSymbol(tokenLabel);

  // Tự derive sender/recipient từ row (đã có sẵn các field profile từ RPC M5-UX1).
  const senderParty = {
    displayName: row.sender_display_name ?? (dir === 'out' ? row.owner_display_name : row.counterparty_display_name) ?? null,
    username: row.sender_username ?? (dir === 'out' ? row.owner_username : row.counterparty_username) ?? null,
    avatarUrl: row.sender_avatar_url ?? (dir === 'out' ? row.owner_avatar_url : row.counterparty_avatar_url) ?? null,
    address: row.sender_wallet_address ?? row.sender_address ?? null,
  };
  const recipientParty = {
    displayName: row.recipient_display_name ?? (dir === 'in' ? row.owner_display_name : row.counterparty_display_name) ?? null,
    username: row.recipient_username ?? (dir === 'in' ? row.owner_username : row.counterparty_username) ?? null,
    avatarUrl: row.recipient_avatar_url ?? (dir === 'in' ? row.owner_avatar_url : row.counterparty_avatar_url) ?? null,
    address: row.recipient_wallet_address ?? row.recipient_address ?? null,
  };

  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const memoRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (!row.memo) return;
    const el = memoRef.current;
    if (!el) return;
    const check = () => {
      // Chỉ đo khi đang clamp; khi expanded coi như true để nút "Thu gọn" luôn hiện
      if (expanded) return;
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [row.memo, expanded]);

  return (
    <button
      type="button"
      onClick={() => onClick?.(row)}
      className={cn(
        'group flex w-full flex-col gap-2 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors',
        'hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {/* Row 1: sender → recipient */}
      <div className="flex items-center gap-2">
        <PartyChip {...senderParty} size="sm" className="min-w-0 flex-1" />
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        <PartyChip {...recipientParty} size="sm" align="right" className="min-w-0 flex-1" />
      </div>

      {/* Row 2: amount + badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('text-base font-semibold tabular-nums', amtCls)}>
          {sign}{formatTokenAmount(row.amount_decimal != null ? Math.abs(row.amount_decimal) : null, baseTokenSymbol)} {tokenLabel}
        </span>
        <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', dirBadge.cls)}>
          {dirBadge.label}
        </Badge>
        {row.chain ? (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
            {row.chain.toUpperCase()}
          </Badge>
        ) : null}
        <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
          {formatTime(row.occurred_at)}
        </span>
      </div>

      {/* Row 3: memo (multi-line, có Mở rộng / Thu gọn) */}
      {row.memo ? (
        <div className="flex flex-col gap-0.5">
          <p
            ref={memoRef}
            className={cn(
              'italic text-xs text-muted-foreground break-words',
              expanded ? 'whitespace-pre-wrap' : 'line-clamp-2',
            )}
          >
            "{row.memo}"
          </p>
          {(isClamped || expanded) ? (
            <span
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setExpanded((v) => !v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  setExpanded((v) => !v);
                }
              }}
              className="mt-0.5 inline-flex w-fit cursor-pointer items-center gap-1 text-[11px] font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {expanded ? 'Thu gọn' : 'Mở rộng'}
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Footer cố định: trái = Status + Tx Hash · phải = Card button */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
        <div className="flex min-w-0 items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', stBadge.cls)}>
            {stBadge.label}
          </Badge>
          {row.tx_hash ? (
            (() => {
              const url = explorerUrlFor(row);
              return url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
                  title="Mở trên blockchain explorer"
                >
                  Tx: {shortHash(row.tx_hash)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                  Tx: {shortHash(row.tx_hash)}
                </span>
              );
            })()
          ) : null}
        </div>
        {onCardClick && (row.tx_hash || row.source_id) ? (
          <span onClick={(e) => e.stopPropagation()}>
            <CardButton onClick={() => onCardClick(row)} className="shrink-0" />
          </span>
        ) : null}
      </div>
    </button>
  );
});
