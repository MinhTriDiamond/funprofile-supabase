import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingUp, Shield, Activity, Lock } from 'lucide-react';
import { useMintPreview } from '@/hooks/useMintPreview';
import { Skeleton } from '@/components/ui/skeleton';

export function MintPreviewCard({ userId }: { userId?: string }) {
  const { data, isLoading } = useMintPreview(userId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Dự đoán Mint</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card className="border-0 shadow-md bg-gradient-to-br from-amber-50/60 to-orange-50/40 dark:from-amber-950/30 dark:to-orange-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="w-4 h-4 text-amber-600" />
            Dự đoán Mint kỳ này
          </CardTitle>
          <Badge variant="outline" className="text-[10px] uppercase">{data.phase}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-center py-3">
          <p className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent">
            {data.eligible ? data.mint_estimate.toFixed(2) : '0.00'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">FUN ước tính</p>
          {!data.eligible && (
            <Badge variant="outline" className="mt-2 gap-1 border-amber-400 text-amber-700">
              <Lock className="w-3 h-3" /> Cần Trust ≥ {data.min_tc_to_mint}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat icon={<TrendingUp className="w-3 h-3" />} label={`ΔLS ${data.window_days}d`} value={data.delta_ls.toFixed(1)} />
          <Stat icon={<Shield className="w-3 h-3" />} label="Trust" value={data.tc.toFixed(2)} />
          <Stat icon={<Activity className="w-3 h-3" />} label="Stability" value={data.stability_index.toFixed(2)} />
        </div>

        <div className="text-[10px] font-mono text-muted-foreground bg-background/60 rounded p-2">
          {data.formula} = <span className="font-semibold">{data.raw_mint.toFixed(3)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded bg-background/80 p-2">
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">{icon}{label}</div>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
