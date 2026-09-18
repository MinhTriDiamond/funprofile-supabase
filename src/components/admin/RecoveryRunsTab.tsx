import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  useRecoveryRuns,
  useApproveRecovery,
  useCancelRecovery,
  useManualTickRecovery,
} from '@/hooks/admin/useRecoveryRuns';
import { Loader2, Play, X, RotateCw } from 'lucide-react';

function statusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'running') return 'default';
  if (s === 'completed') return 'secondary';
  if (s === 'cancelled') return 'destructive';
  return 'outline';
}

function defaultMonth() {
  const now = new Date();
  // Default to previous month (vì recovery thường cho tháng đã chốt)
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

export default function RecoveryRunsTab() {
  const [month, setMonth] = useState(defaultMonth());
  const [maxPerRun, setMaxPerRun] = useState(50);
  const { data: runs, isLoading } = useRecoveryRuns();
  const approve = useApproveRecovery();
  const cancel = useCancelRecovery();
  const tick = useManualTickRecovery();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Auto-recovery EPOCH_CAP failed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tự động đưa các lệnh <code>failed</code> do <code>lockWithPPLP reverted</code> về{' '}
            <code>signed</code> theo FIFO, có throttle 950K FUN/action/ngày và trần 1.05M FUN/user/tháng.
            Cron tick mỗi 30 phút sau khi Cha duyệt.
          </p>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Tháng (YYYY-MM)</label>
              <Input
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                placeholder="2026-05"
                className="w-32"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max / tick</label>
              <Input
                type="number"
                value={maxPerRun}
                onChange={(e) => setMaxPerRun(Number(e.target.value) || 50)}
                className="w-24"
              />
            </div>
            <Button
              onClick={() => approve.mutate({ month, maxPerRun })}
              disabled={approve.isPending}
            >
              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Duyệt đợt mới
            </Button>
            <Button variant="outline" onClick={() => tick.mutate()} disabled={tick.isPending}>
              {tick.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCw className="h-4 w-4 mr-2" />}
              Tick thủ công
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử các đợt</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : !runs || runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có đợt nào.</p>
          ) : (
            <div className="space-y-3">
              {runs.map((r) => {
                const pct = r.total_eligible > 0
                  ? Math.min(100, ((r.total_recovered + r.total_skipped) / r.total_eligible) * 100)
                  : 0;
                return (
                  <div key={r.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                        <span className="font-mono text-sm">{r.month_filter}</span>
                        <span className="text-xs text-muted-foreground">
                          max {r.max_per_run}/tick
                        </span>
                      </div>
                      {(r.status === 'pending' || r.status === 'running') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancel.mutate(r.id)}
                          disabled={cancel.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Đủ điều kiện</div>
                        <div className="font-semibold">{r.total_eligible}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Đã hồi phục</div>
                        <div className="font-semibold text-green-600">{r.total_recovered}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Bỏ qua</div>
                        <div className="font-semibold text-amber-600">{r.total_skipped}</div>
                      </div>
                    </div>
                    <Progress value={pct} />
                    {r.last_tick_at && (
                      <p className="text-xs text-muted-foreground">
                        Tick gần nhất: {new Date(r.last_tick_at).toLocaleString('vi-VN')}
                      </p>
                    )}
                    {r.notes && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Chi tiết tick</summary>
                        <pre className="mt-1 bg-muted p-2 rounded overflow-x-auto">{r.notes}</pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
