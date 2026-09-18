import { useQuests, useQuestStreak } from '@/hooks/useQuests';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Flame, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function QuestWidget() {
  const { data: quests } = useQuests();
  const { data: streak } = useQuestStreak();

  const incomplete = (quests ?? [])
    .filter((q) => !q.progress?.completed_at && q.frequency === 'daily')
    .sort((a, b) => (b.current / b.target_count) - (a.current / a.target_count))
    .slice(0, 3);

  if (!quests || quests.length === 0) return null;

  return (
    <Card className="p-3 bg-gradient-to-br from-primary/5 to-amber-500/5 border-primary/20">
      <Link to="/quests" className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Quest hôm nay</h3>
          {(streak?.current_streak ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-orange-500 font-medium">
              <Flame className="w-3 h-3" /> {streak?.current_streak}d
            </span>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </Link>

      {incomplete.length === 0 ? (
        <p className="text-xs text-emerald-600 font-medium">✨ Đã hoàn thành tất cả quest hôm nay!</p>
      ) : (
        <div className="space-y-2">
          {incomplete.map((q) => (
            <div key={q.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-medium">{q.title_vi}</span>
                <span className="text-muted-foreground shrink-0 ml-2">{q.current}/{q.target_count}</span>
              </div>
              <Progress value={Math.min(100, (q.current / q.target_count) * 100)} className="h-1" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
