# Persistent RTMP/OBS Stream Key for Live Producer

## 1. Ten tinh nang

**Persistent RTMP/OBS Stream Key for Live Producer**

Ten day du:

**Persistent RTMP/OBS Stream Key + Session-Specific Live Producer URLs**

Tinh nang nay them kha nang cho creator chon:

- **Luong tam thoi**: moi phien live tao Cloudflare Live Input/Stream Key rieng.
- **Luong co dinh**: moi user co RTMP Stream Key co dinh, dung lai nhieu lan trong OBS nhu Facebook Live Producer / YouTube Live.

Dong thoi Live Producer co URL rieng cho tung phien:

```txt
/live/obs/:sessionId
```

Route cu:

```txt
/live/obs
```

van duoc giu, nhung se tu tao/resume session va redirect ve URL rieng.

## 2. Audit hien trang truoc khi sua

File lien quan:

- `src/App.tsx`
- `src/modules/live/pages/RtmpLivePage.tsx`
- `supabase/functions/create-rtmp-live-session/index.ts`
- `supabase/functions/reset-rtmp-stream-key/index.ts`
- `supabase/functions/get-rtmp-live-session-status/index.ts`
- `supabase/functions/get-rtmp-live-session-credentials/index.ts`
- `supabase/functions/end-rtmp-live-session/index.ts`
- `supabase/functions/stream-webhook/index.ts`
- `supabase/migrations/20260510023000_rtmp_persistent_stream_configs.sql`

Hien trang cu:

- Chi co route `/live/obs`.
- UI tu goi `create-rtmp-live-session`.
- Backend resume active RTMP session cua user hoac tao Live Input moi.
- Stream Key dang gan truc tiep vao `live_sessions.stream_key_encrypted`.
- Chua co bang config RTMP lau dai theo user.
- Chua co phan biet giua:
  - RTMP credential/config lau dai
  - mot live session cu the
- Khi end RTMP live co the revoke Cloudflare Live Input, khong phu hop voi key co dinh.
- Webhook map theo `cloudflare_live_input_id`, voi persistent Live Input can uu tien active session moi nhat de tranh map vao session cu.

## 3. Kien truc moi

### Luong tam thoi

```txt
User mo /live/obs
-> Tao live_session moi
-> Tao Cloudflare Live Input moi
-> Luu stream key encrypted tren live_sessions
-> Redirect /live/obs/:sessionId
-> OBS live
-> End live
-> Co the revoke temporary Live Input
```

### Luong co dinh

```txt
User bat "Luong co dinh"
-> Kiem tra rtmp_stream_configs cua user
-> Neu chua co: tao Cloudflare Live Input co dinh
-> Neu da co: dung lai RTMPS URL + Stream Key cu
-> Tao live_session moi gan rtmp_config_id
-> Redirect /live/obs/:sessionId
-> OBS live bang key co dinh
-> End live
-> KHONG revoke persistent Live Input
-> Lan sau dung lai key cu, tao session/post/replay moi
```

## 4. Database migration

File:

```txt
supabase/migrations/20260510023000_rtmp_persistent_stream_configs.sql
```

Source:

```sql
-- RTMP/OBS persistent stream configs.
-- A config is the long-lived RTMP credential set. A live_session is one live event.

CREATE TABLE IF NOT EXISTS public.rtmp_stream_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_persistent boolean NOT NULL DEFAULT true,
  cloudflare_live_input_id text NOT NULL,
  rtmps_url text,
  stream_key_encrypted text,
  stream_key_last_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS rtmp_config_id uuid REFERENCES public.rtmp_stream_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_persistent_stream boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rtmp_stream_configs_one_persistent_per_user
  ON public.rtmp_stream_configs(user_id)
  WHERE is_persistent = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rtmp_stream_configs_live_input
  ON public.rtmp_stream_configs(cloudflare_live_input_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_config
  ON public.live_sessions(rtmp_config_id, created_at DESC)
  WHERE rtmp_config_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_active_owner
  ON public.live_sessions(owner_id, mode, status, updated_at DESC)
  WHERE mode = 'rtmp_obs'
    AND deleted_at IS NULL
    AND status IN ('waiting_for_obs', 'source_connected', 'ready_to_go_live', 'live');

DROP TRIGGER IF EXISTS update_rtmp_stream_configs_updated_at ON public.rtmp_stream_configs;
CREATE TRIGGER update_rtmp_stream_configs_updated_at
BEFORE UPDATE ON public.rtmp_stream_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rtmp_stream_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can read own rtmp stream configs" ON public.rtmp_stream_configs;
CREATE POLICY "owner can read own rtmp stream configs"
  ON public.rtmp_stream_configs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner can insert own rtmp stream configs" ON public.rtmp_stream_configs;
CREATE POLICY "owner can insert own rtmp stream configs"
  ON public.rtmp_stream_configs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner can update own rtmp stream configs" ON public.rtmp_stream_configs;
CREATE POLICY "owner can update own rtmp stream configs"
  ON public.rtmp_stream_configs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.rtmp_stream_configs IS 'Long-lived or reusable RTMP/OBS stream credential configs. Stream keys are encrypted and only returned by owner-only Edge Functions.';
COMMENT ON COLUMN public.live_sessions.rtmp_config_id IS 'RTMP config used by this one live session.';
COMMENT ON COLUMN public.live_sessions.is_persistent_stream IS 'True when this live session uses the owner persistent RTMP config.';
```

## 5. Route moi

File:

```txt
src/App.tsx
```

Patch:

```diff
<Route path="/live/obs" element={<RtmpLivePage />} />
+<Route path="/live/obs/:sessionId" element={<RtmpLivePage />} />
```

Ket qua:

- `/live/obs`: tao/resume session cua owner, sau do redirect.
- `/live/obs/:sessionId`: load dung session do.
- User khac mo sessionId khong thuoc minh se bi backend chan khi lay credentials.

## 6. Frontend Live Producer

File:

```txt
src/modules/live/pages/RtmpLivePage.tsx
```

Nhung thay doi chinh:

- Them `useParams` de doc `sessionId`.
- Them `Switch` UI cho "Luong co dinh".
- Them `persistentStream` state.
- Khi tao/resume session, truyen:
  - `live_session_id`
  - `is_persistent_stream`
  - `force_new`
- Neu route cu `/live/obs`, sau khi co session se redirect sang `/live/obs/:sessionId`.
- Neu bat/tat mode thi tao session moi theo mode do.
- Neu OBS dang connected/live thi khong cho doi mode.

Source patch:

```diff
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
-import { useNavigate } from 'react-router-dom';
+import { useNavigate, useParams } from 'react-router-dom';
...
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
+import { Switch } from '@/components/ui/switch';
 import { Textarea } from '@/components/ui/textarea';

 interface ProducerSession {
   live_session_id: string;
   live_post_id?: string | null;
   post_id?: string | null;
   rtmps_url: string;
   stream_key: string;
   hls_url?: string | null;
   playback_url?: string | null;
   cloudflare_video_uid?: string | null;
+  rtmp_config_id?: string | null;
+  is_persistent_stream?: boolean;
+  producer_url?: string | null;
   status: string;
   title?: string | null;
   description?: string | null;
   source_connected_at?: string | null;
 }

 export default function RtmpLivePage() {
   const navigate = useNavigate();
+  const { sessionId } = useParams<{ sessionId?: string }>();
   const [title, setTitle] = useState('');
   const [description, setDescription] = useState('');
   const [creating, setCreating] = useState(true);
   const [saving, setSaving] = useState(false);
   const [publishing, setPublishing] = useState(false);
   const [ending, setEnding] = useState(false);
   const [resetting, setResetting] = useState(false);
   const [sourceConnected, setSourceConnected] = useState(false);
   const [credentials, setCredentials] = useState<ProducerSession | null>(null);
+  const [persistentStream, setPersistentStream] = useState(false);
```

Create/resume session:

```tsx
const createOrResumeSession = useCallback(async (options?: { persistent?: boolean; forceNew?: boolean }) => {
  setCreating(true);
  try {
    const requestedPersistent = options?.persistent ?? persistentStream;
    const { data, error } = await supabase.functions.invoke('create-rtmp-live-session', {
      body: {
        privacy: 'public',
        live_session_id: options?.forceNew === true ? undefined : sessionId,
        is_persistent_stream: requestedPersistent,
        force_new: options?.forceNew === true,
      },
    });
    if (error) throw error;
    if (!data?.rtmps_url || !data?.stream_key) throw new Error('Khong nhan duoc thong tin OBS');

    const next = data as ProducerSession;
    setCredentials(next);
    setTitle(next.title || '');
    setDescription(next.description || '');
    setPersistentStream(!!next.is_persistent_stream);
    setSourceConnected(!!next.source_connected_at || ['source_connected', 'ready_to_go_live', 'live'].includes(next.status));

    if (next.live_session_id && next.live_session_id !== sessionId) {
      navigate(`/live/obs/${next.live_session_id}`, { replace: true });
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Tao phien OBS Live that bai');
  } finally {
    setCreating(false);
  }
}, [navigate, persistentStream, sessionId]);
```

Merge status polling:

```tsx
setCredentials((current) => current ? {
  ...current,
  ...liveSession,
  live_session_id: current.live_session_id,
  status: liveSession.status || current.status,
  hls_url: liveSession.hls_url || current.hls_url,
  playback_url: liveSession.playback_url || current.playback_url,
  cloudflare_video_uid: liveSession.cloudflare_video_uid || current.cloudflare_video_uid,
  rtmp_config_id: liveSession.rtmp_config_id || current.rtmp_config_id,
  is_persistent_stream: typeof liveSession.is_persistent_stream === 'boolean'
    ? liveSession.is_persistent_stream
    : current.is_persistent_stream,
  post_id: liveSession.post_id || current.post_id,
  live_post_id: liveSession.live_post_id || current.live_post_id,
} : current);
```

Change stream mode:

```tsx
const changeStreamMode = useCallback(async (checked: boolean) => {
  if (sourceConnected || credentials?.status === 'live') {
    toast.error('Khong the doi che do khi OBS dang ket noi hoac dang live');
    return;
  }
  setPersistentStream(checked);
  await createOrResumeSession({ persistent: checked, forceNew: true });
}, [createOrResumeSession, credentials?.status, sourceConnected]);
```

UI toggle:

```tsx
<div className="rounded-md border p-3 space-y-3">
  <div className="flex items-center justify-between gap-3">
    <div>
      <div className="text-sm font-medium">Luong co dinh</div>
      <div className="text-xs text-muted-foreground">
        {persistentStream
          ? 'Giu Stream Key co dinh de dung lai trong OBS.'
          : 'Tao Stream Key moi cho tung phien live.'}
      </div>
    </div>
    <Switch
      checked={persistentStream}
      onCheckedChange={changeStreamMode}
      disabled={creating || sourceConnected || credentials?.status === 'live'}
      aria-label="Luong co dinh"
    />
  </div>
  <Badge variant={persistentStream ? 'secondary' : 'outline'}>
    {persistentStream ? 'Luong co dinh' : 'Luong tam thoi'}
  </Badge>
  {persistentStream && (
    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
      Khong chia se Stream Key. Ai co key nay deu co the phat len kenh cua ban.
    </div>
  )}
</div>
```

## 7. Backend create/resume session

File:

```txt
supabase/functions/create-rtmp-live-session/index.ts
```

Source day du cua cac phan moi:

```ts
function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

async function serializeSession(session: any, streamKey: string | null, extras: Record<string, unknown> = {}) {
  return {
    ok: true,
    live_session: session,
    live_session_id: session.id,
    post_id: session.post_id || session.live_post_id || null,
    live_post_id: session.live_post_id || null,
    rtmps_url: session.rtmps_url,
    stream_key: streamKey,
    hls_url: session.hls_url,
    playback_url: session.playback_url || session.hls_url || null,
    cloudflare_video_uid: session.cloudflare_video_uid || null,
    status: session.status,
    title: session.title || '',
    description: session.description || '',
    source_connected_at: session.source_connected_at || null,
    rtmp_config_id: session.rtmp_config_id || null,
    is_persistent_stream: !!session.is_persistent_stream,
    producer_url: `/live/obs/${session.id}`,
    ...extras,
  };
}
```

Request body moi:

```ts
const requestedSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
const wantsPersistent = toBoolean(body.is_persistent_stream ?? body.is_persistent, false);
```

Load session theo URL rieng:

```ts
if (requestedSessionId) {
  const { data: requested, error: requestedError } = await admin
    .from('live_sessions')
    .select('id, status, rtmps_url, stream_key_encrypted, hls_url, playback_url, post_id, live_post_id, title, description, source_connected_at, cloudflare_video_uid, rtmp_config_id, is_persistent_stream, owner_id, host_user_id')
    .eq('id', requestedSessionId)
    .maybeSingle();

  if (requestedError) throw requestedError;
  if (!requested) return json({ error: 'Live session not found' }, 404);
  if (requested.owner_id !== user.id && requested.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);

  return json(await serializeSession(
    requested,
    requested.stream_key_encrypted ? await decryptStreamKey(requested.stream_key_encrypted) : null,
    { resumed: true },
  ));
}
```

Resume active session cua user:

```ts
const { data: existing } = await admin
  .from('live_sessions')
  .select('id, status, rtmps_url, stream_key_encrypted, hls_url, playback_url, post_id, live_post_id, title, description, source_connected_at, cloudflare_video_uid, rtmp_config_id, is_persistent_stream')
  .eq('owner_id', user.id)
  .eq('mode', 'rtmp_obs')
  .is('deleted_at', null)
  .in('status', ['waiting_for_obs', 'source_connected', 'ready_to_go_live', 'live'])
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (existing && body.force_new !== true) {
  return json(await serializeSession(
    existing,
    existing.stream_key_encrypted ? await decryptStreamKey(existing.stream_key_encrypted) : null,
    { resumed: true },
  ));
}
```

Persistent config flow:

```ts
let rtmpConfigId: string | null = null;
let liveInputId: string | null = null;
let rtmpsUrl: string | null = null;
let streamKey: string | null = null;
let encryptedKey: string | null = null;

if (wantsPersistent) {
  const { data: existingConfig, error: configReadError } = await admin
    .from('rtmp_stream_configs')
    .select('id, cloudflare_live_input_id, rtmps_url, stream_key_encrypted, stream_key_last_reset_at')
    .eq('user_id', user.id)
    .eq('is_persistent', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (configReadError) throw configReadError;

  if (existingConfig) {
    rtmpConfigId = existingConfig.id;
    liveInputId = existingConfig.cloudflare_live_input_id;
    rtmpsUrl = existingConfig.rtmps_url;
    encryptedKey = existingConfig.stream_key_encrypted;
    streamKey = encryptedKey ? await decryptStreamKey(encryptedKey) : null;
  } else {
    const liveInput = await createStreamLiveInput({
      name: 'Fun Profile Persistent OBS Live',
      userId: user.id,
      liveSessionId: sessionId,
    });
    if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) {
      throw new Error('Cloudflare did not return RTMPS credentials');
    }

    encryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);
    const { data: createdConfig, error: configCreateError } = await admin
      .from('rtmp_stream_configs')
      .insert({
        user_id: user.id,
        is_persistent: true,
        cloudflare_live_input_id: liveInput.uid,
        rtmps_url: liveInput.rtmpsUrl,
        stream_key_encrypted: encryptedKey,
        stream_key_last_reset_at: new Date().toISOString(),
      })
      .select('id, cloudflare_live_input_id, rtmps_url, stream_key_encrypted')
      .single();

    if (configCreateError) throw configCreateError;
    rtmpConfigId = createdConfig.id;
    liveInputId = createdConfig.cloudflare_live_input_id;
    rtmpsUrl = createdConfig.rtmps_url;
    streamKey = liveInput.rtmpsStreamKey;
  }
} else {
  const liveInput = await createStreamLiveInput({
    name: title || 'OBS Live',
    userId: user.id,
    liveSessionId: sessionId,
  });
  if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) {
    throw new Error('Cloudflare did not return RTMPS credentials');
  }

  liveInputId = liveInput.uid;
  rtmpsUrl = liveInput.rtmpsUrl;
  streamKey = liveInput.rtmpsStreamKey;
  encryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);
}
```

Insert live session:

```ts
const urls = getStreamPlaybackUrls(liveInputId);

const { data: liveSession, error: liveError } = await admin
  .from('live_sessions')
  .insert({
    id: sessionId,
    user_id: user.id,
    host_user_id: user.id,
    owner_id: user.id,
    mode: 'rtmp_obs',
    title,
    description,
    privacy,
    status: 'waiting_for_obs',
    recording_status: 'processing',
    processing_started_at: new Date().toISOString(),
    channel_name: channelName,
    rtmp_config_id: rtmpConfigId,
    is_persistent_stream: wantsPersistent,
    cloudflare_live_input_id: liveInputId,
    rtmps_url: rtmpsUrl,
    stream_key_encrypted: encryptedKey,
    stream_key_last_reset_at: new Date().toISOString(),
    playback_url: urls.hls,
    hls_url: urls.hls,
    storage_provider: 'cloudflare_stream',
    playback_provider: 'cloudflare_stream',
    archive_status: 'pending',
  })
  .select('id, status, cloudflare_live_input_id, rtmps_url, hls_url, playback_url, post_id, live_post_id, title, description, source_connected_at, cloudflare_video_uid, rtmp_config_id, is_persistent_stream')
  .single();

if (liveError) throw liveError;
return json(await serializeSession(liveSession, streamKey, { resumed: false }));
```

## 8. Reset Stream Key theo mode

File:

```txt
supabase/functions/reset-rtmp-stream-key/index.ts
```

Patch:

```diff
 .select('id, owner_id, host_user_id, mode, title, status, cloudflare_live_input_id')
+ .select('id, owner_id, host_user_id, mode, title, status, cloudflare_live_input_id, rtmp_config_id, is_persistent_stream')
```

Neu la persistent session thi update config:

```ts
const encryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);

if (session.is_persistent_stream && session.rtmp_config_id) {
  await admin.from('rtmp_stream_configs').update({
    cloudflare_live_input_id: liveInput.uid,
    rtmps_url: liveInput.rtmpsUrl,
    stream_key_encrypted: encryptedKey,
    stream_key_last_reset_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', session.rtmp_config_id).eq('user_id', user.id);
}

await admin.from('live_sessions').update({
  cloudflare_live_input_id: liveInput.uid,
  rtmps_url: liveInput.rtmpsUrl,
  stream_key_encrypted: encryptedKey,
  stream_key_last_reset_at: new Date().toISOString(),
  playback_url: urls.hls,
  hls_url: urls.hls,
  status: 'waiting_for_obs',
  source_connected_at: null,
  updated_at: new Date().toISOString(),
}).eq('id', liveSessionId);
```

Response:

```ts
return json({
  ok: true,
  live_session_id: session.id,
  rtmps_url: liveInput.rtmpsUrl,
  stream_key: liveInput.rtmpsStreamKey,
  hls_url: urls.hls,
  playback_url: urls.hls,
  rtmp_config_id: session.rtmp_config_id || null,
  is_persistent_stream: !!session.is_persistent_stream,
  status: 'waiting_for_obs',
});
```

## 9. Credentials API

File:

```txt
supabase/functions/get-rtmp-live-session-credentials/index.ts
```

Patch:

```diff
-.select('id, owner_id, host_user_id, mode, status, rtmps_url, stream_key_encrypted, hls_url')
+.select('id, owner_id, host_user_id, mode, status, rtmps_url, stream_key_encrypted, hls_url, playback_url, cloudflare_video_uid, rtmp_config_id, is_persistent_stream')
```

Response:

```ts
return json({
  ok: true,
  live_session_id: session.id,
  status: session.status,
  rtmps_url: session.rtmps_url,
  stream_key: session.stream_key_encrypted ? await decryptStreamKey(session.stream_key_encrypted) : null,
  hls_url: session.hls_url,
  playback_url: session.playback_url || session.hls_url || null,
  cloudflare_video_uid: session.cloudflare_video_uid || null,
  rtmp_config_id: session.rtmp_config_id || null,
  is_persistent_stream: !!session.is_persistent_stream,
  producer_url: `/live/obs/${session.id}`,
});
```

## 10. Status API

File:

```txt
supabase/functions/get-rtmp-live-session-status/index.ts
```

Patch:

```diff
-.select('id, owner_id, host_user_id, mode, status, title, description, source_connected_at, cloudflare_live_input_id, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error')
+.select('id, owner_id, host_user_id, mode, status, title, description, source_connected_at, cloudflare_live_input_id, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error, rtmp_config_id, is_persistent_stream')
```

Va khi update/select lai:

```diff
-.select('id, status, title, description, source_connected_at, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error')
+.select('id, status, title, description, source_connected_at, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error, rtmp_config_id, is_persistent_stream')
```

## 11. End RTMP session

File:

```txt
supabase/functions/end-rtmp-live-session/index.ts
```

Quan trong: khong revoke/delete persistent Live Input.

Patch:

```diff
-if (body.revoke_live_input !== false && session.cloudflare_live_input_id) {
+if (!session.is_persistent_stream && body.revoke_live_input !== false && session.cloudflare_live_input_id) {
  await deleteStreamLiveInput(session.cloudflare_live_input_id).catch((err) => {
    console.warn('[end-rtmp-live-session] live input revoke failed', String(err));
  });
}
```

## 12. Stream webhook mapping

File:

```txt
supabase/functions/stream-webhook/index.ts
```

Van de persistent:

- 1 `cloudflare_live_input_id` co the duoc dung qua nhieu live sessions.
- Webhook phai map ve active session moi nhat.
- Neu persistent input connected nhung chua co active session, tao draft session cho user/config.

Patch tim session moi nhat:

```diff
-const { data: session } = await admin
+let { data: session } = await admin
  .from('live_sessions')
  .select('*')
  .eq('cloudflare_live_input_id', liveInputId)
+ .in('status', ['waiting_for_obs', 'source_connected', 'ready_to_go_live', 'live'])
+ .order('updated_at', { ascending: false })
+ .limit(1)
  .maybeSingle();
```

Fallback tao draft session tu config:

```ts
if (!session) {
  const { data: config } = await admin
    .from('rtmp_stream_configs')
    .select('*')
    .eq('cloudflare_live_input_id', liveInputId)
    .is('deleted_at', null)
    .maybeSingle();

  if (config) {
    const nowForDraft = new Date().toISOString();
    const draftId = crypto.randomUUID();
    const { data: createdSession } = await admin
      .from('live_sessions')
      .insert({
        id: draftId,
        user_id: config.user_id,
        owner_id: config.user_id,
        host_user_id: config.user_id,
        mode: 'rtmp_obs',
        status: isConnected ? 'source_connected' : 'waiting_for_obs',
        title: '',
        description: '',
        privacy: 'public',
        channel_name: `rtmp_${String(config.user_id).replace(/-/g, '').slice(0, 12)}_${Date.now()}`,
        rtmp_config_id: config.id,
        is_persistent_stream: !!config.is_persistent,
        cloudflare_live_input_id: liveInputId,
        rtmps_url: config.rtmps_url,
        stream_key_encrypted: config.stream_key_encrypted,
        stream_key_last_reset_at: config.stream_key_last_reset_at,
        playback_url: getStreamPlaybackUrls(liveInputId).hls,
        hls_url: getStreamPlaybackUrls(liveInputId).hls,
        source_connected_at: isConnected ? nowForDraft : null,
        recording_status: isConnected ? 'recording' : 'processing',
        archive_status: 'pending',
        storage_provider: 'cloudflare_stream',
        playback_provider: 'cloudflare_stream',
      })
      .select('*')
      .single();
    session = createdSession;
  }
}
```

## 13. Security

Da dam bao:

- Stream Key van luu encrypted.
- Chi owner moi lay duoc credentials qua Edge Functions.
- `rtmp_stream_configs` co RLS owner-only.
- URL `/live/obs/:sessionId` khong tu no expose key; frontend van phai goi backend co auth.
- Reset key persistent chi update config cua `user.id`.
- Khong log Stream Key.
- Khong expose Cloudflare token/R2 secret ra frontend.

## 14. Test checklist

### Test luong tam thoi

1. Mo `/live/obs`.
2. Dam bao toggle "Luong co dinh" OFF.
3. App redirect sang `/live/obs/:sessionId`.
4. Copy RTMPS URL + Stream Key vao OBS.
5. Start Streaming.
6. Checklist source connected.
7. Nhap title/description.
8. Bam Phat truc tiep.
9. Stop live.
10. Replay archive R2 chay nhu cu.
11. Lan sau tao session moi co the co key moi.

### Test luong co dinh

1. Mo `/live/obs`.
2. Bat "Luong co dinh".
3. App tao/load `rtmp_stream_configs`.
4. Copy RTMPS URL + Stream Key vao OBS.
5. Start Streaming lan 1.
6. Phat truc tiep, end live, archive replay.
7. Mo lai Producer ngay hom sau.
8. Bat "Luong co dinh".
9. RTMPS URL + Stream Key van nhu cu.
10. OBS dung key cu van live duoc.
11. Session/post/replay moi duoc tao, khong ghi de replay cu.

### Test reset persistent key

1. Bat "Luong co dinh".
2. Bam "Dat lai Stream Key".
3. Xac nhan warning.
4. Key moi hien ra.
5. OBS key cu khong dung duoc nua.
6. OBS key moi live duoc.

### Test security

1. User A tao `/live/obs/:sessionId`.
2. User B mo URL do.
3. Backend phai tra Forbidden khi lay credentials.
4. User B khong thay Stream Key cua User A.

### Test conflict nhieu tab

1. Mo 2 tab `/live/obs`.
2. Neu co active session, route cu phai resume session active thay vi tao duplicate.
3. Neu forceNew do doi mode, session moi co URL rieng.

## 15. Verification

Da chay:

```bash
npx tsc --noEmit
npx eslint src/modules/live/pages/RtmpLivePage.tsx src/App.tsx
npx eslint supabase/functions/create-rtmp-live-session/index.ts supabase/functions/reset-rtmp-stream-key/index.ts supabase/functions/get-rtmp-live-session-status/index.ts supabase/functions/get-rtmp-live-session-credentials/index.ts supabase/functions/end-rtmp-live-session/index.ts supabase/functions/stream-webhook/index.ts
npx vite build
```

Ket qua:

- Typecheck pass.
- ESLint pass.
- Vite build pass.
- Build co mot so warning cu ve Rollup pure annotation, chunk size, va dynamic/static import `sonner`; khong lien quan tinh nang nay.

## 16. Rollback

Neu can rollback:

1. Revert route `/live/obs/:sessionId` trong `src/App.tsx`.
2. Revert toggle/mode logic trong `RtmpLivePage.tsx`.
3. Revert cac thay doi trong:
   - `create-rtmp-live-session`
   - `reset-rtmp-stream-key`
   - `get-rtmp-live-session-status`
   - `get-rtmp-live-session-credentials`
   - `end-rtmp-live-session`
   - `stream-webhook`
4. Neu migration da apply va can rollback DB:

```sql
ALTER TABLE public.live_sessions
  DROP COLUMN IF EXISTS rtmp_config_id,
  DROP COLUMN IF EXISTS is_persistent_stream;

DROP TABLE IF EXISTS public.rtmp_stream_configs;
```

Luu y: chi drop bang config neu chac chan khong can giu persistent stream keys da tao.

## 17. Ket luan

Tinh nang nay tach ro:

- **RTMP stream config**: credential/Live Input lau dai cua user.
- **Live session**: mot lan live cu the, co title, description, post, replay, archive.

Ket qua:

- Moi user/session RTMP co URL rieng.
- User co the chon luong tam thoi hoac luong co dinh.
- Luong co dinh giu Stream Key de dung lai trong OBS.
- Luong tam thoi van tao key rieng theo tung phien.
- Khong dung chung Stream Key/Live Input giua user.
- Persistent Live Input khong bi xoa khi end live.
