import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles } from 'lucide-react';

interface Props {
  currentTier?: string | null;
}

const TIERS = [
  { key: 'T0', label: 'T0 · Unknown', perks: ['Xem nội dung', 'Hoàn thành quest (LS=0)'], color: 'amber' },
  { key: 'T1', label: 'T1 · Trusted', perks: ['Nhận Light Score', 'Mở Daily Quests', 'Connector'], color: 'emerald' },
  { key: 'T2', label: 'T2 · Verified', perks: ['Vote governance', 'Gift Boost ×1.2'], color: 'sky' },
  { key: 'T3', label: 'T3 · Reputable', perks: ['Đề xuất governance', 'AI reputation'], color: 'violet' },
  { key: 'T4', label: 'T4 · Validator', perks: ['Validator quyền', 'Governance đầy đủ'], color: 'rose' },
];

export function TrustJourneyTimeline({ currentTier }: Props) {
  const currentIdx = TIERS.findIndex((t) => t.key === (currentTier ?? 'T0'));

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-500/5 via-background to-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold">Trust Journey</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">
          Đang ở {currentTier ?? 'T0'}
        </span>
      </div>

      <TooltipProvider delayDuration={150}>
        <div className="relative overflow-x-auto pb-2">
          <div className="flex items-center justify-between gap-1 min-w-[480px]">
            {TIERS.map((t, i) => {
              const isCurrent = i === currentIdx;
              const isPast = i < currentIdx;
              const isFuture = i > currentIdx;
              return (
                <div key={t.key} className="flex items-center flex-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="flex flex-col items-center gap-1 group">
                        <div
                          className={`relative w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            isCurrent
                              ? 'bg-gradient-to-br from-emerald-500 to-amber-400 text-white shadow-lg shadow-emerald-500/30 ring-4 ring-emerald-500/20 scale-110 animate-pulse'
                              : isPast
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/40'
                              : 'bg-muted text-muted-foreground border border-dashed border-muted-foreground/40'
                          }`}
                        >
                          {t.key}
                        </div>
                        <span
                          className={`text-[10px] font-medium ${
                            isCurrent ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {t.label.split('·')[1]?.trim() ?? t.key}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px]">
                      <p className="font-semibold mb-1">{t.label}</p>
                      <ul className="text-[11px] space-y-0.5">
                        {t.perks.map((p) => (
                          <li key={p}>• {p}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                  {i < TIERS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 ${
                        isPast || isCurrent
                          ? 'bg-gradient-to-r from-emerald-500/60 to-amber-400/60'
                          : 'bg-muted-foreground/20 border-t border-dashed border-muted-foreground/30'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </TooltipProvider>
    </Card>
  );
}
