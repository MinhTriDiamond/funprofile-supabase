import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Lock, Unlock, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

interface VestingProgressProps {
  userId: string | null;
}

interface VestingSchedule {
  id: string;
  total_amount: number;
  instant_amount: number;
  locked_amount: number;
  released_amount: number;
  remaining_locked: number;
  release_at: string;
  next_unlock_check_at: string | null;
  status: string;
  trust_band: string;
  unlock_history: Array<{ at: string; amount: number }>;
  created_at: string;
}

export function VestingProgress({ userId }: VestingProgressProps) {
  const { data: schedules, isLoading } = useQuery({
    queryKey: ['reward-vesting', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('reward_vesting_schedules')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as VestingSchedule[];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  if (!userId) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Phần thưởng Ánh Sáng</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  if (!schedules || schedules.length === 0) {
    return null;
  }

  const totals = schedules.reduce(
    (acc, s) => ({
      total: acc.total + Number(s.total_amount),
      instant: acc.instant + Number(s.instant_amount),
      released: acc.released + Number(s.released_amount),
      locked: acc.locked + Number(s.remaining_locked),
    }),
    { total: 0, instant: 0, released: 0, locked: 0 },
  );

  const progressPct = totals.total > 0 ? (totals.released / totals.total) * 100 : 0;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Phần thưởng Ánh Sáng
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tổng quan */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-lg bg-muted/40">
            <div className="text-xs text-muted-foreground mb-1">Sẵn sàng dùng</div>
            <div className="text-lg font-semibold text-primary">
              {Math.floor(totals.released).toLocaleString('vi-VN')}
            </div>
            <Unlock className="w-3 h-3 mx-auto mt-1 text-primary/60" />
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <div className="text-xs text-muted-foreground mb-1">Đang mở dần</div>
            <div className="text-lg font-semibold">
              {Math.floor(totals.locked).toLocaleString('vi-VN')}
            </div>
            <Lock className="w-3 h-3 mx-auto mt-1 text-muted-foreground" />
          </div>
          <div className="p-3 rounded-lg bg-muted/40">
            <div className="text-xs text-muted-foreground mb-1">Tổng FUN</div>
            <div className="text-lg font-semibold">
              {Math.floor(totals.total).toLocaleString('vi-VN')}
            </div>
            <TrendingUp className="w-3 h-3 mx-auto mt-1 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Tiến độ mở</span>
            <span>{progressPct.toFixed(1)}%</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>

        {/* Lịch mở */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Các đợt phần thưởng</div>
          {schedules.slice(0, 3).map((s) => {
            const sProgress = Number(s.total_amount) > 0
              ? (Number(s.released_amount) / Number(s.total_amount)) * 100 : 0;
            return (
              <div key={s.id} className="p-3 rounded-lg border bg-card space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {Math.floor(Number(s.total_amount)).toLocaleString('vi-VN')} FUN
                  </div>
                  <Badge variant={s.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                    {s.status === 'completed' ? 'Hoàn tất' : 'Đang mở dần'}
                  </Badge>
                </div>
                <Progress value={sProgress} className="h-1" />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{Math.floor(Number(s.released_amount)).toLocaleString('vi-VN')} đã mở</span>
                  {s.next_unlock_check_at && s.status === 'active' && (
                    <span>
                      Mở thêm{' '}
                      {formatDistanceToNow(new Date(s.next_unlock_check_at), { addSuffix: true, locale: vi })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {schedules.length > 3 && (
            <div className="text-xs text-center text-muted-foreground">
              +{schedules.length - 3} đợt khác
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground italic text-center">
          Phần thưởng tự động mở dần theo thời gian và mức đóng góp của bạn.
        </p>
      </CardContent>
    </Card>
  );
}
