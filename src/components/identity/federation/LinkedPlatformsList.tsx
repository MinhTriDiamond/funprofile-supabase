/**
 * LinkedPlatformsList — liệt kê các platform đã được liên kết vào Ecosystem Identity.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link2 } from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import type { LinkedPlatform } from '@/hooks/useEcosystemIdentity';

const PLATFORM_LABELS: Record<string, string> = {
  fun_profile: 'FUN Profile',
  funprofile: 'FUN Profile',
  lovehub: 'LoveHUB',
  fun_money: 'FUN Money',
  funmoney: 'FUN Money',
  fun_core: 'FUN Core',
  angel_ai: 'Angel AI',
};

function platformLabel(slug: string) {
  const key = slug?.toLowerCase?.() ?? '';
  return PLATFORM_LABELS[key] ?? slug;
}

export function LinkedPlatformsList({ platforms }: { platforms: LinkedPlatform[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="w-4 h-4" /> Linked Platforms
          <Badge variant="outline" className="ml-1">{platforms.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {platforms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có platform nào được liên kết vào identity này.</p>
        ) : (
          <ul className="divide-y">
            {platforms.map((p, i) => {
              const status = String(p.link_status || '').toLowerCase();
              const variant = status === 'active' || status === 'linked' ? 'default'
                : status === 'pending' ? 'secondary'
                : status === 'revoked' || status === 'rejected' ? 'destructive'
                : 'outline';
              return (
                <li key={`${p.platform_slug}-${p.platform_user_id}-${i}`} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{platformLabel(p.platform_slug)}</div>
                    <code className="text-xs font-mono text-muted-foreground break-all">{p.platform_user_id}</code>
                    {p.linked_at && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">Liên kết: {formatDate(p.linked_at)}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={variant as any} className="capitalize">{status || 'unknown'}</Badge>
                    {p.link_method && <span className="text-[10px] text-muted-foreground">{p.link_method}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
