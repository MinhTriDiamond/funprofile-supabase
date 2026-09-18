import { useState } from 'react';
import { toast } from 'sonner';
import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

type Layout = 'landscape_16_9' | 'portrait_9_16';

/**
 * Công cụ admin để sửa nhanh orientation của replay live khi nó hiển thị sai khung
 * (vd webcam quay dọc nhưng canvas Agora ghi ngang 16:9 → letterbox 2 viền đen).
 * Chỉ sửa metadata + post, không re-encode video.
 */
export function FixReplayOrientationPanel() {
  const [sessionId, setSessionId] = useState('');
  const [layout, setLayout] = useState<Layout>('portrait_9_16');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const handleFix = async () => {
    const id = sessionId.trim();
    if (!id) {
      toast.error('Nhập live_session_id');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('admin_fix_live_replay_orientation' as never, {
        p_session_id: id,
        p_layout: layout,
      } as never);
      if (error) throw error;
      setResult(data);
      toast.success('Đã cập nhật orientation cho replay');
    } catch (err: any) {
      console.error('[FixReplayOrientation] error', err);
      toast.error(err?.message || 'Sửa orientation thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" />
          Sửa orientation replay (admin)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Khi video replay hiển thị sai khung (vd webcam dọc lọt vào khung 16:9 ngang),
          dán <code className="rounded bg-muted px-1">live_session_id</code> và chọn orientation đúng.
          Lệnh sẽ cập nhật <code>live_sessions</code> và metadata bài post liên quan,
          không re-encode video.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_140px]">
          <div className="space-y-1">
            <Label htmlFor="orient-session-id">live_session_id</Label>
            <Input
              id="orient-session-id"
              placeholder="uuid của session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label>Orientation đúng</Label>
            <Select value={layout} onValueChange={(v) => setLayout(v as Layout)} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait_9_16">Portrait 9:16</SelectItem>
                <SelectItem value="landscape_16_9">Landscape 16:9</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleFix} disabled={loading} className="w-full">
              {loading ? 'Đang sửa…' : 'Sửa orientation'}
            </Button>
          </div>
        </div>
        {result !== null && (
          <pre className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
