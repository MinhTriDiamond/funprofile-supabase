import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2, Sparkles, TrendingUp } from 'lucide-react';
import { useDIDEligibility } from '@/hooks/useDIDEligibility';
import { useDID } from '@/hooks/useDID';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';

export function DIDLevelProgression() {
  const { data: did, refetch } = useDID();
  const { data: checks = [], isLoading, refetch: refetchEl } = useDIDEligibility();
  const [checking, setChecking] = useState(false);

  const handleCheckPromotion = async () => {
    if (!did?.did_id) return;
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('identity-did-auto-promote', {
        body: { did_id: did.did_id, dry_run: false },
      });
      if (error) throw error;
      const result = data?.results?.[0];
      if (result?.action === 'promoted') {
        toast.success(`Đã nâng cấp ${result.current} → ${result.proposed}`, {
          description: result.reasons?.join(' · '),
        });
      } else if (result?.action === 'no_change') {
        toast.info('Chưa đủ điều kiện nâng cấp', { description: result.reasons?.join(' · ') || 'Tiếp tục tích lũy Trust' });
      }
      await Promise.all([refetch(), refetchEl()]);
    } catch (e: any) {
      toast.error('Lỗi kiểm tra', { description: e.message });
    } finally {
      setChecking(false);
    }
  };

  // Tìm cấp tiếp theo chưa đạt
  const nextLevel = checks.find((c) => !c.achieved);
  const totalReq = nextLevel?.requirements.length ?? 0;
  const metReq = nextLevel?.requirements.filter((r) => r.met).length ?? 0;
  const progress = totalReq > 0 ? (metReq / totalReq) * 100 : 100;

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-accent/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Lộ trình DID Level
          </span>
          <Button size="sm" variant="outline" onClick={handleCheckPromotion} disabled={checking || !did?.did_id} className="h-7 gap-1">
            {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            <span className="text-[11px]">Check</span>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
        ) : nextLevel ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Mục tiêu kế tiếp</span>
                <Badge variant="outline" className="font-mono">{nextLevel.level}</Badge>
              </div>
              <Progress value={progress} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground text-right">{metReq}/{totalReq} điều kiện</p>
            </div>
            <ul className="space-y-1.5">
              {nextLevel.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  {r.met ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <span className={r.met ? 'text-foreground' : 'text-muted-foreground'}>{r.label}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="text-center py-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Đã đạt cấp cao nhất</p>
          </div>
        )}
        <div className="grid grid-cols-5 gap-1 pt-2 border-t">
          {(['L0', 'L1', 'L2', 'L3', 'L4'] as const).map((lv) => {
            const isAchieved = checks.find((c) => c.level === lv)?.achieved ?? (lv === 'L0');
            const isCurrent = did?.did_level === lv;
            return (
              <div key={lv} className="text-center">
                <div className={`mx-auto w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isCurrent ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                  isAchieved ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {lv.slice(1)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
