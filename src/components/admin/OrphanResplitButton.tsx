import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wrench, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ResplitResult {
  success: boolean;
  dry_run: boolean;
  orphans_found: number;
  planned: number;
  errors: Array<{ id: string; error?: string; reason?: string }>;
  plan: Array<{
    parent_id: string;
    user_id: string;
    original_amount_fun: number;
    child1: { action: string; amount_fun: number };
    child2: { action: string; amount_fun: number } | null;
  }>;
}

export function OrphanResplitButton() {
  const [loading, setLoading] = useState<'dry' | 'apply' | null>(null);
  const [result, setResult] = useState<ResplitResult | null>(null);

  const run = async (dryRun: boolean) => {
    setLoading(dryRun ? 'dry' : 'apply');
    try {
      const { data, error } = await supabase.functions.invoke('pplp-resplit-orphan-parents', {
        body: { dry_run: dryRun, limit: 20 },
      });
      if (error) throw error;
      setResult(data as ResplitResult);
      const r = data as ResplitResult;
      if (r.success) {
        toast.success(
          dryRun
            ? `Quét xong: ${r.orphans_found} parent mồ côi, ${r.planned} có thể sửa.`
            : `Đã sửa ${r.planned}/${r.orphans_found} parent. Cron auto-submit sẽ chạy tiếp.`
        );
      }
    } catch (e: any) {
      toast.error(e?.message || 'Lỗi không xác định');
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card className="border-orange-500/40 bg-gradient-to-br from-orange-500/10 via-background to-background">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-orange-500" />
            <div>
              <div className="font-semibold text-foreground">
                Khôi phục parent mint mồ côi
              </div>
              <div className="text-xs text-muted-foreground">
                Sửa các lệnh `split_parent` không có dòng con (5 user T4/2026 đang kẹt 1.050.000 FUN/người).
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(true)}
              disabled={loading !== null}
            >
              {loading === 'dry' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Quét thử'}
            </Button>
            <Button
              size="sm"
              onClick={() => run(false)}
              disabled={loading !== null}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {loading === 'apply' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Khôi phục ngay'}
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                {result.planned} đã xử lý
              </Badge>
              <Badge variant="outline">Mồ côi: {result.orphans_found}</Badge>
              {result.errors.length > 0 && (
                <Badge variant="outline" className="gap-1 border-red-500/40">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  {result.errors.length} lỗi
                </Badge>
              )}
              {result.dry_run && <Badge variant="secondary">Dry run</Badge>}
            </div>
            {result.plan.length > 0 && (
              <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs space-y-1 max-h-48 overflow-auto">
                {result.plan.map((p) => (
                  <div key={p.parent_id} className="font-mono">
                    {p.parent_id.slice(0, 8)} · {p.original_amount_fun.toLocaleString('vi-VN')} FUN →
                    {' '}{p.child1.action}/{p.child1.amount_fun.toLocaleString('vi-VN')}
                    {p.child2 && ` + ${p.child2.action}/${p.child2.amount_fun.toLocaleString('vi-VN')}`}
                  </div>
                ))}
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs space-y-1">
                {result.errors.map((e, i) => (
                  <div key={i} className="font-mono text-red-600 dark:text-red-400">
                    {e.id.slice(0, 8)}: {e.error || e.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
