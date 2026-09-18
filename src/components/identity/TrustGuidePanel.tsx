import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { CheckCircle2, Circle, Loader2, Sparkles, Rocket, ShieldCheck, ArrowRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDID } from '@/hooks/useDID';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { useDIDEligibility } from '@/hooks/useDIDEligibility';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TrustBoostMissions } from './TrustBoostMissions';
import { NextBestAction } from './NextBestAction';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const TIER_PERKS: Record<string, string[]> = {
  T0: ['Xem nội dung', 'Hoàn thành quest (chưa nhận LS)'],
  T1: ['Nhận Light Score', 'Mở Daily Quests', 'Tham gia Connector'],
  T2: ['Vote governance', 'Gift Boost x1.2', 'Tăng trust multiplier'],
  T3: ['Đề xuất governance', 'Mở AI reputation', 'Tăng SoftCeiling cá nhân'],
  T4: ['Validator quyền', 'Tham gia governance đầy đủ'],
};

export function TrustGuidePanel({ open, onOpenChange }: Props) {
  const isMobile = useIsMobile();
  const { data: did, refetch: refetchDid } = useDID();
  const { data: trust, refetch: refetchTrust } = useTrustProfile();
  const { data: checks = [], refetch: refetchEl } = useDIDEligibility();
  const [recalcLoading, setRecalcLoading] = useState(false);

  const tier = trust?.trust_tier ?? 'T0';
  const tc = Number(trust?.tc ?? 0);
  const sybil = trust?.sybil_risk ?? 'medium';
  const currentLevel = did?.did_level ?? 'L0';
  const nextLevel = checks.find((c) => !c.achieved);
  const totalReq = nextLevel?.requirements.length ?? 0;
  const metReq = nextLevel?.requirements.filter((r) => r.met).length ?? 0;
  const progressPct = totalReq > 0 ? (metReq / totalReq) * 100 : 100;

  // Tier requirements (frontend-derived, khớp engine T1 = TC ≥ 0.60 + sybil ≠ high)
  const tierRequirements = (() => {
    if (tier !== 'T0') return [];
    return [
      { label: `TC ≥ 0.60 (hiện ${tc.toFixed(2)})`, met: tc >= 0.60 },
      { label: `Sybil risk ≠ High (hiện ${sybil})`, met: sybil !== 'high' },
    ];
  })();

  const handleRecalc = async () => {
    if (!did?.did_id) return;
    setRecalcLoading(true);
    try {
      const { error } = await supabase.functions.invoke('identity-trust-engine', {
        body: { did_id: did.did_id },
      });
      if (error) throw error;
      toast.success('Đã tính lại Trust Score', { description: 'Cập nhật TC và Tier mới' });
      await Promise.all([refetchDid(), refetchTrust(), refetchEl()]);
    } catch (e: any) {
      toast.error('Lỗi tính lại', { description: e.message });
    } finally {
      setRecalcLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={`p-0 overflow-hidden flex flex-col ${
          isMobile ? 'h-[92vh] rounded-t-2xl' : 'w-full sm:max-w-md'
        }`}
      >
        <div className="bg-gradient-to-br from-emerald-500/10 via-amber-400/5 to-emerald-500/10 border-b border-border/50 px-5 py-4 shrink-0">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Cách tăng Trust
            </SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mt-1">
            Hướng dẫn nâng level account, mở khóa Light Score và quest
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* A. Level hiện tại */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                Cấp hiện tại
              </span>
              <div className="flex gap-2">
                <Badge variant="outline" className="font-mono">{currentLevel}</Badge>
                <Badge
                  variant="outline"
                  className={`font-mono ${tier === 'T0' ? 'border-amber-500/50 text-amber-600' : 'border-emerald-500/50 text-emerald-600'}`}
                >
                  {tier} · TC {tc.toFixed(2)}
                </Badge>
              </div>
            </div>
            <Card className="p-3 bg-muted/30 border-0">
              <p className="text-[11px] font-semibold mb-1.5">Bạn đang có:</p>
              <ul className="text-xs space-y-1">
                {(TIER_PERKS[tier] ?? []).map((p) => (
                  <li key={p} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* B. Next best action */}
          <NextBestAction />

          {/* C. Checklist tiến lên Tier T1 */}
          {tier === 'T0' && tierRequirements.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Để lên Trust Tier T1
                </span>
              </div>
              <Card className="p-3 border-amber-500/30 bg-amber-500/5">
                <ul className="space-y-1.5">
                  {tierRequirements.map((r) => (
                    <li key={r.label} className="flex items-center gap-2 text-xs">
                      {r.met ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className={r.met ? 'text-foreground' : 'text-muted-foreground'}>
                        {r.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {/* D. Checklist DID Level kế tiếp */}
          {nextLevel && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Để lên DID {nextLevel.level}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {metReq}/{totalReq} điều kiện
                </span>
              </div>
              <Progress value={progressPct} className="h-1.5" />
              <Card className="p-3 border-0 bg-muted/30">
                <ul className="space-y-1.5">
                  {nextLevel.requirements.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      {r.met ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className={r.met ? 'text-foreground' : 'text-muted-foreground'}>
                        {r.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {/* E. Trust Boost Missions */}
          <TrustBoostMissions onRecalc={handleRecalc} />

          <p className="text-[10px] text-muted-foreground text-center pt-2">
            Sau khi hoàn thành, bấm <strong>Tính lại Trust</strong> để cập nhật TC ngay
          </p>
        </div>

        <div className="border-t border-border/50 p-3 flex gap-2 shrink-0 bg-background">
          <Button
            variant="outline"
            onClick={handleRecalc}
            disabled={recalcLoading || !did?.did_id}
            className="flex-1 gap-1"
          >
            {recalcLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            Tính lại Trust
          </Button>
          <Button asChild className="flex-1 gap-1 bg-gradient-to-r from-emerald-500 to-amber-500 text-white">
            <Link to="/identity/onboarding" onClick={() => onOpenChange(false)}>
              Onboarding <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
