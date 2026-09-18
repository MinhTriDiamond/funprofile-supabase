import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, RefreshCw, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BackfillResult {
  ok: boolean;
  dry_run: boolean;
  batch_size: number;
  processed: number;
  remaining_after_batch: number;
  stats: Record<string, number>;
}

interface CumulativeProgress {
  totalInitial: number;
  totalProcessed: number;
  batchesRun: number;
  remaining: number;
  startedAt: number;       // ms
  lastBatchAt: number;     // ms
  status: 'running' | 'paused' | 'done';
  cumulativeStats: Record<string, number>;
}

const JOB_KEY = 'donations_usd_backfill';

function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m} phút ${rs} giây`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h} giờ ${rm} phút`;
}

async function loadProgress(): Promise<CumulativeProgress | null> {
  const { data, error } = await supabase
    .from('admin_repricing_progress')
    .select('*')
    .eq('job_key', JOB_KEY)
    .maybeSingle();
  if (error || !data) return null;
  return {
    totalInitial: data.total_initial,
    totalProcessed: data.total_processed,
    batchesRun: data.batches_run,
    remaining: data.remaining,
    startedAt: new Date(data.started_at).getTime(),
    lastBatchAt: new Date(data.last_batch_at).getTime(),
    status: (data.status as 'running' | 'paused' | 'done') || 'paused',
    cumulativeStats: (data.cumulative_stats as Record<string, number>) || {},
  };
}

async function saveProgress(p: CumulativeProgress) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('admin_repricing_progress').upsert({
    job_key: JOB_KEY,
    total_initial: p.totalInitial,
    total_processed: p.totalProcessed,
    batches_run: p.batchesRun,
    remaining: p.remaining,
    started_at: new Date(p.startedAt).toISOString(),
    last_batch_at: new Date(p.lastBatchAt).toISOString(),
    status: p.status,
    cumulative_stats: p.cumulativeStats,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'job_key' });
}

export function UsdRepricingCard() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [autoLoop, setAutoLoop] = useState(false);
  const [progress, setProgress] = useState<CumulativeProgress | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const stopRequestedRef = useRef(false);
  const [, setNowTick] = useState(0);

  // Khôi phục từ DB lúc mount
  useEffect(() => {
    (async () => {
      try {
        const p = await loadProgress();
        if (p) {
          // Khi reload, luôn về paused — admin tự bấm "Tiếp tục" để chạy lại
          if (p.status === 'running') {
            p.status = 'paused';
            await saveProgress(p);
          }
          setProgress(p);
        }
      } finally {
        setHydrating(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!running || !autoLoop) return;
    const id = setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running, autoLoop]);

  const runBatch = async (
    dryRun = false,
    shouldAutoLoop = false,
    resumeFrom: CumulativeProgress | null = null,
  ) => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('donations-repricing-backfill', {
        body: { batch_size: 50, dry_run: dryRun },
      });
      if (error) throw error;
      const r = data as BackfillResult;
      setResult(r);

      if (shouldAutoLoop && !dryRun) {
        const now = Date.now();
        const base = resumeFrom ?? progress;
        let next: CumulativeProgress;
        if (!base) {
          const totalInitial = r.processed + r.remaining_after_batch;
          next = {
            totalInitial,
            totalProcessed: r.processed,
            batchesRun: 1,
            remaining: r.remaining_after_batch,
            startedAt: now,
            lastBatchAt: now,
            status: r.remaining_after_batch === 0 ? 'done' : 'running',
            cumulativeStats: { ...r.stats },
          };
        } else {
          const merged: Record<string, number> = { ...base.cumulativeStats };
          for (const [k, v] of Object.entries(r.stats)) {
            if (k === 'fun_zeroed') merged[k] = v;
            else merged[k] = (merged[k] || 0) + v;
          }
          // Nếu tổng còn lại bây giờ > totalInitial - totalProcessed (do user khác cũng chạy hoặc data mới),
          // mở rộng totalInitial để thanh tiến trình không vượt 100%
          const newTotalProcessed = base.totalProcessed + r.processed;
          const expectedTotal = newTotalProcessed + r.remaining_after_batch;
          const totalInitial = Math.max(base.totalInitial, expectedTotal);
          next = {
            ...base,
            totalInitial,
            totalProcessed: newTotalProcessed,
            batchesRun: base.batchesRun + 1,
            remaining: r.remaining_after_batch,
            lastBatchAt: now,
            status: r.remaining_after_batch === 0 ? 'done' : 'running',
            cumulativeStats: merged,
          };
        }
        setProgress(next);
        // Lưu DB (fire-and-forget; không block loop)
        saveProgress(next).catch((e) => console.warn('saveProgress failed', e));

        toast.success(`Đã xử lý ${r.processed} donation. Còn ${r.remaining_after_batch} chờ.`);

        if (r.remaining_after_batch > 0 && !stopRequestedRef.current) {
          setTimeout(() => runBatch(false, true, next), 3000);
          return;
        }

        // Kết thúc loop
        setAutoLoop(false);
        if (r.remaining_after_batch === 0) {
          toast.success('🎉 Hoàn tất backfill toàn bộ donation!');
        } else if (stopRequestedRef.current) {
          const paused: CumulativeProgress = { ...next, status: 'paused' };
          setProgress(paused);
          saveProgress(paused).catch(() => {});
        }
      } else {
        toast.success(`Đã xử lý ${r.processed} donation. Còn ${r.remaining_after_batch} chờ.`);
      }
      setRunning(false);
      stopRequestedRef.current = false;
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
      setRunning(false);
      setAutoLoop(false);
      stopRequestedRef.current = false;
      if (progress) {
        const paused: CumulativeProgress = { ...progress, status: 'paused' };
        setProgress(paused);
        saveProgress(paused).catch(() => {});
      }
    }
  };

  const startAutoLoop = () => {
    stopRequestedRef.current = false;
    setProgress(null);
    setAutoLoop(true);
    runBatch(false, true, null);
  };

  const resumeAutoLoop = () => {
    if (!progress) return;
    stopRequestedRef.current = false;
    setAutoLoop(true);
    runBatch(false, true, { ...progress, status: 'running' });
  };

  const stopAutoLoop = () => {
    stopRequestedRef.current = true;
    setAutoLoop(false);
    toast.info('Sẽ dừng sau khi batch hiện tại hoàn tất.');
  };

  const clearProgress = async () => {
    await supabase.from('admin_repricing_progress').delete().eq('job_key', JOB_KEY);
    setProgress(null);
    toast.success('Đã xóa tiến trình lưu trữ.');
  };

  const now = Date.now();
  let etaMs = 0;
  let percent = 0;
  let avgPerBatchMs = 0;
  let elapsedMs = 0;
  if (progress && progress.totalInitial > 0) {
    percent = Math.min(100, (progress.totalProcessed / progress.totalInitial) * 100);
    elapsedMs = now - progress.startedAt;
    if (progress.batchesRun > 0 && progress.totalProcessed > 0) {
      const msPerDonation = elapsedMs / progress.totalProcessed;
      etaMs = msPerDonation * progress.remaining;
      avgPerBatchMs = elapsedMs / progress.batchesRun;
    }
  }

  const statusLabel =
    !progress ? '' :
    progress.status === 'done' ? '✅ Hoàn tất' :
    autoLoop ? '⏳ Đang chạy tự động...' :
    progress.status === 'paused' ? '⏸ Tạm dừng (có thể tiếp tục)' :
    '⏸ Đã dừng';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          Backfill USD theo giá lịch sử
        </CardTitle>
        <CardDescription className="space-y-1">
          <p>• <b>FUN</b> (testnet) sẽ được zero-out — hiển thị "—" trên UI.</p>
          <p>• <b>CAMLY / USDT / BNB / BTC / BTCB / ETH</b> sẽ được tính lại theo giá CoinGecko vào ngày donate.</p>
          <p>• Mỗi batch xử lý 50 donation. Tiến trình được <b>lưu DB</b> — tải lại trang sẽ khôi phục.</p>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => runBatch(true, false)} disabled={running || hydrating} variant="outline" size="sm">
            {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Dry-run
          </Button>
          <Button
            onClick={() => { setAutoLoop(false); runBatch(false, false); }}
            disabled={running || hydrating}
            size="sm"
          >
            {running && !autoLoop ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Chạy 1 batch
          </Button>
          {progress && progress.status === 'paused' && progress.remaining > 0 ? (
            <Button onClick={resumeAutoLoop} disabled={running || hydrating} variant="default" size="sm">
              {running && autoLoop ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Tiếp tục từ tiến trình đã lưu
            </Button>
          ) : (
            <Button onClick={startAutoLoop} disabled={running || hydrating} variant="default" size="sm">
              {running && autoLoop ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Chạy tự động đến hết
            </Button>
          )}
          {autoLoop && (
            <Button onClick={stopAutoLoop} variant="destructive" size="sm" disabled={stopRequestedRef.current}>
              {stopRequestedRef.current ? 'Đang dừng...' : 'Dừng auto'}
            </Button>
          )}
          {progress && !autoLoop && (
            <Button onClick={clearProgress} variant="ghost" size="sm" disabled={running}>
              Xóa tiến trình lưu
            </Button>
          )}
        </div>

        {hydrating && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Đang khôi phục tiến trình từ DB...
          </p>
        )}

        {progress && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{statusLabel}</span>
              <span className="font-mono text-primary font-bold">{percent.toFixed(1)}%</span>
            </div>
            <Progress value={percent} className="h-3" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="space-y-0.5">
                <p className="text-muted-foreground">Đã xử lý</p>
                <p className="font-mono font-bold text-base">
                  {progress.totalProcessed.toLocaleString('vi-VN')}
                  <span className="text-muted-foreground font-normal">/{progress.totalInitial.toLocaleString('vi-VN')}</span>
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-muted-foreground">Còn lại</p>
                <p className="font-mono font-bold text-base text-amber-600">
                  {progress.remaining.toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-muted-foreground">Đã trôi qua</p>
                <p className="font-mono font-bold text-base">{formatDuration(elapsedMs)}</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-muted-foreground">ETA còn lại</p>
                <p className="font-mono font-bold text-base text-emerald-600">
                  {progress.remaining === 0 ? '—' : (autoLoop ? formatDuration(etaMs) : 'Tạm dừng')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-2 border-t font-mono">
              <p>Batch đã chạy: <b>{progress.batchesRun}</b></p>
              <p>TB/batch: <b>{formatDuration(avgPerBatchMs)}</b></p>
              <p>Repriced: <b>{progress.cumulativeStats.donations_repriced || 0}</b></p>
              <p>Skip (no price): <b>{progress.cumulativeStats.donations_skipped_no_price || 0}</b></p>
              <p>CG fetched: <b>{progress.cumulativeStats.prices_fetched_from_cg || 0}</b></p>
              <p>Cache hit: <b>{progress.cumulativeStats.prices_used_from_cache || 0}</b></p>
              <p className="col-span-full">FUN zeroed (snapshot): <b>{progress.cumulativeStats.fun_zeroed || 0}</b></p>
              <p className="col-span-full text-muted-foreground">
                Bắt đầu: {new Date(progress.startedAt).toLocaleString('vi-VN')} · Batch cuối: {new Date(progress.lastBatchAt).toLocaleString('vi-VN')}
              </p>
            </div>
          </div>
        )}

        {result && !progress && (
          <div className="text-sm bg-muted/50 rounded-lg p-3 space-y-1 font-mono">
            <p>Đã xử lý: <b>{result.processed}</b> / Còn lại: <b>{result.remaining_after_batch}</b></p>
            <p>FUN zeroed: {result.stats.fun_zeroed}</p>
            <p>Donations repriced: {result.stats.donations_repriced}</p>
            <p>Skip (no price): {result.stats.donations_skipped_no_price}</p>
            <p>Giá fetch CG: {result.stats.prices_fetched_from_cg} / Cache hit: {result.stats.prices_used_from_cache}</p>
            {result.dry_run && <p className="text-amber-600">(dry-run, chưa ghi DB)</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
