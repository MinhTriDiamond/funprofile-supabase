import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, User2, Network, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { TierBadge } from './TierBadge';
import { IISIndicator } from './IISIndicator';
import { ImpactRingChart } from './ImpactRingChart';

interface V25Score {
  pls: number; nls: number; lls: number; tls: number;
  raw_ls: number; display_ls: number;
  consistency_multiplier: number; reliability_multiplier: number;
  alpha: number; beta: number; gamma: number;
  snapshot_at: string;
}

export function LightScoreV25Card() {
  const [score, setScore] = useState<V25Score | null>(null);
  const [tier, setTier] = useState<string>('Seed Light');
  const [iis, setIis] = useState<number>(1.0);
  const [im, setIm] = useState<number>(1.0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const uid = session.user.id;

      const [lsRes, tierRes, intentRes, impactRes] = await Promise.all([
        supabase.from('pplp_v25_light_scores').select('*').eq('user_id', uid).eq('is_current', true).maybeSingle(),
        supabase.from('pplp_v25_tier_assignments').select('tier_name').eq('user_id', uid).eq('is_current', true).maybeSingle(),
        supabase.from('pplp_v25_intent_metrics').select('iis_value').eq('user_id', uid).maybeSingle(),
        supabase.from('pplp_v25_impact_metrics').select('im_value').eq('user_id', uid).order('computed_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (cancelled) return;
      if (lsRes.data) setScore(lsRes.data as any);
      if (tierRes.data) setTier(tierRes.data.tier_name);
      if (intentRes.data) setIis(Number(intentRes.data.iis_value));
      if (impactRes.data) setIm(Number(impactRes.data.im_value));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  if (!score) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
        <CardContent className="py-6 text-center">
          <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">PPLP v2.5 Light Score chưa được tính. Hãy chờ lần aggregate kế tiếp hoặc liên hệ admin chạy backfill.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 via-purple-50 to-fuchsia-50 dark:from-indigo-950/30 dark:via-purple-950/30 dark:to-fuchsia-950/30 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-fuchsia-500" />
            <span className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent">
              PPLP v2.5 — Light Score
            </span>
          </CardTitle>
          <TierBadge tier={tier} size="sm" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Headline */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent">
              {Math.round(score.display_ls).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Display Light · Raw {Math.round(score.raw_ls).toLocaleString()}
            </p>
          </div>
          <ImpactRingChart value={im} size={72} />
        </div>

        {/* IIS */}
        <IISIndicator value={iis} />

        {/* 3 tầng */}
        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid grid-cols-3 w-full h-9">
            <TabsTrigger value="personal" className="text-xs"><User2 className="w-3 h-3 mr-1" />Personal</TabsTrigger>
            <TabsTrigger value="network" className="text-xs"><Network className="w-3 h-3 mr-1" />Network</TabsTrigger>
            <TabsTrigger value="legacy" className="text-xs"><Crown className="w-3 h-3 mr-1" />Legacy</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Personal Light (PLS)</span>
              <span className="font-semibold">{Math.round(score.pls).toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Trọng số α = {score.alpha} · Consistency × {score.consistency_multiplier.toFixed(2)} · Reliability × {score.reliability_multiplier.toFixed(2)}
            </p>
          </TabsContent>

          <TabsContent value="network" className="mt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Network Light (NLS)</span>
              <span className="font-semibold">{Math.round(score.nls).toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Trọng số β = {score.beta} · Đo năng lực lan tỏa ánh sáng cho người khác.
            </p>
          </TabsContent>

          <TabsContent value="legacy" className="mt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Legacy Light (LLS)</span>
              <span className="font-semibold">{Math.round(score.lls).toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Trọng số γ = {score.gamma} · Khuyến khích di sản dài hạn.
            </p>
          </TabsContent>
        </Tabs>

        {/* Footer formula */}
        <div className="bg-muted/50 rounded-lg px-3 py-2 text-[11px] text-muted-foreground text-center">
          TLS = {score.alpha}·PLS + {score.beta}·NLS + {score.gamma}·LLS = <strong>{Math.round(score.tls).toLocaleString()}</strong>
        </div>
      </CardContent>
    </Card>
  );
}
