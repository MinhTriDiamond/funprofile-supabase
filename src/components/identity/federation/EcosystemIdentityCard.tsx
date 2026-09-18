/**
 * EcosystemIdentityCard — thẻ tổng quan Ecosystem Identity của user.
 * Không sửa identity/trust/SBT engine; chỉ render dữ liệu từ FUN Core proxy.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, Network, Fingerprint, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/utils/clipboard';
import { formatDate } from '@/lib/formatters';
import type { EcosystemIdentityData } from '@/hooks/useEcosystemIdentity';

interface Props {
  data: EcosystemIdentityData | null;
  isLoading: boolean;
  notReady: boolean;
  notFound?: boolean;
  isError: boolean;
  errorMessage?: string | null;
}

export function EcosystemIdentityCard({ data, isLoading, notReady, notFound, isError, errorMessage }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Ecosystem Identity</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </CardContent>
      </Card>
    );
  }

  if (notFound) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Network className="w-4 h-4" /> Ecosystem Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Bạn chưa có Ecosystem Identity trên FUN Core.</p>
          <p className="text-xs">FUN Core sẽ tự tạo Ecosystem Identity khi bạn liên kết nền tảng đầu tiên (LoveHUB, FUN Money, Angel AI, …) hoặc khi admin chạy backfill cho tài khoản của bạn.</p>
        </CardContent>
      </Card>
    );
  }

  if (notReady) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Network className="w-4 h-4" /> Ecosystem Identity</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Hệ thống FUN Core đang chuẩn bị endpoint Ecosystem Identity. Vui lòng quay lại sau ít phút.
        </CardContent>
      </Card>
    );
  }


  if (isError) {
    return (
      <Card className="border-destructive/40">
        <CardHeader><CardTitle className="text-base">Ecosystem Identity</CardTitle></CardHeader>
        <CardContent className="text-sm text-destructive">
          Không tải được dữ liệu. {errorMessage}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    // Empty state — chưa federated
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Network className="w-4 h-4" /> Ecosystem Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Bạn chưa được liên kết vào FUN Ecosystem Identity.</p>
          <p className="text-xs">Khi bạn tương tác với các ứng dụng trong hệ sinh thái (LoveHUB, FUN Money, ...), Ecosystem Identity sẽ được tạo tự động và đồng bộ về đây.</p>
        </CardContent>
      </Card>
    );
  }

  const status = String(data.status || 'unknown').toLowerCase();
  const statusVariant = ['active', 'verified', 'linked'].includes(status) ? 'default' : 'secondary';
  const updatedAt = data.freshness?.updated_at;

  const copyId = async () => {
    const ok = await copyToClipboard(data.ecosystem_identity_id);
    if (ok) toast.success('Đã copy Ecosystem ID');
  };

  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-background to-primary/5">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><Network className="w-4 h-4 text-emerald-600" /> Ecosystem Identity</span>
          <Badge variant={statusVariant as any} className="capitalize">{status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Fingerprint className="w-3 h-3" /> Ecosystem ID</div>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs font-mono break-all bg-muted px-2 py-1 rounded flex-1">{data.ecosystem_identity_id}</code>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={copyId} aria-label="Copy">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {data.primary_did && (
          <div>
            <div className="text-xs text-muted-foreground">Primary DID</div>
            <code className="text-xs font-mono break-all">{data.primary_did}</code>
          </div>
        )}

        {data.merged_into && (
          <div className="text-xs text-amber-600">
            Identity này đã được merge vào: <code className="font-mono">{data.merged_into}</code>
          </div>
        )}

        {updatedAt && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> Cập nhật: {formatDate(updatedAt)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
