/**
 * FederationBadge — hiển thị huy hiệu "Connected to FUN Ecosystem".
 *
 * - Chỉ render khi user có Ecosystem Identity (status active hoặc tương đương).
 * - Không fake data: nếu UPSTREAM_NOT_READY / lỗi / chưa có → không render.
 * - Dùng được trong ProfileHeader, IdentityDashboard, v.v.
 */
import { Badge } from '@/components/ui/badge';
import { Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEcosystemIdentity } from '@/hooks/useEcosystemIdentity';

interface FederationBadgeProps {
  userId?: string | null;
  compact?: boolean;
  className?: string;
}

export function FederationBadge({ userId, compact, className }: FederationBadgeProps) {
  const { data, isLoading, notReady, isError } = useEcosystemIdentity(userId ?? undefined);
  if (isLoading || notReady || isError || !data) return null;
  const status = String(data.status || '').toLowerCase();
  if (!['active', 'verified', 'linked'].includes(status) && !data.ecosystem_identity_id) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        compact ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs',
        className,
      )}
      title={`Ecosystem ID: ${data.ecosystem_identity_id}`}
    >
      <Network className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {compact ? 'Ecosystem' : 'Connected to FUN Ecosystem'}
    </Badge>
  );
}
