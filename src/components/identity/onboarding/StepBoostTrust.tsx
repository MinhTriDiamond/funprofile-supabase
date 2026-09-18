import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, RefreshCw, TrendingUp, Sparkles, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useDID } from '@/hooks/useDID';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { useDIDEligibility } from '@/hooks/useDIDEligibility';
import { TrustBoostMissions } from '@/components/identity/TrustBoostMissions';

const TC_TIERS: { tier: string; min: number; label: string }[] = [
  { tier: 'T0', min: 0, label: 'Khởi đầu' },
  { tier: 'T1', min: 0.6, label: 'Được tin' },
  { tier: 'T2', min: 0.8, label: 'Tin cậy' },
  { tier: 'T3', min: 1.0, label: 'Uy tín' },
  { tier: 'T4', min: 1.25, label: 'Lõi cộng đồng' },
];

const SUBSCORE_HINTS: Record<string, { label: string; hint: string }> = {
  verification_strength: { label: 'VS · Xác thực', hint: 'Liên kết thêm ví, email, mạng xã hội' },
  behavior_stability: { label: 'BS · Ổn định', hint: 'Đăng/tương tác đều, tránh dừng dài' },
  social_trust: { label: 'SS · Mạng xã hội', hint: 'Mời guardian, nhận attestation' },
  onchain_credibility: { label: 'OS · On-chain', hint: 'Có giao dịch trao tặng thật trên chain' },
  historical_cleanliness: { label: 'HS · Sạch lịch sử', hint: 'Không vi phạm, không bị slash' },
};

export function StepBoostTrust({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: did } = useDID();
  const { data: trust, refetch: refetchTrust } = useTrustProfile();
  const { data: eligibility = [], refetch: refetchEl } = useDIDEligibility();
  const [recalcing, setRecalcing] = useState(false);

  const tc = Number(trust?.tc ?? 0);
  const currentTier = [...TC_TIERS].reverse().find((t) => tc >= t.min) ?? TC_TIERS[0];
  const nextTier = TC_TIERS.find((t) => t.min > tc);
  const progressPct = nextTier
    ? Math.min(100, Math.round(((tc - currentTier.min) / (nextTier.min - currentTier.min)) * 100))
    : 100;

  const currentLevel = did?.did_level ?? 'L0';
  const nextLevelStep = eligibility.find((e: any) => !e.achieved);

  const recalc = async () => {
    if (!did?.did_id) return;
    setRecalcing(true);
    try {
      const { error } = await supabase.functions.invoke('identity-trust-engine', {
        body: { did_id: did.did_id },
      });
      if (error) throw error;
      await Promise.all([refetchTrust(), refetchEl()]);
      qc.invalidateQueries({ queryKey: ['trust-boost-data'] });
      toast.success('Đã tính lại Trust Score');
    } catch (e: any) {
      toast.error('Không thể tính lại', { description: e.message });
    } finally {
      setRecalcing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* TC hiện tại + thanh tiến độ */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-emerald-500/5">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Trust Coefficient hiện tại</p>
              <p className="text-2xl font-bold tabular-nums">{tc.toFixed(3)}</p>
            </div>
            <div className="text-right space-y-1">
              <Badge>{currentTier.tier} · {currentTier.label}</Badge>
              <p className="text-[10px] text-muted-foreground">DID {currentLevel}</p>
            </div>
          </div>
          {nextTier ? (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Tiến độ tới {nextTier.tier} ({nextTier.label})</span>
                <span className="tabular-nums">{tc.toFixed(2)} / {nextTier.min.toFixed(2)}</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>
          ) : (
            <p className="text-[11px] text-emerald-600 font-medium">
              Bạn đã đạt tier cao nhất — tiếp tục giữ vững nhé!
            </p>
          )}
        </CardContent>
      </Card>

      {/* DID lên cấp tiếp theo */}
      {nextLevelStep && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Điều kiện nâng DID lên {nextLevelStep.level}
          </h4>
          <ul className="space-y-1.5">
            {nextLevelStep.requirements.map((r: any, i: number) => (
              <li
                key={i}
                className="flex items-center gap-2 text-xs rounded-lg border p-2.5"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    r.met ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  }`}
                />
                <span className="flex-1">{r.label}</span>
                {r.met && <Badge variant="outline" className="text-[10px] h-5">OK</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5 thanh con TC */}
      {trust && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            5 thành phần của Trust
          </h4>
          <div className="grid gap-2">
            {Object.entries(SUBSCORE_HINTS).map(([key, meta]) => {
              const val = Number((trust as any)?.[key] ?? 0);
              return (
                <div key={key} className="rounded-lg border p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{meta.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {val.toFixed(2)}
                    </span>
                  </div>
                  <Progress value={Math.min(100, val * 100)} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground">{meta.hint}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Missions */}
      <TrustBoostMissions onRecalc={recalc} />

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Quay lại
        </Button>
        <Button
          variant="outline"
          onClick={recalc}
          disabled={recalcing || !did?.did_id}
          className="flex-1"
        >
          {recalcing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Tính lại Trust
        </Button>
        <Button onClick={onNext} className="flex-1">
          Tiếp tục
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground text-center">
        Trust tăng dần theo thời gian khi bạn hoạt động tích cực. Cứ vào đây bất cứ lúc nào để cập nhật.
      </p>
    </div>
  );
}
