# Agora Realtime + Cloudflare Stream VOD Full Source Package

This package is generated from the local FUN PROFILE repository. It contains the full source for the chosen livestream architecture: Agora RTC for low-latency realtime live, and Cloudflare Stream for VOD/replay processing and HLS playback.

## Architecture Decision

- Keep Agora RTC as the realtime live transport for host/viewer latency.
- Do not use Cloudflare Stream Live Input, RTMPS, or Cloudflare HLS for the realtime live session.
- Use browser MediaRecorder chunks as the recording source, upload chunks to Cloudflare R2, then ingest those chunks into Cloudflare Stream using server-side TUS.
- Treat Cloudflare Stream HLS as the VOD source of truth. R2 chunked manifest is backup/recovery metadata only, not the primary public replay.

## Runtime Flow

```text
Host camera/microphone
  -> Agora RTC publish
  -> Viewers subscribe through Agora

End live
  -> MediaRecorder WebM chunks
  -> R2 chunk upload + manifest
  -> live_replays queued
  -> Cloudflare Stream TUS ingest
  -> Cloudflare transcode
  -> stream-webhook or poll-status updates DB
  -> post.video_url = Cloudflare HLS only when ready
  -> ReplayPlayer plays native HLS on Safari or hls.js elsewhere
```

## Required Secrets

Do not put real values in frontend code. Configure these as Supabase/Lovable Edge Function secrets.

- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_STREAM_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_TOKEN` or `CLOUDFLARE_STREAM_API_TOKEN`
- `CLOUDFLARE_STREAM_CUSTOMER_CODE`
- `CLOUDFLARE_STREAM_WEBHOOK_SECRET`
- `CLOUDFLARE_ACCESS_KEY_ID`
- `CLOUDFLARE_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET_NAME`
- `CLOUDFLARE_R2_PUBLIC_URL`
- `CRON_SECRET` or `CRON_SHARED_SECRET`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Production Health Signal

The admin debug action `test_cloudflare_api` should return `stream.success=true` and `webhook.success=true`. A replay is healthy when `live_replays.status=ready`, `stream_uid` is present, `playback_hls` is a Cloudflare Stream `.m3u8` URL, and `thumbnail_url` is present.

Observed good response shape from production:

```json
{
  "ok": true,
  "stream": { "httpStatus": 200, "success": true, "errors": [] },
  "webhook": { "httpStatus": 200, "success": true, "errors": [] }
}
```

## Deploy Checklist

1. Apply all included migrations.
2. Deploy all included Supabase Edge Functions.
3. Set all required secrets.
4. Register Cloudflare Stream webhook to `/functions/v1/stream-webhook` and copy its secret into `CLOUDFLARE_STREAM_WEBHOOK_SECRET`.
5. Ensure cron invokes `auto-finalize-recordings`, `live-replay-stream-ingest`, and `live-replay-poll-status`.
6. Test a new livestream end-to-end: live via Agora, replay queued/uploading/processing/ready via Cloudflare Stream.

## Full Source Files

## src/modules/live/hooks/useLiveRtc.ts

``ts
import { useCallback, useEffect, useRef, useState } from 'react';
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { createAgoraRtcClient, secondsUntilExpiry } from '@/lib/agoraRtc';
import { getRtcToken } from '../api/agora';

type LiveRole = 'host' | 'audience';

interface UseLiveRtcOptions {
  sessionId?: string;
  role: LiveRole;
  enabled?: boolean;
  onViewerCountChange?: (count: number) => void;
  onRemoteOffline?: () => void;
}

const MAX_REJOIN_ATTEMPTS = 5;

function mapRtcError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const msg = error instanceof Error ? error.message : String(error || '');
  if (name === 'NotAllowedError') return 'Báº¡n chÆ°a cáº¥p quyá»n camera/micro.';
  if (name === 'NotFoundError') return 'KhÃ´ng tÃ¬m tháº¥y thiáº¿t bá»‹ camera/micro.';
  if (msg.toLowerCase().includes('network')) return 'Máº¡ng khÃ´ng á»•n Ä‘á»‹nh, Ä‘ang thá»­ káº¿t ná»‘i láº¡i...';
  if (msg.toLowerCase().includes('timeout')) return 'Káº¿t ná»‘i quÃ¡ cháº­m, vui lÃ²ng thá»­ láº¡i.';
  return msg || 'Káº¿t ná»‘i LIVE tháº¥t báº¡i.';
}

export function useLiveRtc({
  sessionId,
  role,
  enabled = true,
  onViewerCountChange,
  onRemoteOffline,
}: UseLiveRtcOptions) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const remoteAudioRef = useRef<any>(null);
  const tokenExpiresAtRef = useRef<number | null>(null);
  const rejoinAttemptsRef = useRef(0);
  const renewFailuresRef = useRef(0);
  const rejoinTimerRef = useRef<number | null>(null);
  const isLeavingRef = useRef(false);
  const startedRef = useRef(false);

  const localContainerRef = useRef<HTMLDivElement | null>(null);
  const [localContainerMounted, setLocalContainerMounted] = useState(false);

  const setLocalContainerRef = useCallback((node: HTMLDivElement | null) => {
    localContainerRef.current = node;
    setLocalContainerMounted(!!node);
  }, []);
  const remoteContainerRef = useRef<HTMLDivElement | null>(null);

  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [statusText, setStatusText] = useState('Connecting...');

  const emitViewerCount = useCallback((_client: IAgoraRTCClient) => {
    // no-op: viewer count managed by increment/decrement in LiveAudiencePage
  }, []);

  const clearRejoinTimer = () => {
    if (rejoinTimerRef.current) {
      window.clearTimeout(rejoinTimerRef.current);
      rejoinTimerRef.current = null;
    }
  };

  const playRemote = useCallback((user: IAgoraRTCRemoteUser) => {
    if (user.videoTrack && remoteContainerRef.current) {
      user.videoTrack.play(remoteContainerRef.current);
      setHasRemoteVideo(true);
    }
    if (user.audioTrack) {
      remoteAudioRef.current = user.audioTrack;
      user.audioTrack.play();
    }
  }, []);

  const refreshToken = useCallback(async () => {
    if (!sessionId || !clientRef.current) return;
    const tokenData = await getRtcToken({ sessionId, role });
    tokenExpiresAtRef.current = tokenData.expiresAt;
    await clientRef.current.renewToken(tokenData.token);
    renewFailuresRef.current = 0;
  }, [role, sessionId]);

  const leave = useCallback(async () => {
    isLeavingRef.current = true;
    clearRejoinTimer();
    renewFailuresRef.current = 0;
    rejoinAttemptsRef.current = 0;

    localAudioRef.current?.close();
    localVideoRef.current?.close();
    localAudioRef.current = null;
    localVideoRef.current = null;
    remoteAudioRef.current?.stop?.();
    remoteAudioRef.current = null;
    setHasRemoteVideo(false);
    setIsJoined(false);
    startedRef.current = false;

    if (clientRef.current) {
      clientRef.current.removeAllListeners();
      await clientRef.current.leave();
      clientRef.current = null;
    }
  }, []);

  const rejoinWithBackoff = useCallback(async () => {
    if (!sessionId || !clientRef.current || isLeavingRef.current) return;
    if (rejoinAttemptsRef.current >= MAX_REJOIN_ATTEMPTS) {
      setStatusText('Káº¿t ná»‘i tháº¥t báº¡i, thá»­ táº£i láº¡i.');
      return;
    }

    rejoinAttemptsRef.current += 1;
    const attempt = rejoinAttemptsRef.current;
    const delay = Math.min(1000 * 2 ** (attempt - 1), 12000);
    clearRejoinTimer();

    rejoinTimerRef.current = window.setTimeout(async () => {
      try {
        const tokenData = await getRtcToken({ sessionId, role });
        tokenExpiresAtRef.current = tokenData.expiresAt;
        await clientRef.current?.leave();
        await clientRef.current?.join(tokenData.appId, tokenData.channel, tokenData.token, tokenData.uid);

        if (role === 'host' && localAudioRef.current) {
          if (localVideoRef.current) {
            await clientRef.current?.publish([localAudioRef.current, localVideoRef.current]);
          } else {
            await clientRef.current?.publish(localAudioRef.current);
          }
          if (clientRef.current) emitViewerCount(clientRef.current);
        }

        rejoinAttemptsRef.current = 0;
        setStatusText(role === 'audience' ? 'Waiting for host...' : 'LIVE');
        setIsJoined(true);
      } catch (error) {
        setStatusText(mapRtcError(error));
        rejoinWithBackoff().catch(() => undefined);
      }
    }, delay);
  }, [emitViewerCount, role, sessionId]);

  const setupClient = useCallback(() => {
    if (clientRef.current) return clientRef.current;

    const client = createAgoraRtcClient('live');
    clientRef.current = client;

    client.on('user-joined', () => {
      emitViewerCount(client);
    });

    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      playRemote(user);
      emitViewerCount(client);
    });

    client.on('user-unpublished', () => {
      setHasRemoteVideo(false);
      if (role === 'audience') {
        setStatusText('Host táº¡m dá»«ng phÃ¡t...');
        onRemoteOffline?.();
      }
    });

    client.on('user-left', () => {
      emitViewerCount(client);
      if (role === 'audience') {
        setHasRemoteVideo(false);
        setStatusText('Host Ä‘Ã£ rá»i phiÃªn live');
        onRemoteOffline?.();
      }
    });

    client.on('connection-state-change', (curState, _prevState, reason) => {
      if (curState === 'DISCONNECTED' && reason !== 'LEAVE' && !isLeavingRef.current) {
        setStatusText('Máº¡ng khÃ´ng á»•n Ä‘á»‹nh, Ä‘ang thá»­ káº¿t ná»‘i láº¡i...');
        rejoinWithBackoff().catch(() => undefined);
      }
    });

    client.on('token-privilege-will-expire', () => {
      refreshToken().catch(() => {
        renewFailuresRef.current += 1;
        if (renewFailuresRef.current >= 2) {
          setStatusText('Äang cáº¥p láº¡i token...');
          rejoinWithBackoff().catch(() => undefined);
        }
      });
    });

    client.on('token-privilege-did-expire', () => {
      refreshToken().catch(() => {
        renewFailuresRef.current += 1;
        setStatusText('Token háº¿t háº¡n, Ä‘ang káº¿t ná»‘i láº¡i...');
        rejoinWithBackoff().catch(() => undefined);
      });
    });

    return client;
  }, [emitViewerCount, onRemoteOffline, playRemote, refreshToken, rejoinWithBackoff, role]);

  const start = useCallback(async () => {
    if (!sessionId || !enabled) return;
    if (startedRef.current) return;
    startedRef.current = true;
    isLeavingRef.current = false;
    setStatusText('Connecting...');

    try {
      const tokenData = await getRtcToken({ sessionId, role });
      tokenExpiresAtRef.current = tokenData.expiresAt;
      const client = setupClient();
      await client.setClientRole(role);
      await client.join(tokenData.appId, tokenData.channel, tokenData.token, tokenData.uid);
      emitViewerCount(client);

      if (role === 'host') {
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localAudioRef.current = audioTrack;
        localVideoRef.current = videoTrack;
        if (localContainerRef.current) {
          videoTrack.play(localContainerRef.current);
        }
        await client.publish([audioTrack, videoTrack]);
        setStatusText('LIVE');
      } else {
        setStatusText('Waiting for host...');
        for (const user of client.remoteUsers) {
          if (user.hasVideo) await client.subscribe(user, 'video');
          if (user.hasAudio) await client.subscribe(user, 'audio');
          playRemote(user);
        }
      }

      setIsJoined(true);
      rejoinAttemptsRef.current = 0;
      renewFailuresRef.current = 0;
    } catch (error) {
      startedRef.current = false;
      setStatusText(mapRtcError(error));
      throw error;
    }
  }, [emitViewerCount, enabled, playRemote, role, sessionId, setupClient]);

  const toggleMute = useCallback(async () => {
    if (!localAudioRef.current) return;
    const next = !isMuted;
    await localAudioRef.current.setEnabled(!next);
    setIsMuted(next);
  }, [isMuted]);

  const toggleCamera = useCallback(async () => {
    if (!localVideoRef.current) return;
    const next = !isCameraOff;
    await localVideoRef.current.setEnabled(!next);
    setIsCameraOff(next);
  }, [isCameraOff]);

  const toggleRemoteAudio = useCallback(() => {
    if (!remoteAudioRef.current) return;
    if (isMuted) {
      remoteAudioRef.current.play();
      setIsMuted(false);
    } else {
      remoteAudioRef.current.stop();
      setIsMuted(true);
    }
  }, [isMuted]);

  useEffect(() => {
    if (!tokenExpiresAtRef.current || !isJoined) return;
    const secondsLeft = secondsUntilExpiry(tokenExpiresAtRef.current);
    if (secondsLeft > 90) return;
    refreshToken().catch(() => {
      rejoinWithBackoff().catch(() => undefined);
    });
  }, [isJoined, refreshToken, rejoinWithBackoff]);

  useEffect(() => {
    if (localContainerMounted && localVideoRef.current && localContainerRef.current) {
      localVideoRef.current.play(localContainerRef.current);
    }
  }, [localContainerMounted]);

  useEffect(() => {
    return () => {
      leave().catch(() => undefined);
    };
  }, [leave]);

  const getLocalTracks = useCallback(() => ({
    audio: localAudioRef.current,
    video: localVideoRef.current,
  }), []);

  return {
    setLocalContainerRef,
    remoteContainerRef,
    isJoined,
    isMuted,
    isCameraOff,
    hasRemoteVideo,
    statusText,
    start,
    leave,
    toggleMute,
    toggleCamera,
    toggleRemoteAudio,
    getLocalTracks,
  };
}
````

## src/modules/live/api/agora.ts

``ts
import { supabase } from '@/integrations/supabase/client';

export type LiveRtcRole = 'host' | 'audience' | 'recorder';

export interface GetRtcTokenInput {
  sessionId?: string;
  channelName?: string;
  uid?: string | number;
  role: LiveRtcRole;
  expireSeconds?: number;
}

export interface RtcTokenResult {
  appId: string;
  token: string;
  uid: string | number;
  channel: string;
  expiresAt?: number;
}

export async function getRtcToken(input: GetRtcTokenInput): Promise<RtcTokenResult> {
  const { data, error } = await supabase.functions.invoke('live-token', {
    body: {
      sessionId: input.sessionId,
      channelName: input.channelName,
      uid: input.uid,
      role: input.role,
      expireSeconds: input.expireSeconds,
    },
  });

  if (error) throw error;
  if (!data?.token || !data?.appId || !data?.channel) {
    throw new Error('Invalid live-token response');
  }

  return {
    appId: data.appId,
    token: data.token,
    uid: data.uid,
    channel: data.channel,
    expiresAt: data.expiresAt,
  };
}
````

## src/modules/live/pages/LiveHostPage.tsx

``tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Clock, Eye, Home, Loader2, Mic, MicOff, PhoneOff, Radio, RefreshCw, Video, VideoOff } from 'lucide-react';
import { toast } from 'sonner';
import { usePplpEvaluate } from '@/hooks/usePplpEvaluate';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

import { supabase } from '@/integrations/supabase/client';
import {
  createLiveSession,
  finalizeLiveSession,
  updateLiveViewerCount,
  uploadLiveRecording,
  uploadLiveThumbnail,
  attachLiveReplayToPost,
  createChunkedRecording,
  type RecordingStatus,
} from '../liveService';
import { createRecorder, type RecorderController } from '../recording/clientRecorder';
import { useLiveRecording, type RecordingPhase } from '@/hooks/live/useLiveRecording';
import { useLiveSession } from '../useLiveSession';
import { useLiveRtc } from '../hooks/useLiveRtc';
import { useLiveHeartbeat } from '../hooks/useLiveHeartbeat';
import { LiveChatPanel } from '../components/LiveChatPanel';
import { FloatingReactions } from '../components/FloatingReactions';
import { useLiveDuration } from '../hooks/useLiveDuration';
import { useLivePresence } from '../hooks/useLivePresence';

type BootState = 'idle' | 'auth' | 'creating' | 'loading' | 'starting' | 'ready' | 'error';

const CHUNKED_RECORDING_ENABLED = true;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function toUserError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError') return 'Báº¡n chÆ°a cáº¥p quyá»n camera/micro.';
  if (name === 'NotFoundError') return 'KhÃ´ng tÃ¬m tháº¥y thiáº¿t bá»‹ camera/micro.';
  const lower = message.toLowerCase();
  if (lower.includes('auth timeout')) return 'XÃ¡c thá»±c quÃ¡ cháº­m, vui lÃ²ng thá»­ láº¡i.';
  if (lower.includes('create live session timeout')) return 'Táº¡o phiÃªn LIVE quÃ¡ lÃ¢u, vui lÃ²ng thá»­ láº¡i.';
  if (lower.includes('timeout')) return 'Káº¿t ná»‘i quÃ¡ cháº­m, vui lÃ²ng thá»­ láº¡i.';
  return message || 'KhÃ´ng thá»ƒ báº¯t Ä‘áº§u phÃ¡t trá»±c tiáº¿p.';
}

function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return message.includes('timeout') || message.includes('network') || message.includes('fetch');
}

/** Map recording phase to UI status */
function phaseToRecordingStatus(phase: RecordingPhase): RecordingStatus {
  const map: Record<RecordingPhase, RecordingStatus> = {
    idle: 'idle',
    recording: 'recording',
    stopping: 'stopping',
    uploading: 'processing',
    queued: 'processing',
    processing: 'processing',
    done: 'ready',
    error: 'failed',
  };
  return map[phase] ?? 'idle';
}

const REC_BADGE: Record<RecordingStatus, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  idle: { label: 'â¸ Sáºµn sÃ ng', variant: 'secondary' },
  acquiring: { label: 'â³ Äang chuáº©n bá»‹...', variant: 'secondary' },
  starting: { label: 'â³ Äang báº¯t Ä‘áº§u...', variant: 'secondary' },
  recording: { label: 'âº Äang ghi', variant: 'destructive' },
  stopping: { label: 'â³ Äang dá»«ng...', variant: 'secondary' },
  compressing: { label: 'ðŸ—œ Äang nÃ©n...', variant: 'secondary' },
  processing: { label: 'â³ Äang táº£i lÃªn...', variant: 'secondary' },
  ready: { label: 'âœ“ ÄÃ£ lÆ°u', variant: 'default' },
  failed: { label: 'âœ• Lá»—i ghi hÃ¬nh', variant: 'outline' },
  stopped: { label: 'â–  ÄÃ£ dá»«ng', variant: 'secondary' },
};

export default function LiveHostPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { evaluateAsync } = usePplpEvaluate();
  const { liveSessionId } = useParams<{ liveSessionId: string }>();
  const preLiveState = (location.state as { title?: string; privacy?: string } | null);

  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [bootState, setBootState] = useState<BootState>('idle');
  const [bootError, setBootError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [recordingState, setRecordingState] = useState<RecordingStatus>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [compressProgress, setCompressProgress] = useState<number>(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const startedRef = useRef(false);
  const browserRecorderRef = useRef<RecorderController | null>(null);
  const lastSentViewerCountRef = useRef<number | null>(null);
  const viewerCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveSessionId = liveSessionId || createdSessionId || undefined;
  const sessionQuery = useLiveSession(effectiveSessionId);
  const session = sessionQuery.data;

  const {
    setLocalContainerRef,
    isJoined,
    isMuted,
    isCameraOff,
    statusText,
    start,
    leave,
    toggleMute,
    toggleCamera,
    getLocalTracks,
  } = useLiveRtc({
    sessionId: effectiveSessionId,
    role: 'host',
    enabled: !!effectiveSessionId && session?.status !== 'ended',
    onViewerCountChange: async (count) => {
      if (!effectiveSessionId) return;
      if (lastSentViewerCountRef.current === count) return;
      if (viewerCountTimerRef.current) {
        clearTimeout(viewerCountTimerRef.current);
      }
      viewerCountTimerRef.current = setTimeout(async () => {
        if (!effectiveSessionId) return;
        if (lastSentViewerCountRef.current === count) return;
        lastSentViewerCountRef.current = count;
        await updateLiveViewerCount(effectiveSessionId, count);
      }, 400);
    },
  });

  // Get local tracks for the chunked recording hook
  const localTracks = getLocalTracks();

  // Chunked recording hook
  const recording = useLiveRecording({
    videoTrack: CHUNKED_RECORDING_ENABLED ? (localTracks.video ?? null) : null,
    audioTrack: CHUNKED_RECORDING_ENABLED ? (localTracks.audio ?? null) : null,
    sessionId: CHUNKED_RECORDING_ENABLED ? effectiveSessionId : undefined,
    recordingId: CHUNKED_RECORDING_ENABLED ? (recordingId ?? undefined) : undefined,
    autoStart: CHUNKED_RECORDING_ENABLED && isJoined,
  });

  // Mark live host session active so AuthSessionKeeper / ChunkLoadRecovery skip disruptive reloads
  useEffect(() => {
    (window as any).__LIVE_ACTIVE__ = true;
    return () => {
      (window as any).__LIVE_ACTIVE__ = false;
    };
  }, []);

  // Sync recording phase to UI state
  useEffect(() => {
    if (CHUNKED_RECORDING_ENABLED && recording.phase !== 'idle') {
      setRecordingState(phaseToRecordingStatus(recording.phase));
    }
  }, [recording.phase]);

  // Sync upload stats to progress
  useEffect(() => {
    if (CHUNKED_RECORDING_ENABLED && recording.uploadStats.total > 0) {
      setUploadProgress(Math.round((recording.uploadStats.uploaded / recording.uploadStats.total) * 100));
    }
  }, [recording.uploadStats]);

  useEffect(() => {
    if (CHUNKED_RECORDING_ENABLED && recording.streamUploadProgress > 0) {
      setUploadProgress(recording.streamUploadProgress);
    }
  }, [recording.streamUploadProgress]);

  const liveDuration = useLiveDuration(session?.started_at, session?.status === 'live' && isJoined);
  const { viewers } = useLivePresence(effectiveSessionId);

  // Sync viewer count from Presence â†’ DB every 10s
  const viewerSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!effectiveSessionId || session?.status !== 'live') return;
    viewerSyncRef.current = setInterval(() => {
      const count = viewers.length;
      if (lastSentViewerCountRef.current !== count) {
        lastSentViewerCountRef.current = count;
        updateLiveViewerCount(effectiveSessionId, count);
      }
    }, 10000);
    return () => {
      if (viewerSyncRef.current) clearInterval(viewerSyncRef.current);
    };
  }, [effectiveSessionId, session?.status, viewers.length]);

  const isHost = useMemo(() => !!session && !!userId && session.host_user_id === userId, [session, userId]);

  // Heartbeat: keep session alive every 15s
  useLiveHeartbeat(effectiveSessionId, isHost);

  // Realtime force-stop: if another device starts live, this session gets ended
  useEffect(() => {
    if (!effectiveSessionId) return;

    const channel = supabase
      .channel(`live-force-stop-${effectiveSessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_sessions',
        filter: `id=eq.${effectiveSessionId}`,
      }, (payload: any) => {
        if (payload.new.status === 'ended') {
          toast.info('PhiÃªn live Ä‘Ã£ káº¿t thÃºc vÃ¬ báº¡n báº¯t Ä‘áº§u live tá»« thiáº¿t bá»‹ khÃ¡c.');
          leave();
          navigate('/');
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [effectiveSessionId, leave, navigate]);

  const runBootstrap = useCallback(async () => {
    setBootError(null);
    setBootState('auth');
    setCreatedSessionId(null);

    const authResult = await withTimeout(supabase.auth.getSession(), 15000, 'auth timeout');
    const currentUserId = authResult.data.session?.user?.id;
    if (!currentUserId) {
      throw new Error('Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ phÃ¡t trá»±c tiáº¿p.');
    }
    setUserId(currentUserId);

    if (liveSessionId) {
      setBootState('loading');
      return;
    }

    setBootState('creating');

    // Auto-retry 1 láº§n khi táº¡o session bá»‹ lá»—i táº¡m thá»i (timeout / network)
    const createWithRetry = async () => {
      try {
        return await withTimeout(
          createLiveSession({
            privacy: preLiveState?.privacy === 'friends' ? 'friends' : 'public',
            title: preLiveState?.title,
          }),
          30000,
          'create live session timeout'
        );
      } catch (err) {
        if (!isTransientError(err)) throw err;
        console.warn('[LiveHost] createLiveSession failed, retrying once:', err);
        await new Promise((r) => setTimeout(r, 1000));
        return await withTimeout(
          createLiveSession({
            privacy: preLiveState?.privacy === 'friends' ? 'friends' : 'public',
            title: preLiveState?.title,
          }),
          30000,
          'create live session timeout'
        );
      }
    };

    const created = await createWithRetry();
    setCreatedSessionId(created.id);

    // Create chunked_recordings row for DB tracking
    if (CHUNKED_RECORDING_ENABLED) {
      try {
        const recId = await createChunkedRecording(
          currentUserId,
          created.id,
          created.channel_name,
          'video/webm;codecs=vp8,opus'
        );
        setRecordingId(recId);
      } catch (err) {
        console.warn('[LiveHost] createChunkedRecording failed:', err);
      }
    }

    setBootState('loading');
    navigate(`/live/${created.id}/host`, { replace: true });
  }, [liveSessionId, navigate, preLiveState?.privacy, preLiveState?.title]);

  useEffect(() => {
    let active = true;
    runBootstrap().catch((error) => {
      if (!active) return;
      setBootState('error');
      setBootError(toUserError(error));
    });

    return () => {
      active = false;
    };
  }, [retryNonce, runBootstrap]);

  useEffect(() => {
    if (typeof session?.viewer_count === 'number') {
      lastSentViewerCountRef.current = session.viewer_count;
    }
  }, [session?.viewer_count]);

  useEffect(() => {
    if (!effectiveSessionId) return;
    if (sessionQuery.isLoading) return;
    if (sessionQuery.isError) {
      setBootState('error');
      setBootError('KhÃ´ng táº£i Ä‘Æ°á»£c phiÃªn LIVE. Vui lÃ²ng thá»­ láº¡i.');
      return;
    }
    if (!session) {
      setBootState('error');
      setBootError('KhÃ´ng tÃ¬m tháº¥y phiÃªn LIVE.');
      return;
    }
    if (bootState !== 'starting') {
      setBootState('ready');
    }
  }, [bootState, effectiveSessionId, session, sessionQuery.isError, sessionQuery.isLoading]);

  // Start Agora RTC + Browser Recording (legacy path only)
  useEffect(() => {
    if (!session || !isHost || session.status === 'ended' || startedRef.current) return;
    startedRef.current = true;
    setBootState('starting');

    start()
      .then(async () => {
        setBootState('ready');

        // Legacy single-blob recording (when chunked is disabled)
        if (!CHUNKED_RECORDING_ENABLED) {
          try {
            const tracks = getLocalTracks();
            if (tracks.video && tracks.audio) {
              const stream = new MediaStream();
              const videoTrack = tracks.video.getMediaStreamTrack();
              const audioTrack = tracks.audio.getMediaStreamTrack();
              if (videoTrack) stream.addTrack(videoTrack);
              if (audioTrack) stream.addTrack(audioTrack);

              const recorder = createRecorder(stream);
              recorder.start();
              browserRecorderRef.current = recorder;
              setRecordingState('recording');
              setRecordingError(null);
            } else {
              setRecordingState('failed');
              setRecordingError('KhÃ´ng láº¥y Ä‘Æ°á»£c track video/audio Ä‘á»ƒ ghi hÃ¬nh.');
            }
          } catch (recErr: any) {
            setRecordingState('failed');
            setRecordingError(recErr?.message || 'KhÃ´ng thá»ƒ báº¯t Ä‘áº§u ghi hÃ¬nh.');
            toast.error('KhÃ´ng thá»ƒ báº¯t Ä‘áº§u ghi hÃ¬nh báº±ng trÃ¬nh duyá»‡t.');
          }
        }
        // Chunked recording is handled by useLiveRecording hook (autoStart)
      })
      .catch((error) => {
        startedRef.current = false;
        const message = toUserError(error);
        setBootState('error');
        setBootError(message);
        toast.error(message);
      });
  }, [effectiveSessionId, isHost, session, start, getLocalTracks]);

  useEffect(() => {
    if (session?.status === 'ended') {
      leave().catch(() => undefined);
    }
  }, [leave, session?.status]);

  useEffect(() => {
    return () => {
      if (viewerCountTimerRef.current) {
        clearTimeout(viewerCountTimerRef.current);
      }
      leave().catch(() => undefined);
    };
  }, [leave]);

  async function generateThumbnailFromBlob(blob: Blob): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      let settled = false;

      const finish = (result: Blob | null) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        resolve(result);
      };

      const timer = setTimeout(() => finish(null), 10000);

      video.onloadeddata = () => {
        video.currentTime = Math.min(video.duration * 0.1, 2);
      };

      video.onseeked = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          canvas.getContext('2d')?.drawImage(video, 0, 0);
          canvas.toBlob((thumbBlob) => finish(thumbBlob), 'image/jpeg', 0.85);
        } catch {
          finish(null);
        }
      };

      video.onerror = () => {
        clearTimeout(timer);
        finish(null);
      };
    });
  }

  const handleEndLive = async (skipNavigate = false) => {
    if (!effectiveSessionId) return;
    if (viewerCountTimerRef.current) {
      clearTimeout(viewerCountTimerRef.current);
      viewerCountTimerRef.current = null;
    }

    let playbackUrl: string | null = null;
    let recordingStatus: RecordingStatus = 'failed';
    let thumbnailUrl: string | null = null;

    try {
      // === CHUNKED RECORDING PATH ===
      // KHÃ”NG cháº·n UI: dá»«ng ghi xong lÃ  Ä‘iá»u hÆ°á»›ng vá» feed ngay,
      // cÃ²n viá»‡c flush chunk + ingest sang Cloudflare cháº¡y ngáº§m.
      if (CHUNKED_RECORDING_ENABLED) {
        setRecordingState('stopping');
        try {
          await recording.stop();
        } catch (stopErr) {
          console.warn('[LiveHost] recording.stop failed (non-fatal):', stopErr);
        }

        // Mark session ended NGAY Ä‘á»ƒ viewer khÃ´ng káº¹t á»Ÿ "Ä‘ang live"
        try {
          await finalizeLiveSession(effectiveSessionId, {
            playbackUrl: null,
            recordingStatus: 'processing',
          });
        } catch (e) {
          console.warn('[LiveHost] finalizeLiveSession (early) failed:', e);
        }

        // Background finalize â€” khÃ´ng await
        recording.finalize().then(async (finalResult) => {
          try {
            const finalUrl = finalResult?.playbackHls ?? null;
            const finalStatus: RecordingStatus = finalResult
              ? (finalResult.status === 'ready' && finalUrl ? 'ready' : 'processing')
              : 'failed';
            if (finalResult) {
              await finalizeLiveSession(effectiveSessionId, {
                playbackUrl: finalUrl,
                recordingStatus: finalStatus,
              });
              if (finalUrl && finalStatus === 'ready') {
                await attachLiveReplayToPost(
                  effectiveSessionId,
                  finalUrl,
                  undefined,
                  finalResult.thumbnailUrl ?? undefined,
                ).catch((e) => console.warn('[LiveHost] attach replay failed:', e));
              }
            }
          } catch (e) {
            console.warn('[LiveHost] background finalize tail failed:', e);
          }
        }).catch((e) => {
          console.error('[LiveHost] background finalize failed:', e);
        });

        await leave();
        evaluateAsync({ action_type: 'livestream', reference_id: effectiveSessionId });
        toast.success('ÄÃ£ káº¿t thÃºc live. Replay Ä‘ang xá»­ lÃ½ ngáº§m â€” sáº½ tá»± xuáº¥t hiá»‡n trong vÃ i phÃºt.');
        if (!skipNavigate) navigate(`/live/${effectiveSessionId}`);
        return;
      }

      // === LEGACY SINGLE-BLOB PATH (giá»¯ nguyÃªn cho fallback) ===
      if (browserRecorderRef.current?.getState() === 'recording') {
        setRecordingState('stopping');
        const rawBlob = await browserRecorderRef.current.stop();
        if (rawBlob.size > 0) {
          setRecordingState('compressing');
          setCompressProgress(0);
          const { compressVideo } = await import('@/utils/videoCompression');
          const blob = await compressVideo(rawBlob, {
            onProgress: (p) => setCompressProgress(p),
          });

          setRecordingState('processing');
          setUploadProgress(0);

          try {
            const thumbBlob = await generateThumbnailFromBlob(blob);
            if (thumbBlob) {
              thumbnailUrl = await uploadLiveThumbnail(thumbBlob, effectiveSessionId);
            }
          } catch {
            // thumbnail failure won't block video upload
          }

          const { url } = await uploadLiveRecording(
            blob,
            effectiveSessionId,
            browserRecorderRef.current.getMimeType(),
            (percent) => setUploadProgress(percent)
          );
          playbackUrl = url;
          recordingStatus = 'ready';
          setRecordingState('ready');
        } else {
          setRecordingState('failed');
          setRecordingError('Video trá»‘ng, khÃ´ng thá»ƒ lÆ°u replay.');
        }
      } else {
        setRecordingState('failed');
        setRecordingError('KhÃ´ng cÃ³ báº£n ghi nÃ o Ä‘ang hoáº¡t Ä‘á»™ng.');
      }

      await finalizeLiveSession(effectiveSessionId, { playbackUrl, recordingStatus });
      if (playbackUrl && recordingStatus === 'ready') {
        try {
          await attachLiveReplayToPost(effectiveSessionId, playbackUrl, undefined, thumbnailUrl);
        } catch (attachErr) {
          console.warn('[LiveHost] attachLiveReplayToPost failed:', attachErr);
        }
      }

      await leave();
      evaluateAsync({ action_type: 'livestream', reference_id: effectiveSessionId });
      toast.success('Live Ä‘Ã£ káº¿t thÃºc!');
      if (!skipNavigate) {
        navigate(`/live/${effectiveSessionId}`);
      }
    } catch (error: any) {
      toast.error(error?.message || 'KhÃ´ng thá»ƒ káº¿t thÃºc live');
    }
  };

  const handleRetry = () => {
    startedRef.current = false;
    setCreatedSessionId(null);
    setRecordingId(null);
    setBootError(null);
    setBootState('idle');
    setRetryNonce((x) => x + 1);
  };

  const isEnding = ['stopping', 'compressing', 'processing'].includes(recordingState);

  // Navigation guard: block leaving page while live
  const shouldBlock = isHost && session?.status === 'live' && isJoined && !isEnding;
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);

  // Intercept browser back/forward via popstate
  useEffect(() => {
    if (!shouldBlock) return;
    const handler = (e: PopStateEvent) => {
      window.history.pushState(null, '', window.location.href);
      setShowLeaveDialog(true);
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [shouldBlock]);

  // Warn on tab close / refresh while live
  useEffect(() => {
    if (!shouldBlock) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [shouldBlock]);

  // Intercept programmatic navigation via navigate()
  const guardedNavigate = useCallback((to: string) => {
    if (shouldBlock) {
      pendingNavigationRef.current = to;
      setShowLeaveDialog(true);
    } else {
      navigate(to);
    }
  }, [shouldBlock, navigate]);

  const handleConfirmLeave = async () => {
    await handleEndLive(true);
    setShowLeaveDialog(false);
    if (pendingNavigationRef.current) {
      navigate(pendingNavigationRef.current);
      pendingNavigationRef.current = null;
    } else {
      navigate('/');
    }
  };

  const showLoader =
    ['idle', 'auth', 'creating', 'loading', 'starting'].includes(bootState) ||
    (!!effectiveSessionId && sessionQuery.isLoading);

  if (showLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>
            {bootState === 'creating'
              ? 'Äang táº¡o phiÃªn LIVE...'
              : bootState === 'starting'
                ? 'Äang káº¿t ná»‘i...'
                : 'Äang táº£i...'}
          </span>
        </div>
      </div>
    );
  }

  if (bootState === 'error') {
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        <div className="pt-20 px-4 max-w-xl mx-auto">
          <Card className="p-6 space-y-4">
            <div className="font-semibold text-lg">KhÃ´ng thá»ƒ báº¯t Ä‘áº§u LIVE</div>
            <div className="text-sm text-muted-foreground">{bootError || 'ÄÃ£ xáº£y ra lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh.'}</div>
            <div className="flex items-center gap-2">
              <Button onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Thá»­ láº¡i
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                <Home className="h-4 w-4 mr-2" />
                Quay vá» trang chá»§
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6 space-y-3">
          <div>Live session not found.</div>
          <Button onClick={handleRetry}>Retry</Button>
        </Card>
      </div>
    );
  }

  if (!isHost) {
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        <div className="pt-20 px-4 max-w-3xl mx-auto">
          <Card className="p-6 text-center space-y-4">
            <p className="font-semibold">You are not the host of this live session.</p>
            <Button onClick={() => navigate(`/live/${session.id}`)}>Switch to viewer mode</Button>
          </Card>
        </div>
      </div>
    );
  }

  const recBadge = REC_BADGE[recordingState];

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main className="pt-16 px-3 md:px-6 pb-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <h1 className="text-xl md:text-2xl font-bold">{session.title || 'Live Stream'}</h1>
                <div className="text-sm text-muted-foreground">Channel: {session.agora_channel || session.channel_name}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={session.status === 'live' && isJoined ? 'destructive' : 'secondary'} className="gap-1">
                  <Radio className="h-3.5 w-3.5" />
                  {session.status === 'ended' ? 'ENDED' : isJoined ? 'LIVE' : 'CONNECTING'}
                </Badge>
                {session.status === 'live' && isJoined && (
                  <Badge variant="outline" className="gap-1 font-mono">
                    <Clock className="h-3.5 w-3.5" />
                    {liveDuration}
                  </Badge>
                )}
                <Badge variant={recBadge.variant}>
                  {recBadge.label}
                  {CHUNKED_RECORDING_ENABLED && recordingState === 'recording' && recording.uploadStats.total > 0
                    ? ` (${recording.uploadStats.uploaded}/${recording.uploadStats.total})`
                    : ''}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {viewers.length}
                </Badge>
              </div>
            </div>

            {recordingError ? (
              <Card className="p-3 text-sm border-destructive/30 text-destructive">
                Ghi hÃ¬nh: {recordingError}
              </Card>
            ) : null}


            {recordingState === 'stopping' && (
              <Card className="p-3 text-sm border-primary/30 text-primary flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Äang dá»«ng ghi hÃ¬nh...
              </Card>
            )}

            {recordingState === 'compressing' && (
              <Card className="p-4 border-primary/30">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Äang nÃ©n video...
                  </span>
                  <span className="ml-auto text-sm font-mono font-bold text-primary">
                    {compressProgress}%
                  </span>
                </div>
                <Progress value={compressProgress} className="h-2.5" />
                <p className="text-xs text-muted-foreground mt-2">
                  âš ï¸ Vui lÃ²ng khÃ´ng Ä‘Ã³ng tab â€” Ä‘ang nÃ©n video Ä‘á»ƒ giáº£m dung lÆ°á»£ng
                </p>
              </Card>
            )}

            {recordingState === 'processing' && CHUNKED_RECORDING_ENABLED && (
              <Card className="p-4 border-primary/30">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">
                    {recording.streamUploadProgress > 0 ? 'Äang táº£i replay lÃªn Cloudflare Stream...' : recording.uploadStats.total > 0
                      ? `Äang táº£i lÃªn chunk ${recording.uploadStats.uploaded}/${recording.uploadStats.total}...`
                      : 'Äang xá»­ lÃ½...'}
                  </span>
                  <span className="ml-auto text-sm font-mono font-bold text-primary">
                    {uploadProgress}%
                  </span>
                </div>
                <Progress value={uploadProgress} className="h-2.5" />
                <p className="text-xs text-muted-foreground mt-2">
                  âš ï¸ Chunked upload â€” video sáº½ Ä‘Æ°á»£c lÆ°u an toÃ n tá»«ng pháº§n
                </p>
              </Card>
            )}

            {recordingState === 'processing' && !CHUNKED_RECORDING_ENABLED && (
              <Card className="p-4 border-primary/30">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Äang táº£i video lÃªn...
                  </span>
                  <span className="ml-auto text-sm font-mono font-bold text-primary">
                    {uploadProgress}%
                  </span>
                </div>
                <Progress value={uploadProgress} className="h-2.5" />
                <p className="text-xs text-muted-foreground mt-2">
                  âš ï¸ Vui lÃ²ng khÃ´ng Ä‘Ã³ng tab â€” video sáº½ bá»‹ máº¥t náº¿u thoÃ¡t trang
                </p>
              </Card>
            )}


            <Card className="overflow-hidden">
              <div className="aspect-video bg-black relative">
                <div ref={setLocalContainerRef} className="h-full w-full" />
                {!isJoined && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/50">
                    {statusText}
                  </div>
                )}
                {effectiveSessionId && <FloatingReactions sessionId={effectiveSessionId} />}
              </div>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={toggleMute} disabled={!isJoined || isEnding}>
                {isMuted ? <MicOff className="h-4 w-4 mr-2" /> : <Mic className="h-4 w-4 mr-2" />}
                {isMuted ? 'Unmute' : 'Mute'}
              </Button>
              <Button variant="outline" onClick={toggleCamera} disabled={!isJoined || isEnding}>
                {isCameraOff ? <VideoOff className="h-4 w-4 mr-2" /> : <Video className="h-4 w-4 mr-2" />}
                {isCameraOff ? 'Camera On' : 'Camera Off'}
              </Button>
              <Button variant="destructive" onClick={() => setShowEndConfirm(true)} disabled={isEnding}>
                {isEnding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PhoneOff className="h-4 w-4 mr-2" />}
                {isEnding ? 'Äang xá»­ lÃ½...' : 'End Live'}
              </Button>
            </div>
          </section>

          {effectiveSessionId && <LiveChatPanel sessionId={effectiveSessionId} isHost={true} liveTitle={session?.title || undefined} className="h-[70vh] lg:h-[calc(100vh-120px)]" viewers={viewers} />}
        </div>
      </main>
      {/* Navigation guard dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rá»i khá»i Live Stream?</AlertDialogTitle>
            <AlertDialogDescription>
              Báº¡n Ä‘ang phÃ¡t trá»±c tiáº¿p. Náº¿u rá»i Ä‘i, buá»•i live sáº½ káº¿t thÃºc vÃ  video sáº½ Ä‘Æ°á»£c lÆ°u láº¡i.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowLeaveDialog(false)}>á»ž láº¡i</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLeave}>Káº¿t thÃºc & Rá»i Ä‘i</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* End Live confirmation dialog */}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Báº¡n cÃ³ cháº¯c káº¿t thÃºc buá»•i Live Stream?</AlertDialogTitle>
            <AlertDialogDescription>
              Buá»•i live sáº½ káº¿t thÃºc vÃ  video sáº½ Ä‘Æ°á»£c lÆ°u láº¡i.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>á»ž láº¡i</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleEndLive()}>Káº¿t thÃºc</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
````

## src/modules/live/pages/LiveAudiencePage.tsx

``tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, Eye, Loader2, Radio, Volume2, VolumeX } from 'lucide-react';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { useLiveSession } from '../useLiveSession';
import { useLiveRtc } from '../hooks/useLiveRtc';
import { LiveChatPanel } from '../components/LiveChatPanel';
import { FloatingReactions } from '../components/FloatingReactions';
import { useSlugResolver } from '@/hooks/useSlugResolver';
import { useLiveDuration } from '../hooks/useLiveDuration';
import { useLivePresence } from '../hooks/useLivePresence';

export default function LiveAudiencePage() {
  const navigate = useNavigate();
  const { liveSessionId, username, slug } = useParams<{ liveSessionId?: string; username?: string; slug?: string }>();

  const { resolvedId: resolvedSessionId } = useSlugResolver({
    contentType: 'live',
    table: 'live_sessions',
    userIdColumn: 'owner_id',
    directId: liveSessionId,
    username,
    slug,
    urlPrefix: 'live',
  });

  const { data: session, isLoading } = useLiveSession(resolvedSessionId);
  const liveDuration = useLiveDuration(session?.started_at, session?.status === 'live');
  const { viewers } = useLivePresence(resolvedSessionId);
  const [mobileTab, setMobileTab] = useState<'chat' | 'reactions'>('chat');
  const [showEndedDialog, setShowEndedDialog] = useState(false);

  const {
    remoteContainerRef,
    statusText,
    hasRemoteVideo,
    isMuted,
    start,
    leave,
    toggleRemoteAudio,
  } = useLiveRtc({
    sessionId: resolvedSessionId,
    role: 'audience',
    enabled: !!resolvedSessionId && session?.status === 'live',
  });

  useEffect(() => {
    if (!resolvedSessionId || !session || session.status !== 'live') return;
    start().catch(() => undefined);
  }, [resolvedSessionId, session, start]);

  // Viewer count now handled entirely by useLivePresence (Realtime Presence)
  // No more increment/decrement DB RPCs â€” Presence auto-cleans on disconnect

  useEffect(() => {
    if (session?.status === 'ended') {
      leave().catch(() => undefined);
      setShowEndedDialog(true);
    }
  }, [leave, session?.status]);

  useEffect(() => {
    return () => {
      leave().catch(() => undefined);
    };
  }, [leave]);

  // Mark live session active so AuthSessionKeeper / ChunkLoadRecovery skip disruptive reloads
  useEffect(() => {
    (window as any).__LIVE_ACTIVE__ = true;
    return () => {
      (window as any).__LIVE_ACTIVE__ = false;
    };
  }, []);

  const handleReplay = () => {
    if (session?.post_id) {
      navigate(`/post/${session.post_id}`);
    } else {
      navigate('/');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">KhÃ´ng tÃ¬m tháº¥y phiÃªn Live.</Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main className="pt-16 px-3 md:px-6 pb-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={session.host_profile?.avatar_url || ''} />
                  <AvatarFallback>
                    {session.host_profile?.username?.charAt(0)?.toUpperCase() || 'H'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold text-sm">{session.host_profile?.full_name || session.host_profile?.username || 'Host'}</div>
                  <h1 className="text-lg md:text-xl font-bold">{session.title || 'Live Stream'}</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={session.status === 'live' ? 'destructive' : 'secondary'} className="gap-1">
                  <Radio className="h-3.5 w-3.5" />
                  {session.status === 'live' ? 'LIVE' : 'ÄÃƒ Káº¾T THÃšC'}
                </Badge>
                {session.status === 'live' && (
                  <Badge variant="outline" className="gap-1 font-mono">
                    <Clock className="h-3.5 w-3.5" />
                    {liveDuration}
                  </Badge>
                )}
                <Badge variant="secondary" className="gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {viewers.length}
                </Badge>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="aspect-video bg-black relative">
                <div ref={remoteContainerRef} className="h-full w-full" />
                {!hasRemoteVideo && (
                  <div className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/50 text-center px-4">
                    {session.status === 'ended' ? 'PhiÃªn Live Stream Ä‘Ã£ káº¿t thÃºc' : statusText}
                  </div>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute bottom-3 left-3 z-10 bg-black/30 hover:bg-black/50 text-white rounded-full h-10 w-10"
                  onClick={toggleRemoteAudio}
                >
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>

                {resolvedSessionId && <FloatingReactions sessionId={resolvedSessionId} />}
              </div>
            </Card>

            <div className="lg:hidden border rounded-xl bg-card overflow-hidden">
              <div className="grid grid-cols-2 border-b">
                <button
                  className={`py-2 text-sm font-medium ${mobileTab === 'chat' ? 'bg-accent' : ''}`}
                  onClick={() => setMobileTab('chat')}
                >
                  Chat
                </button>
                <button
                  className={`py-2 text-sm font-medium ${mobileTab === 'reactions' ? 'bg-accent' : ''}`}
                  onClick={() => setMobileTab('reactions')}
                >
                  Reactions
                </button>
              </div>
              <div className="p-2">
                {mobileTab === 'chat' && resolvedSessionId && <LiveChatPanel sessionId={resolvedSessionId} className="h-[320px]" liveTitle={session.title || undefined} viewers={viewers} />}
                {mobileTab === 'reactions' && resolvedSessionId && (
                  <div className="h-[120px] flex items-center justify-center relative">
                    <FloatingReactions sessionId={resolvedSessionId} showPicker />
                  </div>
                )}
              </div>
            </div>
          </section>

          {resolvedSessionId && <LiveChatPanel sessionId={resolvedSessionId} className="hidden lg:flex h-[calc(100vh-120px)]" liveTitle={session.title || undefined} viewers={viewers} />}
        </div>
        <div className="max-w-7xl mx-auto mt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            Quay láº¡i
          </Button>
        </div>
      </main>

      <AlertDialog open={showEndedDialog}>
        <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>PhiÃªn Live Stream Ä‘Ã£ káº¿t thÃºc</AlertDialogTitle>
            <AlertDialogDescription>
              Cáº£m Æ¡n báº¡n Ä‘Ã£ theo dÃµi phiÃªn phÃ¡t trá»±c tiáº¿p!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            {session?.post_id && (
              <AlertDialogAction onClick={handleReplay} className="bg-primary">
                Xem láº¡i
              </AlertDialogAction>
            )}
            <AlertDialogAction onClick={() => navigate('/')}>
              Vá» trang chá»§
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
````

## src/modules/live/liveService.ts

``ts
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/utils/r2Upload';
import { toJson, mergeJson } from '@/utils/supabaseJsonHelpers';
import logger from '@/lib/logger';
import type { CreateLiveSessionInput, LiveSession, LivePrivacy, LiveStatus } from './types';
import type { Database } from '@/integrations/supabase/types';

type LiveSessionRow = Database['public']['Tables']['live_sessions']['Row'];
type LiveSessionInsert = Database['public']['Tables']['live_sessions']['Insert'];

export type LiveReplayStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';

export interface LiveReplayRow {
  id: string;
  user_id: string;
  live_session_id: string;
  chunked_recording_id: string | null;
  source_webm_key: string | null;
  stream_uid: string | null;
  playback_hls: string | null;
  playback_dash: string | null;
  playback_mp4: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  filesize_bytes: number | null;
  status: LiveReplayStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveReplayUploadSession {
  uploadURL: string;
  stream_uid: string | null;
  replay_id: string;
}

const LIVE_POST_DEFAULT_CONTENT = 'Ã„Âang LIVE trÃƒÂªn FUN Profile';

const buildChannelName = (userId: string) => `live_${userId}_${Date.now()}`;

const uuidToNumericUid = (uuid: string) => {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) || 10001;
};

interface UploadLiveRecordingResult {
  key: string;
  url: string;
}

export type RecordingStatus =
  | 'idle'
  | 'acquiring'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'compressing'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'stopped';

export interface FinalizeLiveSessionOptions {
  playbackUrl?: string | null;
  recordingStatus?: RecordingStatus;
}

type LivePostMetadata = {
  live_title?: string | null;
  live_status?: 'live' | 'ended';
  channel_name?: string | null;
  agora_channel?: string | null;
  live_session_id?: string | null;
  viewer_count?: number;
  ended_at?: string | null;
  playback_url?: string | null;
  [key: string]: unknown;
};

async function mergeLivePostMetadata(postId: string, patch: Partial<LivePostMetadata>): Promise<void> {
  const { data: existingPost } = await supabase
    .from('posts')
    .select('metadata')
    .eq('id', postId)
    .maybeSingle();

  const merged = mergeJson<LivePostMetadata>(existingPost?.metadata ?? null, patch);

  await supabase
    .from('posts')
    .update({ metadata: merged })
    .eq('id', postId);
}

/** Typed row from live_sessions query with joined profile */
interface LiveSessionQueryRow extends Omit<LiveSessionRow, 'last_worker_response' | 'recording_files'> {
  host_profile?: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

function normalizeLiveSession(row: LiveSessionQueryRow): LiveSession {
  return {
    id: row.id,
    host_user_id: row.host_user_id || row.owner_id,
    agora_channel: row.agora_channel || row.channel_name,
    channel_name: row.channel_name,
    agora_uid_host: row.agora_uid_host ?? null,
    recording_uid: row.recording_uid ?? null,
    recording_status: (row.recording_status as LiveSession['recording_status']) ?? null,
    title: row.title ?? null,
    privacy: row.privacy as LivePrivacy,
    status: row.status as LiveStatus,
    viewer_count: row.viewer_count ?? 0,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    post_id: row.post_id ?? null,
    host_profile: row.host_profile
      ? {
          username: row.host_profile.username ?? null,
          full_name: row.host_profile.full_name ?? null,
          avatar_url: row.host_profile.avatar_url ?? null,
        }
      : null,
  };
}

export async function uploadLiveThumbnail(
  thumbnailBlob: Blob,
  liveSessionId: string
): Promise<string | null> {
  try {
    const path = `live/${liveSessionId}/thumbnail.jpg`;
    const { error } = await supabase.storage
      .from('live-thumbnails')
      .upload(path, thumbnailBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) {
      logger.warn('[liveService] uploadLiveThumbnail error:', error);
      return null;
    }
    const { data } = supabase.storage.from('live-thumbnails').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    logger.warn('[liveService] uploadLiveThumbnail exception:', err);
    return null;
  }
}

export async function attachLiveReplayToPost(
  sessionId: string,
  playbackUrl: string,
  durationSeconds?: number,
  thumbnailUrl?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('attach_live_replay_to_post' as any, {
    _session_id: sessionId,
    _playback_url: playbackUrl,
    _duration_seconds: durationSeconds,
    _thumbnail_url: thumbnailUrl,
  });
  if (error) throw error;
}

export async function createLiveSession(input: CreateLiveSessionInput): Promise<LiveSession> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error('BÃ¡ÂºÂ¡n cÃ¡ÂºÂ§n Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p Ã„â€˜Ã¡Â»Æ’ bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u live');
  }

  const userId = session.user.id;
  const hostUid = uuidToNumericUid(userId);
  const title = input.title?.trim() || '';
  const channelName = buildChannelName(userId);
  const visibility = input.privacy === 'friends' ? 'friends' : 'public';

  // Single Active Host Rule (Facebook-style)
  // Gá»™p SELECT + UPDATE thÃ nh 1 UPDATE ... RETURNING Ä‘á»ƒ tiáº¿t kiá»‡m round-trip.
  const nowIso = new Date().toISOString();
  const { data: oldSessions } = await supabase
    .from('live_sessions')
    .update({ status: 'ended', ended_at: nowIso, updated_at: nowIso })
    .eq('host_user_id', userId)
    .eq('status', 'live')
    .select('id, post_id');

  if (oldSessions && oldSessions.length > 0) {
    // Cáº­p nháº­t metadata cÃ¡c post cÅ© song song (khÃ´ng cháº·n táº¡o session má»›i).
    Promise.all(
      oldSessions
        .filter((o) => o.post_id)
        .map((o) =>
          mergeLivePostMetadata(o.post_id as string, { live_status: 'ended', ended_at: nowIso }).catch(
            (err) => logger.warn('[liveService] mergeLivePostMetadata old session failed:', err)
          )
        )
    );
  }

  let postId: string | null = null;

  const liveMetadata: LivePostMetadata = {
    live_title: title,
    live_status: 'live',
    channel_name: channelName,
    agora_channel: channelName,
    viewer_count: 0,
  };

  try {
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content: title || LIVE_POST_DEFAULT_CONTENT,
        visibility,
        post_type: 'live',
        metadata: toJson(liveMetadata),
      })
      .select('id')
      .single();

    if (postError) throw postError;
    postId = post.id;

    const { data, error } = await supabase
      .from('live_sessions')
      .insert({
        host_user_id: userId,
        owner_id: userId,
        channel_name: channelName,
        agora_channel: channelName,
        agora_uid_host: hostUid,
        title,
        privacy: input.privacy,
        status: 'live',
        recording_status: 'idle',
        post_id: postId,
      } satisfies Partial<LiveSessionInsert>)
      .select(
        `
        id, host_user_id, agora_channel, channel_name, title, privacy, status, viewer_count,
        started_at, ended_at, created_at, updated_at, post_id,
        host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
      `
      )
      .single();

    if (error) throw error;

    const fullMetadata: LivePostMetadata = {
      ...liveMetadata,
      live_session_id: data.id,
    };

    await supabase
      .from('posts')
      .update({ metadata: toJson(fullMetadata) })
      .eq('id', postId);

    notifyFriendsLiveStarted(data.id, postId!).catch((err) =>
      logger.warn('[liveService] notify-live-started failed:', err)
    );

    return normalizeLiveSession(data as unknown as LiveSessionQueryRow);
  } catch (error) {
    if (postId) {
      await supabase.from('posts').delete().eq('id', postId);
    }
    throw error;
  }
}

export async function getLiveSession(sessionId: string): Promise<LiveSession | null> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      `
      id, host_user_id, agora_channel, channel_name, recording_uid, title, privacy, status, viewer_count,
      started_at, ended_at, created_at, updated_at, post_id,
      host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
    `
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normalizeLiveSession(data as unknown as LiveSessionQueryRow);
}

export async function listActiveLiveSessions(): Promise<LiveSession[]> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      `
      id, host_user_id, agora_channel, channel_name, title, privacy, status, viewer_count,
      started_at, ended_at, created_at, updated_at, post_id,
      host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
    `
    )
    .eq('status', 'live')
    .order('started_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => normalizeLiveSession(row as unknown as LiveSessionQueryRow));
}

export async function endLiveSession(sessionId: string): Promise<void> {
  await finalizeLiveSession(sessionId, { recordingStatus: 'failed' });
}

export async function finalizeLiveSession(
  sessionId: string,
  options: FinalizeLiveSessionOptions = {}
): Promise<void> {
  const { playbackUrl = null, recordingStatus = playbackUrl ? 'ready' : 'failed' } = options;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('live_sessions')
    .update({
      status: 'ended',
      ended_at: nowIso,
      recording_status: recordingStatus,
      updated_at: nowIso,
    })
    .eq('id', sessionId)
    .select('id, post_id, title, agora_channel, channel_name, ended_at')
    .single();

  if (error) throw error;

  if (data?.post_id) {
    await mergeLivePostMetadata(data.post_id, {
      live_status: 'ended',
      ended_at: data.ended_at,
      playback_url: playbackUrl,
    });

    if (playbackUrl) {
      await supabase.from('posts')
        .update({ video_url: playbackUrl })
        .eq('id', data.post_id);
    }
  }
}

export async function updateLiveViewerCount(sessionId: string, viewerCount: number): Promise<void> {
  const nextCount = Math.max(0, viewerCount);
  const { data } = await supabase
    .from('live_sessions')
    .update({ viewer_count: nextCount })
    .eq('id', sessionId)
    .select('id, post_id, title, agora_channel, channel_name')
    .maybeSingle();

  if (data?.post_id) {
    const viewerMetadata: LivePostMetadata = {
      live_title: data.title,
      channel_name: data.agora_channel || data.channel_name,
      agora_channel: data.agora_channel || data.channel_name,
      live_status: 'live',
      viewer_count: nextCount,
      live_session_id: data.id,
    };

    await supabase
      .from('posts')
      .update({ metadata: toJson(viewerMetadata) })
      .eq('id', data.post_id);
  }
}

export async function incrementLiveViewerCount(sessionId: string): Promise<void> {
  await supabase.rpc('increment_live_viewer_count' as any, { session_id: sessionId });
}

export async function decrementLiveViewerCount(sessionId: string): Promise<void> {
  await supabase.rpc('decrement_live_viewer_count' as any, { session_id: sessionId });
}

export async function uploadLiveRecording(
  blob: Blob,
  liveSessionId: string,
  mimeType: string,
  onProgress?: (percent: number) => void
): Promise<UploadLiveRecordingResult> {
  const baseMimeType = mimeType.split(';')[0].trim();
  const extension = baseMimeType.includes('webm') ? 'webm' : 'mp4';
  const customPath = `live/${liveSessionId}/recording-${Date.now()}.${extension}`;

  const file = new File([blob], `recording.${extension}`, { type: baseMimeType });

  const result = await uploadToR2(file, 'videos', customPath, undefined, onProgress);

  return { key: result.key, url: result.url };
}

export async function saveLiveReplay(liveSessionId: string, playbackUrl?: string | null): Promise<void> {
  await finalizeLiveSession(liveSessionId, {
    playbackUrl: playbackUrl || null,
    recordingStatus: playbackUrl ? 'ready' : 'failed',
  });
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Chunked Recording: Upload via Edge Function (Presigned URL) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/**
 * Upload a single chunk via presigned URL from r2-signed-chunk-url Edge Function.
 */
export async function uploadLiveChunk(
  blob: Blob,
  recordingId: string,
  chunkIndex: number,
  mimeType: string
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // 1. Get presigned URL from Edge Function
  const presignRes = await fetch(`${supabaseUrl}/functions/v1/r2-signed-chunk-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      recording_id: recordingId,
      seq: chunkIndex,
      contentType: mimeType || 'video/webm',
      fileSize: blob.size,
    }),
  });

  if (!presignRes.ok) {
    const errBody = await presignRes.text().catch(() => 'no body');
    throw new Error(`Presign chunk #${chunkIndex} failed: ${presignRes.status} Ã¢â‚¬â€ ${errBody}`);
  }

  const { uploadUrl, objectKey } = await presignRes.json() as { uploadUrl: string; objectKey: string };

  // 2. Upload blob directly to R2 via presigned URL
  const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: blob });
  if (!uploadRes.ok) {
    throw new Error(`Chunk #${chunkIndex} R2 upload failed: ${uploadRes.status}`);
  }

  // 3. Record chunk in DB
  await supabase
    .from('chunked_recording_chunks')
    .insert({
      recording_id: recordingId,
      seq: chunkIndex,
      object_key: objectKey,
      bytes: blob.size,
      status: 'uploaded',
      uploaded_at: new Date().toISOString(),
    });

  // 4. Update last_seq_uploaded
  await supabase
    .from('chunked_recordings')
    .update({ last_seq_uploaded: chunkIndex })
    .eq('id', recordingId);

  logger.debug(`[uploadLiveChunk] #${chunkIndex} Ã¢Å“â€œ key=${objectKey}`);
  return objectKey;
}

/**
 * Finalize a chunked recording via recording-finalize Edge Function.
 */
export async function finalizeLiveChunks(
  recordingId: string,
  liveSessionId?: string
): Promise<{ manifestUrl: string; totalChunks: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/recording-finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ recording_id: recordingId, live_session_id: liveSessionId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Finalize failed' })) as { error?: string };
    throw new Error(err.error || `Finalize failed: ${res.status}`);
  }

  const data = await res.json() as { success: boolean; manifest_url?: string; replay_url?: string; total_chunks: number };
  const url = data.manifest_url || data.replay_url || '';
  return { manifestUrl: url, totalChunks: data.total_chunks };
}

export async function createLiveReplayUpload(
  liveSessionId: string,
  chunkedRecordingId: string,
  expectedSize: number
): Promise<LiveReplayUploadSession> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/live-replay-create-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      live_session_id: liveSessionId,
      chunked_recording_id: chunkedRecordingId,
      expected_size: expectedSize,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Create upload failed' })) as { error?: string };
    throw new Error(err.error || `Create Stream upload failed: ${res.status}`);
  }

  return res.json() as Promise<LiveReplayUploadSession>;
}

export async function uploadReplayToCloudflareStream(
  uploadURL: string,
  blob: Blob,
  filename = 'live-replay.webm',
  onProgress?: (percent: number) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', new File([blob], filename, { type: blob.type || 'video/webm' }));

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Cloudflare Stream upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Cloudflare Stream upload network error'));
    xhr.open('POST', uploadURL);
    xhr.send(formData);
  });
}

/**
 * YÃƒÂªu cÃ¡ÂºÂ§u Cloudflare Stream KÃƒâ€°O file replay tÃ¡Â»Â« R2 (server-side ingest).
 * KhÃƒÂ´ng cÃ¡ÂºÂ§n upload lÃ¡ÂºÂ¡i file WebM tÃ¡Â»Â« trÃƒÂ¬nh duyÃ¡Â»â€¡t Ã¢â€ â€™ "End Live" trÃ¡Â»Å¸ vÃ¡Â»Â tÃ¡Â»Â©c thÃƒÂ¬.
 */
export async function ingestLiveReplayFromR2(
  liveSessionId: string,
  chunkedRecordingId: string,
): Promise<{ replay_id: string; stream_uid: string | null; status: 'processing' | 'ready' | 'queued'; reused?: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/live-replay-ingest-from-r2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      live_session_id: liveSessionId,
      chunked_recording_id: chunkedRecordingId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ingest failed' })) as { error?: string };
    throw new Error(err.error || `Ingest from R2 failed: ${res.status}`);
  }

  return res.json() as Promise<{ replay_id: string; stream_uid: string | null; status: 'processing' | 'ready' | 'queued'; reused?: boolean }>;
}

export async function markLiveReplayQueued(replayId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/live-replay-mark-uploaded`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ replay_id: replayId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to mark replay queued' })) as { error?: string };
    throw new Error(err.error || `Failed to mark replay queued: ${res.status}`);
  }
}

export async function waitForLiveReplayReady(
  replayId: string,
  timeoutMs = 20 * 60 * 1000
): Promise<LiveReplayRow> {
  const { data: initial, error: initialErr } = await (supabase.from('live_replays' as any) as any)
    .select('*')
    .eq('id', replayId)
    .maybeSingle();
  if (initialErr) throw initialErr;
  if (initial?.status === 'ready') return initial as LiveReplayRow;
  if (initial?.status === 'failed') throw new Error(initial.error_message || 'Replay processing failed');

  return new Promise<LiveReplayRow>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      supabase.removeChannel(channel);
      reject(new Error('Replay processing timeout'));
    }, timeoutMs);

    const channel = supabase
      .channel(`live-replay-${replayId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_replays',
        filter: `id=eq.${replayId}`,
      }, (payload: { new: LiveReplayRow }) => {
        if (payload.new.status === 'ready') {
          window.clearTimeout(timer);
          supabase.removeChannel(channel);
          resolve(payload.new);
        } else if (payload.new.status === 'failed') {
          window.clearTimeout(timer);
          supabase.removeChannel(channel);
          reject(new Error(payload.new.error_message || 'Replay processing failed'));
        }
      })
      .subscribe();
  });
}

/**
 * Create a chunked_recordings row in DB to track the recording session.
 */
export async function createChunkedRecording(
  userId: string,
  liveSessionId: string,
  channelName?: string,
  mimeType: string = 'video/webm;codecs=vp8,opus'
): Promise<string> {
  const { data, error } = await supabase
    .from('chunked_recordings')
    .insert({
      user_id: userId,
      live_session_id: liveSessionId,
      channel_name: channelName,
      mime_type: mimeType,
      status: 'recording',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Notifications Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function notifyFriendsLiveStarted(sessionId: string, postId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/notify-live-started`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ session_id: sessionId, post_id: postId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${response.status}`);
  }
}
````

## src/hooks/live/useLiveRecording.ts

``ts
import { useRef, useState, useCallback, useEffect } from 'react';
import type { ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';
import { createChunkedRecorder, type ChunkedRecorderController } from '@/modules/live/recording/chunkedRecorder';
import { createChunkUploadQueue, type ChunkUploadQueueController } from '@/modules/live/recording/chunkUploadQueue';
import {
  finalizeLiveChunks,
  ingestLiveReplayFromR2,
  uploadLiveChunk,
  waitForLiveReplayReady,
  type LiveReplayRow,
} from '@/modules/live/liveService';
import { initRecoverySession, saveChunkBlob, saveChunkKey, clearRecovery } from '@/modules/live/recording/crashRecovery';
import { STREAM_REPLAY_MIME_TYPE } from '@/modules/live/recording/finalizeWebm';

export type RecordingPhase = 'idle' | 'recording' | 'stopping' | 'uploading' | 'queued' | 'processing' | 'done' | 'error';

export interface FinalizeReplayResult {
  manifestUrl?: string;
  totalChunks: number;
  replayId?: string;
  streamUid?: string | null;
  playbackHls?: string | null;
  thumbnailUrl?: string | null;
  status: 'queued' | 'processing' | 'ready' | 'failed';
}

export interface FinalizeReplayOptions {
  waitForReady?: boolean;
}

interface UseLiveRecordingOptions {
  videoTrack: ICameraVideoTrack | null;
  audioTrack: IMicrophoneAudioTrack | null;
  sessionId?: string;
  recordingId?: string;
  autoStart?: boolean;
}

export function useLiveRecording({ videoTrack, audioTrack, sessionId, recordingId, autoStart = true }: UseLiveRecordingOptions) {
  const recorderRef = useRef<ChunkedRecorderController | null>(null);
  const queueRef = useRef<ChunkUploadQueueController | null>(null);
  const chunkKeysRef = useRef<string[]>([]);
  const rawChunksRef = useRef<Blob[]>([]);
  const finalizedBlobRef = useRef<Blob | null>(null);
  const mimeTypeRef = useRef<string>(STREAM_REPLAY_MIME_TYPE);
  const replayRef = useRef<LiveReplayRow | null>(null);
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [chunkCount, setChunkCount] = useState(0);
  const [uploadStats, setUploadStats] = useState({ total: 0, uploaded: 0, failed: 0 });
  const [streamUploadProgress, setStreamUploadProgress] = useState(0);
  const [replay, setReplay] = useState<LiveReplayRow | null>(null);
  const startedRef = useRef(false);

  const start = useCallback(() => {
    if (!videoTrack || !audioTrack || !sessionId || !recordingId || recorderRef.current) return;

    try {
      const videoMediaTrack = videoTrack.getMediaStreamTrack();
      const audioMediaTrack = audioTrack.getMediaStreamTrack();
      if (!videoMediaTrack || !audioMediaTrack) return;

      const stream = new MediaStream([videoMediaTrack, audioMediaTrack]);

      // Init IndexedDB backup
      initRecoverySession(sessionId, STREAM_REPLAY_MIME_TYPE).catch(() => {});

      // Create upload queue Ã¢â‚¬â€ now uses presigned URL via Edge Function
      const currentRecordingId = recordingId;
      const queue = createChunkUploadQueue({
        sessionId,
        maxRetries: 3,
        uploadFn: async (chunk) => {
          const key = await uploadLiveChunk(chunk.blob, currentRecordingId, chunk.index, chunk.mimeType);
          chunkKeysRef.current.push(key);
          saveChunkKey(sessionId, key).catch(() => {});
          return key;
        },
        onProgress: (uploaded, total) => {
          setUploadStats({ total, uploaded, failed: 0 });
        },
        onError: (err, chunk) => {
          console.error(`[useLiveRecording] chunk #${chunk.index} upload failed:`, err);
          setUploadStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        },
      });
      queueRef.current = queue;

      const recorder = createChunkedRecorder({
        stream,
        chunkDurationMs: 2000,
        onChunk: (chunk) => {
          setChunkCount((c) => c + 1);
          mimeTypeRef.current = chunk.mimeType;
          rawChunksRef.current.push(chunk.blob);
          saveChunkBlob(sessionId, chunk.blob).catch(() => {});
          queue.enqueue(chunk);
        },
        onError: (err) => {
          console.error('[useLiveRecording] recorder error:', err);
        },
        mimeType: STREAM_REPLAY_MIME_TYPE,
      });

      recorder.start();
      recorderRef.current = recorder;
      setPhase('recording');
    } catch (err) {
      console.error('[useLiveRecording] failed to start:', err);
      setPhase('error');
    }
  }, [videoTrack, audioTrack, sessionId, recordingId]);

  const stop = useCallback(async (): Promise<{ blob: Blob; mimeType: string } | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    setPhase('stopping');
    try {
      const blob = await recorder.stop();
      const mimeType = recorder.getMimeType();
      recorderRef.current = null;
      setPhase('idle');
      return { blob, mimeType };
    } catch (err) {
      console.error('[useLiveRecording] stop error:', err);
      setPhase('error');
      return null;
    }
  }, []);

  const finalize = useCallback(async (options: FinalizeReplayOptions = {}): Promise<FinalizeReplayResult | null> => {
    const queue = queueRef.current;
    if (!queue || !recordingId || !sessionId) return null;

    setPhase('uploading');
    try {
      if (recorderRef.current?.getState() === 'recording') {
        await stop();
      }
      await queue.flush();

      // Step 1: R2 manifest (backup playback path) Ã¢â‚¬â€ best effort
      let manifest: { manifestUrl: string; totalChunks: number } = { manifestUrl: '', totalChunks: 0 };
      try {
        manifest = await finalizeLiveChunks(recordingId, sessionId);
      } catch (e) {
        console.warn('[useLiveRecording] R2 finalize failed (non-fatal):', e);
      }

      // Step 2: Server-side ingest Ã¢â‚¬â€ Cloudflare Stream tÃ¡Â»Â± kÃƒÂ©o file tÃ¡Â»Â« R2.
      // KHÃƒâ€NG cÃƒÂ²n upload lÃ¡ÂºÂ¡i file WebM tÃ¡Â»Â« trÃƒÂ¬nh duyÃ¡Â»â€¡t Ã¢â€ â€™ nhanh nhÃ†Â° Facebook.
      console.log('[useLiveRecording] Triggering server-side ingest from R2...');
      setStreamUploadProgress(100);
      const ingest = await ingestLiveReplayFromR2(sessionId, recordingId);
      console.log('[useLiveRecording] Stream ingest accepted:', ingest);
      setPhase(ingest.status === 'queued' ? 'queued' : 'processing');

      if (options.waitForReady) {
        const readyReplay = await waitForLiveReplayReady(ingest.replay_id);
        replayRef.current = readyReplay;
        setReplay(readyReplay);
        await clearRecovery(sessionId).catch(() => {});
        setPhase('done');
        return {
          manifestUrl: manifest.manifestUrl,
          totalChunks: manifest.totalChunks,
          replayId: readyReplay.id,
          streamUid: readyReplay.stream_uid || ingest.stream_uid,
          playbackHls: readyReplay.playback_hls,
          thumbnailUrl: readyReplay.thumbnail_url,
          status: 'ready',
        };
      }

      // Background watcher Ã¢â‚¬â€ UI Ã„â€˜ÃƒÂ£ trÃ¡Â»Å¸ vÃ¡Â»Â feed, khÃƒÂ´ng chÃ¡Â»Â
      const channel = supabase
        .channel(`live-replay-watch-${ingest.replay_id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_replays',
          filter: `id=eq.${ingest.replay_id}`,
        }, (payload: { new: LiveReplayRow }) => {
          replayRef.current = payload.new;
          setReplay(payload.new);
          if (payload.new.status === 'ready') {
            setPhase('done');
            clearRecovery(sessionId).catch(() => {});
            supabase.removeChannel(channel);
          } else if (payload.new.status === 'failed') {
            setPhase('error');
            supabase.removeChannel(channel);
          }
        })
        .subscribe();

      return {
        manifestUrl: manifest.manifestUrl,
        totalChunks: manifest.totalChunks,
        replayId: ingest.replay_id,
        streamUid: ingest.stream_uid,
        status: ingest.status === 'queued' ? 'queued' : 'processing',
      };
    } catch (err) {
      console.error('[useLiveRecording] finalize error:', err);
      setPhase('error');
      return null;
    }
  }, [recordingId, sessionId, stop]);

  // Auto-start when tracks are ready
  useEffect(() => {
    if (autoStart && videoTrack && audioTrack && sessionId && recordingId && !startedRef.current && phase === 'idle') {
      startedRef.current = true;
      const timer = setTimeout(() => start(), 1000);
      return () => clearTimeout(timer);
    }
  }, [autoStart, videoTrack, audioTrack, sessionId, recordingId, phase, start]);

  // beforeunload warning while recording
  useEffect(() => {
    if (phase !== 'recording') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // Cleanup on unmount Ã¢â‚¬â€ stop recorder + flush queue (best-effort)
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.getState() === 'recording') {
        recorderRef.current.stop().catch(() => {});
      }
      // Flush remaining chunks to R2 (non-blocking, auto-finalize will handle manifest)
      if (queueRef.current) {
        queueRef.current.flush().catch(() => {});
      }
    };
  }, []);

  return {
    phase,
    setPhase,
    chunkCount,
    uploadStats,
    streamUploadProgress,
    replay,
    start,
    stop,
    finalize,
  };
}
````

## src/hooks/live/useLiveReplayStatus.ts

``ts
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveReplayOverride {
  playback_hls?: string;
  thumbnail_url?: string;
  stream_uid?: string;
  playback_type?: 'cloudflare_stream';
}

interface LiveReplayStatusRow {
  status: string;
  playback_hls: string | null;
  thumbnail_url: string | null;
  stream_uid: string | null;
}

interface LiveReplayChangePayload {
  new: LiveReplayStatusRow;
}

/**
 * Hydrates live replay posts from live_replays when Cloudflare Stream VOD is ready.
 * Agora remains the realtime path; Cloudflare Stream HLS is the VOD source of truth.
 */
export function useLiveReplayStatus(
  liveSessionId: string | undefined | null,
  enabled: boolean,
): LiveReplayOverride | null {
  const [override, setOverride] = useState<LiveReplayOverride | null>(null);

  useEffect(() => {
    if (!enabled || !liveSessionId) return;

    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('live_replays')
        .select('status, playback_hls, thumbnail_url, stream_uid')
        .eq('status', 'ready')
        .eq('live_session_id', liveSessionId)
        .not('playback_hls', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || !data?.playback_hls) return;
      setOverride({
        playback_hls: data.playback_hls,
        thumbnail_url: data.thumbnail_url ?? undefined,
        stream_uid: data.stream_uid ?? undefined,
        playback_type: 'cloudflare_stream',
      });
    })();

    const channel = supabase
      .channel(`live-replay-status-${liveSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_replays',
          filter: `live_session_id=eq.${liveSessionId}`,
        },
        (payload: LiveReplayChangePayload) => {
          const row = payload.new;
          if (row.status === 'ready' && row.playback_hls) {
            setOverride({
              playback_hls: row.playback_hls,
              thumbnail_url: row.thumbnail_url ?? undefined,
              stream_uid: row.stream_uid ?? undefined,
              playback_type: 'cloudflare_stream',
            });
            supabase.removeChannel(channel);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [liveSessionId, enabled]);

  return override;
}
````

## src/modules/live/recording/chunkedRecorder.ts

``ts
/**
 * Chunked MediaRecorder â€” records a MediaStream in fixed-duration chunks
 * and emits each chunk via a callback for progressive upload.
 */

export interface ChunkMeta {
  index: number;
  blob: Blob;
  mimeType: string;
  startTime: number;
  endTime: number;
}

export interface ChunkedRecorderOptions {
  stream: MediaStream;
  chunkDurationMs?: number;
  mimeType?: string;
  onChunk: (chunk: ChunkMeta) => void;
  onError?: (error: Error) => void;
}

export interface ChunkedRecorderController {
  start: () => void;
  stop: () => Promise<Blob>;
  getState: () => RecordingState;
  getMimeType: () => string;
}

type RecordingState = 'inactive' | 'recording' | 'stopped';

function pickMimeType(preferred?: string): string {
  const candidates = [
    preferred,
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].filter(Boolean) as string[];

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export function createChunkedRecorder(options: ChunkedRecorderOptions): ChunkedRecorderController {
  const {
    stream,
    chunkDurationMs = 2000,
    onChunk,
    onError,
  } = options;

  const mimeType = pickMimeType(options.mimeType);
  let recorder: MediaRecorder | null = null;
  let state: RecordingState = 'inactive';
  let chunkIndex = 0;
  let chunkStartTime = 0;
  

  function start() {
    if (state !== 'inactive') return;

    recorder = new MediaRecorder(stream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 1_500_000,
    });

    state = 'recording';
    chunkIndex = 0;
    chunkStartTime = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        const now = Date.now();
        const chunk: ChunkMeta = {
          index: chunkIndex++,
          blob: e.data,
          mimeType: mimeType || 'video/webm',
          startTime: chunkStartTime,
          endTime: now,
        };
        chunkStartTime = now;

        try {
          onChunk(chunk);
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    };

    recorder.onerror = (e: any) => {
      onError?.(new Error(e?.error?.message || 'MediaRecorder error'));
    };

    recorder.start(chunkDurationMs);
  }

  async function stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const emptyBlob = new Blob([], { type: mimeType || 'video/webm' });
      if (!recorder || state !== 'recording') {
        resolve(emptyBlob);
        return;
      }

      state = 'stopped';

      recorder.onstop = () => {
        resolve(emptyBlob);
      };
      recorder.stop();
    });
  }

  return {
    start,
    stop,
    getState: () => state,
    getMimeType: () => mimeType || 'video/webm',
  };
}
````

## src/modules/live/recording/chunkUploadQueue.ts

``ts
/**
 * Progressive chunk upload queue with retry, offline awareness, and concurrency.
 * Chunks are uploaded to R2 via presigned URL or direct upload.
 */

import type { ChunkMeta } from './chunkedRecorder';

export interface ChunkUploadQueueOptions {
  sessionId: string;
  maxRetries?: number;
  /** Sá»‘ chunk upload song song (default 4) */
  concurrency?: number;
  onProgress?: (uploaded: number, total: number) => void;
  onError?: (error: Error, chunk: ChunkMeta) => void;
  uploadFn: (chunk: ChunkMeta, sessionId: string) => Promise<string>;
}

interface QueueItem {
  chunk: ChunkMeta;
  retries: number;
  url?: string;
}

export interface ChunkUploadQueueController {
  enqueue: (chunk: ChunkMeta) => void;
  flush: () => Promise<string[]>;
  getUploadedUrls: () => string[];
  getStats: () => { total: number; uploaded: number; failed: number };
}

export function createChunkUploadQueue(options: ChunkUploadQueueOptions): ChunkUploadQueueController {
  const {
    sessionId,
    maxRetries = 3,
    concurrency = 4,
    onProgress,
    onError,
    uploadFn,
  } = options;

  const queue: QueueItem[] = [];
  const uploadedUrls: string[] = [];
  let totalEnqueued = 0;
  let totalUploaded = 0;
  let totalFailed = 0;
  let activeWorkers = 0;

  async function waitOnline() {
    if (typeof navigator === 'undefined' || navigator.onLine) return;
    await new Promise<void>((resolve) => {
      const handler = () => {
        window.removeEventListener('online', handler);
        resolve();
      };
      window.addEventListener('online', handler);
    });
  }

  async function processItem(item: QueueItem) {
    while (true) {
      await waitOnline();
      try {
        const url = await uploadFn(item.chunk, sessionId);
        item.url = url;
        uploadedUrls.push(url);
        totalUploaded++;
        onProgress?.(totalUploaded, totalEnqueued);
        return;
      } catch (err) {
        item.retries++;
        if (item.retries >= maxRetries) {
          totalFailed++;
          onError?.(err instanceof Error ? err : new Error(String(err)), item.chunk);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, item.retries - 1)));
      }
    }
  }

  function pump() {
    while (activeWorkers < concurrency && queue.length > 0) {
      const item = queue.shift()!;
      activeWorkers++;
      processItem(item).finally(() => {
        activeWorkers--;
        pump();
      });
    }
  }

  function enqueue(chunk: ChunkMeta) {
    totalEnqueued++;
    queue.push({ chunk, retries: 0 });
    pump();
  }

  async function flush(): Promise<string[]> {
    while (queue.length > 0 || activeWorkers > 0) {
      await new Promise((r) => setTimeout(r, 150));
    }
    return [...uploadedUrls];
  }

  return {
    enqueue,
    flush,
    getUploadedUrls: () => [...uploadedUrls],
    getStats: () => ({ total: totalEnqueued, uploaded: totalUploaded, failed: totalFailed }),
  };
}
````

## src/modules/live/recording/crashRecovery.ts

``ts
/**
 * Crash Recovery Manager â€” backs up recording state to IndexedDB
 * so that if the browser crashes, we can finalize uploaded chunks later.
 */

const DB_NAME = 'live_recording_backup';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

export interface SessionBackup {
  sessionId: string;
  chunkKeys: string[];
  chunks?: Blob[];
  mimeType: string;
  startedAt: number;
  lastUpdatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function initRecoverySession(
  sessionId: string,
  mimeType: string
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const backup: SessionBackup = {
    sessionId,
    chunkKeys: [],
    chunks: [],
    mimeType,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
  };
  store.put(backup);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function saveChunkBlob(
  sessionId: string,
  blob: Blob
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const existing = await new Promise<SessionBackup | undefined>((resolve, reject) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result as SessionBackup | undefined);
    req.onerror = () => reject(req.error);
  });

  if (existing) {
    existing.chunks = [...(existing.chunks || []), blob];
    existing.lastUpdatedAt = Date.now();
    store.put(existing);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function saveChunkKey(
  sessionId: string,
  key: string
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const existing = await new Promise<SessionBackup | undefined>((resolve, reject) => {
    const req = store.get(sessionId);
    req.onsuccess = () => resolve(req.result as SessionBackup | undefined);
    req.onerror = () => reject(req.error);
  });

  if (existing) {
    existing.chunkKeys.push(key);
    existing.lastUpdatedAt = Date.now();
    store.put(existing);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getPendingRecovery(): Promise<SessionBackup | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const all = await new Promise<SessionBackup[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as SessionBackup[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const valid = all.filter((s) => s.chunkKeys.length > 0);
    if (valid.length === 0) return null;
    valid.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
    return valid[0];
  } catch {
    return null;
  }
}

export async function clearRecovery(sessionId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(sessionId);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // silent fail
  }
}
````

## src/modules/live/recording/finalizeWebm.ts

``ts
// Polyfill Buffer cho ts-ebml cháº¡y trong browser
import { Buffer } from 'buffer';
if (typeof globalThis !== 'undefined' && !(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

export const STREAM_REPLAY_MIME_TYPE = 'video/webm;codecs=vp8,opus';

/**
 * GhÃ©p cÃ¡c chunk MediaRecorder thÃ nh 1 WebM duy nháº¥t, Ä‘á»“ng thá»i cá»‘ gáº¯ng
 * vÃ¡ metadata duration/seekable báº±ng `ts-ebml` (load Ä‘á»™ng Ä‘á»ƒ trÃ¡nh
 * `require is not defined` khi Rollup tÃ¡ch chunk CJS).
 *
 * Náº¿u ts-ebml lá»—i (browser bundle thiáº¿u polyfill, hoáº·c CJS khÃ´ng evaluate
 * Ä‘Æ°á»£c), ta KHÃ”NG nÃ©m exception â€” tráº£ vá» WebM ghÃ©p thÃ´ Ä‘á»ƒ Cloudflare Stream
 * váº«n xá»­ lÃ½ replay Ä‘Æ°á»£c, trÃ¡nh crash UI host live.
 */
export async function finalizeWebmDuration(
  chunks: Blob[],
  mimeType = STREAM_REPLAY_MIME_TYPE
): Promise<Blob> {
  const nonEmptyChunks = chunks.filter((chunk) => chunk.size > 0);
  if (nonEmptyChunks.length === 0) {
    throw new Error('Video trá»‘ng, khÃ´ng thá»ƒ táº¡o replay.');
  }

  const source = new Blob(nonEmptyChunks, { type: mimeType });

  try {
    const { Decoder, Reader, tools } = await import('ts-ebml');
    const buffer = await source.arrayBuffer();
    const decoder = new Decoder();
    const reader = new Reader();
    reader.logging = false;
    reader.drop_default_duration = false;

    const elements = decoder.decode(buffer);
    for (const element of elements) reader.read(element);
    reader.stop();

    if (!reader.duration || !Number.isFinite(reader.duration) || reader.duration <= 0) {
      return source;
    }

    const metadata = tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues);
    const body = buffer.slice(reader.metadataSize);
    return new Blob([metadata, body], { type: mimeType });
  } catch (err) {
    console.warn(
      '[finalizeWebmDuration] EBML metadata repair tháº¥t báº¡i, fallback raw blob:',
      err
    );
    return source;
  }
}
````

## src/components/feed/FacebookPostCard.tsx

``tsx
import { useState, useCallback, useRef, memo, useMemo } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { getAbsolutePostUrl } from '@/lib/slug';
import { extractPostStreamVideos, deleteStreamVideos, isSupabaseStorageUrl, deleteStorageFile } from '@/utils/streamHelpers';
import { usePostStats } from '@/hooks/usePostStats';
import { useLiveReplayStatus } from '@/hooks/live/useLiveReplayStatus';
import { PostHeader } from './PostHeader';
import { PostMedia } from './PostMedia';
import { PostFooter } from './PostFooter';
import { ExpandableContent } from './ExpandableContent';
import { CommentSection } from './CommentSection';
import { ImageViewer } from './ImageViewer';
import { EditPostDialog } from './EditPostDialog';
import { ShareDialog } from './ShareDialog';
import { LiveChatReplay } from '@/modules/live/components/LiveChatReplay';
import { LinkPreviewCard, extractFirstUrl } from './LinkPreviewCard';
import type { FacebookPostCardProps } from './types';

const FacebookPostCardComponent = ({
  post, currentUserId, onPostDeleted, initialStats,
  isPinned = false, onPinPost, onUnpinPost,
  isOwnProfile = false, viewAsPublic = false,
  disableRealtime = false,
}: FacebookPostCardProps) => {
  const { t } = useLanguage();
  const canShowPinOption = isOwnProfile && !viewAsPublic && post.user_id === currentUserId;
  const hasNativeMedia = !!(post.image_url || post.video_url || (post.media_urls && post.media_urls.length > 0));
  const firstUrl = post.content ? extractFirstUrl(post.content) : null;

  // Auto-upgrade lÃªn HLS HD khi Cloudflare Stream encode xong
  const isLivePost = post.post_type === 'live';
  const liveSessionId = isLivePost ? (post.metadata?.live_session_id as string | undefined) : undefined;
  const needsReplayHydrate = isLivePost && !post.metadata?.playback_hls;
  const replayOverride = useLiveReplayStatus(liveSessionId, needsReplayHydrate);

  const effectivePost = useMemo(() => {
    if (!replayOverride) return post;
    return {
      ...post,
      video_url: replayOverride.playback_hls ?? post.video_url,
      metadata: { ...(post.metadata || {}), ...replayOverride },
    };
  }, [post, replayOverride]);

  const [showImageViewer, setShowImageViewer] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const lastTapRef = useRef<number>(0);

  const {
    likeCount, commentCount, shareCount,
    currentReaction, reactionCounts,
    handleReactionChange, incrementCommentCount, setShareCount,
  } = usePostStats(post.id, currentUserId, initialStats, disableRealtime);

  const handleDelete = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('posts').delete().eq('id', post.id);
      if (error) throw error;
      toast.success(t('postDeleted'));
      onPostDeleted();
      // Background cleanup
      const videoUrls = extractPostStreamVideos(post);
      if (videoUrls.length > 0) deleteStreamVideos(videoUrls).catch(() => {});
      if (post.video_url && isSupabaseStorageUrl(post.video_url)) deleteStorageFile(post.video_url).catch(() => {});
    } catch {
      toast.error(t('cannotDeletePost'));
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, post, onPostDeleted, t]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(getAbsolutePostUrl(post));
    toast.success(t('linkCopied'));
  }, [post, t]);

  const toggleComments = useCallback(() => setShowComments((p) => !p), []);

  const handleMediaDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300 && !currentReaction) {
      setShowHeartAnimation(true);
    }
    lastTapRef.current = now;
  }, [currentReaction]);

  return (
    <>
      <div className="fb-card mb-3 sm:mb-4 overflow-hidden">
        <PostHeader
          post={post}
          currentUserId={currentUserId}
          isPinned={isPinned}
          canShowPinOption={canShowPinOption}
          isDeleting={isDeleting}
          onCopyLink={handleCopyLink}
          onCopyContent={post.content ? () => {
            navigator.clipboard.writeText(post.content!);
            toast.success(t('postCopySuccess'));
          } : undefined}
          onEdit={() => setShowEditDialog(true)}
          onDelete={handleDelete}
          onPinPost={onPinPost}
          onUnpinPost={onUnpinPost}
        />

        {post.content && (
          <div className="px-4 pb-3 select-text">
            <ExpandableContent content={post.content} maxLength={300} maxLines={5} />
          </div>
        )}

        <PostMedia
          post={effectivePost}
          showHeartAnimation={showHeartAnimation}
          onHeartComplete={() => setShowHeartAnimation(false)}
          onDoubleTap={handleMediaDoubleTap}
        />

        {firstUrl && <LinkPreviewCard url={firstUrl} />}

        <PostFooter
          post={post}
          currentUserId={currentUserId}
          likeCount={likeCount}
          commentCount={commentCount}
          shareCount={shareCount}
          currentReaction={currentReaction}
          reactionCounts={reactionCounts}
          onToggleComments={toggleComments}
          onReactionChange={handleReactionChange}
          onShareClick={() => setShowShareDialog(true)}
        />

        {showComments && (
          <div className="border-t border-border px-4 py-3">
            {post.post_type === 'live' && post.metadata?.live_session_id && (
              <div className="max-h-[300px] rounded-lg overflow-hidden border border-border mb-3">
                <LiveChatReplay sessionId={post.metadata.live_session_id} />
              </div>
            )}
            <CommentSection postId={post.id} onCommentAdded={incrementCommentCount} disableRealtime={disableRealtime} />
          </div>
        )}
      </div>

      <ImageViewer imageUrl={post.image_url || ''} isOpen={showImageViewer} onClose={() => setShowImageViewer(false)} />
      <EditPostDialog post={post} isOpen={showEditDialog} onClose={() => setShowEditDialog(false)} onPostUpdated={onPostDeleted} />
      <ShareDialog
        open={showShareDialog} onOpenChange={setShowShareDialog}
        post={post} currentUserId={currentUserId}
        onShareComplete={() => setShareCount((p) => p + 1)}
      />
    </>
  );
};

export const PostCard = memo(FacebookPostCardComponent, (prev, next) => (
  prev.post.id === next.post.id &&
  prev.post.content === next.post.content &&
  prev.post.image_url === next.post.image_url &&
  prev.post.video_url === next.post.video_url &&
  prev.currentUserId === next.currentUserId &&
  prev.initialStats?.commentCount === next.initialStats?.commentCount &&
  prev.initialStats?.shareCount === next.initialStats?.shareCount &&
  prev.initialStats?.reactions?.length === next.initialStats?.reactions?.length &&
  prev.isPinned === next.isPinned &&
  prev.isOwnProfile === next.isOwnProfile &&
  prev.viewAsPublic === next.viewAsPublic &&
  prev.disableRealtime === next.disableRealtime
));

/** @deprecated Use PostCard instead */
export const FacebookPostCard = PostCard;
````

## src/components/feed/PostMedia.tsx

``tsx
import { useMemo, memo } from 'react';
import { MediaGrid } from './MediaGrid';
import { LivePostEmbed } from './LivePostEmbed';
import { HeartAnimation } from './HeartAnimation';
import { Radio } from 'lucide-react';
import type { PostData } from './types';

interface PostMediaProps {
  post: PostData;
  showHeartAnimation: boolean;
  onHeartComplete: () => void;
  onDoubleTap: () => void;
}

export const PostMedia = memo(function PostMedia({
  post, showHeartAnimation, onHeartComplete, onDoubleTap,
}: PostMediaProps) {
  const metadata = post.metadata;
  const isLive = post.post_type === 'live';

  const mediaItems = useMemo(() => {
    const items: Array<{ url: string; type: 'image' | 'video'; poster?: string; isLiveReplay?: boolean }> = [];
    const hlsUrl = isLive ? metadata?.playback_hls : undefined;
    const chunkedFallbackUrl = isLive && metadata?.allow_chunked_fallback
      ? metadata?.fallback_playback_url || metadata?.playback_url
      : undefined;
    const poster = metadata?.thumbnail_url;

    if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
      if (isLive) {
        const replayUrl = hlsUrl || chunkedFallbackUrl;
        if (!replayUrl) return [];
        return post.media_urls.map(m => ({
          ...m,
          url: m.type === 'video' ? replayUrl : m.url,
          isLiveReplay: m.type === 'video',
          poster: m.type === 'video' ? poster : undefined,
        }));
      }
      return post.media_urls;
    }

    if (post.image_url) {
      items.push({ url: post.image_url, type: 'image' as const });
    }
    const videoUrl = isLive ? (hlsUrl || chunkedFallbackUrl) : post.video_url;
    if (videoUrl) {
      items.push({ url: videoUrl, type: 'video' as const, poster, isLiveReplay: isLive });
    }
    return items;
  }, [post.media_urls, post.image_url, post.video_url, metadata, isLive]);

  // Live embed for active streams
  if (isLive && metadata?.live_status === 'live') {
    return (
      <LivePostEmbed
        metadata={metadata}
        hostName={post.profiles?.display_name || post.profiles?.username || ''}
      />
    );
  }

  return (
    <div className="relative" onClick={onDoubleTap}>
      {mediaItems.length > 0 ? (
        <MediaGrid media={mediaItems} feedId={post.id} />
      ) : isLive && metadata?.live_status === 'ended' ? (
        metadata?.recording_failed ? (
          <div className="flex items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
            <Radio className="w-4 h-4" />
            <span>PhiÃªn live nÃ y khÃ´ng cÃ³ báº£n ghi</span>
          </div>
        ) : (
          <div className="flex items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Äang xá»­ lÃ½ báº£n ghi livestream...</span>
          </div>
        )
      ) : null}
      <HeartAnimation show={showHeartAnimation} onComplete={onHeartComplete} />
    </div>
  );
});
````

## src/components/feed/FeedVideoPlayer.tsx

``tsx
import { memo, useEffect, useId, useCallback, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { FacebookVideoPlayer } from '@/components/ui/FacebookVideoPlayer';
import { VideoErrorBoundary } from '@/components/ui/VideoErrorBoundary';
import { videoPlaybackCoordinator } from './videoPlaybackCoordinator';
import { Radio, Download, Play } from 'lucide-react';
import { downloadChunkedVideo } from '@/utils/chunkedVideoDownload';

const ChunkedVideoPlayer = lazy(() =>
  import('@/modules/live/components/ChunkedVideoPlayer').then(mod => ({ default: mod.ChunkedVideoPlayer }))
);
const ReplayPlayer = lazy(() =>
  import('@/components/ui/ReplayPlayer').then(mod => ({ default: mod.ReplayPlayer }))
);

/* R2 URL normalizer */
const R2_DEV_PATTERN = /https:\/\/pub-[a-f0-9]+\.r2\.dev/g;
const R2_CUSTOM_DOMAIN = 'https://media.fun.rich';
function normalizeR2Url(url: string): string {
  return url.replace(R2_DEV_PATTERN, R2_CUSTOM_DOMAIN);
}

function isChunkedManifestUrl(url: string): boolean {
  return url.endsWith('manifest.json') || /\/recordings\/[^/]+\/manifest\.json/.test(url);
}

function isCloudflareStreamHls(url: string): boolean {
  return /(?:cloudflarestream\.com|videodelivery\.net)\/[^/]+\/manifest\/video\.m3u8/.test(url);
}

function isAppleMobileSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const appleMobile = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return appleMobile && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export interface FeedVideoPlayerProps {
  src: string;
  poster?: string;
  isLiveReplay?: boolean;
  itemId?: string;
  feedId?: string;
  className?: string;
  compact?: boolean;
  onError?: () => void;
}

export const FeedVideoPlayer = memo(({
  src,
  poster,
  isLiveReplay = false,
  itemId,
  feedId,
  className,
  compact = false,
  onError,
}: FeedVideoPlayerProps) => {
  const autoId = useId();
  const coordId = itemId || feedId || autoId;
  const normalizedSrc = useMemo(() => normalizeR2Url(src), [src]);
  const isChunked = isChunkedManifestUrl(normalizedSrc);
  const isCloudflareReplay = isCloudflareStreamHls(normalizedSrc);
  const blockChunkedOnIos = isChunked && isAppleMobileSafari();

  if (import.meta.env.DEV) {
    console.debug(
      `[FeedVideoPlayer] route=${isCloudflareReplay ? 'cloudflare-hls' : isChunked ? 'chunked' : 'generic'} src=${normalizedSrc}`,
    );
  }

  // Lazy mount: only create video element when near viewport
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  // Debounced version to prevent rapid mount/unmount during fast scroll
  const [debouncedNear, setDebouncedNear] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
      },
      { rootMargin: '200px' } // reduced from 400px
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // 300ms debounce for viewport detection to avoid jank on fast scroll
  useEffect(() => {
    if (isNearViewport) {
      // Mount immediately when entering viewport
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setDebouncedNear(true);
    } else {
      // Delay unmount by 300ms
      debounceRef.current = setTimeout(() => setDebouncedNear(false), 300);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isNearViewport]);

  // Register with coordinator (only when mounted)
  useEffect(() => {
    if (!debouncedNear) return;
    const el = containerRef.current?.querySelector('video') as HTMLVideoElement | null;
    const pauseFn = () => { el?.pause(); };
    videoPlaybackCoordinator.register(coordId, pauseFn);
    return () => videoPlaybackCoordinator.unregister(coordId);
  }, [coordId, src, debouncedNear]);

  const handlePlayStart = useCallback(() => {
    videoPlaybackCoordinator.requestPlay(coordId);
  }, [coordId]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full aspect-square overflow-hidden rounded-xl bg-black',
        className
      )}
      data-feed-video-id={coordId}
    >
      {/* Layer 1: Blurred backdrop Ã¢â‚¬â€ poster img or gradient (NEVER a <video>) */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {poster ? (
          <img
            src={poster}
            alt=""
            className="w-full h-full object-cover blur-2xl opacity-35 scale-110"
            aria-hidden="true"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black" aria-hidden="true" />
        )}
      </div>

      {/* Layer 2: Foreground Ã¢â‚¬â€ lazy mounted video or static placeholder */}
      <div className="relative z-10 w-full h-full">
        {debouncedNear ? (
          // Near viewport: mount real player
          isCloudflareReplay ? (
            <VideoErrorBoundary>
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse" />}>
                <ReplayPlayer
                  src={normalizedSrc}
                  poster={poster}
                  className="w-full h-full"
                  controls
                />
              </Suspense>
            </VideoErrorBoundary>
          ) : blockChunkedOnIos ? (
            <div className="flex h-full w-full items-center justify-center bg-black p-4 text-center text-sm text-white/80">
              Replay Ã„â€˜ang Ã„â€˜Ã†Â°Ã¡Â»Â£c xÃ¡Â»Â­ lÃƒÂ½ HLS cho Safari.
            </div>
          ) : isChunked ? (
            <VideoErrorBoundary>
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse" />}>
                <ChunkedVideoPlayer
                  manifestUrl={normalizedSrc}
                  className="w-full h-full"
                  autoPlay={false}
                  controls
                />
              </Suspense>
            </VideoErrorBoundary>
          ) : (
            <FacebookVideoPlayer
              src={normalizedSrc}
              poster={poster}
              className="w-full h-full"
              compact={compact}
              mutedByDefault
              autoPlayInView
              objectFit="contain"
              onPlayStart={handlePlayStart}
              onError={onError}
            />
          )
        ) : (
          // Off-screen placeholder: poster + play icon (zero video elements)
          <div className="w-full h-full flex items-center justify-center">
            {poster && (
              <img
                src={poster}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
                loading="lazy"
              />
            )}
            <div className="relative z-10 w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="w-7 h-7 text-white fill-white" />
            </div>
          </div>
        )}
      </div>

      {/* LIVE Replay badge + download */}
      {isLiveReplay && (
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-30">
          <div className="flex items-center gap-1.5 bg-destructive/90 text-destructive-foreground px-2.5 py-1 rounded-full text-xs font-bold shadow-lg backdrop-blur-sm">
            <Radio className="w-3.5 h-3.5" />
            LIVE Replay
          </div>
          {isChunked ? (
            <button
              onClick={(e) => { e.stopPropagation(); downloadChunkedVideo(src); }}
              className="pointer-events-auto w-9 h-9 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
              title="TÃ¡ÂºÂ£i xuÃ¡Â»â€˜ng"
            >
              <Download className="w-4 h-4" />
            </button>
          ) : (
            <a
              href={src}
              download
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto w-9 h-9 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
              title="TÃ¡ÂºÂ£i xuÃ¡Â»â€˜ng"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
});

FeedVideoPlayer.displayName = 'FeedVideoPlayer';
````

## src/components/feed/MediaGrid.tsx

``tsx
import { useState, memo, useCallback, useRef, lazy, Suspense } from 'react';
import { ImageViewer } from './ImageViewer';
import { LazyImage } from '@/components/ui/LazyImage';
import { FeedVideoPlayer } from './FeedVideoPlayer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, X, Play, Download, Loader2 } from 'lucide-react';
import { SocialVideoPlayer } from '@/components/ui/SocialVideoPlayer';
import { downloadChunkedVideo } from '@/utils/chunkedVideoDownload';

// Lazy load ChunkedVideoPlayer for gallery
const ChunkedVideoPlayer = lazy(() => import('@/modules/live/components/ChunkedVideoPlayer').then(mod => ({ default: mod.ChunkedVideoPlayer })));
const ReplayPlayer = lazy(() => import('@/components/ui/ReplayPlayer').then(mod => ({ default: mod.ReplayPlayer })));

/** Detect if a URL points to a chunked recording manifest */
function isChunkedManifestUrl(url: string): boolean {
  return url.endsWith('manifest.json') || /\/recordings\/[^/]+\/manifest\.json/.test(url);
}

function isCloudflareStreamHls(url: string): boolean {
  return /(?:cloudflarestream\.com|videodelivery\.net)\/[^/]+\/manifest\/video\.m3u8/.test(url);
}

function isAppleMobileSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const appleMobile = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return appleMobile && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

interface MediaItem {
  url: string;
  type: 'image' | 'video';
  poster?: string;
  isLiveReplay?: boolean;
}

interface MediaGridProps {
  media: MediaItem[];
  feedId?: string;
}

/**
 * Optimized MediaGrid component with lazy loading
 * - Supports up to 80 media items
 * - Gallery viewer for browsing all media
 * - Automatically filters out broken media
 */
export const MediaGrid = memo(({ media: initialMedia, feedId }: MediaGridProps) => {
  const [showViewer, setShowViewer] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());

  // Filter out broken media
  const media = initialMedia.filter(item => !brokenUrls.has(item.url));

  const handleMediaError = useCallback((url: string) => {
    setBrokenUrls(prev => new Set(prev).add(url));
  }, []);

  if (media.length === 0) return null;

  const remainingCount = media.length - 4;

  const handleClick = (index: number) => {
    setSelectedIndex(index);
    setShowViewer(true);
  };

  const handlePrev = () => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : media.length - 1));
  };

  const handleNext = () => {
    setSelectedIndex((prev) => (prev < media.length - 1 ? prev + 1 : 0));
  };

  // Single media
  if (media.length === 1) {
    const item = media[0];
    return (
      <>
        {item.type === 'video' ? (
            <FeedVideoPlayer
              src={item.url}
              poster={item.poster}
              
              isLiveReplay={item.isLiveReplay}
              feedId={feedId}
              onError={() => handleMediaError(item.url)}
            />
        ) : (
          <div 
            className="cursor-pointer"
            onClick={() => handleClick(0)}
          >
            <LazyImage
              src={item.url}
              alt="Post media"
              className="w-full max-h-[600px] bg-black"
              hideOnError
              onLoadError={() => handleMediaError(item.url)}
              transformPreset="post"
            />
          </div>
        )}
        <MediaGalleryViewer
          media={media}
          isOpen={showViewer}
          onClose={() => setShowViewer(false)}
          currentIndex={selectedIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          setIndex={setSelectedIndex}
        />
      </>
    );
  }

  // Two media
  if (media.length === 2) {
    return (
      <>
        <div className="grid grid-cols-2 gap-1">
          {media.map((item, index) => (
            <div key={item.url} className="aspect-square overflow-hidden">
              {item.type === 'video' ? (
                <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                    src={item.url}
                    poster={item.poster}
                    isLiveReplay={item.isLiveReplay}
                    feedId={feedId}
                    compact
                    onError={() => handleMediaError(item.url)}
                  />
                </div>
              ) : (
                <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                  <LazyImage
                    src={item.url}
                    alt={`Media ${index + 1}`}
                    className="w-full h-full hover:opacity-95 transition-opacity"
                    hideOnError
                    onLoadError={() => handleMediaError(item.url)}
                    transformPreset="post-grid"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <MediaGalleryViewer
          media={media}
          isOpen={showViewer}
          onClose={() => setShowViewer(false)}
          currentIndex={selectedIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          setIndex={setSelectedIndex}
        />
      </>
    );
  }

  // Three media - Image 1 on top left, Image 2 on top right, Image 3 on bottom left
  if (media.length === 3) {
    return (
      <>
        <div className="grid grid-cols-2 grid-rows-2 gap-1">
          {/* Image 1 - Top left */}
          <div className="aspect-square overflow-hidden">
            {media[0].type === 'video' ? (
              <div onClick={() => handleClick(0)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                  src={media[0].url}
                  poster={media[0].poster}
                  isLiveReplay={media[0].isLiveReplay}
                  feedId={feedId}
                  compact
                  onError={() => handleMediaError(media[0].url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(0)} className="cursor-pointer h-full">
                <LazyImage
                  src={media[0].url}
                  alt="Media 1"
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={() => handleMediaError(media[0].url)}
                  transformPreset="post-grid"
                />
              </div>
            )}
          </div>
          {/* Image 2 - Top right, spans 2 rows */}
          <div className="row-span-2 aspect-auto overflow-hidden">
            {media[1].type === 'video' ? (
              <div onClick={() => handleClick(1)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                  src={media[1].url}
                  poster={media[1].poster}
                  isLiveReplay={media[1].isLiveReplay}
                  feedId={feedId}
                  compact
                  onError={() => handleMediaError(media[1].url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(1)} className="cursor-pointer h-full">
                <LazyImage
                  src={media[1].url}
                  alt="Media 2"
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={() => handleMediaError(media[1].url)}
                  transformPreset="post-grid"
                />
              </div>
            )}
          </div>
          {/* Image 3 - Bottom left */}
          <div className="aspect-square overflow-hidden">
            {media[2].type === 'video' ? (
              <div onClick={() => handleClick(2)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                  src={media[2].url}
                  poster={media[2].poster}
                  isLiveReplay={media[2].isLiveReplay}
                  feedId={feedId}
                  compact
                  onError={() => handleMediaError(media[2].url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(2)} className="cursor-pointer h-full">
                <LazyImage
                  src={media[2].url}
                  alt="Media 3"
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={() => handleMediaError(media[2].url)}
                  transformPreset="post-grid"
                />
              </div>
            )}
          </div>
        </div>
        <MediaGalleryViewer
          media={media}
          isOpen={showViewer}
          onClose={() => setShowViewer(false)}
          currentIndex={selectedIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          setIndex={setSelectedIndex}
        />
      </>
    );
  }

  // Four or more media
  return (
    <>
      <div className="grid grid-cols-2 gap-1">
        {media.slice(0, 4).map((item, index) => (
          <div 
            key={item.url} 
            className="aspect-square overflow-hidden relative"
          >
            {item.type === 'video' ? (
              <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                  src={item.url}
                  poster={item.poster}
                  isLiveReplay={item.isLiveReplay}
                  feedId={feedId}
                  compact
                  onError={() => handleMediaError(item.url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                <LazyImage
                  src={item.url}
                  alt={`Media ${index + 1}`}
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={() => handleMediaError(item.url)}
                  transformPreset="post-grid"
                />
              </div>
            )}
            {index === 3 && remainingCount > 0 && (
              <div 
                className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer"
                onClick={() => handleClick(3)}
              >
                <span className="text-white text-3xl font-bold">+{remainingCount}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <MediaGalleryViewer
        media={media}
        isOpen={showViewer}
        onClose={() => setShowViewer(false)}
        currentIndex={selectedIndex}
        onPrev={handlePrev}
        onNext={handleNext}
        setIndex={setSelectedIndex}
      />
    </>
  );
});

MediaGrid.displayName = 'MediaGrid';

// Gallery viewer component for browsing all media
interface MediaGalleryViewerProps {
  media: MediaItem[];
  isOpen: boolean;
  onClose: () => void;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  setIndex?: (index: number) => void;
}

const MediaGalleryViewer = memo(({ media, isOpen, onClose, currentIndex, onPrev, onNext, setIndex }: MediaGalleryViewerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!isOpen || media.length === 0) return null;

  const currentMedia = media[currentIndex];

  const handleThumbnailClick = (index: number) => {
    if (setIndex) {
      setIndex(index);
    }
  };

  const skipVideo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
        <div className="relative w-full h-[90vh] flex items-center justify-center">
          {/* Close + Download buttons */}
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            {currentMedia.type === 'video' && (
              isChunkedManifestUrl(currentMedia.url) ? (
                <button
                  onClick={() => downloadChunkedVideo(currentMedia.url)}
                  className="w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
                  title="TÃ¡ÂºÂ£i xuÃ¡Â»â€˜ng"
                >
                  <Download className="w-5 h-5" />
                </button>
              ) : (
                <a
                  href={currentMedia.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
                  title="TÃ¡ÂºÂ£i xuÃ¡Â»â€˜ng"
                >
                  <Download className="w-5 h-5" />
                </a>
              )
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Counter */}
          <div className="absolute top-4 left-4 z-50 bg-black/50 px-3 py-1 rounded-full text-white text-sm">
            {currentIndex + 1} / {media.length}
          </div>

          {/* Previous button */}
          {media.length > 1 && (
            <button
              onClick={onPrev}
              className="absolute left-4 z-50 w-12 h-12 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {/* Media content */}
          <div className="max-w-full max-h-full flex items-center justify-center p-4 relative">
            {currentMedia.type === 'video' ? (
              isCloudflareStreamHls(currentMedia.url) ? (
                <Suspense fallback={<div className="w-full h-[85vh] bg-muted animate-pulse" />}>
                  <ReplayPlayer
                    src={currentMedia.url}
                    poster={currentMedia.poster}
                    className="max-w-full max-h-[85vh]"
                    autoPlay
                    controls
                  />
                </Suspense>
              ) : isChunkedManifestUrl(currentMedia.url) && isAppleMobileSafari() ? (
                <div className="flex h-[85vh] max-h-[85vh] w-[80vw] items-center justify-center bg-black p-4 text-center text-sm text-white/80">
                  Replay Ã„â€˜ang Ã„â€˜Ã†Â°Ã¡Â»Â£c xÃ¡Â»Â­ lÃƒÂ½ HLS cho Safari.
                </div>
              ) : isChunkedManifestUrl(currentMedia.url) ? (
                <Suspense fallback={<div className="w-full h-[85vh] bg-muted animate-pulse" />}>
                  <ChunkedVideoPlayer
                    manifestUrl={currentMedia.url}
                    className="max-w-full max-h-[85vh]"
                    autoPlay
                    controls
                  />
                </Suspense>
              ) : (
                <>
                  <SocialVideoPlayer
                    videoRef={videoRef as React.RefObject<HTMLVideoElement>}
                    showControls
                    className="max-w-full max-h-[85vh]"
                  >
                    <video
                      ref={videoRef}
                      key={currentMedia.url}
                      src={currentMedia.url}
                      autoPlay
                      playsInline
                      className="max-w-full max-h-[85vh] object-contain"
                    />
                  </SocialVideoPlayer>
                </>
              )
            ) : (
              <img
                key={currentMedia.url}
                src={currentMedia.url}
                alt={`Media ${currentIndex + 1}`}
                className="max-w-full max-h-[85vh] object-contain"
              />
            )}
          </div>

          {/* Next button */}
          {media.length > 1 && (
            <button
              onClick={onNext}
              className="absolute right-4 z-50 w-12 h-12 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Thumbnail strip for many images */}
          {media.length > 4 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 max-w-[80vw] overflow-x-auto p-2 bg-black/50 rounded-lg">
              {media.map((item, index) => (
                <button
                  key={index}
                  onClick={() => handleThumbnailClick(index)}
                  className={`w-12 h-12 flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                    index === currentIndex ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                {item.type === 'video' ? (
                    item.poster ? (
                      <img src={item.poster} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <Play className="w-4 h-4 text-white/70" />
                      </div>
                    )
                  ) : (
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

MediaGalleryViewer.displayName = 'MediaGalleryViewer';
````

## src/components/feed/types.ts

``ts
export interface PostMetadata {
  live_status?: 'live' | 'ended' | string;
  live_session_id?: string;
  thumbnail_url?: string;
  recording_failed?: boolean;
  fallback_playback_url?: string;
  playback_hls?: string;
  playback_type?: 'cloudflare_stream' | 'cloudflare_stream_pending' | 'chunked' | string;
  allow_chunked_fallback?: boolean;
  stream_uid?: string;
  [key: string]: unknown;
}

export interface PostData {
  id: string;
  slug?: string | null;
  content: string;
  image_url: string | null;
  video_url?: string | null;
  media_urls?: Array<{ url: string; type: 'image' | 'video' }> | null;
  created_at: string;
  user_id: string;
  visibility?: string;
  post_type?: string;
  metadata?: PostMetadata | null;
  profiles: {
    username: string;
    display_name?: string | null;
    avatar_url: string | null;
    public_wallet_address?: string | null;
  };
}

export interface PostStats {
  reactions: { id: string; user_id: string; type: string }[];
  commentCount: number;
  shareCount: number;
}

export interface ReactionCount {
  type: string;
  count: number;
}

export interface FacebookPostCardProps {
  post: PostData;
  currentUserId: string;
  onPostDeleted: () => void;
  initialStats?: PostStats;
  isPinned?: boolean;
  onPinPost?: (postId: string) => void;
  onUnpinPost?: () => void;
  isOwnProfile?: boolean;
  viewAsPublic?: boolean;
  disableRealtime?: boolean;
}
````

## src/components/ui/ReplayPlayer.tsx

``tsx
import { memo, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReplayPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  loop?: boolean;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

export const ReplayPlayer = memo(({
  src,
  poster,
  className,
  autoPlay = false,
  muted = false,
  controls = true,
  loop = false,
  onReady,
  onError,
}: ReplayPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setLoading(true);
    setBuffering(false);
    setError(null);

    const handleReady = () => {
      setLoading(false);
      onReady?.();
      if (autoPlay) {
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      }
    };
    const handleWaiting = () => setBuffering(true);
    const handlePlaying = () => {
      setLoading(false);
      setBuffering(false);
    };
    const handleError = () => {
      const message = 'Replay playback error';
      setLoading(false);
      setError(message);
      onError?.(new Error(message));
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handlePlaying);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', handleReady, { once: true });
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('canplay', handlePlaying);
        video.removeEventListener('loadedmetadata', handleReady);
        video.removeEventListener('error', handleError);
        video.removeAttribute('src');
        video.load();
      };
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 90,
        startLevel: -1,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, handleReady);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          handleError();
        }
      });

      return () => {
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('canplay', handlePlaying);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    handleError();
    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handlePlaying);
    };
  }, [src, autoPlay, onReady, onError]);

  return (
    <div className={cn('relative bg-black overflow-hidden', className)}>
      <video
        ref={videoRef}
        poster={poster}
        controls={controls}
        muted={muted}
        loop={loop}
        preload="metadata"
        playsInline
        className="w-full h-full object-contain"
      />
      {(loading || buffering) && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-white/80" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-white/80">
          KhÃ´ng thá»ƒ phÃ¡t replay. Vui lÃ²ng thá»­ láº¡i sau.
        </div>
      )}
    </div>
  );
});

ReplayPlayer.displayName = 'ReplayPlayer';
export default ReplayPlayer;
````

## src/components/ui/StreamPlayer.tsx

``tsx
import { useEffect, useRef, useState, memo, useCallback } from 'react';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from 'lucide-react';
import { checkVideoStatus, extractStreamUid } from '@/utils/streamUpload';
import { VideoProcessingState } from './VideoProcessingState';
import { VideoErrorState } from './VideoErrorState';
import logger from '@/lib/logger';

interface StreamPlayerProps {
  src: string; // HLS manifest URL, Stream UID, or iframe embed URL
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  onError?: (error: Error) => void;
  onReady?: () => void;
  /** Enable status polling for processing videos */
  enableStatusCheck?: boolean;
}

/**
 * Detect video URL type and extract UID if applicable
 */
function parseVideoSource(src: string): { type: 'iframe' | 'hls' | 'direct'; url: string; uid?: string } {
  // iframe.videodelivery.net/{uid}
  if (src.includes('iframe.videodelivery.net')) {
    const match = src.match(/iframe\.videodelivery\.net\/([a-f0-9]+)/i);
    return { type: 'iframe', url: src, uid: match?.[1] };
  }
  
  // cloudflarestream.com/{uid}/manifest/video.m3u8
  if (src.includes('cloudflarestream.com') && src.includes('.m3u8')) {
    return { type: 'hls', url: src };
  }
  
  // videodelivery.net/{uid}/manifest/video.m3u8
  if (src.includes('videodelivery.net') && src.includes('.m3u8')) {
    return { type: 'hls', url: src };
  }
  
  // Just a UID - convert to iframe URL
  if (/^[a-f0-9]{32}$/i.test(src)) {
    return { type: 'iframe', url: `https://iframe.videodelivery.net/${src}`, uid: src };
  }
  
  // R2 or other direct video URLs (including media.fun.rich)
  if (src.includes('.r2.dev') || src.includes('media.fun.rich') || src.includes('.mp4') || src.includes('.webm')) {
    return { type: 'direct', url: src };
  }
  
  // Default: treat as HLS
  return { type: 'hls', url: src };
}

/**
 * HLS Video Player for Cloudflare Stream
 * - Adaptive bitrate streaming
 * - Fallback to native HLS for Safari
 * - Iframe embed support for maximum compatibility
 * - Custom controls
 * - Auto-polling for processing videos
 */
export const StreamPlayer = memo(({
  src,
  poster,
  className,
  autoPlay = false,
  muted = true,
  loop = false,
  controls = true,
  onError,
  onReady,
  enableStatusCheck = true,
}: StreamPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<number | undefined>(undefined);
  const [isVideoReady, setIsVideoReady] = useState<boolean | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const { type, url, uid } = parseVideoSource(src);
  
  // Generate thumbnail URL from UID
  const thumbnailUrl = uid ? `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=1s` : poster;

  // Determine effective type after fallback
  const effectiveType = useIframeFallback ? 'iframe' : type;

  // Poll video status for processing videos
  const pollVideoStatus = useCallback(async () => {
    const videoUid = uid || extractStreamUid(src);
    if (!videoUid) {
      setIsVideoReady(true);
      return;
    }

    try {
      const status = await checkVideoStatus(videoUid);
      logger.debug('[StreamPlayer] Video status:', status);
      
      if (status.readyToStream) {
        setIsVideoReady(true);
        setIsProcessing(false);
        setHasError(false);
        setErrorCode(undefined);
        setErrorMessage(undefined);
        // Stop polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } else {
        setIsVideoReady(false);
        
        // Check for errors (permanent failures)
        if (status.status?.state === 'error') {
          setHasError(true);
          setIsProcessing(false);
          setErrorCode(status.status.errorReasonCode);
          setErrorMessage(status.status.errorReasonText);
          onError?.(new Error(status.status.errorReasonText || 'Video processing failed'));
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } else {
          // Still processing
          setIsProcessing(true);
          // Parse progress from pctComplete
          if (status.status?.pctComplete) {
            const pct = parseFloat(status.status.pctComplete);
            if (!isNaN(pct)) {
              setProcessingProgress(pct);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[StreamPlayer] Failed to check video status:', err);
      // Don't set error state, just assume ready and let player handle it
      setIsVideoReady(true);
    }
  }, [src, uid, onError]);

  // Start polling when component mounts
  useEffect(() => {
    if (!enableStatusCheck) {
      setIsVideoReady(true);
      return;
    }

    // Check status immediately on mount
    pollVideoStatus();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enableStatusCheck, pollVideoStatus]);

  // Start/stop polling based on processing state
  useEffect(() => {
    if (isProcessing && !pollingRef.current) {
      logger.debug('[StreamPlayer] Starting status polling...');
      pollingRef.current = setInterval(pollVideoStatus, 5000);
    }
    
    return () => {
      if (pollingRef.current && !isProcessing) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isProcessing, pollVideoStatus]);

  // HLS playback setup - only runs for HLS type
  useEffect(() => {
    // Skip if not HLS type or video not ready
    if (effectiveType !== 'hls' || isVideoReady === false || isProcessing) return;
    
    const video = videoRef.current;
    if (!video || !src) return;

    setIsLoading(true);
    setHasError(false);

    // Check if HLS.js is supported
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1, // Auto quality selection
      });

      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        onReady?.();
        if (autoPlay) {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error('[StreamPlayer] Fatal error:', data);
          
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            logger.debug('[StreamPlayer] Falling back to iframe embed');
            setUseIframeFallback(true);
          }
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = url;
      
      const handleMetadata = () => {
        setIsLoading(false);
        onReady?.();
        if (autoPlay) {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      };

      const handleError = () => {
        setUseIframeFallback(true);
      };

      video.addEventListener('loadedmetadata', handleMetadata);
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('loadedmetadata', handleMetadata);
        video.removeEventListener('error', handleError);
      };
    } else {
      // No HLS support - use iframe
      setUseIframeFallback(true);
    }
  }, [src, url, autoPlay, onError, onReady, effectiveType, isVideoReady, isProcessing]);

  // Video play/pause event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  // Control functions
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen?.();
    }
  }, []);

  // --- RENDER SECTION ---
  
  // Show processing UI when video is still being encoded
  if (isProcessing && isVideoReady === false && !hasError) {
    return (
      <VideoProcessingState
        thumbnailUrl={thumbnailUrl}
        progress={processingProgress}
        className={className}
      />
    );
  }

  // Show error UI when video has a permanent error
  if (hasError && errorCode) {
    return (
      <VideoErrorState
        errorCode={errorCode}
        errorMessage={errorMessage}
        thumbnailUrl={thumbnailUrl}
        className={className}
      />
    );
  }

  // For iframe embeds
  if (effectiveType === 'iframe') {
    const iframeUrl = type === 'iframe' ? url : `https://iframe.videodelivery.net/${uid || src}`;
    
    // If video has permanent error, show error state
    if (hasError && errorCode) {
      return (
        <VideoErrorState
          errorCode={errorCode}
          errorMessage={errorMessage}
          thumbnailUrl={thumbnailUrl}
          className={className}
        />
      );
    }
    
    return (
      <div className={cn('relative bg-black aspect-video', className)}>
        <iframe
          src={`${iframeUrl}?${autoPlay ? 'autoplay=true&' : ''}${muted ? 'muted=true&' : ''}${loop ? 'loop=true&' : ''}controls=${controls ? 'true' : 'false'}&preload=auto&poster=${encodeURIComponent(thumbnailUrl || '')}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={() => {
            setIsLoading(false);
            setIsProcessing(false);
            onReady?.();
          }}
          onError={() => {
            // Video might be processing, trigger status check
            pollVideoStatus();
          }}
        />
        {isLoading && !isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>
    );
  }

  // For direct videos (R2, mp4, etc.)
  if (effectiveType === 'direct') {
    return (
      <div className={cn('relative bg-black', className)}>
        <video
          src={url}
          poster={poster}
          autoPlay={autoPlay}
          muted={muted}
          loop={loop}
          controls={controls}
          playsInline
          className="w-full h-full object-contain"
          onLoadedData={() => {
            setIsLoading(false);
            onReady?.();
          }}
          onError={() => {
            setHasError(true);
            onError?.(new Error('Video playback error'));
          }}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>
    );
  }

  // HLS playback - show error state for permanent errors
  if (hasError && errorCode) {
    return (
      <VideoErrorState
        errorCode={errorCode}
        errorMessage={errorMessage}
        thumbnailUrl={thumbnailUrl}
        className={className}
      />
    );
  }

  // HLS playback - show processing state for encoding
  if (hasError && !errorCode) {
    return (
      <VideoProcessingState
        thumbnailUrl={thumbnailUrl}
        progress={processingProgress}
        className={className}
      />
    );
  }

  // HLS video player with custom controls
  return (
    <div 
      className={cn('relative bg-black group', className)}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        muted={muted}
        loop={loop}
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {/* Custom controls */}
      {controls && !isLoading && (
        <div 
          className={cn(
            'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity',
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={toggleMute}
              className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>

            <div className="flex-1" />

            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Big play button */}
      {!isPlaying && !isLoading && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
            <Play className="w-8 h-8 text-black ml-1" />
          </div>
        </button>
      )}
    </div>
  );
});

StreamPlayer.displayName = 'StreamPlayer';

export default StreamPlayer;
````

## src/pages/AdminReplayDebug.tsx

``tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Satellite, Shield, TestTube2 } from "lucide-react";
import { FacebookNavbar } from "@/components/layout/FacebookNavbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminRole } from "@/hooks/useAdminRole";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ReplayDebugRow = {
  id: string;
  live_session_id: string;
  chunked_recording_id: string | null;
  stream_uid: string | null;
  status: string;
  tus_offset: number;
  next_chunk_seq: number;
  total_chunks_for_ingest: number | null;
  ingest_attempts: number;
  last_ingest_at: string | null;
  webhook_received_at: string | null;
  playback_hls: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  last_error_at: string | null;
  last_webhook_event: string | null;
  last_cf_status: string | null;
  last_cf_response: unknown;
  created_at: string;
  updated_at: string;
};

const statusClass: Record<string, string> = {
  ready: "bg-emerald-500 text-white",
  processing: "bg-blue-500 text-white",
  uploading: "bg-amber-500 text-white",
  queued: "bg-slate-500 text-white",
  failed: "bg-destructive text-destructive-foreground",
};

async function callDebug(action: string, replayId?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Admin session required");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-replay-debug`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, replay_id: replayId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function shortId(id: string | null | undefined) {
  return id ? `${id.slice(0, 8)}...${id.slice(-4)}` : "-";
}

function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function AdminReplayDebug() {
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useAdminRole();
  const [rows, setRows] = useState<ReplayDebugRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [cfResult, setCfResult] = useState<unknown>(null);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      toast.error("BÃ¡ÂºÂ¡n khÃƒÂ´ng cÃƒÂ³ quyÃ¡Â»Ân truy cÃ¡ÂºÂ­p trang nÃƒÂ y");
      navigate("/");
    }
  }, [isAdmin, isLoading, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callDebug("list");
      setRows(data.replays || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "KhÃƒÂ´ng tÃ¡ÂºÂ£i Ã„â€˜Ã†Â°Ã¡Â»Â£c replay debug");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const stats = useMemo(() => ({
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    active: rows.filter((r) => ["queued", "uploading", "processing"].includes(r.status)).length,
    failed: rows.filter((r) => r.status === "failed").length,
  }), [rows]);

  const runAction = async (action: string, replayId?: string) => {
    setBusyAction(`${action}:${replayId || "global"}`);
    try {
      const data = await callDebug(action, replayId);
      if (action === "test_cloudflare_api") setCfResult(data);
      toast.success("Ã„ÂÃƒÂ£ chÃ¡ÂºÂ¡y thao tÃƒÂ¡c debug");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Thao tÃƒÂ¡c thÃ¡ÂºÂ¥t bÃ¡ÂºÂ¡i");
    } finally {
      setBusyAction(null);
    }
  };

  if (isLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="mx-auto max-w-7xl px-4 py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary rounded-lg text-primary-foreground">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Replay Debug</h1>
                <p className="text-sm text-muted-foreground">Cloudflare Stream ingest, webhook, and HLS readiness</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="outline" onClick={() => runAction("force_status_refresh")} disabled={!!busyAction}>
                <Satellite className="mr-2 h-4 w-4" />
                Force status refresh
              </Button>
              <Button onClick={() => runAction("test_cloudflare_api")} disabled={!!busyAction}>
                <TestTube2 className="mr-2 h-4 w-4" />
                Test Cloudflare API
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(stats).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">{label}</div>
                  <div className="text-2xl font-semibold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {cfResult !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cloudflare API Result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(cfResult, null, 2)}</pre>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Replays</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Replay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stream UID</TableHead>
                    <TableHead>TUS</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Playback</TableHead>
                    <TableHead>Last Error</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-48">
                        <div className="font-mono text-xs">{shortId(row.id)}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(row.created_at)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusClass[row.status] || ""}>{row.status}</Badge>
                        <div className="mt-1 text-xs text-muted-foreground">{row.last_cf_status || "-"}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{shortId(row.stream_uid)}</TableCell>
                      <TableCell className="text-xs">
                        <div>offset: {Number(row.tus_offset || 0).toLocaleString()}</div>
                        <div>next seq: {row.next_chunk_seq} / {row.total_chunks_for_ingest ?? "-"}</div>
                        <div>attempts: {row.ingest_attempts}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{row.last_webhook_event || "-"}</div>
                        <div className="text-muted-foreground">{fmtDate(row.webhook_received_at)}</div>
                      </TableCell>
                      <TableCell className="max-w-64 text-xs">
                        <div className="truncate" title={row.playback_hls || ""}>HLS: {row.playback_hls || "-"}</div>
                        <div className="truncate" title={row.thumbnail_url || ""}>Thumb: {row.thumbnail_url || "-"}</div>
                      </TableCell>
                      <TableCell className="max-w-64 text-xs">
                        <div className="line-clamp-3">{row.error_message || "-"}</div>
                        <div className="text-muted-foreground">{fmtDate(row.last_error_at)}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runAction("retry_upload", row.id)}
                            disabled={!!busyAction}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            Upload
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => runAction("retry_webhook_sync", row.id)}
                            disabled={!!busyAction}
                          >
                            Sync
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        No replay records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
````

## src/App.tsx

``tsx
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ensureAutoplay, registerAudioElement } from '@/lib/globalAudio';
import ScrollToTop from "./components/ScrollToTop";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { LawOfLightGuard } from "@/components/auth/LawOfLightGuard";
import { ConditionalWeb3Provider } from "@/components/providers/ConditionalWeb3Provider";
import { DonationReceivedNotification } from "@/components/donations/DonationReceivedNotification";
import { RewardAdjustmentNotification } from "@/components/notifications/RewardAdjustmentNotification";
import { EpochClaimCelebration } from "@/components/notifications/EpochClaimCelebration";
import { CallProvider } from "@/contexts/CallContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateNotification } from "@/components/UpdateNotification";
import { InstallBanner } from "@/components/install/InstallBanner";
import { usePendingDonationRecovery } from "@/hooks/usePendingDonationRecovery";
import { useNewMemberWelcome } from "@/hooks/useNewMemberWelcome";

// Lazy load ALL pages for code splitting (Phase 4 Ã¢â‚¬â€ A1)
const Feed = lazy(() => import("./pages/Feed"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Auth = lazy(() => import("./pages/Auth"));
const Friends = lazy(() => import("./pages/Friends"));
const Profile = lazy(() => import("./pages/Profile"));
const Post = lazy(() => import("./pages/Post"));
const About = lazy(() => import("./pages/About"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const AdminMigration = lazy(() => import("./pages/AdminMigration"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminReplayDebug = lazy(() => import("./pages/AdminReplayDebug"));
const FounderDashboard = lazy(() => import("./pages/FounderDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LawOfLight = lazy(() => import("./pages/LawOfLight"));
const Notifications = lazy(() => import("./pages/Notifications"));
const DocsRouter = lazy(() => import("./pages/DocsRouter"));
const ConnectedApps = lazy(() => import("./pages/ConnectedApps"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Chat = lazy(() => import("./pages/Chat"));
const Install = lazy(() => import("./pages/Install"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const Settings = lazy(() => import("./pages/Settings"));
const Benefactors = lazy(() => import("./pages/Benefactors"));
const Donations = lazy(() => import("./pages/Donations"));
const Users = lazy(() => import("./pages/Users"));
const Reels = lazy(() => import("./pages/Reels"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const IdentityDashboard = lazy(() => import("./pages/identity/IdentityDashboard"));
const IdentityOnboarding = lazy(() => import("./pages/identity/IdentityOnboarding"));
const ConnectorPage = lazy(() => import("./pages/connector/ConnectorPage"));
const ConnectorGivenPage = lazy(() => import("./pages/connector/ConnectorGivenPage"));

const LiveDiscoveryPage = lazy(() => import("./pages/LiveDiscoveryPage"));
const LiveHostPage = lazy(() => import("./modules/live/pages/LiveHostPage").then(m => ({ default: m.default })));
const LiveAudiencePage = lazy(() => import("./modules/live/pages/LiveAudiencePage").then(m => ({ default: m.default })));
const PreLivePage = lazy(() => import("./modules/live/pages/PreLivePage"));

const CHUNK_RELOAD_KEY = 'fun_profile_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 15000;

function getChunkErrorMessage(reason: unknown) {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === 'string') return reason;
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    const message = (reason as { message?: unknown }).message;
    return typeof message === 'string' ? message : String(message ?? '');
  }
  return '';
}

function isDynamicImportError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('failed to fetch dynamically imported module') ||
    normalized.includes('importing a module script failed') ||
    normalized.includes('failed to load module script') ||
    normalized.includes('error loading dynamically imported module')
  );
}

function showChunkReloadToast() {
  import('sonner').then(({ toast }) => {
    toast.error('CÃƒÂ³ lÃ¡Â»â€”i tÃ¡ÂºÂ£i tÃƒÂ i nguyÃƒÂªn', {
      description: 'BÃ¡ÂºÂ¥m Ã„â€˜Ã¡Â»Æ’ tÃ¡ÂºÂ£i lÃ¡ÂºÂ¡i trang khi bÃ¡ÂºÂ¡n sÃ¡ÂºÂµn sÃƒÂ ng.',
      duration: Infinity,
      action: {
        label: 'TÃ¡ÂºÂ£i lÃ¡ÂºÂ¡i',
        onClick: () => window.location.reload(),
      },
    });
  }).catch(() => {});
}

function ChunkLoadRecovery() {
  useEffect(() => {
    const recover = (reason: unknown) => {
      const message = getChunkErrorMessage(reason);
      if (!isDynamicImportError(message)) return;

      const lastRecoveryAt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? '0');
      if (lastRecoveryAt && Date.now() - lastRecoveryAt < CHUNK_RELOAD_COOLDOWN_MS) {
        return;
      }

      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
      showChunkReloadToast();
    };

    const handleError = (event: ErrorEvent) => recover(event.error ?? event.message);
    const handleRejection = (event: PromiseRejectionEvent) => recover(event.reason);

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}

function AuthSessionKeeper() {
  return null;
}

function PendingDonationRecovery() {
  usePendingDonationRecovery();
  return null;
}

function NewMemberWelcome() {
  useNewMemberWelcome();
  return null;
}

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-4 animate-fade-in">
      <div className="w-10 h-10 md:w-12 md:h-12 border-3 md:border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Ã„Âang tÃ¡ÂºÂ£i...</p>
    </div>
  </div>
);

/**
 * Phase 4 Ã¢â‚¬â€ A7: Defer audio loading.
 * ChÃ¡Â»â€° mount thÃ¡ÂºÂ» <audio> sau khi user tÃ†Â°Ã†Â¡ng tÃƒÂ¡c lÃ¡ÂºÂ§n Ã„â€˜Ã¡ÂºÂ§u (click/touch/keydown).
 * TrÃ†Â°Ã¡Â»â€ºc Ã„â€˜ÃƒÂ³: khÃƒÂ´ng tÃ¡ÂºÂ£i file MP3 Ã¢â€ â€™ tiÃ¡ÂºÂ¿t kiÃ¡Â»â€¡m bÃ„Æ’ng thÃƒÂ´ng + tÃ„Æ’ng tÃ¡Â»â€˜c FCP.
 */
function GlobalAudioBootstrap() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed) return;
    const arm = () => {
      setArmed(true);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('touchstart', arm);
    };
    window.addEventListener('pointerdown', arm, { once: true, passive: true });
    window.addEventListener('keydown', arm, { once: true });
    window.addEventListener('touchstart', arm, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('touchstart', arm);
    };
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    registerAudioElement(audioRef.current);
    ensureAutoplay();
  }, [armed]);

  if (!armed) return null;

  return (
    <audio
      ref={audioRef}
      src="/sounds/light-economy-anthem.mp3"
      autoPlay
      loop
      preload="metadata"
      playsInline
      className="hidden"
      aria-hidden="true"
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <GlobalAudioBootstrap />
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <ChunkLoadRecovery />
            <AuthSessionKeeper />
            <BrowserRouter>
              <ConditionalWeb3Provider>
                <ScrollToTop />
                <PendingDonationRecovery />
                <NewMemberWelcome />
                <CallProvider>
                  <Suspense fallback={<PageLoader />}>
                    <LawOfLightGuard>
                      <Routes>
                        <Route path="/begin" element={<Navigate to="/law-of-light" replace />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/set-password" element={<SetPassword />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/verify-email" element={<VerifyEmail />} />
                        <Route path="/auth/callback" element={<AuthCallback />} />
                        <Route path="/law-of-light" element={<LawOfLight />} />
                        <Route path="/" element={<Feed />} />
                        <Route path="/friends" element={<Friends />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/profile/:userId" element={<Profile />} />
                        <Route path="/profile/connected-apps" element={<ConnectedApps />} />
                        <Route path="/@:username" element={<Profile />} />
                        <Route path="/wallet/*" element={<Wallet />} />
                        <Route path="/post/:postId" element={<Post />} />
                        <Route path="/:username/post/:slug" element={<Post />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/leaderboard" element={<Leaderboard />} />
                        <Route path="/admin/migration" element={<AdminMigration />} />
                        <Route path="/admin/replay-debug" element={<AdminReplayDebug />} />
                        <Route path="/admin" element={<Admin />} />
                        <Route path="/founder" element={<FounderDashboard />} />
                        <Route path="/notifications" element={<Notifications />} />
                        <Route path="/chat" element={<Chat />} />
                        <Route path="/chat/:conversationId" element={<Chat />} />
                        <Route path="/identity" element={<IdentityDashboard />} />
                        <Route path="/identity/onboarding" element={<IdentityOnboarding />} />
                        <Route path="/connector" element={<ConnectorPage />} />
                        <Route path="/connector/given" element={<ConnectorGivenPage />} />
                        <Route path="/docs/*" element={<DocsRouter />} />
                        <Route path="/install" element={<Install />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/settings/:tab" element={<Settings />} />
                        <Route path="/benefactors" element={<Benefactors />} />
                        <Route path="/donations" element={<Donations />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="/reels" element={<Reels />} />
                        <Route path="/reels/:reelId" element={<Reels />} />
                        <Route path="/:username/video/:slug" element={<Reels />} />
                        <Route path="/mint" element={<Navigate to="/wallet/fun_money" replace />} />
                        <Route path="/live" element={<LiveDiscoveryPage />} />
                        <Route path="/live/setup" element={<PreLivePage />} />
                        <Route path="/live/new" element={<LiveHostPage />} />
                        <Route path="/live/stream" element={<Navigate to="/live/new" replace />} />
                        <Route path="/live/:liveSessionId" element={<LiveAudiencePage />} />
                        <Route path="/live/:liveSessionId/host" element={<LiveHostPage />} />
                        <Route path="/:username/live/:slug" element={<LiveAudiencePage />} />
                        <Route path="/:username" element={<Profile />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </LawOfLightGuard>
                    <DonationReceivedNotification />
                    <RewardAdjustmentNotification />
                    <EpochClaimCelebration />
                    <UpdateNotification />
                    <InstallBanner />
                  </Suspense>
                </CallProvider>
              </ConditionalWeb3Provider>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
````

## supabase/config.toml

``toml
project_id = "bhtsnervqiwchluwuxki"

[functions]
  [functions.admin-batch-mint-requests]
    verify_jwt = false
  [functions.admin-list-merge-requests]
    verify_jwt = false
  [functions.admin-merge-mint-requests]
    verify_jwt = false
  [functions.admin-update-media-url]
    verify_jwt = true
  [functions.angel-chat]
    verify_jwt = false
  [functions.angel-inline]
    verify_jwt = false
  [functions.auth-email-hook]
    verify_jwt = false
  [functions.auto-backfill-donations]
    verify_jwt = false
  [functions.auto-scan-donations]
    verify_jwt = false
  [functions.backfill-donations]
    verify_jwt = false
  [functions.backfill-swap-transactions]
    verify_jwt = false
  [functions.backfill-wallet-transfers]
    verify_jwt = false
  [functions.backfill-tx-donations]
    verify_jwt = false
  [functions.batch-delete-banned-users]
    verify_jwt = false
  [functions.claim-reward]
    verify_jwt = false
  [functions.cleanup-orphan-videos]
    verify_jwt = false
  [functions.cleanup-supabase-storage]
    verify_jwt = true
  [functions.cloudflare-migrate]
    verify_jwt = true
  [functions.connect-external-wallet]
    verify_jwt = true
  [functions.create-custodial-wallet]
    verify_jwt = true
  [functions.create-post]
    verify_jwt = false
  [functions.delete-from-r2]
    verify_jwt = true
  [functions.delete-user-account]
    verify_jwt = true
  [functions.detect-incoming-transfers]
    verify_jwt = false
  [functions.disconnect-external-wallet]
    verify_jwt = false
  [functions.fix-cloudflare-urls]
    verify_jwt = true
  [functions.generate-presigned-url]
    verify_jwt = true
  [functions.generate-upload-url]
    verify_jwt = true
  [functions.get-upload-url]
    verify_jwt = true
  [functions.image-transform]
    verify_jwt = false
  [functions.live-recording-status]
    verify_jwt = false
  [functions.live-token]
    verify_jwt = false
  [functions.media-guard]
    verify_jwt = false
  [functions.migrate-stream-to-r2]
    verify_jwt = false
  [functions.migrate-to-r2]
    verify_jwt = true
  [functions.mint-soul-nft]
    verify_jwt = true
  [functions.notify-live-started]
    verify_jwt = false
  [functions.optimize-storage]
    verify_jwt = true
  [functions.pplp-authorize-mint]
    verify_jwt = false
  [functions.pplp-batch-processor]
    verify_jwt = false
  [functions.pplp-detect-fraud]
    verify_jwt = false
  [functions.pplp-evaluate]
    verify_jwt = false
  [functions.pplp-get-score]
    verify_jwt = false
  [functions.pplp-mint-fun]
    verify_jwt = false
  [functions.pplp-score-action]
    verify_jwt = false
  [functions.pplp-submit-action]
    verify_jwt = false
  [functions.recalculate-fun-amounts]
    verify_jwt = false
  [functions.scan-treasury-camly]
    verify_jwt = false
  [functions.scan-treasury-outgoing]
    verify_jwt = false
  [functions.scheduled-reconciliation]
    verify_jwt = false
  [functions.sso-authorize]
    verify_jwt = false
  [functions.sso-merge-approve]
    verify_jwt = true
  [functions.sso-merge-request]
    verify_jwt = false
  [functions.sso-otp-request]
    verify_jwt = false
  [functions.sso-otp-verify]
    verify_jwt = false
  [functions.sso-refresh]
    verify_jwt = false
  [functions.sso-register]
    verify_jwt = false
  [functions.sso-resend-webhook]
    verify_jwt = false
  [functions.sso-revoke]
    verify_jwt = false
  [functions.sso-set-password]
    verify_jwt = false
  [functions.sso-sync-data]
    verify_jwt = false
  [functions.sso-sync-financial]
    verify_jwt = false
  [functions.sso-token]
    verify_jwt = false
  [functions.sso-verify]
    verify_jwt = false
  [functions.sso-web3-auth]
    verify_jwt = false
  [functions.stream-video]
    verify_jwt = false
  [functions.live-replay-create-upload]
    verify_jwt = true
  [functions.live-replay-mark-uploaded]
    verify_jwt = true
  [functions.live-replay-ingest-from-r2]
    verify_jwt = true
  [functions.live-replay-stream-ingest]
    verify_jwt = false
  [functions.live-replay-poll-status]
    verify_jwt = false
  [functions.auto-finalize-recordings]
    verify_jwt = false
  [functions.admin-replay-debug]
    verify_jwt = true
  [functions.stream-webhook]
    verify_jwt = false
  [functions.stream-webhook-register]
    verify_jwt = true
  [functions.upload-to-cf-images]
    verify_jwt = true
  [functions.upload-to-r2]
    verify_jwt = true
  [functions.send-email-link-verification]
    verify_jwt = false
  [functions.sync-treasury-profile]
    verify_jwt = false
  [functions.verify-email-link]
    verify_jwt = false
  [functions.moralis-webhook]
    verify_jwt = false
  [functions.setup-moralis-stream]
    verify_jwt = false
  [functions.fast-scan-donations]
    verify_jwt = false
  [functions.backfill-outgoing-donations]
    verify_jwt = false
  [functions.pplp-ingest-actions]
    verify_jwt = false
  [functions.identity-did-resolve]
    verify_jwt = false
[functions.token-limits-status]
verify_jwt = false
````

## supabase/functions/live-token/index.ts

``ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { RtcTokenBuilder, RtcRole } from 'npm:agora-token'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function uuidToNumericUid(uuid: string): number {
  let hash = 0
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & 0x7FFFFFFF
  }
  return hash || 1
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token)
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error('Auth error:', claimsErr?.message || 'No claims')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const userId = claimsData.claims.sub as string

    // Check banned status
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: banCheck } = await supabaseAdmin
      .from('profiles').select('is_banned').eq('id', userId).single()
    if (banCheck?.is_banned) {
      return new Response(JSON.stringify({ error: 'TÃ i khoáº£n Ä‘Ã£ bá»‹ cáº¥m vÄ©nh viá»…n.' }), { status: 403, headers: corsHeaders })
    }

    const body = await req.json().catch(() => ({}))
    const sessionId = body.session_id || body.sessionId
    const role = body.role || 'audience'

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'session_id required' }), { status: 400, headers: corsHeaders })
    }

    // Lookup live session (reuse supabaseAdmin from ban check)

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('live_sessions')
      .select('id, channel_name, agora_channel, status, host_user_id, privacy')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: corsHeaders })
    }

    if (session.status !== 'live' && session.status !== 'starting') {
      return new Response(JSON.stringify({ error: 'Session is not live' }), { status: 400, headers: corsHeaders })
    }

    if (role === 'host' && session.host_user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Only host can get host token' }), { status: 403, headers: corsHeaders })
    }

    // Enforce friends-only privacy
    if (session.privacy === 'friends' && role !== 'host') {
      const { data: friendship } = await supabaseAdmin
        .from('friendships')
        .select('id')
        .or(`and(user_id.eq.${userId},friend_id.eq.${session.host_user_id},status.eq.accepted),and(user_id.eq.${session.host_user_id},friend_id.eq.${userId},status.eq.accepted)`)
        .limit(1)

      if (!friendship || friendship.length === 0) {
        return new Response(JSON.stringify({ error: 'PhiÃªn live nÃ y chá»‰ dÃ nh cho báº¡n bÃ¨' }), { status: 403, headers: corsHeaders })
      }
    }

    const channel = session.agora_channel || session.channel_name

    // Generate Agora token directly
    const appId = Deno.env.get('AGORA_APP_ID')
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')

    if (!appId || !appCertificate) {
      return new Response(JSON.stringify({ error: 'Agora not configured' }), { status: 500, headers: corsHeaders })
    }

    const numericUid = uuidToNumericUid(userId)
    const agoraRole = role === 'host' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER
    const expirationInSeconds = 86400

    const agoraToken = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      numericUid,
      agoraRole,
      expirationInSeconds,
      expirationInSeconds
    )

    const currentTimestamp = Math.floor(Date.now() / 1000)
    return new Response(JSON.stringify({
      token: agoraToken,
      channel,
      uid: String(numericUid),
      appId,
      expiresAt: currentTimestamp + expirationInSeconds,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('live-token error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
````

## supabase/functions/r2-signed-chunk-url/index.ts

``ts
/**
 * r2-signed-chunk-url Edge Function
 * Generates presigned PUT URLs for individual recording chunks
 * Uses AWS Signature V4 for Cloudflare R2
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return await hmacSha256(kService, 'aws4_request');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, maxPerMinute = 60): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  entry.count++;
  return entry.count <= maxPerMinute;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = user.id;

    // Check banned status
    const supabaseAdminBan = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: banCheck } = await supabaseAdminBan
      .from('profiles').select('is_banned').eq('id', userId).single();
    if (banCheck?.is_banned) {
      return new Response(JSON.stringify({ error: 'TÃ i khoáº£n Ä‘Ã£ bá»‹ cáº¥m vÄ©nh viá»…n.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Rate limit
    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { recording_id, seq, contentType, fileSize } = await req.json();

    if (!recording_id || typeof seq !== 'number' || !contentType) {
      return new Response(JSON.stringify({ error: 'Missing recording_id, seq, or contentType' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate ownership via service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: recording, error: recError } = await supabaseAdmin
      .from('chunked_recordings')
      .select('id, user_id, status')
      .eq('id', recording_id)
      .maybeSingle();

    if (recError || !recording) {
      return new Response(JSON.stringify({ error: 'Recording not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (recording.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate presigned URL
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!;
    const accessKeyId = Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID')!;
    const secretAccessKey = Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY')!;
    const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')!;
    const publicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL')!;

    const seqPadded = seq.toString().padStart(4, '0');
    const ext = contentType.includes('webm') ? 'webm' : 'mp4';
    const objectKey = `recordings/${recording_id}/chunks/${seqPadded}.${ext}`;

    const region = 'auto';
    const service = 's3';
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const expiresIn = 60;

    const canonicalUri = `/${bucketName}/${objectKey}`;
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const credential = `${accessKeyId}/${credentialScope}`;

    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': algorithm,
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': expiresIn.toString(),
      'X-Amz-SignedHeaders': 'host',
    });
    queryParams.sort();

    const canonicalRequest = [
      'PUT', canonicalUri, queryParams.toString(),
      `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD',
    ].join('\n');

    const canonicalRequestHash = toHex(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))
    );

    const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');
    const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = toHex(await hmacSha256(signingKey, stringToSign));

    queryParams.append('X-Amz-Signature', signature);
    const uploadUrl = `https://${host}${canonicalUri}?${queryParams.toString()}`;

    return new Response(JSON.stringify({
      uploadUrl,
      objectKey,
      publicUrl: `${publicUrl}/${objectKey}`,
      expiresIn,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('r2-signed-chunk-url error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
````

## supabase/functions/recording-finalize/index.ts

``ts
/**
 * recording-finalize Edge Function
 * Creates a manifest.json listing all chunks for playback.
 * Fast (~2s) â€” no concat, no timeout risk.
 * Concat to single file is handled async by auto-finalize-recordings cron.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// â”€â”€â”€ R2 signing utilities (kept for manifest upload) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getR2Config() {
  return {
    accountId: Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!,
    accessKeyId: Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY')!,
    bucketName: Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')!,
    publicUrl: Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL')!,
    region: 'auto',
    service: 's3',
    get host() { return `${this.accountId}.r2.cloudflarestorage.com`; },
  };
}

async function signedRequest(
  method: string,
  canonicalUri: string,
  headers: Record<string, string>,
  body: Uint8Array | string | null,
  queryString = '',
): Promise<Response> {
  const r2 = getR2Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const bodyBytes = body instanceof Uint8Array ? body : (body ? new TextEncoder().encode(body) : new Uint8Array(0));
  const bodyHash = toHex(await crypto.subtle.digest('SHA-256', bodyBytes));

  const allHeaders: Record<string, string> = {
    ...headers,
    'host': r2.host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': amzDate,
  };

  const sortedHeaderKeys = Object.keys(allHeaders).sort();
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${allHeaders[k]}`).join('\n') + '\n';

  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, bodyHash].join('\n');
  const canonicalRequestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));

  const credentialScope = `${dateStamp}/${r2.region}/${r2.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');
  const signingKey = await getSignatureKey(r2.secretAccessKey, dateStamp, r2.region, r2.service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const fetchHeaders: Record<string, string> = { ...allHeaders, Authorization: authorization };
  const url = `https://${r2.host}${canonicalUri}${queryString ? '?' + queryString : ''}`;

  return fetch(url, {
    method,
    headers: fetchHeaders,
    body: body ? bodyBytes : undefined,
  });
}

// â”€â”€â”€ Upload manifest.json to R2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function uploadManifestToR2(objectKey: string, manifestJson: string): Promise<void> {
  const r2 = getR2Config();
  const uri = `/${r2.bucketName}/${objectKey}`;
  const resp = await signedRequest('PUT', uri, { 'content-type': 'application/json' }, manifestJson);
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Upload manifest failed: ${resp.status} ${errText}`);
  }
  await resp.text(); // consume body
}

// â”€â”€â”€ Main handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const userId = user.id;

    // Check banned status
    const supabaseAdminBan = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: banCheck } = await supabaseAdminBan
      .from('profiles').select('is_banned').eq('id', userId).single();
    if (banCheck?.is_banned) {
      return new Response(JSON.stringify({ error: 'TÃ i khoáº£n Ä‘Ã£ bá»‹ cáº¥m vÄ©nh viá»…n.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { recording_id, live_session_id } = await req.json();
    if (!recording_id) {
      return new Response(JSON.stringify({ error: 'Missing recording_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify ownership
    const { data: recording, error: recErr } = await supabaseAdmin
      .from('chunked_recordings')
      .select('*')
      .eq('id', recording_id)
      .maybeSingle();

    if (recErr || !recording) {
      return new Response(JSON.stringify({ error: 'Recording not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (recording.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get all uploaded chunks
    const { data: chunks, error: chunkErr } = await supabaseAdmin
      .from('chunked_recording_chunks')
      .select('*')
      .eq('recording_id', recording_id)
      .eq('status', 'uploaded')
      .order('seq', { ascending: true });

    if (chunkErr || !chunks || chunks.length === 0) {
      await supabaseAdmin.from('chunked_recordings')
        .update({ status: 'failed', error_message: 'No uploaded chunks found' })
        .eq('id', recording_id);
      return new Response(JSON.stringify({ error: 'No chunks found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const r2 = getR2Config();
    const mimeType = recording.mime_type || 'video/webm';
    const totalDurationMs = chunks.reduce((sum: number, c: any) => sum + (c.duration_ms || 2000), 0);
    const totalBytes = chunks.reduce((sum: number, c: any) => sum + (c.bytes || 0), 0);

    // â”€â”€ Build manifest.json â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const manifest = {
      version: 2,
      recording_id,
      live_session_id: live_session_id || recording.live_session_id,
      mime_type: mimeType,
      codec: recording.codec || null,
      total_chunks: chunks.length,
      total_duration_ms: totalDurationMs,
      total_bytes: totalBytes,
      created_at: new Date().toISOString(),
      chunks: chunks.map((c: any) => ({
        seq: c.seq,
        url: `${r2.publicUrl}/${c.object_key}`,
        object_key: c.object_key,
        bytes: c.bytes || 0,
        duration_ms: c.duration_ms || 2000,
      })),
    };

    const manifestKey = `recordings/${recording_id}/manifest.json`;
    const manifestJson = JSON.stringify(manifest);
    await uploadManifestToR2(manifestKey, manifestJson);

    const manifestUrl = `${r2.publicUrl}/${manifestKey}`;

    // â”€â”€ Update recording as done â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    await supabaseAdmin.from('chunked_recordings').update({
      status: 'done',
      total_chunks: chunks.length,
      output_object_key: manifestKey,
      output_url: manifestUrl,
      ended_at: new Date().toISOString(),
    }).eq('id', recording_id);

    // â”€â”€ Update live session + post â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sessionId = live_session_id || recording.live_session_id;
    if (sessionId) {
      await supabaseAdmin.from('live_sessions')
        .update({ recording_status: 'processing' })
        .eq('id', sessionId);

      const { data: liveSession } = await supabaseAdmin
        .from('live_sessions')
        .select('post_id, title, ended_at')
        .eq('id', sessionId)
        .maybeSingle();

      if (liveSession?.post_id) {
        await supabaseAdmin.from('posts').update({
          metadata: {
            live_title: liveSession.title,
            live_status: 'ended',
            live_session_id: sessionId,
            playback_url: null,
            playback_type: 'cloudflare_stream_pending',
            fallback_playback_url: manifestUrl,
            allow_chunked_fallback: false,
            chunked_recording_id: recording_id,
            ended_at: liveSession.ended_at || new Date().toISOString(),
          },
        }).eq('id', liveSession.post_id);
      }
    }

    // â”€â”€ Enqueue cho TUS ingest lÃªn Cloudflare Stream â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      await supabaseAdmin.from('live_replays').upsert({
        user_id: recording.user_id,
        live_session_id: sessionId,
        chunked_recording_id: recording_id,
        source_webm_key: manifestKey,
        status: 'queued',
        total_chunks_for_ingest: chunks.length,
        tus_offset: 0,
        next_chunk_seq: 0,
        ingest_attempts: 0,
      }, { onConflict: 'chunked_recording_id', ignoreDuplicates: true });
    } catch (enqErr: any) {
      console.warn('[recording-finalize] enqueue replay failed:', enqErr?.message);
    }

    console.log(`[recording-finalize] âœ“ manifest created for ${recording_id} (${chunks.length} chunks)`);

    return new Response(JSON.stringify({
      success: true,
      manifest_url: manifestUrl,
      total_chunks: chunks.length,
      total_bytes: totalBytes,
      total_duration_ms: totalDurationMs,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('recording-finalize error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
````

## supabase/functions/auto-finalize-recordings/index.ts

``ts
/**
 * auto-finalize-recordings Edge Function
 * Runs via pg_cron every 5 minutes.
 * 1. Auto-close sessions stuck as 'live' for > 4 hours (with no heartbeat in last 2 min)
 * 2. Reset recordings stuck in 'assembling' > 10 min
 * 3. Finalize stuck recordings by creating manifest.json (fast, no timeout)
 * 4. Optionally concat small recordings (< 50 chunks) into single file
 * 5. Cleanup old live_messages
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ R2 / S3 signing utilities Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getR2Config() {
  return {
    accountId: Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!,
    accessKeyId: Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY')!,
    bucketName: Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')!,
    publicUrl: Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL')!,
    region: 'auto',
    service: 's3',
    get host() { return `${this.accountId}.r2.cloudflarestorage.com`; },
  };
}

async function signedRequest(
  method: string,
  canonicalUri: string,
  headers: Record<string, string>,
  body: Uint8Array | string | null,
  queryString = '',
): Promise<Response> {
  const r2 = getR2Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const bodyBytes = body instanceof Uint8Array ? body : (body ? new TextEncoder().encode(body) : new Uint8Array(0));
  const bodyHash = toHex(await crypto.subtle.digest('SHA-256', bodyBytes));

  const allHeaders: Record<string, string> = {
    ...headers,
    'host': r2.host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': amzDate,
  };

  const sortedHeaderKeys = Object.keys(allHeaders).sort();
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${allHeaders[k]}`).join('\n') + '\n';

  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, bodyHash].join('\n');
  const canonicalRequestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));

  const credentialScope = `${dateStamp}/${r2.region}/${r2.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');
  const signingKey = await getSignatureKey(r2.secretAccessKey, dateStamp, r2.region, r2.service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const fetchHeaders: Record<string, string> = { ...allHeaders, Authorization: authorization };
  const url = `https://${r2.host}${canonicalUri}${queryString ? '?' + queryString : ''}`;

  return fetch(url, {
    method,
    headers: fetchHeaders,
    body: body ? bodyBytes : undefined,
  });
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ (Removed) R2 Multipart concat utilities Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Pipeline mÃ¡Â»â€ºi: live-replay-stream-ingest stream-pipe chunks R2 Ã¢â€ â€™ Cloudflare
// Stream qua TUS, KHÃƒâ€NG cÃ¡ÂºÂ§n file replay.webm trung gian.

async function fetchChunkData(url: string, retries = 3): Promise<Uint8Array> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
      return new Uint8Array(await resp.arrayBuffer());
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Upload manifest.json to R2 Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function uploadManifestToR2(objectKey: string, manifestJson: string): Promise<void> {
  const r2 = getR2Config();
  const uri = `/${r2.bucketName}/${objectKey}`;
  const resp = await signedRequest('PUT', uri, { 'content-type': 'application/json' }, manifestJson);
  if (!resp.ok) throw new Error(`Upload manifest failed: ${resp.status}`);
  await resp.text();
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Create manifest for a recording Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function createManifestForRecording(
  supabaseAdmin: ReturnType<typeof createClient>,
  rec: any,
  chunks: any[],
  session: any,
): Promise<{ manifest_url: string }> {
  const r2 = getR2Config();
  const mimeType = rec.mime_type || 'video/webm';
  const totalDurationMs = chunks.reduce((sum: number, c: any) => sum + (c.duration_ms || 2000), 0);
  const totalBytes = chunks.reduce((sum: number, c: any) => sum + (c.bytes || 0), 0);

  const manifest = {
    version: 2,
    recording_id: rec.id,
    live_session_id: rec.live_session_id,
    mime_type: mimeType,
    codec: rec.codec || null,
    total_chunks: chunks.length,
    total_duration_ms: totalDurationMs,
    total_bytes: totalBytes,
    created_at: new Date().toISOString(),
    auto_finalized: true,
    chunks: chunks.map((c: any) => ({
      seq: c.seq,
      url: `${r2.publicUrl}/${c.object_key}`,
      object_key: c.object_key,
      bytes: c.bytes || 0,
      duration_ms: c.duration_ms || 2000,
    })),
  };

  const manifestKey = `recordings/${rec.id}/manifest.json`;
  await uploadManifestToR2(manifestKey, JSON.stringify(manifest));
  const manifestUrl = `${r2.publicUrl}/${manifestKey}`;

  // Update recording
  await supabaseAdmin.from('chunked_recordings').update({
    status: 'done',
    total_chunks: chunks.length,
    output_object_key: manifestKey,
    output_url: manifestUrl,
    ended_at: new Date().toISOString(),
  }).eq('id', rec.id);

  // Update live session
  await supabaseAdmin.from('live_sessions')
    .update({ recording_status: 'processing' })
    .eq('id', rec.live_session_id);

  // Update post
  if (session?.post_id) {
    await supabaseAdmin.from('posts').update({
      metadata: {
        live_title: session.title,
        live_status: 'ended',
        live_session_id: rec.live_session_id,
        playback_url: null,
        playback_type: 'cloudflare_stream_pending',
        fallback_playback_url: manifestUrl,
        allow_chunked_fallback: false,
        chunked_recording_id: rec.id,
        ended_at: session.ended_at || new Date().toISOString(),
        auto_finalized: true,
      },
    }).eq('id', session.post_id);
  }

  console.log(`[auto-finalize] Ã¢Å“â€œ manifest for ${rec.id} (${chunks.length} chunks)`);
  return { manifest_url: manifestUrl };
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Enqueue live_replays for TUS ingest Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Sau khi manifest sÃ¡ÂºÂµn sÃƒÂ ng, tÃ¡ÂºÂ¡o row live_replays trÃ¡ÂºÂ¡ng thÃƒÂ¡i 'queued' Ã„â€˜Ã¡Â»Æ’
// cron live-replay-stream-ingest pipe chunks lÃƒÂªn Cloudflare Stream qua TUS.

async function enqueueReplay(
  supabaseAdmin: ReturnType<typeof createClient>,
  rec: any,
  chunks: any[],
  manifestKey: string,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('live_replays')
      .upsert({
        user_id: rec.user_id,
        live_session_id: rec.live_session_id,
        chunked_recording_id: rec.id,
        source_webm_key: manifestKey,
        status: 'queued',
        total_chunks_for_ingest: chunks.length,
        tus_offset: 0,
        next_chunk_seq: 0,
        ingest_attempts: 0,
      }, { onConflict: 'chunked_recording_id', ignoreDuplicates: true });
    if (error && !String(error.message).includes('duplicate')) {
      console.warn(`[auto-finalize] enqueueReplay ${rec.id}:`, error.message);
    } else {
      console.log(`[auto-finalize] queued replay ingest for rec=${rec.id} chunks=${chunks.length}`);
    }
  } catch (e: any) {
    console.warn(`[auto-finalize] enqueueReplay throw ${rec.id}:`, e?.message);
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Main handler Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: accept service_role key, cron secret, or anon key
  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const isCronAuth = cronSecret && req.headers.get('X-Cron-Secret') === cronSecret;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const isAnonCron = authHeader === `Bearer ${anonKey}`;

  if (!isServiceRole && !isCronAuth && !isAnonCron) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results: Array<{ recording_id?: string; session_id?: string; action: string; error?: string }> = [];
    const nowIso = new Date().toISOString();

    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    // STEP 1: Auto-close sessions stuck as 'live' for > 4 hours
    //         Only close if no heartbeat (updated_at) in last 2 minutes
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: stuckLiveSessions } = await supabaseAdmin
      .from('live_sessions')
      .select('id, post_id')
      .eq('status', 'live')
      .lt('started_at', fourHoursAgo)
      .lt('updated_at', twoMinAgo)
      .limit(20);

    if (stuckLiveSessions && stuckLiveSessions.length > 0) {
      for (const session of stuckLiveSessions) {
        await supabaseAdmin.from('live_sessions')
          .update({ status: 'ended', ended_at: nowIso, updated_at: nowIso })
          .eq('id', session.id);

        if (session.post_id) {
          await supabaseAdmin.from('posts')
            .update({
              metadata: {
                live_status: 'ended',
                ended_at: nowIso,
                auto_closed: true,
              },
            })
            .eq('id', session.post_id);
        }

        results.push({ session_id: session.id, action: 'auto_closed_stuck_live' });
        console.log(`[auto-finalize] Auto-closed stuck live session ${session.id}`);
      }
    }

    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    // STEP 2: Reset recordings stuck in 'assembling' for > 10 minutes
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckAssembling } = await supabaseAdmin
      .from('chunked_recordings')
      .select('id')
      .eq('status', 'assembling')
      .lt('created_at', tenMinAgo)
      .limit(10);

    if (stuckAssembling && stuckAssembling.length > 0) {
      for (const rec of stuckAssembling) {
        await supabaseAdmin.from('chunked_recordings')
          .update({ status: 'recording', error_message: 'Reset from stuck assembling state' })
          .eq('id', rec.id);
        results.push({ recording_id: rec.id, action: 'reset_stuck_assembling' });
        console.log(`[auto-finalize] Reset stuck assembling recording ${rec.id}`);
      }
    }

    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    // STEP 3: Finalize stuck recordings (manifest first, then try concat)
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    const { data: stuckRecordings, error: queryErr } = await supabaseAdmin
      .from('chunked_recordings')
      .select(`
        id, user_id, live_session_id, mime_type, codec, width, height,
        live_sessions!chunked_recordings_live_session_id_fkey(id, status, ended_at, post_id, title)
      `)
      .eq('status', 'recording')
      .not('live_session_id', 'is', null)
      .limit(10);

    if (queryErr) {
      console.error('auto-finalize query error:', queryErr);
    }

    for (const rec of stuckRecordings || []) {
      const session = (rec as any).live_sessions;
      if (!session || session.status !== 'ended') continue;
      // Wait at least 2 minutes after session ended
      if (Date.now() - new Date(session.ended_at).getTime() < 2 * 60 * 1000) continue;

      try {
        const { data: chunks, error: chunkErr } = await supabaseAdmin
          .from('chunked_recording_chunks')
          .select('*')
          .eq('recording_id', rec.id)
          .eq('status', 'uploaded')
          .order('seq', { ascending: true });

        if (chunkErr || !chunks || chunks.length === 0) {
          await supabaseAdmin.from('chunked_recordings')
            .update({ status: 'failed', error_message: 'Auto-finalize: no uploaded chunks', ended_at: nowIso })
            .eq('id', rec.id);
          results.push({ recording_id: rec.id, action: 'marked_failed', error: 'No chunks' });
          continue;
        }

        // Step 3a: Create manifest (fast, always succeeds)
        const { manifest_url } = await createManifestForRecording(supabaseAdmin, rec, chunks, session);
        results.push({ recording_id: rec.id, action: 'manifest_created' });

        // Step 3b: Enqueue cho TUS ingest lÃƒÂªn Cloudflare Stream
        const manifestKey = manifest_url.split('/').slice(-3).join('/');
        await enqueueReplay(supabaseAdmin, rec, chunks, manifestKey);
        results.push({ recording_id: rec.id, action: 'replay_enqueued' });
      } catch (err: any) {
        console.error(`[auto-finalize] Error processing ${rec.id}:`, err);
        await supabaseAdmin.from('chunked_recordings')
          .update({ status: 'failed', error_message: `Auto-finalize error: ${err.message}` })
          .eq('id', rec.id);
        results.push({ recording_id: rec.id, action: 'error', error: err.message });
      }
    }

    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    // STEP 3.5: Backfill enqueue cho recordings Ã„â€˜ÃƒÂ£ 'done' (manifest only)
    //           nhÃ†Â°ng chÃ†Â°a cÃƒÂ³ row live_replays.
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    const sevenDaysAgoStep35 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: doneManifestOnly } = await supabaseAdmin
      .from('chunked_recordings')
      .select(`
        id, user_id, live_session_id, mime_type, codec, output_object_key,
        live_sessions!chunked_recordings_live_session_id_fkey(id, status, ended_at, post_id, title)
      `)
      .eq('status', 'done')
      .like('output_object_key', '%manifest.json')
      .gte('ended_at', sevenDaysAgoStep35)
      .limit(20);

    for (const rec of doneManifestOnly || []) {
      const session = (rec as any).live_sessions;
      if (!session || session.status !== 'ended') continue;
      const { data: existing } = await supabaseAdmin
        .from('live_replays')
        .select('id')
        .eq('chunked_recording_id', rec.id)
        .maybeSingle();
      if (existing) continue;

      const { data: chunks } = await supabaseAdmin
        .from('chunked_recording_chunks')
        .select('seq, object_key, bytes')
        .eq('recording_id', rec.id)
        .eq('status', 'uploaded')
        .order('seq', { ascending: true });
      if (!chunks || chunks.length === 0) continue;

      await enqueueReplay(supabaseAdmin, rec, chunks, (rec as any).output_object_key);
      results.push({ recording_id: rec.id, action: 'late_enqueued' });
    }

    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    // STEP 4: Keep-alive ping to live-token
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      await fetch(`${supabaseUrl}/functions/v1/live-token`, {
        method: 'OPTIONS',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch { /* non-critical */ }

    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    // STEP 5: Cleanup old live_messages (> 7 days)
    // Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
    let messagesDeleted = 0;
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: oldSessions } = await supabaseAdmin
        .from('live_sessions')
        .select('id')
        .eq('status', 'ended')
        .lt('ended_at', sevenDaysAgo)
        .limit(50);

      if (oldSessions && oldSessions.length > 0) {
        const sessionIds = oldSessions.map((s: any) => s.id);
        const { count } = await supabaseAdmin
          .from('live_messages')
          .delete({ count: 'exact' })
          .in('session_id', sessionIds);
        messagesDeleted = count || 0;
        if (messagesDeleted > 0) {
          console.log(`[auto-finalize] Cleaned ${messagesDeleted} old live_messages`);
        }
      }
    } catch (cleanErr: any) {
      console.warn('[auto-finalize] Message cleanup error:', cleanErr.message);
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
      stuck_sessions_closed: stuckLiveSessions?.length || 0,
      stuck_assembling_reset: stuckAssembling?.length || 0,
      messages_cleaned: messagesDeleted,
      timestamp: nowIso,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('auto-finalize-recordings error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
````

## supabase/functions/live-replay-ingest-from-r2/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

async function invokeReplayWorkers(): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (cronSecret) headers['X-Cron-Secret'] = cronSecret;

  await Promise.allSettled([
    fetch(`${supabaseUrl}/functions/v1/auto-finalize-recordings`, {
      method: 'POST',
      headers,
      body: '{}',
    }),
    fetch(`${supabaseUrl}/functions/v1/live-replay-stream-ingest`, {
      method: 'POST',
      headers,
      body: '{}',
    }),
  ]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    const r2PublicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
    if (!accountId || !token || !r2PublicUrl) {
      return json({ error: 'Missing Cloudflare configuration' }, 500);
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { live_session_id, chunked_recording_id } = await req.json();
    if (!live_session_id || !chunked_recording_id) {
      return json({ error: 'Missing live_session_id or chunked_recording_id' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.is_banned) return json({ error: 'Account is banned' }, 403);

    const { data: liveSession, error: sessErr } = await supabaseAdmin
      .from('live_sessions')
      .select('id, host_user_id, owner_id, post_id, title')
      .eq('id', live_session_id)
      .maybeSingle();
    if (sessErr || !liveSession) return json({ error: 'Live session not found' }, 404);
    if (liveSession.host_user_id !== user.id && liveSession.owner_id !== user.id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: recording, error: recErr } = await supabaseAdmin
      .from('chunked_recordings')
      .select('id, user_id, live_session_id, output_object_key, output_url, total_chunks')
      .eq('id', chunked_recording_id)
      .maybeSingle();
    if (recErr || !recording) return json({ error: 'Recording not found' }, 404);
    if (recording.user_id !== user.id || recording.live_session_id !== live_session_id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: existingReplay } = await (supabaseAdmin as any)
      .from('live_replays')
      .select('id, status, stream_uid')
      .eq('chunked_recording_id', chunked_recording_id)
      .in('status', ['queued', 'uploading', 'processing', 'ready'])
      .maybeSingle();
    if (existingReplay) {
      if (existingReplay.status === 'queued' || existingReplay.status === 'uploading') {
        invokeReplayWorkers().catch((err) => console.warn('[live-replay-ingest-from-r2] worker trigger failed:', err));
      }
      return json({
        replay_id: existingReplay.id,
        stream_uid: existingReplay.stream_uid,
        status: existingReplay.status,
        reused: true,
      });
    }

    let sourceUrl = recording.output_url || '';
    const outputKey = recording.output_object_key || '';
    const isManifest = outputKey.endsWith('manifest.json');
    if (!sourceUrl || isManifest) {
      sourceUrl = `${r2PublicUrl}/recordings/${chunked_recording_id}/replay.webm`;
    }

    let sourceReady = false;
    try {
      const headResp = await fetch(sourceUrl, { method: 'HEAD' });
      sourceReady = headResp.ok && parseInt(headResp.headers.get('content-length') || '0', 10) > 0;
    } catch {
      sourceReady = false;
    }

    if (!sourceReady) {
      const { data: replay, error: upsertErr } = await (supabaseAdmin as any)
        .from('live_replays')
        .upsert({
          user_id: user.id,
          live_session_id,
          chunked_recording_id,
          source_webm_key: outputKey || `recordings/${chunked_recording_id}/manifest.json`,
          status: 'queued',
          error_message: null,
          last_error_at: null,
        }, { onConflict: 'chunked_recording_id' })
        .select('id, stream_uid, status')
        .single();
      if (upsertErr || !replay) {
        return json({ error: upsertErr?.message || 'Failed to enqueue replay ingest' }, 500);
      }

      await supabaseAdmin
        .from('live_sessions')
        .update({ recording_status: 'processing', recording_error: null })
        .eq('id', live_session_id);

      invokeReplayWorkers().catch((err) => console.warn('[live-replay-ingest-from-r2] worker trigger failed:', err));

      return json({
        replay_id: replay.id,
        stream_uid: replay.stream_uid,
        status: 'queued',
        message: 'Replay queued for Cloudflare Stream TUS ingest.',
        source_url: sourceUrl,
      }, 202);
    }

    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upload-Creator': user.id.slice(0, 64),
      },
      body: JSON.stringify({
        url: sourceUrl,
        meta: {
          source: 'fun-profile-live-replay-ingest',
          userId: user.id,
          liveSessionId: live_session_id,
          chunkedRecordingId: chunked_recording_id,
          name: liveSession.title || 'FUN Profile live replay',
        },
        requireSignedURLs: false,
        allowedOrigins: ['*'],
      }),
    });

    const cfBody = await cfResp.text().catch(() => '');
    if (!cfResp.ok) {
      console.error('[CF_STREAM] [/copy] failed', { status: cfResp.status, body: cfBody.slice(0, 500) });
      return json({
        error: `Cloudflare Stream copy failed: ${cfResp.status}`,
        detail: cfBody.slice(0, 500),
      }, 502);
    }

    const cfData = JSON.parse(cfBody || '{}');
    const streamUid = cfData?.result?.uid;
    if (!streamUid) return json({ error: 'Invalid Cloudflare /copy response' }, 502);

    const { data: replay, error: upsertErr } = await (supabaseAdmin as any)
      .from('live_replays')
      .upsert({
        user_id: user.id,
        live_session_id,
        chunked_recording_id,
        source_webm_key: outputKey || null,
        stream_uid: streamUid,
        status: 'processing',
        last_cf_status: 'copy_created',
        last_cf_response: cfData,
        error_message: null,
        last_error_at: null,
      }, { onConflict: 'chunked_recording_id' })
      .select('id')
      .single();
    if (upsertErr || !replay) {
      return json({ error: upsertErr?.message || 'Failed to create replay row' }, 500);
    }

    await supabaseAdmin
      .from('live_sessions')
      .update({ recording_status: 'processing', recording_error: null })
      .eq('id', live_session_id);

    return json({
      replay_id: replay.id,
      stream_uid: streamUid,
      status: 'processing',
      source_url: sourceUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-ingest-from-r2 error:', error);
    return json({ error: message }, 500);
  }
});
````

## supabase/functions/live-replay-stream-ingest/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_REPLAYS_PER_RUN = 3;
const PER_REPLAY_BUDGET_MS = 25_000;
const TOTAL_BUDGET_MS = 90_000;
const PATCH_TARGET_BYTES = 6 * 1024 * 1024;
const TUS_ALIGN = 256 * 1024;
const MIN_NON_FINAL_PATCH = 5 * 1024 * 1024;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | undefined {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function cfError(message: string, status: string, response: Record<string, unknown>, fatal = false): Error {
  return Object.assign(new Error(message), { cfStatus: status, cfResponse: response, fatal });
}

async function fetchChunkBytes(url: string, retries = 2): Promise<Uint8Array> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      lastErr = e;
      console.warn('[UPLOAD] chunk fetch retry', { attempt: i + 1, url, error: String(e) });
      await new Promise(res => setTimeout(res, 500 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchChunkBytes failed');
}

async function tusCreate(
  accountId: string,
  token: string,
  filename: string,
  totalBytes: number,
): Promise<{ uid: string; tusUrl: string; response: Record<string, unknown> }> {
  const meta = `name ${b64(filename)},filetype ${b64('video/webm')}`;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(totalBytes),
      'Upload-Metadata': meta,
    },
  });
  if (r.status !== 201) {
    const text = await r.text().catch(() => '');
    console.error('[CF_STREAM] [TUS] create failed', { status: r.status, body: text.slice(0, 500) });
    throw cfError(
      `TUS create failed ${r.status}: ${text.slice(0, 300)}`,
      `tus_create_${r.status}`,
      { status: r.status, body: text.slice(0, 500) },
      r.status === 401 || r.status === 403,
    );
  }
  const tusUrl = r.headers.get('Location') || '';
  const uid = r.headers.get('stream-media-id') || '';
  if (!tusUrl || !uid) {
    throw cfError('TUS create missing Location/stream-media-id headers', 'tus_create_missing_headers', {
      location: !!tusUrl,
      streamMediaId: !!uid,
    }, true);
  }
  const response = { uid, location: tusUrl, totalBytes, filename };
  console.log('[CF_STREAM] [TUS] created', response);
  return { uid, tusUrl, response };
}

async function tusHead(tusUrl: string, token: string): Promise<number | null> {
  const r = await fetch(tusUrl, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${token}`,
      'Tus-Resumable': '1.0.0',
    },
  });
  const uploadOffset = r.headers.get('Upload-Offset');
  console.log('[CF_STREAM] [OFFSET] HEAD', { status: r.status, uploadOffset });
  if (r.status === 404) return null;
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw cfError(
      `TUS HEAD ${r.status}: ${text.slice(0, 200)}`,
      `tus_head_${r.status}`,
      { status: r.status, body: text.slice(0, 500) },
      r.status === 401 || r.status === 403,
    );
  }
  const offset = parseInt(uploadOffset || '0', 10);
  return Number.isFinite(offset) ? offset : 0;
}

async function tusPatch(tusUrl: string, offset: number, body: Uint8Array, token: string): Promise<number> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    console.log('[TUS] [PATCH] start', { attempt: attempt + 1, offset, bytes: body.byteLength });
    const r = await fetch(tusUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
        'Content-Length': String(body.byteLength),
      },
      body,
    });
    lastStatus = r.status;
    if (r.status === 204) {
      const newOffset = parseInt(r.headers.get('Upload-Offset') || '0', 10);
      console.log('[TUS] [OFFSET] PATCH ok', { offset, bytes: body.byteLength, newOffset });
      return newOffset;
    }
    const text = await r.text().catch(() => '');
    if (r.status >= 400 && r.status < 500) {
      console.error('[TUS] [PATCH] client error', {
        status: r.status,
        offset,
        bytes: body.byteLength,
        uploadOffset: r.headers.get('Upload-Offset'),
        body: text.slice(0, 500),
      });
      throw cfError(
        `TUS PATCH ${r.status}: ${text.slice(0, 200)}`,
        `tus_patch_${r.status}`,
        { status: r.status, uploadOffset: r.headers.get('Upload-Offset'), body: text.slice(0, 500) },
        r.status === 401 || r.status === 403,
      );
    }
    console.warn('[TUS] [PATCH] retryable error', { status: r.status, offset, body: text.slice(0, 300) });
    await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
  }
  throw cfError(`TUS PATCH failed after retries, last=${lastStatus}`, `tus_patch_${lastStatus}`, { status: lastStatus });
}

interface ReplayRow {
  id: string;
  user_id: string;
  live_session_id: string;
  chunked_recording_id: string;
  status: string;
  stream_uid: string | null;
  tus_upload_url: string | null;
  tus_offset: number;
  next_chunk_seq: number;
  total_chunks_for_ingest: number | null;
  ingest_attempts: number;
}

async function processOneReplay(
  supabase: ReturnType<typeof createClient>,
  replay: ReplayRow,
  ctx: { accountId: string; token: string; r2PublicUrl: string; deadlineMs: number },
): Promise<{ status: string; bytesUploaded: number; chunksUploaded: number; stream_uid: string | null }> {
  const { data: chunks, error } = await supabase
    .from('chunked_recording_chunks')
    .select('seq, object_key, bytes')
    .eq('recording_id', replay.chunked_recording_id)
    .eq('status', 'uploaded')
    .order('seq', { ascending: true });
  if (error) throw error;
  if (!chunks || chunks.length === 0) throw new Error('no chunks');

  const totalChunks = chunks.length;
  const cum: number[] = new Array(totalChunks + 1).fill(0);
  for (let i = 0; i < totalChunks; i++) cum[i + 1] = cum[i] + Number((chunks[i] as any).bytes || 0);
  const totalBytes = cum[totalChunks];
  if (totalBytes <= 0) throw new Error('total bytes zero');

  let tusUrl = replay.tus_upload_url;
  let uid = replay.stream_uid;

  if (!tusUrl) {
    const created = await tusCreate(ctx.accountId, ctx.token, `replay-${replay.live_session_id}.webm`, totalBytes);
    tusUrl = created.tusUrl;
    uid = created.uid;
    await supabase.from('live_replays').update({
      stream_uid: uid,
      tus_upload_url: tusUrl,
      total_chunks_for_ingest: totalChunks,
      status: 'uploading',
      tus_offset: 0,
      next_chunk_seq: 0,
      ingest_attempts: (replay.ingest_attempts || 0) + 1,
      last_ingest_at: new Date().toISOString(),
      last_cf_status: 'tus_created',
      last_cf_response: { ...created.response, totalChunks },
      error_message: null,
      last_error_at: null,
    }).eq('id', replay.id);
    console.log('[CF_STREAM] [UPLOAD] created upload', { replay_id: replay.id, stream_uid: uid, totalChunks, totalBytes });
  }

  let serverOffset = Number(replay.tus_offset || 0);
  if (tusUrl) {
    const remoteOffset = await tusHead(tusUrl, ctx.token);
    if (remoteOffset !== null && remoteOffset !== serverOffset) {
      console.warn('[CF_STREAM] [OFFSET] reconciled mismatch', {
        replay_id: replay.id,
        stream_uid: uid,
        dbOffset: serverOffset,
        remoteOffset,
      });
      await supabase.from('live_replays').update({
        tus_offset: remoteOffset,
        last_cf_status: 'tus_offset_reconciled',
        last_cf_response: { dbOffset: serverOffset, remoteOffset },
      }).eq('id', replay.id);
      serverOffset = remoteOffset;
    }
  }

  let startChunkIdx = 0;
  while (startChunkIdx < totalChunks && cum[startChunkIdx + 1] <= serverOffset) startChunkIdx++;
  let skipInFirst = serverOffset - cum[startChunkIdx];

  let buffer = new Uint8Array(0);
  let chunksUploadedThisRun = 0;
  let bytesUploadedThisRun = 0;
  let seq = startChunkIdx;

  const appendChunk = async () => {
    const c = chunks[seq] as any;
    console.log('[UPLOAD] chunk fetch', { replay_id: replay.id, stream_uid: uid, seq, offset: serverOffset, object_key: c.object_key });
    const bytes = await fetchChunkBytes(`${ctx.r2PublicUrl}/${c.object_key}`);
    const slice = (seq === startChunkIdx && skipInFirst > 0) ? bytes.slice(skipInFirst) : bytes;
    const merged = new Uint8Array(buffer.byteLength + slice.byteLength);
    merged.set(buffer, 0);
    merged.set(slice, buffer.byteLength);
    buffer = merged;
    seq++;
    chunksUploadedThisRun++;
    skipInFirst = 0;
  };

  const flushAligned = async () => {
    const alignedSize = Math.floor(buffer.byteLength / TUS_ALIGN) * TUS_ALIGN;
    if (alignedSize < MIN_NON_FINAL_PATCH) return;
    const body = buffer.slice(0, alignedSize);
    const newOffset = await tusPatch(tusUrl!, serverOffset, body, ctx.token);
    bytesUploadedThisRun += alignedSize;
    serverOffset = newOffset;
    buffer = buffer.slice(alignedSize);
  };

  const flushFinal = async () => {
    if (buffer.byteLength === 0) return;
    const newOffset = await tusPatch(tusUrl!, serverOffset, buffer, ctx.token);
    bytesUploadedThisRun += buffer.byteLength;
    serverOffset = newOffset;
    buffer = new Uint8Array(0);
  };

  while (seq < totalChunks && Date.now() < ctx.deadlineMs) {
    await appendChunk();
    if (buffer.byteLength >= PATCH_TARGET_BYTES) await flushAligned();
  }

  const reachedEnd = seq >= totalChunks;
  if (reachedEnd) await flushFinal();
  else await flushAligned();

  const done = serverOffset >= totalBytes;
  await supabase.from('live_replays').update({
    tus_offset: serverOffset,
    next_chunk_seq: seq,
    status: done ? 'processing' : 'uploading',
    last_ingest_at: new Date().toISOString(),
    ingest_attempts: (replay.ingest_attempts || 0) + 1,
    last_cf_status: done ? 'tus_upload_complete' : 'tus_uploading',
    last_cf_response: { stream_uid: uid, tus_offset: serverOffset, totalBytes, totalChunks, next_chunk_seq: seq },
    error_message: null,
    last_error_at: null,
  }).eq('id', replay.id);

  console.log('[CF_STREAM] [UPLOAD] replay processed', {
    replay_id: replay.id,
    stream_uid: uid,
    status: done ? 'processing' : 'uploading',
    tus_offset: serverOffset,
    totalBytes,
    chunksUploadedThisRun,
    bytesUploadedThisRun,
  });

  return {
    status: done ? 'processing' : 'uploading',
    bytesUploaded: bytesUploadedThisRun,
    chunksUploaded: chunksUploadedThisRun,
    stream_uid: uid,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const isAuthorized =
    authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    (cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
  if (!isAuthorized) return json({ error: 'Unauthorized' }, 401);

  const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const token = streamToken();
  const r2PublicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
  if (!accountId || !token || !r2PublicUrl) {
    return json({ error: 'Missing Cloudflare configuration' }, 500);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const startTs = Date.now();
  const totalDeadline = startTs + TOTAL_BUDGET_MS;
  const { data: replays, error: queryErr } = await supabase
    .from('live_replays')
    .select('id, user_id, live_session_id, chunked_recording_id, status, stream_uid, tus_upload_url, tus_offset, next_chunk_seq, total_chunks_for_ingest, ingest_attempts')
    .in('status', ['queued', 'uploading'])
    .not('chunked_recording_id', 'is', null)
    .lt('ingest_attempts', 30)
    .order('last_ingest_at', { ascending: true, nullsFirst: true })
    .limit(MAX_REPLAYS_PER_RUN);

  if (queryErr) {
    console.error('[CF_STREAM] [UPLOAD] query error', queryErr);
    return json({ error: queryErr.message }, 500);
  }

  const results: Array<Record<string, unknown>> = [];
  for (const r of (replays || []) as ReplayRow[]) {
    if (Date.now() >= totalDeadline) break;
    const perDeadline = Math.min(Date.now() + PER_REPLAY_BUDGET_MS, totalDeadline);
    try {
      const out = await processOneReplay(supabase, r, { accountId, token, r2PublicUrl, deadlineMs: perDeadline });
      results.push({ replay_id: r.id, ...out });
    } catch (err: any) {
      const fatal = !!err?.fatal;
      console.error('[CF_STREAM] [UPLOAD] replay error', { replay_id: r.id, fatal, message: err?.message });
      const update: Record<string, unknown> = {
        last_ingest_at: new Date().toISOString(),
        ingest_attempts: (r.ingest_attempts || 0) + 1,
        error_message: String(err?.message || err).slice(0, 500),
        last_error_at: new Date().toISOString(),
        last_cf_status: err?.cfStatus || 'ingest_error',
        last_cf_response: err?.cfResponse || { message: String(err?.message || err).slice(0, 500) },
      };
      if (fatal) update.status = 'failed';
      await supabase.from('live_replays').update(update).eq('id', r.id);
      results.push({ replay_id: r.id, error: String(err?.message || err), fatal });
    }
  }

  return json({
    processed: results.length,
    results,
    elapsed_ms: Date.now() - startTs,
    timestamp: new Date().toISOString(),
  });
});
````

## supabase/functions/live-replay-poll-status/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function playbackUrls(uid: string) {
  const code = Deno.env.get('CLOUDFLARE_STREAM_CUSTOMER_CODE');
  const base = code ? `https://customer-${code}.cloudflarestream.com/${uid}` : `https://videodelivery.net/${uid}`;
  return {
    hls: `${base}/manifest/video.m3u8`,
    dash: `${base}/manifest/video.mpd`,
    mp4: `${base}/downloads/default.mp4`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg?time=3s`,
  };
}

async function requestMp4Download(accountId: string, token: string, uid: string): Promise<string | null> {
  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  console.log('[CF_STREAM] [POLL] mp4 download request', { uid, status: resp.status, success: data?.success });
  return data?.result?.default?.url || playbackUrls(uid).mp4;
}

async function markReady(admin: ReturnType<typeof createClient>, replay: any, uid: string, video: any, mp4Url: string | null) {
  const urls = playbackUrls(uid);
  const duration = Math.round(Number(video?.duration || 0)) || null;
  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, title, ended_at')
    .eq('id', replay.live_session_id)
    .maybeSingle();

  await (admin as any).from('live_replays').update({
    status: 'ready',
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: mp4Url || urls.mp4,
    thumbnail_url: urls.thumbnail,
    duration_seconds: duration,
    last_cf_status: 'ready',
    last_cf_response: video,
    error_message: null,
    last_error_at: null,
  }).eq('id', replay.id);

  await admin.from('live_sessions').update({
    recording_status: 'ready',
    recording_ready_at: new Date().toISOString(),
    recording_error: null,
  }).eq('id', replay.live_session_id);

  if (liveSession?.post_id) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', liveSession.post_id).maybeSingle();
    const metadata = {
      ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
      live_title: liveSession.title,
      live_status: 'ended',
      live_session_id: replay.live_session_id,
      playback_url: urls.hls,
      playback_type: 'cloudflare_stream',
      stream_uid: uid,
      playback_hls: urls.hls,
      playback_dash: urls.dash,
      playback_mp4: mp4Url || urls.mp4,
      thumbnail_url: urls.thumbnail,
      duration_seconds: duration,
      replay_ready_at: new Date().toISOString(),
      ended_at: liveSession.ended_at || new Date().toISOString(),
    };
    await admin.from('posts').update({ video_url: urls.hls, image_url: null, metadata }).eq('id', liveSession.post_id);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const ok =
    authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    (cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
  if (!ok) return json({ error: 'Unauthorized' }, 401);

  try {
    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    if (!accountId || !token) return json({ error: 'Missing Cloudflare Stream config' }, 500);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: pending } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, stream_uid, status')
      .in('status', ['uploading', 'queued', 'processing'])
      .not('stream_uid', 'is', null)
      .limit(50);

    const results: any[] = [];
    for (const replay of pending || []) {
      const uid = replay.stream_uid as string;
      const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await cfResp.json().catch(() => null);
      console.log('[CF_STREAM] [POLL] video status', { uid, httpStatus: cfResp.status, success: data?.success });
      if (!cfResp.ok || !data?.success) {
        await (admin as any).from('live_replays').update({
          last_cf_status: `poll_${cfResp.status}`,
          last_cf_response: data || { status: cfResp.status },
        }).eq('id', replay.id);
        results.push({ uid, status: 'poll_error', httpStatus: cfResp.status });
        continue;
      }

      const video = data.result;
      const state = String(video?.status?.state || 'processing').toLowerCase();
      if (video?.readyToStream === true || state === 'ready') {
        const mp4Url = await requestMp4Download(accountId, token, uid);
        await markReady(admin, replay, uid, video, mp4Url);
        results.push({ uid, status: 'ready' });
      } else if (state === 'error' || state === 'failed') {
        const reason = video?.status?.errReasonText || video?.status?.errorReasonText || 'Stream encoding failed';
        await (admin as any).from('live_replays').update({
          status: 'failed',
          error_message: reason,
          last_error_at: new Date().toISOString(),
          last_cf_status: state,
          last_cf_response: video,
        }).eq('id', replay.id);
        await admin.from('live_sessions').update({
          recording_status: 'failed',
          recording_error: reason,
        }).eq('id', replay.live_session_id);
        results.push({ uid, status: 'failed', reason });
      } else {
        await (admin as any).from('live_replays').update({
          last_cf_status: state,
          last_cf_response: video,
        }).eq('id', replay.id);
        results.push({ uid, status: replay.status, state });
      }
    }

    return json({ ok: true, processed: results.length, results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-poll-status error:', error);
    return json({ error: msg }, 500);
  }
});
````

## supabase/functions/stream-webhook/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function accountId(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
}

function parseSignature(header: string | null): { time: string; sig1: string } | null {
  if (!header) return null;
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.trim().split('=');
    return [key, value];
  }));
  if (!parts.time || !parts.sig1) return null;
  return { time: parts.time, sig1: parts.sig1 };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhook(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get('CLOUDFLARE_STREAM_WEBHOOK_SECRET');
  const sigHeader = req.headers.get('Webhook-Signature');
  console.log('[WEBHOOK] signature received', { hasSecret: !!secret, hasHeader: !!sigHeader });
  if (!secret || !sigHeader) return false;

  const parsed = parseSignature(sigHeader);
  if (!parsed) {
    console.warn('[WEBHOOK] signature parse failed');
    return false;
  }

  const timestamp = Number(parsed.time);
  if (!Number.isFinite(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 5 * 60) {
    console.warn('[WEBHOOK] timestamp skew', { skewSeconds: now - timestamp });
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parsed.time}.${rawBody}`));
  const ok = constantTimeEqual(toHex(signature), parsed.sig1);
  if (!ok) console.warn('[WEBHOOK] HMAC mismatch');
  return ok;
}

function playbackUrls(uid: string) {
  const code = Deno.env.get('CLOUDFLARE_STREAM_CUSTOMER_CODE');
  const base = code ? `https://customer-${code}.cloudflarestream.com/${uid}` : `https://videodelivery.net/${uid}`;
  return {
    hls: `${base}/manifest/video.m3u8`,
    dash: `${base}/manifest/video.mpd`,
    mp4: `${base}/downloads/default.mp4`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg?time=3s`,
  };
}

async function getVideo(uid: string): Promise<Record<string, unknown> | null> {
  const id = accountId();
  const token = streamToken();
  if (!id || !token) return null;
  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  console.log('[CF_STREAM] [WEBHOOK] retrieve video', { uid, status: resp.status, success: data?.success });
  if (!resp.ok || !data?.success) return null;
  return data.result || null;
}

async function requestMp4Download(uid: string): Promise<string | null> {
  const id = accountId();
  const token = streamToken();
  if (!id || !token) return null;

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream/${uid}/downloads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  console.log('[CF_STREAM] [WEBHOOK] mp4 download request', { uid, status: resp.status, success: data?.success });
  return data?.result?.default?.url || playbackUrls(uid).mp4;
}

function extractUid(event: any): string | null {
  return event?.uid || event?.data?.uid || event?.video?.uid || event?.result?.uid || null;
}

function normalizeState(event: any, video: any): string {
  const status = event?.status || event?.data?.status || event?.video?.status || video?.status || {};
  const state = status?.state || status?.current || event?.state || event?.data?.state || video?.status?.state;
  if (event?.readyToStream === true || video?.readyToStream === true) return 'ready';
  return typeof state === 'string' ? state.toLowerCase() : 'processing';
}

async function markReady(admin: ReturnType<typeof createClient>, replay: any, uid: string, event: any, video: any) {
  const urls = playbackUrls(uid);
  const mp4Url = await requestMp4Download(uid);
  const durationSeconds = Math.round(Number(video?.duration || event?.duration || event?.data?.duration || 0)) || null;

  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, title, ended_at')
    .eq('id', replay.live_session_id)
    .maybeSingle();

  await (admin as any).from('live_replays').update({
    status: 'ready',
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: mp4Url || urls.mp4,
    thumbnail_url: urls.thumbnail,
    duration_seconds: durationSeconds,
    webhook_received_at: new Date().toISOString(),
    last_webhook_event: 'ready',
    last_cf_status: 'ready',
    last_cf_response: video || event,
    error_message: null,
    last_error_at: null,
  }).eq('id', replay.id);

  await admin.from('live_sessions').update({
    recording_status: 'ready',
    recording_ready_at: new Date().toISOString(),
    recording_error: null,
  }).eq('id', replay.live_session_id);

  if (liveSession?.post_id) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', liveSession.post_id).maybeSingle();
    const metadata = {
      ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
      live_title: liveSession.title,
      live_status: 'ended',
      live_session_id: replay.live_session_id,
      playback_url: urls.hls,
      playback_type: 'cloudflare_stream',
      stream_uid: uid,
      playback_hls: urls.hls,
      playback_dash: urls.dash,
      playback_mp4: mp4Url || urls.mp4,
      thumbnail_url: urls.thumbnail,
      duration_seconds: durationSeconds,
      replay_ready_at: new Date().toISOString(),
      ended_at: liveSession.ended_at || new Date().toISOString(),
    };
    await admin.from('posts').update({ video_url: urls.hls, image_url: null, metadata }).eq('id', liveSession.post_id);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawBody = await req.text();
  if (!(await verifyWebhook(req, rawBody))) return json({ error: 'Invalid signature' }, 401);

  try {
    const event = JSON.parse(rawBody);
    const uid = extractUid(event);
    console.log('[WEBHOOK] event received', {
      type: event?.type || event?.event || event?.name || 'unknown',
      uid,
      hasBody: rawBody.length > 0,
    });
    if (!uid) return json({ ok: true, ignored: 'missing uid' });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: replay } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, stream_uid')
      .eq('stream_uid', uid)
      .maybeSingle();
    if (!replay) return json({ ok: true, ignored: 'replay not found' });

    const video = await getVideo(uid);
    const state = normalizeState(event, video);
    console.log('[WEBHOOK] parsed state', { uid, state, readyToStream: video?.readyToStream ?? event?.readyToStream });

    if (state === 'ready') {
      await markReady(admin, replay, uid, event, video);
      return json({ ok: true, status: 'ready' });
    }

    if (state === 'error' || state === 'failed') {
      const reason = (video as any)?.status?.errReasonText || event?.status?.errReasonText || event?.errReasonText || 'Cloudflare Stream processing failed';
      await (admin as any).from('live_replays').update({
        status: 'failed',
        error_message: reason,
        last_error_at: new Date().toISOString(),
        webhook_received_at: new Date().toISOString(),
        last_webhook_event: state,
        last_cf_status: state,
        last_cf_response: video || event,
      }).eq('id', replay.id);
      await admin.from('live_sessions').update({ recording_status: 'failed', recording_error: reason }).eq('id', replay.live_session_id);
      return json({ ok: true, status: 'failed' });
    }

    await (admin as any).from('live_replays').update({
      status: 'processing',
      webhook_received_at: new Date().toISOString(),
      last_webhook_event: state,
      last_cf_status: state,
      last_cf_response: video || event,
    }).eq('id', replay.id);

    return json({ ok: true, status: 'processing' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stream-webhook error:', error);
    return json({ error: message }, 500);
  }
});
````

## supabase/functions/stream-webhook-register/index.ts

``ts
/**
 * stream-webhook-register (admin-only)
 *
 * Ã„ÂÃ„Æ’ng kÃƒÂ½ notification URL cho Cloudflare Stream vÃƒÂ  trÃ¡ÂºÂ£ vÃ¡Â»Â secret HMAC.
 * Secret nÃƒÂ y CHÃ¡Â»Ë† hiÃ¡Â»Æ’n thÃ¡Â»â€¹ 1 lÃ¡ÂºÂ§n Ã¢â‚¬â€ admin phÃ¡ÂºÂ£i copy vÃƒÂ  cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t vÃƒÂ o
 * `CLOUDFLARE_STREAM_WEBHOOK_SECRET` trong Lovable Cloud.
 *
 * Methods:
 *   POST  -> PUT subscription (set notificationUrl), trÃ¡ÂºÂ£ vÃ¡Â»Â { secret, notificationUrl }
 *   GET   -> TrÃ¡ÂºÂ£ vÃ¡Â»Â subscription hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i (khÃƒÂ´ng kÃƒÂ¨m secret)
 *   DELETE-> XoÃƒÂ¡ subscription
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_TOKEN');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Admin check
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'Forbidden Ã¢â‚¬â€ admin only' }, 403);

    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    if (!accountId || !token) return json({ error: 'Missing Cloudflare Stream configuration' }, 500);

    const subUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/webhook`;

    if (req.method === 'GET') {
      const r = await fetch(subUrl, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => null);
      return json({ status: r.status, data });
    }

    if (req.method === 'DELETE') {
      const r = await fetch(subUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => null);
      return json({ status: r.status, data });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const notificationUrl = body.notificationUrl || `${supabaseUrl}/functions/v1/stream-webhook`;

      const r = await fetch(subUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationUrl }),
      });
      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.success) {
        return json({ error: 'Cloudflare PUT failed', status: r.status, detail: data }, 502);
      }

      const secret = data?.result?.secret;
      const savedUrl = data?.result?.notificationUrl;
      return json({
        ok: true,
        notificationUrl: savedUrl,
        secret,
        instruction: 'Copy "secret" vÃƒÂ  cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t vÃƒÂ o CLOUDFLARE_STREAM_WEBHOOK_SECRET trong Lovable Cloud secrets. Secret nÃƒÂ y chÃ¡Â»â€° hiÃ¡Â»Æ’n thÃ¡Â»â€¹ 1 lÃ¡ÂºÂ§n!',
      });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stream-webhook-register error:', error);
    return json({ error: message }, 500);
  }
});
````

## supabase/functions/admin-replay-debug/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function accountId(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
}

async function requireAdmin(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin, user };
}

async function invokeFunction(name: string): Promise<Record<string, unknown>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (cronSecret) headers['X-Cron-Secret'] = cronSecret;
  const resp = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const data = await resp.json().catch(() => null);
  return { httpStatus: resp.status, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const guard = await requireAdmin(req.headers.get('Authorization'));
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin;

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'list';
  const replayId = body.replay_id || body.replayId;

  try {
    if (action === 'list') {
      const { data, error } = await (admin as any)
        .from('live_replays')
        .select(`
          id, live_session_id, chunked_recording_id, user_id, stream_uid, status,
          tus_offset, next_chunk_seq, total_chunks_for_ingest, ingest_attempts,
          last_ingest_at, webhook_received_at, playback_hls, thumbnail_url,
          duration_seconds, error_message, last_error_at, last_webhook_event,
          last_cf_status, last_cf_response, created_at, updated_at
        `)
        .order('created_at', { ascending: false })
        .limit(Number(body.limit || 50));
      if (error) throw error;
      return json({ ok: true, replays: data || [] });
    }

    if (action === 'retry_upload') {
      if (!replayId) return json({ error: 'Missing replay_id' }, 400);
      const { error } = await (admin as any).from('live_replays').update({
        status: 'queued',
        error_message: null,
        last_error_at: null,
        last_cf_status: 'manual_retry_upload',
        last_cf_response: { by: guard.user.id, at: new Date().toISOString() },
      }).eq('id', replayId);
      if (error) throw error;
      const invoked = await invokeFunction('live-replay-stream-ingest');
      return json({ ok: true, invoked });
    }

    if (action === 'retry_webhook_sync' || action === 'force_status_refresh') {
      const invoked = await invokeFunction('live-replay-poll-status');
      return json({ ok: true, invoked });
    }

    if (action === 'test_cloudflare_api') {
      const id = accountId();
      const token = streamToken();
      if (!id || !token) return json({ ok: false, error: 'Missing Cloudflare Stream config' }, 500);
      const listResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream?per_page=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listResp.json().catch(() => null);
      const webhookResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream/webhook`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const webhookData = await webhookResp.json().catch(() => null);
      return json({
        ok: !!listData?.success,
        stream: { httpStatus: listResp.status, success: listData?.success, errors: listData?.errors || [] },
        webhook: { httpStatus: webhookResp.status, success: webhookData?.success, result: webhookData?.result || null, errors: webhookData?.errors || [] },
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('admin-replay-debug error:', error);
    return json({ error: message }, 500);
  }
});
````

## supabase/functions/recover-orphan-livestreams/index.ts

``ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify admin via auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const results = { orphans_recovered: 0, posts_with_video_fixed: 0, posts_marked_failed: 0, details: [] as any[] }

    // === PART A: Recover orphan sessions (post_id IS NULL, has done recording) ===
    const { data: orphanSessions } = await supabase
      .from('live_sessions')
      .select('id, host_user_id, title, channel_name, agora_channel, started_at, ended_at, status')
      .is('post_id', null)

    if (orphanSessions) {
      for (const session of orphanSessions) {
        // Check for done chunked recording
        const { data: recordings } = await supabase
          .from('chunked_recordings')
          .select('id, output_url, total_chunks')
          .eq('live_session_id', session.id)
          .eq('status', 'done')
          .limit(1)

        if (recordings && recordings.length > 0 && recordings[0].output_url) {
          const recording = recordings[0]
          const metadata = {
            live_title: session.title,
            live_status: 'ended',
            channel_name: session.channel_name,
            agora_channel: session.agora_channel,
            live_session_id: session.id,
            playback_url: null,
            playback_type: 'cloudflare_stream_pending',
            fallback_playback_url: recording.output_url,
            allow_chunked_fallback: false,
            ended_at: session.ended_at,
          }

          // Create post
          const { data: newPost, error: postErr } = await supabase
            .from('posts')
            .insert({
              user_id: session.host_user_id,
              content: session.title || 'PhÃ¡t láº¡i livestream',
              post_type: 'live',
              video_url: null,
              visibility: 'public',
              created_at: session.started_at,
              metadata,
            })
            .select('id')
            .single()

          if (newPost && !postErr) {
            // Link session to post
            await supabase
              .from('live_sessions')
              .update({ post_id: newPost.id })
              .eq('id', session.id)

            results.orphans_recovered++
            results.details.push({
              action: 'recovered',
              session_id: session.id,
              post_id: newPost.id,
              chunks: recording.total_chunks,
            })
          } else {
            results.details.push({
              action: 'error_creating_post',
              session_id: session.id,
              error: postErr?.message,
            })
          }
        }
      }
    }

    // === PART B: Fix live posts without video_url ===
    const { data: emptyPosts } = await supabase
      .from('posts')
      .select('id, metadata')
      .eq('post_type', 'live')
      .is('video_url', null)

    if (emptyPosts) {
      for (const post of emptyPosts) {
        const meta = (post.metadata || {}) as Record<string, any>
        const sessionId = meta.live_session_id

        if (sessionId) {
          // Check if there's a done recording for this session
          const { data: recordings } = await supabase
            .from('chunked_recordings')
            .select('output_url')
            .eq('live_session_id', sessionId)
            .eq('status', 'done')
            .limit(1)

          if (recordings && recordings.length > 0 && recordings[0].output_url) {
            // Keep Cloudflare Stream as the VOD source of truth; chunked is recovery metadata only.
            await supabase
              .from('posts')
              .update({
                video_url: null,
                metadata: {
                  ...meta,
                  playback_url: null,
                  playback_type: 'cloudflare_stream_pending',
                  fallback_playback_url: recordings[0].output_url,
                  allow_chunked_fallback: false,
                },
              })
              .eq('id', post.id)

            results.posts_with_video_fixed++
            results.details.push({ action: 'video_fixed', post_id: post.id })
          } else {
            // Mark as recording_failed
            await supabase
              .from('posts')
              .update({
                metadata: { ...meta, recording_failed: true },
              })
              .eq('id', post.id)

            results.posts_marked_failed++
            results.details.push({ action: 'marked_failed', post_id: post.id })
          }
        } else {
          // No session ID in metadata â€” mark failed
          await supabase
            .from('posts')
            .update({
              metadata: { ...meta, recording_failed: true },
            })
            .eq('id', post.id)

          results.posts_marked_failed++
          results.details.push({ action: 'marked_failed_no_session', post_id: post.id })
        }
      }
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
````

## supabase/migrations/20260221191438_ba090f72-d4c4-4515-b338-828c25e92b2e.sql

``sql
-- 1. Extend posts table
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Create live_sessions table
CREATE TABLE IF NOT EXISTS public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_name text NOT NULL UNIQUE,
  agora_channel text,
  agora_uid_host integer,
  recording_uid integer,
  resource_id text,
  sid text,
  recording_resource_id text,
  recording_sid text,
  recording_files jsonb DEFAULT '[]'::jsonb,
  recording_status text NOT NULL DEFAULT 'idle',
  recording_started_at timestamptz,
  recording_stopped_at timestamptz,
  recording_ready_at timestamptz,
  recording_error text,
  last_worker_response jsonb DEFAULT '{}'::jsonb,
  recording_acquired_at timestamptz,
  title text,
  privacy text NOT NULL DEFAULT 'public',
  status text NOT NULL DEFAULT 'live',
  viewer_count integer NOT NULL DEFAULT 0 CHECK (viewer_count >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_sessions_privacy_check CHECK (privacy IN ('public', 'friends')),
  CONSTRAINT live_sessions_status_check CHECK (status IN ('live', 'ended')),
  CONSTRAINT live_sessions_recording_status_check CHECK (recording_status IN ('idle', 'acquired', 'acquiring', 'starting', 'recording', 'stopping', 'processing', 'ready', 'stopped', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_channel_name_unique ON public.live_sessions(channel_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_agora_channel_unique ON public.live_sessions(agora_channel) WHERE agora_channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_live_sessions_status_started_at ON public.live_sessions(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_host_status ON public.live_sessions(host_user_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_owner_status ON public.live_sessions(owner_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_recording_status ON public.live_sessions(recording_status, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_live_sessions_updated_at
BEFORE UPDATE ON public.live_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Create live_recordings table
CREATE TABLE IF NOT EXISTS public.live_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  resource_id text,
  sid text,
  recorder_uid text,
  mode text DEFAULT 'composite',
  status text NOT NULL DEFAULT 'recording',
  storage_vendor integer,
  storage_region integer,
  file_list_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_url text,
  error_message text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  duration_seconds integer,
  thumbnail_url text
);

CREATE INDEX IF NOT EXISTS idx_live_recordings_live_created ON public.live_recordings(live_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_recordings_status ON public.live_recordings(status, created_at DESC);

-- 4. Create live_messages table
CREATE TABLE IF NOT EXISTS public.live_messages (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_messages_session_created_at ON public.live_messages(session_id, created_at);

-- 5. Create live_reactions table
CREATE TABLE IF NOT EXISTS public.live_reactions (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_reactions_session_created_at ON public.live_reactions(session_id, created_at);

-- 6. Create live_comments table
CREATE TABLE IF NOT EXISTS public.live_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_live_comments_session_created_at ON public.live_comments(live_session_id, created_at);

-- 7. Create streams table
CREATE TABLE IF NOT EXISTS public.streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  video_path text NOT NULL,
  duration integer NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Enable RLS
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;

-- 9. Policies

-- live_sessions
CREATE POLICY "public can read live sessions" ON public.live_sessions FOR SELECT TO anon, authenticated USING (status IN ('live', 'ended'));
CREATE POLICY "host can insert own live session" ON public.live_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_user_id OR auth.uid() = owner_id);
CREATE POLICY "host can update own live session" ON public.live_sessions FOR UPDATE TO authenticated USING (auth.uid() = host_user_id OR auth.uid() = owner_id) WITH CHECK (auth.uid() = host_user_id OR auth.uid() = owner_id);

-- live_messages
CREATE POLICY "Anyone can view live messages" ON public.live_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert live messages" ON public.live_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- live_reactions
CREATE POLICY "Anyone can view live reactions" ON public.live_reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert live reactions" ON public.live_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- live_comments
CREATE POLICY "Anyone can view live comments" ON public.live_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert live comments" ON public.live_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- streams
CREATE POLICY "Anyone can view streams" ON public.streams FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert streams" ON public.streams FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 10. RPC Functions

-- increment_live_viewer_count
CREATE OR REPLACE FUNCTION public.increment_live_viewer_count(session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_sessions
  SET viewer_count = viewer_count + 1
  WHERE id = session_id;
END;
$$;

-- decrement_live_viewer_count
CREATE OR REPLACE FUNCTION public.decrement_live_viewer_count(session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_sessions
  SET viewer_count = GREATEST(0, viewer_count - 1)
  WHERE id = session_id;
END;
$$;

-- get_live_recording_context
CREATE OR REPLACE FUNCTION public.get_live_recording_context(_session_id uuid)
RETURNS TABLE (
  id uuid,
  host_user_id uuid,
  channel_name text,
  agora_channel text,
  resource_id text,
  sid text,
  recording_uid integer,
  recording_status text,
  recording_started_at timestamptz,
  recording_stopped_at timestamptz,
  recording_ready_at timestamptz,
  recording_error text,
  last_worker_response jsonb,
  post_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ls.id,
    ls.host_user_id,
    ls.channel_name,
    ls.agora_channel,
    ls.resource_id,
    ls.sid,
    ls.recording_uid,
    ls.recording_status,
    ls.recording_started_at,
    ls.recording_stopped_at,
    ls.recording_ready_at,
    ls.recording_error,
    COALESCE(ls.last_worker_response, '{}'::jsonb),
    ls.post_id
  FROM public.live_sessions ls
  WHERE ls.id = _session_id
    AND (
      ls.host_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    );
END;
$$;

-- set_live_recording_state
CREATE OR REPLACE FUNCTION public.set_live_recording_state(
  _session_id uuid,
  _recording_status text DEFAULT NULL,
  _resource_id text DEFAULT NULL,
  _sid text DEFAULT NULL,
  _recording_uid integer DEFAULT NULL,
  _recording_started_at timestamptz DEFAULT NULL,
  _recording_stopped_at timestamptz DEFAULT NULL,
  _recording_ready_at timestamptz DEFAULT NULL,
  _recording_error text DEFAULT NULL,
  _last_worker_response jsonb DEFAULT NULL
)
RETURNS public.live_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.live_sessions;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    WHERE ls.id = _session_id
      AND (
        ls.host_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.live_sessions ls
  SET
    recording_status = COALESCE(_recording_status, ls.recording_status),
    resource_id = COALESCE(_resource_id, ls.resource_id),
    sid = COALESCE(_sid, ls.sid),
    recording_uid = COALESCE(_recording_uid, ls.recording_uid),
    recording_started_at = COALESCE(_recording_started_at, ls.recording_started_at),
    recording_stopped_at = COALESCE(_recording_stopped_at, ls.recording_stopped_at),
    recording_ready_at = COALESCE(_recording_ready_at, ls.recording_ready_at),
    recording_error = COALESCE(_recording_error, ls.recording_error),
    last_worker_response = COALESCE(_last_worker_response, ls.last_worker_response),
    updated_at = now()
  WHERE ls.id = _session_id
  RETURNING ls.* INTO _row;

  RETURN _row;
END;
$$;

-- upsert_live_recording_row
CREATE OR REPLACE FUNCTION public.upsert_live_recording_row(
  _session_id uuid,
  _resource_id text DEFAULT NULL,
  _sid text DEFAULT NULL,
  _recorder_uid text DEFAULT NULL,
  _status text DEFAULT NULL,
  _file_list_json jsonb DEFAULT NULL,
  _media_url text DEFAULT NULL,
  _raw_response jsonb DEFAULT NULL,
  _stopped_at timestamptz DEFAULT NULL,
  _duration_seconds integer DEFAULT NULL,
  _thumbnail_url text DEFAULT NULL
)
RETURNS public.live_recordings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _live public.live_sessions;
  _latest_id uuid;
  _row public.live_recordings;
BEGIN
  SELECT * INTO _live
  FROM public.live_sessions ls
  WHERE ls.id = _session_id
    AND (
      ls.host_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    );

  IF _live.id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT lr.id INTO _latest_id
  FROM public.live_recordings lr
  WHERE lr.live_id = _session_id
  ORDER BY lr.created_at DESC
  LIMIT 1;

  IF _latest_id IS NULL THEN
    INSERT INTO public.live_recordings (
      live_id,
      resource_id,
      sid,
      recorder_uid,
      status,
      file_list_json,
      media_url,
      raw_response,
      stopped_at,
      duration_seconds,
      thumbnail_url
    ) VALUES (
      _session_id,
      _resource_id,
      _sid,
      _recorder_uid,
      COALESCE(_status, 'recording'),
      COALESCE(_file_list_json, '[]'::jsonb),
      _media_url,
      _raw_response,
      _stopped_at,
      _duration_seconds,
      _thumbnail_url
    ) RETURNING * INTO _row;
  ELSE
    UPDATE public.live_recordings lr
    SET
      resource_id = COALESCE(_resource_id, lr.resource_id),
      sid = COALESCE(_sid, lr.sid),
      recorder_uid = COALESCE(_recorder_uid, lr.recorder_uid),
      status = COALESCE(_status, lr.status),
      file_list_json = COALESCE(_file_list_json, lr.file_list_json),
      media_url = COALESCE(_media_url, lr.media_url),
      raw_response = COALESCE(_raw_response, lr.raw_response),
      stopped_at = COALESCE(_stopped_at, lr.stopped_at),
      duration_seconds = COALESCE(_duration_seconds, lr.duration_seconds),
      thumbnail_url = COALESCE(_thumbnail_url, lr.thumbnail_url)
    WHERE lr.id = _latest_id
    RETURNING lr.* INTO _row;
  END IF;

  RETURN _row;
END;
$$;

-- attach_live_replay_to_post
CREATE OR REPLACE FUNCTION public.attach_live_replay_to_post(
  _session_id uuid,
  _playback_url text,
  _duration_seconds integer DEFAULT NULL,
  _thumbnail_url text DEFAULT NULL
)
RETURNS public.live_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _live public.live_sessions;
  _metadata jsonb;
BEGIN
  SELECT * INTO _live
  FROM public.live_sessions ls
  WHERE ls.id = _session_id
    AND (
      ls.host_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
    );

  IF _live.id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _live.post_id IS NOT NULL THEN
    SELECT COALESCE(p.metadata::jsonb, '{}'::jsonb)
    INTO _metadata
    FROM public.posts p
    WHERE p.id = _live.post_id;

    _metadata := _metadata
      || jsonb_build_object('playback_url', _playback_url)
      || jsonb_build_object('live_status', 'ended')
      || jsonb_build_object('replay_ready_at', now());

    IF _duration_seconds IS NOT NULL THEN
      _metadata := _metadata || jsonb_build_object('duration_seconds', _duration_seconds);
    END IF;

    IF _thumbnail_url IS NOT NULL THEN
      _metadata := _metadata || jsonb_build_object('thumbnail_url', _thumbnail_url);
    END IF;

    UPDATE public.posts p
    SET
      metadata = _metadata,
      video_url = COALESCE(_playback_url, p.video_url)
    WHERE p.id = _live.post_id;
  END IF;

  UPDATE public.live_sessions ls
  SET
    recording_status = CASE WHEN _playback_url IS NULL OR _playback_url = '' THEN 'failed' ELSE 'ready' END,
    recording_ready_at = CASE WHEN _playback_url IS NULL OR _playback_url = '' THEN ls.recording_ready_at ELSE now() END,
    recording_error = CASE WHEN _playback_url IS NULL OR _playback_url = '' THEN COALESCE(ls.recording_error, 'Playback URL missing') ELSE NULL END,
    updated_at = now()
  WHERE ls.id = _session_id
  RETURNING ls.* INTO _live;

  RETURN _live;
END;
$$;

-- 11. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_comments;
````

## supabase/migrations/20260225183645_ca9720e1-d37c-4898-8326-82dd89d8c3de.sql

``sql

-- Phase 1: Chunked Recording tables

-- 1. chunked_recordings - main recording session table
CREATE TABLE public.chunked_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  live_session_id UUID REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  channel_name TEXT,
  status TEXT NOT NULL DEFAULT 'recording',
  codec TEXT,
  mime_type TEXT DEFAULT 'video/webm',
  width INT,
  height INT,
  total_chunks INT DEFAULT 0,
  last_seq_uploaded INT DEFAULT -1,
  output_object_key TEXT,
  output_url TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. chunked_recording_chunks - individual chunk tracking
CREATE TABLE public.chunked_recording_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL REFERENCES public.chunked_recordings(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  object_key TEXT,
  bytes INT DEFAULT 0,
  duration_ms INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recording_id, seq)
);

-- 3. Indexes
CREATE INDEX idx_chunked_recordings_user_id ON public.chunked_recordings(user_id);
CREATE INDEX idx_chunked_recordings_live_session ON public.chunked_recordings(live_session_id);
CREATE INDEX idx_chunked_recordings_status ON public.chunked_recordings(status);
CREATE INDEX idx_chunked_recording_chunks_recording ON public.chunked_recording_chunks(recording_id);

-- 4. RLS for chunked_recordings
ALTER TABLE public.chunked_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recordings"
  ON public.chunked_recordings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recordings"
  ON public.chunked_recordings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recordings"
  ON public.chunked_recordings FOR UPDATE
  USING (auth.uid() = user_id);

-- 5. RLS for chunked_recording_chunks
ALTER TABLE public.chunked_recording_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chunks"
  ON public.chunked_recording_chunks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.chunked_recordings cr
    WHERE cr.id = recording_id AND cr.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own chunks"
  ON public.chunked_recording_chunks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chunked_recordings cr
    WHERE cr.id = recording_id AND cr.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own chunks"
  ON public.chunked_recording_chunks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.chunked_recordings cr
    WHERE cr.id = recording_id AND cr.user_id = auth.uid()
  ));

-- 6. Enable realtime for chunked_recordings
ALTER PUBLICATION supabase_realtime ADD TABLE public.chunked_recordings;
````

## supabase/migrations/20260504010000_cloudflare_stream_live_replays.sql

``sql
-- Cloudflare Stream production replay pipeline for livestream VODs.

DO $$
BEGIN
  CREATE TYPE public.live_replay_status AS ENUM (
    'uploading',
    'queued',
    'processing',
    'ready',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.live_replays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  live_session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  chunked_recording_id UUID REFERENCES public.chunked_recordings(id) ON DELETE SET NULL,
  source_webm_key TEXT,
  stream_uid TEXT UNIQUE,
  playback_hls TEXT,
  playback_dash TEXT,
  playback_mp4 TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  filesize_bytes BIGINT,
  status public.live_replay_status NOT NULL DEFAULT 'uploading',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_replays_user_created
  ON public.live_replays(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_replays_live_session
  ON public.live_replays(live_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_replays_chunked_recording
  ON public.live_replays(chunked_recording_id);
CREATE INDEX IF NOT EXISTS idx_live_replays_status
  ON public.live_replays(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_replays_stream_uid
  ON public.live_replays(stream_uid)
  WHERE stream_uid IS NOT NULL;

DROP TRIGGER IF EXISTS update_live_replays_updated_at ON public.live_replays;
CREATE TRIGGER update_live_replays_updated_at
BEFORE UPDATE ON public.live_replays
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.live_replays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own live replays" ON public.live_replays;
CREATE POLICY "Users can view own live replays"
  ON public.live_replays FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can view ready live replays" ON public.live_replays;
CREATE POLICY "Public can view ready live replays"
  ON public.live_replays FOR SELECT
  TO anon, authenticated
  USING (status = 'ready');

DROP POLICY IF EXISTS "Users can update own uploading live replays" ON public.live_replays;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_replays;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
````

## supabase/migrations/20260504235553_9922255b-9689-4be4-82a9-5571862d41e8.sql

``sql
ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS tus_upload_url text,
  ADD COLUMN IF NOT EXISTS tus_offset bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_chunk_seq integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_chunks_for_ingest integer,
  ADD COLUMN IF NOT EXISTS ingest_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ingest_at timestamptz;

CREATE INDEX IF NOT EXISTS live_replays_ingest_queue_idx
  ON public.live_replays(status, last_ingest_at NULLS FIRST)
  WHERE status IN ('queued','uploading');
````

## supabase/migrations/20260505010000_live_replay_debug_state.sql

``sql
ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS webhook_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_event text,
  ADD COLUMN IF NOT EXISTS last_cf_status text,
  ADD COLUMN IF NOT EXISTS last_cf_response jsonb,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_replays_webhook_received
  ON public.live_replays(webhook_received_at DESC)
  WHERE webhook_received_at IS NOT NULL;
````

## supabase/migrations/20260505124639_21db0bd6-3638-4d25-9c97-a23cc0fe2f38.sql

``sql
DROP INDEX IF EXISTS public.live_replays_recording_uniq;
ALTER TABLE public.live_replays ALTER COLUMN chunked_recording_id SET NOT NULL;
ALTER TABLE public.live_replays ADD CONSTRAINT live_replays_recording_uniq UNIQUE (chunked_recording_id);
````

