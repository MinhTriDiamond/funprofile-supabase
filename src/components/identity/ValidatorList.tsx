import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { useAllValidators } from '@/hooks/useEntityProfiles';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  jailed: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
  exited: 'bg-slate-500/10 text-slate-600 border-slate-500/30',
  slashed: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
};

export function ValidatorList() {
  const { data: validators = [], isLoading } = useAllValidators();

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />Validators</h3>
        <p className="text-xs text-muted-foreground">Danh sách validator đang stake FUN</p>
      </div>
      {isLoading ? <Skeleton className="h-24" /> : validators.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Chưa có validator nào</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {validators.map((v: any) => (
            <Card key={v.did_id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{v.display_name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{v.did_id}</p>
                  </div>
                  <Badge className={STATUS_COLOR[v.status] ?? ''} variant="outline">{v.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
                  <div className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-primary" />{Number(v.stake_amount).toLocaleString()} FUN</div>
                  <div className="flex items-center gap-1"><Activity className="w-3 h-3 text-emerald-500" />{Number(v.uptime_pct).toFixed(1)}%</div>
                  <div className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" />{v.slash_count} slash</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
