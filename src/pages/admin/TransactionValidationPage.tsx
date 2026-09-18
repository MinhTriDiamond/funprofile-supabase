/**
 * TransactionValidationPage — M5.5A
 *
 * 3 tab tối giản (admin-only, đọc dữ liệu Validation):
 *  - Snapshot Compare: chạy edge `tx-snapshot-compare` cho 1 user_id, hiển thị diff.
 *  - Shadow Diffs: bảng `tx_shadow_diffs` (mới nhất).
 *  - Performance: tổng hợp p50/p95 từ `tx_perf_samples` theo surface/op (24h).
 *
 * Không sửa dữ liệu transaction. Read + log only.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type SurfaceKey = string;

function percentile(arr: number[], p: number) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}

function SnapshotTab() {
  const [userId, setUserId] = useState('');
  const [save, setSave] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const recent = useQuery({
    queryKey: ['admin', 'tx_validation_snapshots', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tx_validation_snapshots')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  async function run() {
    if (!userId.trim()) { toast.error('Cần nhập user_id'); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('tx-snapshot-compare', {
        body: { user_id: userId.trim(), save },
      });
      if (error) throw error;
      setResult(data as Record<string, unknown>);
      toast.success('Đã chạy snapshot compare');
      recent.refetch();
    } catch (e) {
      toast.error((e as Error).message || 'Lỗi snapshot compare');
    } finally { setRunning(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Chạy snapshot cho 1 user</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="user_id (uuid)" value={userId} onChange={(e) => setUserId(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
              Lưu vào tx_validation_snapshots
            </label>
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Run compare
            </Button>
          </div>
          {result && (
            <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-96">{JSON.stringify(result, null, 2)}</pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">20 snapshot gần nhất</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => recent.refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {recent.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1 pr-3">Tạo lúc</th><th className="py-1 pr-3">User</th><th className="py-1 pr-3">Legacy</th><th className="py-1 pr-3">Unified</th><th className="py-1 pr-3">Diff</th><th className="py-1 pr-3">Status</th></tr>
                </thead>
                <tbody>
                  {(recent.data ?? []).map((r: Record<string, unknown>) => (
                    <tr key={String(r.id)} className="border-t">
                      <td className="py-1 pr-3">{new Date(String(r.created_at)).toLocaleString()}</td>
                      <td className="py-1 pr-3 font-mono">{String(r.user_id ?? '').slice(0, 8)}</td>
                      <td className="py-1 pr-3">{String(r.legacy_count ?? '-')}</td>
                      <td className="py-1 pr-3">{String(r.unified_count ?? '-')}</td>
                      <td className="py-1 pr-3">{String(r.diff_count ?? '-')}</td>
                      <td className="py-1 pr-3">
                        <Badge variant={r.status === 'match' ? 'secondary' : 'destructive'}>{String(r.status ?? '-')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShadowDiffsTab() {
  const q = useQuery({
    queryKey: ['admin', 'tx_shadow_diffs', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tx_shadow_diffs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Shadow Diffs (100 mới nhất)</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">Lúc</th><th className="py-1 pr-3">Surface</th><th className="py-1 pr-3">Loại</th>
                  <th className="py-1 pr-3">Legacy</th><th className="py-1 pr-3">Unified</th><th className="py-1 pr-3">Δ count</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r: Record<string, unknown>) => (
                  <tr key={String(r.id)} className="border-t">
                    <td className="py-1 pr-3">{new Date(String(r.created_at)).toLocaleString()}</td>
                    <td className="py-1 pr-3">{String(r.surface ?? '-')}</td>
                    <td className="py-1 pr-3"><Badge variant="outline">{String(r.diff_type ?? '-')}</Badge></td>
                    <td className="py-1 pr-3">{String(r.legacy_count ?? '-')}</td>
                    <td className="py-1 pr-3">{String(r.unified_count ?? '-')}</td>
                    <td className="py-1 pr-3">{Number(r.unified_count ?? 0) - Number(r.legacy_count ?? 0)}</td>
                  </tr>
                ))}
                {(q.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="py-3 text-muted-foreground">Chưa có shadow diff nào. ✅</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PerformanceTab() {
  const q = useQuery({
    queryKey: ['admin', 'tx_perf_samples', '24h'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from('tx_perf_samples')
        .select('surface,op,ms,payload_bytes,created_at')
        .gte('created_at', since)
        .limit(5000);
      if (error) throw error;
      return data;
    },
  });

  const rows = (() => {
    const map = new Map<SurfaceKey, number[]>();
    for (const r of q.data ?? []) {
      const key = `${(r as Record<string, unknown>).surface}::${(r as Record<string, unknown>).op}`;
      const arr = map.get(key) ?? [];
      arr.push(Number((r as Record<string, unknown>).ms));
      map.set(key, arr);
    }
    return [...map.entries()].map(([key, arr]) => {
      const [surface, op] = key.split('::');
      return {
        key, surface, op,
        n: arr.length,
        p50: Math.round(percentile(arr, 50)),
        p95: Math.round(percentile(arr, 95)),
        p99: Math.round(percentile(arr, 99)),
      };
    }).sort((a, b) => b.p95 - a.p95);
  })();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Performance (24h, sampling)</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent>
        {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">Surface</th><th className="py-1 pr-3">Op</th>
                  <th className="py-1 pr-3">N</th><th className="py-1 pr-3">p50 (ms)</th>
                  <th className="py-1 pr-3">p95 (ms)</th><th className="py-1 pr-3">p99 (ms)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="py-1 pr-3">{r.surface}</td>
                    <td className="py-1 pr-3">{r.op}</td>
                    <td className="py-1 pr-3">{r.n}</td>
                    <td className="py-1 pr-3">{r.p50}</td>
                    <td className="py-1 pr-3">
                      <Badge variant={r.p95 > 800 ? 'destructive' : 'secondary'}>{r.p95}</Badge>
                    </td>
                    <td className="py-1 pr-3">{r.p99}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="py-3 text-muted-foreground">Chưa có mẫu perf nào trong 24h.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TransactionValidationPage() {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Transaction Validation (M5.5A)</h1>
        <p className="text-sm text-muted-foreground">
          So sánh Legacy vs Unified, theo dõi shadow diffs &amp; performance. Read-only validation.
        </p>
      </div>
      <Tabs defaultValue="snapshot" className="w-full">
        <TabsList>
          <TabsTrigger value="snapshot">Snapshot Compare</TabsTrigger>
          <TabsTrigger value="shadow">Shadow Diffs</TabsTrigger>
          <TabsTrigger value="perf">Performance</TabsTrigger>
        </TabsList>
        <TabsContent value="snapshot" className="mt-4"><SnapshotTab /></TabsContent>
        <TabsContent value="shadow" className="mt-4"><ShadowDiffsTab /></TabsContent>
        <TabsContent value="perf" className="mt-4"><PerformanceTab /></TabsContent>
      </Tabs>
    </div>
  );
}
