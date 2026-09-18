/**
 * RecentUnifiedTransactions — Wallet Overview / Dashboard / Profile.
 * Dùng cùng hook unified, limit 5.
 */
import { useUnifiedTransactionHistory } from '@/hooks/useUnifiedTransactionHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { TransactionRow } from './TransactionRow';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { CelebrationCardModal } from './CelebrationCardModal';
import type { UnifiedTransactionRow } from './types';

interface Props {
  targetUserId?: string | null;
  /** Link "Xem tất cả" → /wallet/history hoặc /profile/:username/history */
  seeAllHref?: string;
  title?: string;
  limit?: number;
}

export function RecentUnifiedTransactions({
  targetUserId, seeAllHref = '/wallet/history', title = 'Giao dịch gần đây', limit = 5,
}: Props) {
  const { rows, isLoading } = useUnifiedTransactionHistory({
    targetUserId, pageSize: limit,
  });
  const [openRow, setOpenRow] = useState<UnifiedTransactionRow | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to={seeAllHref}>Xem tất cả <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && rows.length === 0 ? (
          <div className="space-y-2">{Array.from({ length: limit }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Chưa có giao dịch.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.slice(0, limit).map((r) => (
              <TransactionRow
                key={`${r.source_table}:${r.source_id}:${r.direction}`}
                row={r}
                onClick={setOpenRow}
                onCardClick={setOpenRow}
              />
            ))}
          </div>
        )}
        <CelebrationCardModal
          open={!!openRow}
          onOpenChange={(o) => !o && setOpenRow(null)}
          txHash={openRow?.tx_hash ?? null}
          sourceTable={openRow?.source_table ?? null}
          sourceId={openRow?.source_id ?? null}
          seed={openRow}
        />
      </CardContent>
    </Card>
  );
}
