import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, RefreshCw, PlayCircle, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const ENGINES = [
  { name: 'pplp-v25-intent-calculator', label: 'IIS Calculator', desc: 'Tính Intent Integrity Score (0–1.5)', icon: '🛡️' },
  { name: 'pplp-v25-impact-calculator', label: 'IM Calculator',  desc: 'Tính Impact Multiplier (0–3.0)',     icon: '✨' },
  { name: 'pplp-v25-aggregate',         label: 'Aggregator',     desc: 'Gộp PLS/NLS/LLS → TLS → Display',    icon: '🔗' },
  { name: 'pplp-v25-tier-assigner',     label: 'Tier Assigner',  desc: 'Gán tier theo RawLS',                icon: '🏆' },
];

export function PPLPv25EnginePanel() {
  const [running, setRunning] = useState<string | null>(null);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [lastResults, setLastResults] = useState<Record<string, any>>({});

  const runEngine = async (name: string) => {
    setRunning(name);
    try {
      const { data, error } = await supabase.functions.invoke(name, { body: {} });
      if (error) throw error;
      setLastResults(prev => ({ ...prev, [name]: data }));
      toast.success(`${name}: thành công`, { description: JSON.stringify(data).slice(0, 100) });
    } catch (e: any) {
      toast.error(`${name} lỗi`, { description: e.message });
    } finally {
      setRunning(null);
    }
  };

  const runBackfill = async (dry_run: boolean) => {
    setBackfillRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('pplp-v25-backfill', { body: { dry_run } });
      if (error) throw error;
      setLastResults(prev => ({ ...prev, backfill: data }));
      toast.success(dry_run ? 'Dry-run xong' : 'Backfill v2.5 hoàn tất', {
        description: JSON.stringify(data).slice(0, 150),
      });
    } catch (e: any) {
      toast.error('Backfill lỗi', { description: e.message });
    } finally {
      setBackfillRunning(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-fuchsia-500" />
            PPLP v2.5 — Engine Control
          </CardTitle>
          <Badge variant="outline">α=0.4 · β=0.3 · γ=0.3</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Backfill */}
        <div className="rounded-lg border-2 border-dashed border-fuchsia-300 dark:border-fuchsia-800 p-4 bg-fuchsia-50/50 dark:bg-fuchsia-950/20">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="font-semibold text-sm flex items-center gap-1.5">
                🔄 Backfill toàn bộ lịch sử
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quét toàn bộ light_actions + pplp_v2_user_actions, tính lại VVU, aggregate và gán tier.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm" variant="outline" onClick={() => runBackfill(true)} disabled={backfillRunning}
            >
              {backfillRunning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
              Dry-run (xem trước)
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={backfillRunning}>
                  <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                  Execute Backfill
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xác nhận Backfill v2.5</AlertDialogTitle>
                  <AlertDialogDescription>
                    Quá trình này có thể mất 5–10 phút và sẽ ghi log đầy đủ vào pplp_v2_event_log. Tiếp tục?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction onClick={() => runBackfill(false)}>Tiếp tục</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {lastResults.backfill && (
            <pre className="mt-3 text-[10px] bg-background/80 rounded p-2 overflow-x-auto max-h-32">
              {JSON.stringify(lastResults.backfill, null, 2)}
            </pre>
          )}
        </div>

        {/* 4 engines */}
        <div className="grid gap-2 sm:grid-cols-2">
          {ENGINES.map(eng => (
            <div key={eng.name} className="rounded-lg border p-3 bg-card">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-sm flex items-center gap-1.5">
                    <span>{eng.icon}</span> {eng.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{eng.desc}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => runEngine(eng.name)} disabled={running === eng.name}>
                  {running === eng.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </Button>
              </div>
              {lastResults[eng.name] && (
                <p className="text-[10px] text-muted-foreground truncate">
                  ✓ {JSON.stringify(lastResults[eng.name]).slice(0, 80)}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
