import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { useImpersonationAlerts, type ImpersonationAlert } from '@/hooks/useImpersonationAlerts';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

const STATUS_LABEL: Record<ImpersonationAlert['status'], string> = {
  pending: 'Đang chờ bạn xác minh',
  victim_confirmed_impersonator: 'Đã báo cáo mạo danh',
  victim_confirmed_self: 'Đã xác nhận là tài khoản của bạn',
  dismissed_by_admin: 'Đã đóng bởi quản trị',
  auto_resolved: 'Tự động xử lý',
};

function AlertRow({ alert }: { alert: ImpersonationAlert }) {
  const { respond } = useImpersonationAlerts();
  const s = alert.details.suspect;
  return (
    <Card className="border-orange-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-700 dark:text-orange-300 border-0">
            <AlertTriangle className="w-3 h-3" /> Nghi vấn mạo danh
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(alert.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12 ring-2 ring-orange-500/40">
            <AvatarImage src={s?.avatar_url ?? undefined} />
            <AvatarFallback>{(s?.username ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{s?.display_name || s?.full_name || s?.username}</div>
            <div className="text-xs text-muted-foreground truncate">@{s?.username}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="flex justify-between"><span>Giống tên</span><span className="font-semibold">{alert.name_similarity}%</span></div>
            <Progress value={Number(alert.name_similarity)} className="h-1.5 mt-1" />
          </div>
          <div>
            <div className="flex justify-between"><span>Giống ảnh</span><span className="font-semibold">{alert.avatar_similarity}%</span></div>
            <Progress value={Number(alert.avatar_similarity)} className="h-1.5 mt-1" />
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Trạng thái: <span className="font-medium text-foreground">{STATUS_LABEL[alert.status]}</span>
        </div>

        {alert.status === 'pending' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ alertId: alert.id, response: 'impersonator' })}
            >
              <UserX className="w-4 h-4" /> Đây là kẻ mạo danh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ alertId: alert.id, response: 'self' })}
            >
              <UserCheck className="w-4 h-4" /> Đây là tài khoản khác của tôi
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ImpersonationAlertsTab() {
  const { alerts, pending, isLoading } = useImpersonationAlerts();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Đang tải cảnh báo...</div>;
  }

  if (!alerts.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500" />
          <div className="font-medium">Chưa có cảnh báo mạo danh nào</div>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Hệ thống sẽ tự động phát hiện và thông báo cho bạn nếu có tài khoản mới
            đăng ký với tên và ảnh đại diện giống bạn.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3 text-sm">
          <div className="font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Bạn có {pending.length} cảnh báo cần xác minh
          </div>
        </div>
      )}
      {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
    </div>
  );
}
