/**
 * FederationSyncStatus — hiển thị trạng thái đồng bộ federation cho user.
 * Dữ liệu lấy từ freshness của ecosystem identity (không gọi DB trực tiếp).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Radio } from 'lucide-react';
import { formatDate, formatRelativeTime } from '@/lib/formatters';
import type { EcosystemIdentityData } from '@/hooks/useEcosystemIdentity';

export function FederationSyncStatus({ data }: { data: EcosystemIdentityData }) {
  const updatedAt = data.freshness?.updated_at ?? null;
  const linkCount = data.freshness?.link_count ?? data.linked_platforms?.length ?? 0;

  let freshness: 'fresh' | 'stale' | 'unknown' = 'unknown';
  if (updatedAt) {
    const ageMs = Date.now() - new Date(updatedAt).getTime();
    freshness = ageMs < 24 * 60 * 60 * 1000 ? 'fresh' : 'stale';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="w-4 h-4" /> Federation Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Trạng thái</span>
          <Badge
            variant="outline"
            className={
              freshness === 'fresh'
                ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                : freshness === 'stale'
                ? 'border-amber-500/40 text-amber-700 dark:text-amber-300'
                : ''
            }
          >
            {freshness === 'fresh' ? 'Đang đồng bộ' : freshness === 'stale' ? 'Có thể chậm cập nhật' : 'Chưa rõ'}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Số liên kết</span>
          <span className="font-medium">{linkCount}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Cập nhật gần nhất</span>
          <span className="text-right">
            {updatedAt ? (
              <>
                <span className="font-medium">{formatRelativeTime(updatedAt)}</span>
                <span className="block text-[11px] text-muted-foreground">{formatDate(updatedAt)}</span>
              </>
            ) : '—'}
          </span>
        </div>
        {data.trace_id && (
          <div className="text-[10px] text-muted-foreground pt-1 border-t">
            trace: <code className="font-mono">{data.trace_id}</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
