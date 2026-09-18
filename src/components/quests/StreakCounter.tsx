import { Flame, Snowflake, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getStreakMultiplier } from '@/config/questConstants';

interface Props {
  currentStreak: number;
  longestStreak: number;
  freezePasses: number;
  totalLs: number;
}

export function StreakCounter({ currentStreak, longestStreak, freezePasses, totalLs }: Props) {
  const mul = getStreakMultiplier(currentStreak);

  return (
    <Card className="p-4 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-rose-500/10 border-amber-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Flame className="w-9 h-9 text-orange-500 drop-shadow-[0_0_12px_hsl(25_95%_53%/0.5)]" />
            <div className="absolute -bottom-1 -right-1 bg-background rounded-full px-1.5 text-[10px] font-bold border border-orange-500/40">
              {currentStreak}
            </div>
          </div>
          <div>
            <p className="font-semibold text-sm">Streak hiện tại</p>
            <p className="text-xs text-muted-foreground">
              {currentStreak === 0 ? 'Hoàn thành 1 quest hôm nay để bắt đầu' : `Multiplier ×${mul.toFixed(2)}`}
            </p>
          </div>
        </div>
        <div className="text-right space-y-0.5">
          <div className="flex items-center justify-end gap-1 text-xs">
            <Trophy className="w-3 h-3 text-amber-600" />
            <span className="font-medium">Kỷ lục: {longestStreak}d</span>
          </div>
          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <Snowflake className="w-3 h-3 text-cyan-500" />
            <span>{freezePasses} freeze pass</span>
          </div>
          <div className="text-xs text-emerald-600 font-medium">
            Tổng: {Math.round(totalLs)} LS
          </div>
        </div>
      </div>
    </Card>
  );
}
