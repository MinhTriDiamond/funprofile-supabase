# RTMP/OBS Live Producer Preview Auto-Refresh Fix

## 1. Ten tinh nang

**RTMP/OBS Live Producer Preview Auto-Refresh Fix**

Ten mo ta day du:

**RTMP/OBS Live Preview Auto-Refresh & Player Remount Fix for Fun Profile**

Tinh nang nay sua loi trong trang `/live/obs`: OBS va Cloudflare Stream da LIVE, session Fun Profile da chuyen sang trang thai live/source connected, nhung video preview trong tab hien tai van den/loading. Khi mo tab Chrome moi cung URL thi video lai hien binh thuong.

## 2. Muc tieu

Khi Cloudflare/OBS da live, preview player trong Live Producer phai tu cap nhat ngay trong tab hien tai:

- Khong can refresh tab.
- Khong can mo tab moi.
- Khong bi giu HLS source/null source cu.
- Khong bi ket manifest cache luc OBS chua bat dau live.
- Polling status van cap nhat `source_connected`, `hls_url`, `playback_url`, `cloudflare_video_uid`.
- Player duoc remount/reload khi trang thai live/source thay doi.

## 3. Audit hien trang

File lien quan:

- `src/modules/live/pages/RtmpLivePage.tsx`
- `src/components/ui/ReplayPlayer.tsx`
- `supabase/functions/get-rtmp-live-session-status/index.ts`

Trang `/live/obs` dang render preview bang:

```tsx
<ReplayPlayer src={playbackUrl} className="h-full w-full" autoPlay muted controls />
```

Trong do:

```tsx
const playbackUrl = credentials?.hls_url || credentials?.playback_url || null;
```

Van de:

Cloudflare Live Input co the co `hls_url` ngay tu luc tao session, truoc khi OBS bat dau push stream. Khi OBS bat dau live, URL HLS co the van y nguyen. React thay `src` khong doi, nen `ReplayPlayer` khong bi remount. Neu player/HLS.js da thu load manifest qua som, no co the bi ket o trang thai loading/den trong tab cu.

Mo tab moi thi player mount lai tu dau, lay manifest moi va phat duoc. Dieu nay chung minh playback URL dung, loi nam o frontend state/player reload.

## 4. Nguyen nhan goc

Nguyen nhan chinh:

1. `hls_url`/`playback_url` co the da co san tu luc tao Live Input.
2. Khi OBS connected, source URL khong nhat thiet thay doi.
3. `ReplayPlayer` khong co `key` dong de ep remount khi:
   - `sourceConnected` doi tu false sang true
   - `status` doi sang `source_connected`, `ready_to_go_live`, hoac `live`
   - `cloudflare_video_uid` duoc backfill
   - preview load loi truoc do
4. Khong co retry reload rieng cho live preview khi HLS manifest chua san sang dung luc.

## 5. Flow moi sau khi sua

1. User mo `/live/obs`.
2. Preview hien placeholder.
3. User Start Streaming trong OBS.
4. Status polling goi `get-rtmp-live-session-status`.
5. Backend xac dinh Cloudflare da connected/live.
6. Frontend update:
   - `sourceConnected = true`
   - `credentials.status`
   - `credentials.hls_url`
   - `credentials.playback_url`
   - `credentials.cloudflare_video_uid`
7. UI tao `livePreviewKey` moi.
8. UI tao `livePreviewSrc` co cache-buster `fp_live_preview`.
9. `ReplayPlayer` bi remount va load lai HLS manifest.
10. Neu player chua ready, UI retry remount moi 5 giay.
11. Khi player ready, dung retry.

## 6. Source code can sua

### File: `src/modules/live/pages/RtmpLivePage.tsx`

> Day la source code day du cua Live Producer page sau khi them preview auto-refresh/remount fix.

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clipboard, Loader2, Play, RadioTower, RotateCcw, Square, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { ReplayPlayer } from '@/components/ui/ReplayPlayer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

interface ProducerSession {
  live_session_id: string;
  live_post_id?: string | null;
  post_id?: string | null;
  rtmps_url: string;
  stream_key: string;
  hls_url?: string | null;
  playback_url?: string | null;
  cloudflare_video_uid?: string | null;
  status: string;
  title?: string | null;
  description?: string | null;
  source_connected_at?: string | null;
}

interface StatusPayload {
  live_session?: Partial<ProducerSession> & { id?: string; live_post_id?: string | null; post_id?: string | null };
  source_connected?: boolean;
  details_complete?: boolean;
  can_go_live?: boolean;
}

async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  toast.success(`${label} copied`);
}

function stepState(done: boolean, active: boolean) {
  if (done) return 'border-emerald-500 bg-emerald-500/10 text-emerald-700';
  if (active) return 'border-primary bg-primary/10 text-primary';
  return 'border-muted bg-card text-muted-foreground';
}

export default function RtmpLivePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sourceConnected, setSourceConnected] = useState(false);
  const [credentials, setCredentials] = useState<ProducerSession | null>(null);
  const [previewReloadToken, setPreviewReloadToken] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const previousPreviewStateRef = useRef<{
    sourceConnected: boolean;
    status?: string;
    playbackUrl: string | null;
    cloudflareVideoUid?: string | null;
  }>({ sourceConnected: false, playbackUrl: null });

  const detailsComplete = title.trim().length > 0 && description.trim().length > 0;
  const playbackUrl = credentials?.hls_url || credentials?.playback_url || null;

  const livePreviewSrc = useMemo(() => {
    if (!playbackUrl) return null;
    const separator = playbackUrl.includes('?') ? '&' : '?';
    return `${playbackUrl}${separator}fp_live_preview=${previewReloadToken}`;
  }, [playbackUrl, previewReloadToken]);

  const livePreviewKey = [
    playbackUrl || 'no-src',
    credentials?.cloudflare_video_uid || credentials?.live_session_id || 'no-video',
    credentials?.status || 'unknown',
    previewReloadToken,
  ].join(':');

  const canGoLive = !!credentials && sourceConnected && detailsComplete && credentials.status !== 'live';

  const disabledReason = useMemo(() => {
    if (publishing) return 'Dang phat truc tiep...';
    if (!sourceConnected) return 'Dang cho OBS ket noi.';
    if (!title.trim() || !description.trim()) return 'Vui long nhap tieu de va mo ta.';
    if (credentials?.status === 'live') return 'Live da public.';
    return null;
  }, [credentials?.status, description, publishing, sourceConnected, title]);

  const createOrResumeSession = useCallback(async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-rtmp-live-session', {
        body: { privacy: 'public' },
      });
      if (error) throw error;
      if (!data?.rtmps_url || !data?.stream_key) throw new Error('Khong nhan duoc thong tin OBS');
      const next = data as ProducerSession;
      setCredentials(next);
      setTitle(next.title || '');
      setDescription(next.description || '');
      setSourceConnected(!!next.source_connected_at || ['source_connected', 'ready_to_go_live', 'live'].includes(next.status));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Tao phien OBS Live that bai');
    } finally {
      setCreating(false);
    }
  }, []);

  useEffect(() => {
    createOrResumeSession();
  }, [createOrResumeSession]);

  const refreshStatus = useCallback(async () => {
    if (!credentials?.live_session_id) return;
    try {
      const { data, error } = await supabase.functions.invoke('get-rtmp-live-session-status', {
        body: { live_session_id: credentials.live_session_id },
      });
      if (error) throw error;
      const payload = data as StatusPayload;
      const liveSession = payload.live_session || {};
      const nextSourceConnected = !!payload.source_connected;

      setSourceConnected(nextSourceConnected);
      setCredentials((current) => current ? {
        ...current,
        ...liveSession,
        live_session_id: current.live_session_id,
        status: liveSession.status || current.status,
        hls_url: liveSession.hls_url || current.hls_url,
        playback_url: liveSession.playback_url || current.playback_url,
        cloudflare_video_uid: liveSession.cloudflare_video_uid || current.cloudflare_video_uid,
        post_id: liveSession.post_id || current.post_id,
        live_post_id: liveSession.live_post_id || current.live_post_id,
      } : current);

      console.debug('[RTMP_STATUS_POLL]', {
        sessionId: credentials.live_session_id,
        previousStatus: credentials.status,
        nextStatus: liveSession.status || credentials.status,
        previousPlaybackUrl: credentials.playback_url || null,
        nextPlaybackUrl: liveSession.playback_url || credentials.playback_url || null,
        previousHlsUrl: credentials.hls_url || null,
        nextHlsUrl: liveSession.hls_url || credentials.hls_url || null,
        previousSourceConnected: sourceConnected,
        nextSourceConnected,
      });
    } catch {
      // Polling is fallback; webhook can still update state.
    }
  }, [credentials?.hls_url, credentials?.live_session_id, credentials?.playback_url, credentials?.status, sourceConnected]);

  useEffect(() => {
    if (!credentials?.live_session_id) return;
    console.debug('[RTMP_PRODUCER_STATE]', {
      sessionId: credentials.live_session_id,
      sessionStatus: credentials.status,
      sourceConnected,
      playbackUrl,
      cloudflareVideoUid: credentials.cloudflare_video_uid || null,
      previewReloadToken,
      titleValid: !!title.trim(),
      descriptionValid: !!description.trim(),
      canGoLive,
      disabledReason,
    });
  }, [canGoLive, credentials?.cloudflare_video_uid, credentials?.live_session_id, credentials?.status, description, disabledReason, playbackUrl, previewReloadToken, sourceConnected, title]);

  useEffect(() => {
    const previous = previousPreviewStateRef.current;
    const next = {
      sourceConnected,
      status: credentials?.status,
      playbackUrl,
      cloudflareVideoUid: credentials?.cloudflare_video_uid || null,
    };
    const sourceChanged = previous.playbackUrl !== next.playbackUrl
      || previous.cloudflareVideoUid !== next.cloudflareVideoUid
      || previous.status !== next.status
      || previous.sourceConnected !== next.sourceConnected;

    previousPreviewStateRef.current = next;
    if (!sourceConnected || !playbackUrl) {
      setPreviewReady(false);
      return;
    }
    if (sourceChanged) {
      setPreviewReady(false);
      setPreviewReloadToken((value) => value + 1);
      console.debug('[RTMP_PREVIEW_RELOAD_TRIGGERED]', {
        sessionId: credentials?.live_session_id,
        previousStatus: previous.status,
        nextStatus: next.status,
        previousPlaybackUrl: previous.playbackUrl,
        nextPlaybackUrl: next.playbackUrl,
        previousCloudflareVideoUid: previous.cloudflareVideoUid,
        nextCloudflareVideoUid: next.cloudflareVideoUid,
      });
    }
  }, [credentials?.cloudflare_video_uid, credentials?.live_session_id, credentials?.status, playbackUrl, sourceConnected]);

  useEffect(() => {
    if (!sourceConnected || !playbackUrl || previewReady) return;
    const timer = window.setInterval(() => {
      setPreviewReloadToken((value) => value + 1);
      console.debug('[RTMP_PREVIEW_RETRY_RELOAD]', {
        sessionId: credentials?.live_session_id,
        status: credentials?.status,
        playbackUrl,
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [credentials?.live_session_id, credentials?.status, playbackUrl, previewReady, sourceConnected]);

  useEffect(() => {
    if (!credentials?.live_session_id || credentials.status === 'ended' || credentials.status === 'posted') return;
    const timer = window.setInterval(() => refreshStatus(), 5000);
    refreshStatus();
    return () => window.clearInterval(timer);
  }, [credentials?.live_session_id, credentials?.status, refreshStatus]);

  const saveDetails = async (): Promise<boolean> => {
    if (!credentials?.live_session_id) return false;
    if (!detailsComplete) {
      toast.error('Tieu de va mo ta la bat buoc');
      return false;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-rtmp-live-details', {
        body: { live_session_id: credentials.live_session_id, title, description },
      });
      if (error) throw error;
      const liveSession = (data as StatusPayload).live_session || {};
      setCredentials((current) => current ? { ...current, ...liveSession, live_session_id: current.live_session_id } : current);
      toast.success('Da luu chi tiet bai live');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Luu chi tiet that bai');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goLive = async () => {
    if (!credentials?.live_session_id || !canGoLive) return;
    setPublishing(true);
    try {
      const saved = await saveDetails();
      if (!saved) return;
      const { data, error } = await supabase.functions.invoke('go-live-rtmp-session', {
        body: { live_session_id: credentials.live_session_id },
      });
      if (error) throw error;
      const liveSession = (data as StatusPayload).live_session || {};
      setCredentials((current) => current ? {
        ...current,
        ...liveSession,
        live_session_id: current.live_session_id,
        status: 'live',
        live_post_id: (data as { live_post_id?: string }).live_post_id || current.live_post_id,
      } : current);
      toast.success('Da phat truc tiep len feed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Phat truc tiep that bai');
    } finally {
      setPublishing(false);
    }
  };

  const resetKey = async () => {
    if (!credentials?.live_session_id) return;
    const confirmReset = sourceConnected || credentials.status === 'live'
      ? window.confirm('OBS dang ket noi hoac dang live. Dat lai key se lam key cu khong dung duoc. Tiep tuc?')
      : true;
    if (!confirmReset) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-rtmp-stream-key', {
        body: { live_session_id: credentials.live_session_id, confirm_reset: confirmReset },
      });
      if (error) throw error;
      setCredentials({ ...credentials, ...(data as ProducerSession) });
      setSourceConnected(false);
      toast.success('Da dat lai Stream Key');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Dat lai Stream Key that bai');
    } finally {
      setResetting(false);
    }
  };

  const endSession = async () => {
    if (!credentials?.live_session_id) return;
    setEnding(true);
    try {
      const { error } = await supabase.functions.invoke('end-rtmp-live-session', {
        body: { live_session_id: credentials.live_session_id },
      });
      if (error) throw error;
      setCredentials({ ...credentials, status: 'ended' });
      toast.success('Da ket thuc live. Replay dang duoc xu ly.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ket thuc live that bai');
    } finally {
      setEnding(false);
    }
  };

  const handlePreviewReady = useCallback(() => {
    setPreviewReady(true);
    console.debug('[RTMP_PREVIEW_READY]', {
      sessionId: credentials?.live_session_id,
      status: credentials?.status,
      playbackUrl,
    });
  }, [credentials?.live_session_id, credentials?.status, playbackUrl]);

  const handlePreviewError = useCallback((error: Error) => {
    setPreviewReady(false);
    console.debug('[RTMP_PREVIEW_ERROR]', {
      sessionId: credentials?.live_session_id,
      status: credentials?.status,
      playbackUrl,
      message: error.message,
    });
  }, [credentials?.live_session_id, credentials?.status, playbackUrl]);

  const statusLabel = useMemo(() => {
    if (!credentials) return 'Dang tao';
    if (credentials.status === 'live') return 'Dang live';
    if (credentials.status === 'ended') return 'Da ket thuc';
    if (sourceConnected && detailsComplete) return 'San sang phat';
    if (sourceConnected) return 'Da ket noi OBS';
    return 'Cho OBS ket noi';
  }, [credentials, detailsComplete, sourceConnected]);

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main className="pt-16 px-3 md:px-6 pb-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <RadioTower className="h-6 w-6 text-primary" />
                Live Producer
              </h1>
              <p className="text-sm text-muted-foreground">Phat truc tiep bang phan mem OBS / RTMP / Restream / vMix.</p>
            </div>
            <Badge variant={credentials?.status === 'live' ? 'destructive' : 'secondary'}>{statusLabel}</Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_380px] gap-4">
            <aside className="border bg-card p-4 space-y-3 rounded-lg">
              <h2 className="font-semibold text-sm">Tien trinh</h2>
              {[
                { label: 'Ket noi nguon video', done: sourceConnected, active: !sourceConnected },
                { label: 'Hoan tat chi tiet bai viet', done: detailsComplete, active: sourceConnected && !detailsComplete },
                { label: 'Phat truc tiep', done: credentials?.status === 'live', active: canGoLive },
              ].map((step, index) => (
                <div key={step.label} className={`border p-3 rounded-md ${stepState(step.done, step.active)}`}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {step.done ? <Check className="h-4 w-4" /> : <span className="h-4 w-4 text-center">{index + 1}</span>}
                    {step.label}
                  </div>
                </div>
              ))}
            </aside>

            <section className="space-y-4">
              <div className="aspect-video bg-black relative rounded-lg overflow-hidden border">
                {sourceConnected && playbackUrl ? (
                  <ReplayPlayer
                    key={livePreviewKey}
                    src={livePreviewSrc || playbackUrl}
                    className="h-full w-full"
                    autoPlay
                    muted
                    controls
                    onReady={handlePreviewReady}
                    onError={handlePreviewError}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 text-center px-6">
                    {creating ? <Loader2 className="h-8 w-8 animate-spin mb-3" /> : <RadioTower className="h-10 w-10 mb-3" />}
                    <div className="font-semibold">Ket noi phan mem phat truc tiep de len song</div>
                    <div className="text-sm text-white/70 mt-1">Mo OBS, nhap Server URL va Stream Key, sau do bam Start Streaming.</div>
                  </div>
                )}
              </div>

              <div className="border bg-card p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Hoan tat chi tiet bai viet</h2>
                  {detailsComplete ? <Badge variant="secondary">Da hoan tat</Badge> : <Badge variant="outline">Bat buoc</Badge>}
                </div>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tieu de live (bat buoc)" maxLength={160} />
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mo ta live (bat buoc)" rows={5} />
                <Button onClick={saveDetails} disabled={saving || !credentials || !detailsComplete}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Luu chi tiet
                </Button>
              </div>
            </section>

            <aside className="border bg-card p-4 rounded-lg space-y-4">
              <div>
                <h2 className="font-semibold">Ket noi nguon video</h2>
                <p className="text-sm text-muted-foreground">OBS &gt; Settings &gt; Stream &gt; chon Service Custom.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Server URL / RTMPS URL</label>
                <div className="flex gap-2">
                  <Input value={credentials?.rtmps_url || ''} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" disabled={!credentials?.rtmps_url} onClick={() => copyText(credentials!.rtmps_url, 'Server URL')}>
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Stream Key</label>
                <div className="flex gap-2">
                  <Input value={credentials?.stream_key || ''} readOnly type="password" className="font-mono text-xs" />
                  <Button variant="outline" size="icon" disabled={!credentials?.stream_key} onClick={() => copyText(credentials!.stream_key, 'Stream Key')}>
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button variant="outline" onClick={resetKey} disabled={resetting || !credentials}>
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Dat lai Stream Key
              </Button>

              {credentials?.status !== 'live' && (
                <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {sourceConnected && detailsComplete
                      ? 'OBS da ket noi. Ban co the phat truc tiep.'
                      : disabledReason || 'Can OBS ket noi, tieu de va mo ta hop le truoc khi phat truc tiep.'}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t flex flex-col gap-2">
                <Button onClick={goLive} disabled={!canGoLive || publishing}>
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Phat truc tiep
                </Button>
                <Button variant="destructive" onClick={endSession} disabled={ending || !credentials || credentials.status === 'ended'}>
                  {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  Ket thuc live
                </Button>
                {(credentials?.live_post_id || credentials?.post_id) && (
                  <Button variant="secondary" onClick={() => navigate(`/post/${credentials.live_post_id || credentials.post_id}`)}>
                    Xem bai live tren feed
                  </Button>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
```

## 7. Status API can dam bao

File status API phai tra du:

- `source_connected`
- `live_session.status`
- `live_session.hls_url`
- `live_session.playback_url`
- `live_session.cloudflare_video_uid`
- `live_session.live_post_id`
- `live_session.post_id`

Source tham chieu:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getStreamLiveInput,
  getStreamPlaybackUrls,
  isLiveInputConnected,
  isStreamVideoLive,
  listStreamLiveInputVideos,
} from '../_shared/cloudflareStreamService.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

function nextProducerStatus(session: any, connected: boolean): string {
  if (session.status === 'live' || session.status === 'ended' || session.status === 'processing' || session.status === 'posted' || session.status === 'failed') {
    return session.status;
  }
  if (!connected) return 'waiting_for_obs';
  return session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    if (!liveSessionId) return json({ error: 'Missing live_session_id' }, 400);

    const admin = createAdminClient() as any;
    const { data: session, error } = await admin
      .from('live_sessions')
      .select('id, owner_id, host_user_id, mode, status, title, description, source_connected_at, cloudflare_live_input_id, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    let connected = session.status === 'live';
    let liveInput: Record<string, unknown> | null = null;
    let liveVideo: Record<string, unknown> | null = null;
    let cloudflareVideoUid: string | null = session.cloudflare_video_uid || null;

    if (session.cloudflare_live_input_id) {
      liveInput = await getStreamLiveInput(session.cloudflare_live_input_id).catch(() => null);
      connected = isLiveInputConnected(liveInput);
      const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
      liveVideo = (videos.find((item) => isStreamVideoLive(item)) || videos.find((item: any) => item?.uid) || null) as Record<string, unknown> | null;
      if (liveVideo) {
        cloudflareVideoUid = String((liveVideo as { uid?: unknown }).uid || cloudflareVideoUid || '');
        connected = true;
      }
    }

    const now = new Date().toISOString();
    const status = nextProducerStatus(session, connected);
    let current = session;
    const fallbackUrls = session.cloudflare_live_input_id ? getStreamPlaybackUrls(session.cloudflare_live_input_id) : null;
    const hlsUrl = session.hls_url || session.playback_url || fallbackUrls?.hls || null;

    if (
      status !== session.status
      || (connected && !session.source_connected_at)
      || (cloudflareVideoUid && cloudflareVideoUid !== session.cloudflare_video_uid)
      || (!session.hls_url && hlsUrl)
    ) {
      const { data: updated } = await admin
        .from('live_sessions')
        .update({
          status,
          source_connected_at: connected ? (session.source_connected_at || now) : session.source_connected_at,
          cloudflare_video_uid: cloudflareVideoUid || session.cloudflare_video_uid,
          hls_url: hlsUrl,
          playback_url: session.playback_url || hlsUrl,
          updated_at: now,
        })
        .eq('id', liveSessionId)
        .select('id, status, title, description, source_connected_at, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error')
        .single();
      if (updated) current = { ...session, ...updated };
    }

    const titleValid = !!current.title?.trim();
    const descriptionValid = !!current.description?.trim();
    const canGoLive = connected && titleValid && descriptionValid;

    console.log('[RTMP_STATUS]', {
      sessionId: liveSessionId,
      liveInputId: session.cloudflare_live_input_id,
      cloudflareVideoUid,
      mappedSourceConnected: connected,
      titleValid,
      descriptionValid,
      canGoLive,
      inputStatus: liveInput ? {
        status: (liveInput as any).status,
        state: (liveInput as any).state,
        connected: (liveInput as any).connected,
        readyToStream: (liveInput as any).readyToStream,
      } : null,
      liveVideoStatus: liveVideo ? {
        uid: (liveVideo as any).uid,
        status: (liveVideo as any).status,
        state: (liveVideo as any).state,
        live: (liveVideo as any).live,
        readyToStream: (liveVideo as any).readyToStream,
      } : null,
    });

    return json({
      ok: true,
      live_session: current,
      source_connected: connected,
      details_complete: titleValid && descriptionValid,
      can_go_live: canGoLive,
      cloudflare_video_uid: cloudflareVideoUid,
      cloudflare_live_input: liveInput,
      cloudflare_live_video: liveVideo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## 8. Debug logging

Frontend logs an toan:

- `[RTMP_STATUS_POLL]`
- `[RTMP_PRODUCER_STATE]`
- `[RTMP_PREVIEW_RELOAD_TRIGGERED]`
- `[RTMP_PREVIEW_RETRY_RELOAD]`
- `[RTMP_PREVIEW_READY]`
- `[RTMP_PREVIEW_ERROR]`

Backend logs an toan:

- `[RTMP_STATUS]`

Khong log:

- Stream Key
- Cloudflare API Token
- R2 Secret

## 9. Cach test bang OBS

1. Mo `/live/obs`.
2. Copy `Server URL / RTMPS URL`.
3. Copy `Stream Key`.
4. Trong OBS:
   - Settings -> Stream
   - Service = Custom
   - Server = RTMPS URL
   - Stream Key = stream key
5. Bam Start Streaming.
6. Cho Cloudflare dashboard hien video LIVE.
7. Trong tab Fun Profile hien tai, preview phai tu load video.
8. Khong refresh tab.
9. Khong mo tab moi.
10. Bam `Phat truc tiep`.
11. Live post xuat hien tren feed.

## 10. Edge cases can test

- OBS connected sau khi page da mo.
- OBS connected truoc khi page mo.
- Cloudflare tra HLS manifest tre vai giay.
- User bam `Phat truc tiep` khi preview dang loading.
- User refresh tab.
- User mo tab moi.
- OBS disconnect roi reconnect.
- Reset stream key roi connect lai.
- Mobile browser.

## 11. Verification

Da chay:

```bash
npx tsc --noEmit
npx eslint src/modules/live/pages/RtmpLivePage.tsx
npx vite build
```

Ket qua:

- Typecheck pass.
- ESLint pass.
- Vite build pass.
- Build co mot so warning cu ve Rollup pure annotation, chunk size, dynamic/static import `sonner`; khong lien quan den fix nay.

## 12. Rollback

Neu can rollback nhanh, sua lai preview render ve ban cu:

```tsx
{sourceConnected && playbackUrl ? (
  <ReplayPlayer src={playbackUrl} className="h-full w-full" autoPlay muted controls />
) : (
  <Placeholder />
)}
```

Dong thoi go bo cac state/effect moi:

- `previewReloadToken`
- `previewReady`
- `previousPreviewStateRef`
- `livePreviewSrc`
- `livePreviewKey`
- `handlePreviewReady`
- `handlePreviewError`
- effect `[RTMP_PREVIEW_RELOAD_TRIGGERED]`
- effect `[RTMP_PREVIEW_RETRY_RELOAD]`

## 13. Ket luan

Fix nay khong thay doi kien truc Cloudflare/OBS, khong thay doi stream key, khong thay doi archive pipeline. No chi sua dung van de frontend:

**Khi OBS/Cloudflare da live, player preview trong tab hien tai phai tu remount/reload va hien video, khong can refresh hoac mo tab moi.**
