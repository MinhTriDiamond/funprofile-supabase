import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useTrustBoostData } from '@/hooks/useNextBestAction';

interface Props {
  onOpenGuide?: () => void;
}

export function NextBestAction({ onOpenGuide }: Props) {
  const navigate = useNavigate();
  const { data } = useTrustBoostData();
  const next = data?.next;

  if (!next) return null;

  return (
    <Card className="border-0 shadow-[0_4px_24px_-8px_hsl(var(--primary)/0.25)] bg-gradient-to-r from-emerald-500/10 via-amber-400/10 to-emerald-500/10 backdrop-blur-sm">
      <div className="p-4 flex items-start sm:items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-amber-400 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20 animate-pulse">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-emerald-600/80">
            ✨ Hành động tốt nhất tiếp theo
          </p>
          <p className="text-sm font-bold mt-0.5">{next.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{next.reason}</p>
        </div>
        <div className="flex gap-2 ml-auto">
          {onOpenGuide && (
            <Button size="sm" variant="ghost" onClick={onOpenGuide} className="text-xs">
              Xem tất cả
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => (next.to ? navigate(next.to) : onOpenGuide?.())}
            className="gap-1 bg-gradient-to-r from-emerald-500 to-amber-500 hover:opacity-90 text-white shadow-md"
          >
            {next.ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
