import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Rocket } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useTrustBoostData } from '@/hooks/useNextBestAction';

interface Props {
  onRecalc?: () => void;
}

export function TrustBoostMissions({ onRecalc }: Props) {
  const navigate = useNavigate();
  const { data } = useTrustBoostData();
  const missions = data?.missions ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Rocket className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold">Gợi ý tăng uy tín nhanh</h3>
      </div>
      <div className="grid gap-2">
        {missions.map((m) => {
          const Icon = (Icons as any)[m.icon] ?? Icons.Sparkles;
          const handleClick = () => {
            if (m.cta.action === 'open-recalc') return onRecalc?.();
            if (m.cta.to) navigate(m.cta.to);
          };
          return (
            <Card
              key={m.key}
              className={`p-3 transition-all ${
                m.done
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'hover:border-amber-500/40 hover:bg-amber-500/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    m.done
                      ? 'bg-emerald-500/20 text-emerald-600'
                      : 'bg-gradient-to-br from-emerald-500/15 to-amber-500/15 text-amber-600'
                  }`}
                >
                  {m.done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium leading-tight">{m.label}</p>
                    {m.tcDelta > 0 && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] py-0 px-1.5 ${
                          m.done
                            ? 'border-emerald-500/40 text-emerald-600'
                            : 'border-amber-500/50 text-amber-600'
                        }`}
                      >
                        +{m.tcDelta.toFixed(2)} TC
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{m.description}</p>
                </div>
                <Button
                  size="sm"
                  variant={m.done ? 'outline' : 'default'}
                  disabled={m.done && m.cta.action !== 'open-recalc'}
                  onClick={handleClick}
                  className="shrink-0 text-xs h-8"
                >
                  {m.cta.label}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
