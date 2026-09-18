/**
 * TransactionHistoryPage — shell duy nhất cho Unified Transaction History.
 *
 * Reuse ở:
 *  - /wallet/history          (scope=wallet, owner=true)
 *  - /profile/:username/history (scope=profile, owner=auth.uid==target)
 *  - /donations               (scope=donations, owner=false, preset type=donation)
 *  - Admin tools              (scope=admin, owner=true)
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useUnifiedTransactionHistory,
  useUnifiedTransactionSummary,
  useUnifiedFacets,
} from '@/hooks/useUnifiedTransactionHistory';
import { TransactionFilters } from './TransactionFilters';
import { UnifiedTransactionSummary } from './UnifiedTransactionSummary';
import { GlobalTransactionSummary } from './GlobalTransactionSummary';
import { TransactionList } from './TransactionList';
import { CelebrationCardModal } from './CelebrationCardModal';
import { TransactionExportMenu } from './TransactionExportMenu';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminRole } from '@/hooks/useAdminRole';
import type { UnifiedFilters, UnifiedScope, UnifiedTransactionRow } from './types';

interface Props {
  scope: UnifiedScope;
  targetUserId?: string | null;
  userDisplayName: string;
  userWalletAddress?: string | null;
  /** Preset filter cố định (ví dụ donations page chỉ hiện type=donation). */
  presetFilters?: Partial<UnifiedFilters>;
  /** Sync filters lên URL — true cho route /wallet/history, /profile/.../history, /donations. */
  syncUrl?: boolean;
  /** Header tuỳ biến (title + extra actions) */
  title?: string;
  subtitle?: string;
}

const DEFAULT_FILTERS: UnifiedFilters = {
  direction: 'all', status: 'all', chain: 'all', token: 'all', type: 'all',
  dateFrom: null, dateTo: null, search: '', externalOnly: false, counterpartyUserId: null,
};

export function TransactionHistoryPage({
  scope, targetUserId, userDisplayName, userWalletAddress,
  presetFilters, syncUrl = true, title, subtitle,
}: Props) {
  const { userId } = useCurrentUser();
  const { isAdmin } = useAdminRole();
  const isOwner = scope === 'self'
    ? true
    : scope === 'profile'
      ? (!!userId && userId === targetUserId)
      : false;

  const [filters, setFilters] = useState<UnifiedFilters>({ ...DEFAULT_FILTERS, ...presetFilters });
  const effectiveFilters = useMemo(() => ({ ...filters, ...presetFilters }), [filters, presetFilters]);

  const history = useUnifiedTransactionHistory({ scope, targetUserId, filters: effectiveFilters });
  const summaryQ = useUnifiedTransactionSummary({ scope, targetUserId, filters: effectiveFilters });
  const facetsQ = useUnifiedFacets({ scope, targetUserId });

  // Celebration modal state + deep link ?tx=
  const [sp, setSp] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSeed, setModalSeed] = useState<UnifiedTransactionRow | null>(null);
  const [modalCtx, setModalCtx] = useState<{ tx?: string | null; table?: string | null; id?: string | null }>({});

  const urlTx = sp.get('tx');
  useEffect(() => {
    if (urlTx && !modalOpen) {
      setModalSeed(null);
      setModalCtx({ tx: urlTx });
      setModalOpen(true);
    }
  }, [urlTx, modalOpen]);

  const openModal = (row: UnifiedTransactionRow) => {
    setModalSeed(row);
    setModalCtx({ tx: row.tx_hash, table: row.source_table, id: row.source_id });
    setModalOpen(true);
    if (syncUrl && row.tx_hash) {
      const next = new URLSearchParams(sp);
      next.set('tx', row.tx_hash);
      setSp(next, { replace: true });
    }
  };

  const closeModal = (open: boolean) => {
    setModalOpen(open);
    if (!open && syncUrl && sp.get('tx')) {
      const next = new URLSearchParams(sp);
      next.delete('tx');
      setSp(next, { replace: true });
    }
  };

  const tokens = facetsQ.data?.tokens ?? [];
  const chains = facetsQ.data?.chains ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{title ?? 'Lịch sử giao dịch'}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {(isOwner || isAdmin) && (
          <TransactionExportMenu
            scope={scope}
            targetUserId={targetUserId}
            filters={effectiveFilters}
            surface={scope === 'self' ? 'wallet_history' : scope === 'profile' ? 'profile_history' : 'donations'}
            userDisplayName={userDisplayName}
            userWalletAddress={userWalletAddress ?? null}
            isOwner={isOwner}
          />
        )}
      </div>

      {scope === 'global' ? (
        <GlobalTransactionSummary
          data={summaryQ.data}
          isLoading={summaryQ.isLoading}
        />
      ) : (
        <UnifiedTransactionSummary
          data={summaryQ.data}
          filters={effectiveFilters}
          isLoading={summaryQ.isLoading}
          isFetching={summaryQ.isFetching}
          tokenFilter={filters.token ?? 'all'}
          onTokenClick={(sym) => setFilters((f) => ({ ...f, token: sym }))}
        />
      )}

      <TransactionFilters
        filters={filters}
        onChange={setFilters}
        availableTokens={tokens}
        availableChains={chains}
        syncUrl={syncUrl}
        targetUserId={targetUserId}
        scope={scope}
      />

      <TransactionList
        rows={history.rows}
        isLoading={history.isLoading}
        error={history.error}
        isFetchingNextPage={history.isFetchingNextPage}
        hasNextPage={history.hasNextPage}
        loadMore={history.loadMore}
        onRetry={() => void history.refetch()}
        onRowClick={openModal}
        onCardClick={openModal}
        emptyMessage={scope === 'profile' && !isOwner ? 'Người dùng này chưa có giao dịch.' : undefined}
      />

      <CelebrationCardModal
        open={modalOpen}
        onOpenChange={closeModal}
        txHash={modalCtx.tx ?? null}
        sourceTable={modalCtx.table ?? null}
        sourceId={modalCtx.id ?? null}
        seed={modalSeed}
      />
    </div>
  );
}
