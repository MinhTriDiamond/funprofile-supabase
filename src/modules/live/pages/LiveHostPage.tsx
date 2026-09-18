/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, BarChart3, CheckCircle2, Clock, Eye, Globe2, Home, Link2, Loader2, MessageCircle, Mic, MicOff, PhoneOff, Radio, RefreshCw, Send, Sparkles, SwitchCamera, Video, VideoOff, Wand2, X } from 'lucide-react';
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
  endLiveSessionBackend,
  markBrowserRecordingFallbackFinished,
  markBrowserRecordingFallbackStarted,
  finalizeLiveSession,
  markLiveSessionFailed,
  requestEndLiveKeepalive,
  updateLiveViewerCount,
  uploadLiveRecording,
  uploadLiveThumbnail,
  uploadBrowserRecordingChunk,
  attachLiveReplayToPost,
  createChunkedRecording,
  type RecordingStatus,
} from '../liveService';
import {
  ensureWebcamLiveRecordingStarted,
  getWebcamLiveStatus,
  startWebcamLiveSessionBackend,
  sendWebcamLiveStopBeacon,
} from '../webcam/services/webcamLiveApi';
import { createRecorder, type RecorderController } from '../legacy/browser-recorder';
import { useLiveRecording, type RecordingPhase } from '@/hooks/live/useLiveRecording';
import { useLiveSession } from '../useLiveSession';
import { useLiveRtc } from '../hooks/useLiveRtc';
import type { LiveAudioMode } from '../hooks/useLiveRtc';
import type { LiveCameraFacingMode } from '../hooks/useLiveRtc';
import type { LiveVideoQuality } from '../hooks/useLiveRtc';
import { useLiveHeartbeat } from '../hooks/useLiveHeartbeat';
import { useMusicAutoPause } from '../hooks/useMusicAutoPause';
import { LiveChatPanel } from '../components/LiveChatPanel';
import { FloatingReactions } from '../components/FloatingReactions';
import { useLiveDuration } from '../hooks/useLiveDuration';
import { useLiveDurationLimit } from '../hooks/useLiveDurationLimit';
import { useLivePresence } from '../hooks/useLivePresence';
import { useLiveMessages } from '../hooks/useLiveMessages';
import { useLiveReactions } from '../hooks/useLiveReactions';
import { WebcamHostLivePage } from '../components/host/WebcamHostLivePage';
import { EndLiveConfirmDialog } from '../components/host/EndLiveConfirmDialog';
import type { HostLiveUiState } from '../components/host/hostLiveTypes';
import type { LiveEndReason } from '../types';
import {
  finishAgoraUsageSession,
  recordAgoraUsageError,
  startAgoraUsageSession,
  type AgoraEndReason,
} from '../agoraUsageService';
import {
  LIVE_CONNECT_ERROR_MESSAGE,
  LIVE_CONNECT_ERROR_TITLE,
  buildSessionNotFoundError,
  toFriendlyLiveError,
  type FriendlyLiveError,
} from '../utils/liveErrors';
import { useQueryClient } from '@tanstack/react-query';
import logger from '@/lib/logger';

type BootState = 'idle' | 'auth' | 'creating' | 'loading' | 'starting' | 'ready' | 'error';
type EndFlowState = 'idle' | 'confirming' | 'countdown' | 'ending' | 'ended' | 'failed';

const CHUNKED_RECORDING_ENABLED = import.meta.env.VITE_LIVE_BROWSER_RECORDING_FALLBACK === 'true';
const LIVE_START_TIMEOUT_DESKTOP_MS = 30_000;
const LIVE_START_TIMEOUT_MOBILE_MS = 60_000;
const FALLBACK_RECORDING_DESKTOP_SLICE_MS = 15_000;
const FALLBACK_RECORDING_MOBILE_SLICE_MS = 10_000;

type BrowserFallbackState = 'idle' | 'recommended' | 'recording' | 'uploading' | 'uploaded' | 'failed';

function pickBrowserRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
}

function getStoredLiveAudioMode(): LiveAudioMode {
  try {
    return localStorage.getItem('funprofile_webcam_audio_mode') === 'voice' ? 'voice' : 'original';
  } catch {
    return 'original';
  }
}

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

function readErrorString(error: unknown): string {
  if (error == null) return '';
  if (error instanceof Error) return error.message || error.name || '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'error', 'details', 'hint']) {
      const val = obj[key];
      if (typeof val === 'string' && val.trim()) return val;
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json;
    } catch {
      // fall through
    }
  }
  return String(error);
}

function toUserError(error: unknown): string {
  const message = readErrorString(error);
  const lowerRaw = message.toLowerCase();
  if (
    lowerRaw.includes('duplicate key') ||
    lowerRaw.includes('23505') ||
    lowerRaw.includes('idx_posts_user_slug') ||
    lowerRaw.includes('posts_user_slug') ||
    lowerRaw.includes('live_post_slug_conflict')
  ) {
    return LIVE_CONNECT_ERROR_MESSAGE;
  }
  if ((error as { friendly?: FriendlyLiveError } | null)?.friendly || lowerRaw.includes('agora') || lowerRaw.includes('gateway') || lowerRaw.includes('quota')) {
    return toFriendlyLiveError(error).message;
  }
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError') return 'Bạn chưa cấp quyền camera/micro.';
  if (name === 'NotFoundError') return 'Không tìm thấy thiết bị camera/micro.';
  const lower = message.toLowerCase();
  if (lower.includes('auth timeout')) return 'Xác thực quá chậm, vui lòng thử lại.';
  if (lower.includes('create live session timeout')) return 'Tạo phiên LIVE quá lâu, vui lòng thử lại.';
  if (lower.includes('timeout')) return 'Kết nối quá chậm, vui lòng thử lại.';
  return message || 'Không thể bắt đầu phát trực tiếp.';
}

function isTransientError(error: unknown): boolean {
  const message = readErrorString(error).toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('duplicate key') ||
    message.includes('23505') ||
    message.includes('idx_posts_user_slug') ||
    message.includes('posts_user_slug') ||
    message.includes('live_post_slug_conflict')
  );
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
  idle: { label: '⏸ Sẵn sàng', variant: 'secondary' },
  acquiring: { label: '⏳ Đang chuẩn bị...', variant: 'secondary' },
  starting: { label: '⏳ Đang bắt đầu...', variant: 'secondary' },
  recording: { label: '⏺ Đang ghi', variant: 'destructive' },
  stopping: { label: '⏳ Đang dừng...', variant: 'secondary' },
  compressing: { label: '🗜 Đang nén...', variant: 'secondary' },
  processing: { label: '⏳ Đang tải lên...', variant: 'secondary' },
  ready: { label: '✓ Đã lưu', variant: 'default' },
  failed: { label: '✕ Lỗi ghi hình', variant: 'outline' },
  stopped: { label: '■ Đã dừng', variant: 'secondary' },
};

export default function LiveHostPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { evaluateAsync } = usePplpEvaluate();
  const { liveSessionId } = useParams<{ liveSessionId: string }>();
  const preLiveState = (location.state as {
    title?: string;
    privacy?: string;
    audioMode?: LiveAudioMode;
    quality?: LiveVideoQuality;
    facingMode?: LiveCameraFacingMode;
    micDeviceId?: string;
    recordingAvailable?: boolean;
    fallbackRecordingRecommended?: boolean;
    fallbackProvider?: 'browser';
    recordingErrorCode?: string;
  } | null);
  const liveAudioModeRef = useRef<LiveAudioMode>(
    preLiveState?.audioMode === 'voice' ? 'voice' : getStoredLiveAudioMode()
  );
  const liveVideoQualityRef = useRef<LiveVideoQuality>(
    preLiveState?.quality === 'auto' || preLiveState?.quality === '360p' || preLiveState?.quality === '480p' || preLiveState?.quality === '720p' || preLiveState?.quality === '1080p'
      ? preLiveState.quality
      : 'auto'
  );
  const liveCameraFacingRef = useRef<LiveCameraFacingMode>(
    preLiveState?.facingMode === 'environment' ? 'environment' : 'user'
  );
  const liveMicDeviceIdRef = useRef(preLiveState?.micDeviceId || undefined);

  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [bootState, setBootState] = useState<BootState>('idle');
  const [bootError, setBootError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [friendlyLiveError, setFriendlyLiveError] = useState<FriendlyLiveError | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingStatus>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [compressProgress, setCompressProgress] = useState<number>(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endFlowState, setEndFlowState] = useState<EndFlowState>('idle');
  const [endCountdown, setEndCountdown] = useState(5);
  const [autoEndReason, setAutoEndReason] = useState<null | 'network'>(null);
  const [autoEndCountdown, setAutoEndCountdown] = useState(60);
  const endCountdownTimerRef = useRef<number | null>(null);
  const autoEndTimerRef = useRef<number | null>(null);
  const [useMobileLiveUi, setUseMobileLiveUi] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileCommentText, setMobileCommentText] = useState('');
  const startedRef = useRef(false);
  const manualEndingRef = useRef(false);
  const endingRequestRef = useRef(false);
  const accessTokenRef = useRef<string | null>(null);
  const browserRecorderRef = useRef<RecorderController | null>(null);
  const browserFallbackRecorderRef = useRef<MediaRecorder | null>(null);
  const browserFallbackStartedRef = useRef(false);
  const browserFallbackChunkIndexRef = useRef(0);
  const browserFallbackUploadPromisesRef = useRef<Promise<unknown>[]>([]);
  const browserFallbackUploadChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const browserFallbackLastChunkAtRef = useRef(0);
  const browserFallbackFailedRef = useRef(false);
  const [browserFallbackState, setBrowserFallbackState] = useState<BrowserFallbackState>('idle');
  const lastSentViewerCountRef = useRef<number | null>(null);
  const viewerCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileChatListRef = useRef<HTMLDivElement | null>(null);
  const agoraUsageStartedRef = useRef(false);
  const recordingEnsureStartedRef = useRef(false);
  const sessionFirstSeenAtRef = useRef<Record<string, number>>({});
  const queryClient = useQueryClient();

  const effectiveSessionId = liveSessionId || createdSessionId || undefined;
  const sessionQuery = useLiveSession(effectiveSessionId);
  const session = sessionQuery.data;

  // Track when we first started expecting a given session id, so the "not found"
  // check can apply a grace period (avoids race with replication lag right after
  // the edge function inserts the row).
  useEffect(() => {
    if (!effectiveSessionId) return;
    if (!sessionFirstSeenAtRef.current[effectiveSessionId]) {
      sessionFirstSeenAtRef.current[effectiveSessionId] = Date.now();
    }
  }, [effectiveSessionId]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setUseMobileLiveUi(query.matches);
    update();
    if (query.addEventListener) {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  // Khi rời màn host live, báo Feed refetch để post live/replay xuất hiện ngay
  useEffect(() => {
    return () => {
      try {
        window.dispatchEvent(new Event('invalidate-feed'));
      } catch {
        /* noop */
      }
    };
  }, []);

  const {
    setLocalContainerRef,
    isJoined,
    isMuted,
    isCameraOff,
    isSwitchingCamera,
    statusText,
    networkQuality,
    liveHealth,
    hostPreviewStats,
    start,
    leave,
    toggleMute,
    toggleCamera,
    switchCamera,
    getLocalTracks,
  } = useLiveRtc({
    sessionId: effectiveSessionId,
    role: 'host',
    enabled: !!effectiveSessionId && session?.status !== 'ended',
    audioMode: liveAudioModeRef.current,
    videoQuality: liveVideoQualityRef.current,
    initialFacingMode: liveCameraFacingRef.current,
    microphoneId: liveMicDeviceIdRef.current,
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
  const shouldUseBrowserFallback = CHUNKED_RECORDING_ENABLED && !!effectiveSessionId && (
    preLiveState?.fallbackRecordingRecommended === true ||
    preLiveState?.fallbackProvider === 'browser' ||
    session?.recording_provider === 'browser' ||
    session?.browser_recording_status === 'recording' ||
    (session?.recording_status === 'failed' && session?.recording_error_code?.startsWith('AGORA'))
  );

  // Chunked recording hook
  const recording = useLiveRecording({
    videoTrack: null,
    audioTrack: null,
    sessionId: undefined,
    recordingId: undefined,
    autoStart: false,
    videoQuality: liveVideoQualityRef.current,
  });

  const uploadBrowserFallbackBlob = useCallback((blob: Blob, mimeType: string, durationMs: number) => {
    if (!effectiveSessionId || !blob.size) return;
    const chunkIndex = browserFallbackChunkIndexRef.current++;
    const postId = session?.post_id || session?.live_post_id || undefined;
    const task = browserFallbackUploadChainRef.current.then(async () => {
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await uploadBrowserRecordingChunk({
            liveSessionId: effectiveSessionId,
            postId,
            chunkIndex,
            blob,
            mimeType,
            durationMs,
          });
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 800 * attempt * attempt));
          }
        }
      }
      throw lastError;
    }).catch((error) => {
      console.warn('[LiveHost] browser fallback chunk upload failed:', error);
      browserFallbackFailedRef.current = true;
      setBrowserFallbackState('failed');
      setRecordingError('Livestream vẫn tiếp tục, nhưng replay có thể không được lưu.');
      markBrowserRecordingFallbackFinished(effectiveSessionId, 'failed', readErrorString(error)).catch(() => undefined);
      toast.warning('Livestream vẫn tiếp tục, nhưng replay có thể không được lưu.');
    });
    browserFallbackUploadChainRef.current = task.catch(() => undefined);
    browserFallbackUploadPromisesRef.current.push(task);
  }, [effectiveSessionId, session?.live_post_id, session?.post_id]);

  const startBrowserFallbackRecording = useCallback(() => {
    if (!effectiveSessionId || browserFallbackStartedRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      browserFallbackFailedRef.current = true;
      setBrowserFallbackState('failed');
      toast.warning('Livestream vẫn tiếp tục, nhưng replay có thể không được lưu.');
      markBrowserRecordingFallbackFinished(effectiveSessionId, 'failed', 'MediaRecorder is not supported').catch(() => undefined);
      return;
    }

    const tracks = getLocalTracks();
    const videoTrack = tracks.video?.getMediaStreamTrack();
    const audioTrack = tracks.audio?.getMediaStreamTrack();
    if (!videoTrack || !audioTrack) return;

    const mimeType = pickBrowserRecordingMimeType();
    if (!mimeType) {
      browserFallbackFailedRef.current = true;
      setBrowserFallbackState('failed');
      toast.warning('Livestream vẫn tiếp tục, nhưng replay có thể không được lưu.');
      markBrowserRecordingFallbackFinished(effectiveSessionId, 'failed', 'No supported MediaRecorder mime type').catch(() => undefined);
      return;
    }

    try {
      const stream = new MediaStream([videoTrack, audioTrack]);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: useMobileLiveUi ? 700_000 : 1_200_000,
        audioBitsPerSecond: useMobileLiveUi ? 96_000 : 128_000,
      });
      browserFallbackStartedRef.current = true;
      browserFallbackFailedRef.current = false;
      browserFallbackChunkIndexRef.current = 0;
      browserFallbackUploadPromisesRef.current = [];
      browserFallbackUploadChainRef.current = Promise.resolve();
      browserFallbackLastChunkAtRef.current = Date.now();
      browserFallbackRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        const now = Date.now();
        const durationMs = Math.max(0, now - browserFallbackLastChunkAtRef.current);
        browserFallbackLastChunkAtRef.current = now;
        setBrowserFallbackState('uploading');
        uploadBrowserFallbackBlob(event.data, event.data.type || mimeType, durationMs);
      };
      recorder.onerror = (event) => {
        console.warn('[LiveHost] browser fallback recorder error:', event);
        browserFallbackFailedRef.current = true;
        setBrowserFallbackState('failed');
        markBrowserRecordingFallbackFinished(effectiveSessionId, 'failed', 'MediaRecorder error').catch(() => undefined);
        toast.warning('Livestream vẫn tiếp tục, nhưng replay có thể không được lưu.');
      };
      recorder.start(useMobileLiveUi ? FALLBACK_RECORDING_MOBILE_SLICE_MS : FALLBACK_RECORDING_DESKTOP_SLICE_MS);
      setBrowserFallbackState('recording');
      setRecordingState('recording');
      setRecordingError(null);
      markBrowserRecordingFallbackStarted(
        effectiveSessionId,
        'Agora Cloud Recording unavailable; browser fallback is recording chunks.',
      ).catch((error) => console.warn('[LiveHost] mark browser fallback started failed:', error));
      toast.warning('Livestream vẫn đang phát trực tiếp, nhưng hệ thống ghi replay chính đang quá tải. FUN Profile sẽ thử ghi dự phòng từ trình duyệt của bạn. Vui lòng không tắt tab cho đến khi kết thúc live.');
      toast.info('Đang ghi replay dự phòng từ trình duyệt.');
    } catch (error) {
      console.warn('[LiveHost] failed to start browser fallback recorder:', error);
      browserFallbackFailedRef.current = true;
      setBrowserFallbackState('failed');
      markBrowserRecordingFallbackFinished(effectiveSessionId, 'failed', readErrorString(error)).catch(() => undefined);
      toast.warning('Livestream vẫn tiếp tục, nhưng replay có thể không được lưu.');
    }
  }, [effectiveSessionId, getLocalTracks, uploadBrowserFallbackBlob, useMobileLiveUi]);

  const stopBrowserFallbackRecording = useCallback(async () => {
    const recorder = browserFallbackRecorderRef.current;
    if (!effectiveSessionId || !recorder || !browserFallbackStartedRef.current) return;
    setBrowserFallbackState('uploading');

    if (recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        const finish = () => resolve();
        recorder.addEventListener('stop', finish, { once: true });
        try {
          recorder.requestData();
          recorder.stop();
        } catch {
          resolve();
        }
      });
    }

    await browserFallbackUploadChainRef.current.catch(() => undefined);
    await Promise.allSettled(browserFallbackUploadPromisesRef.current);
    const failed = browserFallbackFailedRef.current || browserFallbackChunkIndexRef.current === 0;
    await markBrowserRecordingFallbackFinished(
      effectiveSessionId,
      failed ? 'failed' : 'uploaded',
      failed
        ? browserFallbackChunkIndexRef.current === 0
          ? 'Browser fallback ended without uploaded chunks'
          : 'One or more fallback chunks failed to upload'
        : undefined,
    ).catch((error) => console.warn('[LiveHost] mark browser fallback finished failed:', error));
    if (!failed) setBrowserFallbackState('uploaded');
    browserFallbackRecorderRef.current = null;
  }, [effectiveSessionId]);

  // Mark live host session active so AuthSessionKeeper / ChunkLoadRecovery skip disruptive reloads
  useEffect(() => {
    const liveWindow = window as Window & { __LIVE_ACTIVE__?: boolean };
    liveWindow.__LIVE_ACTIVE__ = true;
    window.dispatchEvent(new Event('funprofile:live-active-change'));
    return () => {
      liveWindow.__LIVE_ACTIVE__ = false;
      window.dispatchEvent(new Event('funprofile:live-active-change'));
    };
  }, []);

  useEffect(() => {
    if (!shouldUseBrowserFallback) {
      if (browserFallbackState === 'recommended') setBrowserFallbackState('idle');
      return;
    }
    if (browserFallbackState === 'idle') setBrowserFallbackState('recommended');
    if (!isJoined) return;
    startBrowserFallbackRecording();
  }, [browserFallbackState, isJoined, shouldUseBrowserFallback, startBrowserFallbackRecording]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      accessTokenRef.current = data.session?.access_token ?? null;
    });
    const { data } = supabase.auth.onAuthStateChange((event, authSession) => {
      const previousToken = accessTokenRef.current;
      accessTokenRef.current = authSession?.access_token ?? null;
      if (event === 'SIGNED_OUT' && effectiveSessionId && session?.host_user_id && session.host_user_id === userId && session?.status === 'live') {
        requestEndLiveKeepalive(effectiveSessionId, 'logout', previousToken).catch(() => undefined);
        leave().catch(() => undefined);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [effectiveSessionId, session?.host_user_id, userId, leave, session?.status]);

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
  const durationLimit = useLiveDurationLimit(session?.started_at, session?.mode || 'agora_webcam', session?.status === 'live' && isJoined);
  const { viewers } = useLivePresence(effectiveSessionId);
  const audienceViewers = useMemo(
    () => viewers.filter((viewer) => viewer.userId !== userId),
    [userId, viewers],
  );
  const {
    messages: liveMessages,
    sendMessage: sendLiveMessage,
    isLoading: liveMessagesLoading,
  } = useLiveMessages(effectiveSessionId);
  const {
    reactions: liveReactions,
    reactionCount,
    sendReaction,
  } = useLiveReactions(effectiveSessionId);

  useEffect(() => {
    if (!mobileChatOpen) return;
    const list = mobileChatListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [liveMessages.length, mobileChatOpen]);

  const handleSendMobileComment = useCallback(async () => {
    const value = mobileCommentText.trim();
    if (!value) return;
    try {
      await sendLiveMessage(value);
      setMobileCommentText('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể gửi bình luận';
      toast.error(message);
    }
  }, [mobileCommentText, sendLiveMessage]);

  const handleSendHostComment = useCallback(async (message: string) => {
    const value = message.trim();
    if (!value) return;
    try {
      await sendLiveMessage(value);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Khong the gui binh luan';
      toast.error(errorMessage);
      throw err;
    }
  }, [sendLiveMessage]);

  const finishAgoraUsage = useCallback(async (endReason: AgoraEndReason, status: 'failed' | 'ended' = 'ended') => {
    if (!effectiveSessionId) return;
    await finishAgoraUsageSession({
      liveSessionId: effectiveSessionId,
      status,
      endReason,
      peakViewers: Math.max(session?.viewer_count ?? 0, audienceViewers.length),
      totalViewerMinutes: null,
    });
  }, [audienceViewers.length, effectiveSessionId, session?.viewer_count]);

  // Sync viewer count from Presence → DB every 10s
  const viewerSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!effectiveSessionId || session?.status !== 'live') return;
    viewerSyncRef.current = setInterval(() => {
      const count = audienceViewers.length;
      if (lastSentViewerCountRef.current !== count) {
        lastSentViewerCountRef.current = count;
        updateLiveViewerCount(effectiveSessionId, count);
      }
    }, 10000);
    return () => {
      if (viewerSyncRef.current) clearInterval(viewerSyncRef.current);
    };
  }, [audienceViewers.length, effectiveSessionId, session?.status]);

  const isHost = useMemo(() => !!session && !!userId && session.host_user_id === userId, [session, userId]);
  const networkBadge = useMemo(() => {
    if (liveHealth === 'device_overloaded') return { label: 'Máy đang quá tải', className: 'text-yellow-100' };
    if (liveHealth === 'optimizing') return { label: 'Đang tối ưu', className: 'text-yellow-100' };
    if (liveHealth === 'good') return { label: 'Mạng ổn', className: 'text-emerald-100' };
    const uplink = networkQuality.uplinkNetworkQuality || 0;
    if (uplink >= 5) return { label: 'Mạng yếu', className: 'text-red-200' };
    if (uplink >= 4) return { label: 'Mạng chập chờn', className: 'text-yellow-100' };
    if (uplink > 0) return { label: 'Mạng ổn', className: 'text-emerald-100' };
    return null;
  }, [liveHealth, networkQuality.uplinkNetworkQuality]);

  // Heartbeat: backend-owned liveness every 10s.
  useLiveHeartbeat(effectiveSessionId, isHost, session?.status === 'live' && !manualEndingRef.current);
  useMusicAutoPause(true);

  useEffect(() => {
    if (durationLimit.latestWarningMinute == null || session?.status !== 'live') return;
    const unit = durationLimit.latestWarningMinute === 1 ? '1 phút' : `${durationLimit.latestWarningMinute} phút`;
    toast.warning(`Livestream sẽ tự động kết thúc sau ${unit} để đảm bảo chất lượng hệ thống.`);
  }, [durationLimit.latestWarningMinute, session?.status]);

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
        if (payload.new?.status && payload.new.status !== 'live') {
          const endReason = payload.new?.end_reason;
          if (endReason === 'duration_limit' || endReason === 'auto_duration_limit') {
            toast.warning('Livestream đã kết thúc tự động sau khi đạt giới hạn thời lượng.');
            leave().catch(() => undefined);
            navigate('/');
            return;
          }
          if (manualEndingRef.current || endReason === 'manual' || endReason === 'host_clicked_end') {
            leave().catch(() => undefined);
            return;
          }
          if (endReason !== 'superseded_by_new_live') {
            toast.info('Phiên live đã kết thúc.');
            leave().catch(() => undefined);
            navigate('/');
            return;
          }
          toast.info('Phiên live đã kết thúc vì bạn bắt đầu live từ thiết bị khác.');
          leave().catch(() => undefined);
          navigate('/');
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [effectiveSessionId, leave, navigate]);

  const runBootstrap = useCallback(async () => {
    setBootError(null);
    setFriendlyLiveError(null);
    setRecoveryAttempt(0);
    setBootState('auth');
    setCreatedSessionId(null);

    const authResult = await withTimeout(supabase.auth.getSession(), 15000, 'auth timeout');
    const currentUserId = authResult.data.session?.user?.id;
    if (!currentUserId) {
      throw new Error('Bạn cần đăng nhập để phát trực tiếp.');
    }
    setUserId(currentUserId);

    if (liveSessionId) {
      setBootState('loading');
      return;
    }

    setBootState('creating');
    const getRecordingLayoutHints = () => {
      const isMobileLike = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent)
        || window.matchMedia('(max-width: 767px)').matches;
      const isTabletLike = !isMobileLike && window.matchMedia('(max-width: 1024px)').matches;
      const viewportOrientation = window.innerHeight > window.innerWidth ? 'portrait' as const : 'landscape' as const;
      return {
        deviceType: isMobileLike ? 'mobile' as const : isTabletLike ? 'tablet' as const : 'desktop' as const,
        viewportOrientation,
        recordingAspectRatio: isMobileLike && viewportOrientation === 'portrait'
          ? 'portrait_9_16' as const
          : 'landscape_16_9' as const,
      };
    };

    // Auto-retry 1 lần khi tạo session bị lỗi tạm thời (timeout / network)
    const createWithRetry = async () => {
      try {
        return await withTimeout(
          startWebcamLiveSessionBackend({
            privacy: preLiveState?.privacy === 'friends' ? 'friends' : 'public',
            title: preLiveState?.title,
            quality: preLiveState?.quality,
            audioMode: preLiveState?.audioMode,
            ...getRecordingLayoutHints(),
          }),
          45000,
          'create live session timeout'
        );
      } catch (err) {
        if (!isTransientError(err)) throw err;
        console.warn('[LiveHost] createLiveSession failed, retrying once:', err);
        await new Promise((r) => setTimeout(r, 1000));
        return await withTimeout(
          startWebcamLiveSessionBackend({
            privacy: preLiveState?.privacy === 'friends' ? 'friends' : 'public',
            title: preLiveState?.title,
            quality: preLiveState?.quality,
            audioMode: preLiveState?.audioMode,
            ...getRecordingLayoutHints(),
          }),
          45000,
          'create live session timeout'
        );
      }
    };

    const created = await createWithRetry();
    setCreatedSessionId(created.sessionId);
    sessionFirstSeenAtRef.current[created.sessionId] = Date.now();

    // Prime react-query cache tránh race read-replica: dùng dữ liệu vừa nhận
    // từ edge để render ngay, không phải chờ SELECT về.
    const nowIso = new Date().toISOString();
    const primedSession = {
      id: created.sessionId,
      host_user_id: currentUserId,
      user_id: currentUserId,
      owner_id: currentUserId,
      mode: 'agora_webcam',
      status: 'live',
      recording_status: 'acquiring',
      recording_provider: 'agora',
      agora_channel: created.channel,
      agora_channel_name: created.channel,
      channel_name: created.channel,
      agora_uid: created.uid,
      agora_uid_host: created.uid,
      title: preLiveState?.title || null,
      privacy: preLiveState?.privacy === 'friends' ? 'friends' : 'public',
      viewer_count: 0,
      host_connection_status: 'online',
      started_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      last_seen_at: nowIso,
      last_host_heartbeat_at: nowIso,
      host_profile: null,
    } as any;
    queryClient.setQueryData(['live-session', created.sessionId], primedSession);

    // Create chunked_recordings row for DB tracking
    if (CHUNKED_RECORDING_ENABLED && created.fallbackRecordingRecommended) {
      try {
        const recId = await createChunkedRecording(
          currentUserId,
          created.sessionId,
          created.channel,
          'video/webm;codecs=vp8,opus'
        );
        setRecordingId(recId);
      } catch (err) {
        console.warn('[LiveHost] createChunkedRecording failed:', err);
      }
    }

    setBootState('loading');
    navigate(`/live/${created.sessionId}/host`, { replace: true });
  }, [liveSessionId, navigate, preLiveState?.audioMode, preLiveState?.privacy, preLiveState?.quality, preLiveState?.title, queryClient]);

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
    if (sessionQuery.isLoading || sessionQuery.isFetching) return;
    if (sessionQuery.isError) {
      setBootState('error');
      setBootError('Không tải được phiên LIVE. Vui lòng thử lại.');
      return;
    }
    if (!session) {
      // Grace period: replication lag / realtime miss có thể khiến maybeSingle
      // trả null ngay sau khi tạo. Chỉ báo lỗi sau khi đã chờ đủ lâu.
      const firstSeen = sessionFirstSeenAtRef.current[effectiveSessionId] || Date.now();
      const elapsed = Date.now() - firstSeen;
      const gracePeriod = effectiveSessionId === createdSessionId ? 6000 : 4000;
      if (elapsed < gracePeriod) {
        const remaining = gracePeriod - elapsed + 100;
        const timer = setTimeout(() => {
          sessionQuery.refetch().catch(() => undefined);
        }, remaining);
        return () => clearTimeout(timer);
      }
      logger.warn('[LiveHost] session not found after grace period', {
        sessionId: effectiveSessionId,
        source: effectiveSessionId === createdSessionId ? 'just-created' : 'from-url',
      });
      setBootState('error');
      setFriendlyLiveError(buildSessionNotFoundError());
      setBootError(null);
      return;
    }
    if (bootState !== 'starting') {
      setBootState('ready');
    }
  }, [bootState, createdSessionId, effectiveSessionId, session, sessionQuery, sessionQuery.isError, sessionQuery.isFetching, sessionQuery.isLoading]);

  // Start Agora RTC + Browser Recording (legacy path only)
  useEffect(() => {
    if (!session || !isHost || ['ended', 'failed', 'archived'].includes(session.status) || startedRef.current) return;
    startedRef.current = true;
    setBootState('starting');

    let cancelled = false;
    const runStartWithRetry = async () => {
      const maxAttempts = 3;
      let lastFriendly: FriendlyLiveError | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (cancelled) return;
        setRecoveryAttempt(attempt);
        if (attempt > 1) setBootError('Đang khôi phục kết nối LIVE...');

        try {
          const startTimeoutMs = useMobileLiveUi ? LIVE_START_TIMEOUT_MOBILE_MS : LIVE_START_TIMEOUT_DESKTOP_MS;
          await withTimeout(start(), startTimeoutMs, 'LIVE_START_TIMEOUT');
          if (cancelled) return;
          setRecoveryAttempt(0);
          setFriendlyLiveError(null);
          setBootError(null);
          setBootState('ready');

          if (!agoraUsageStartedRef.current && effectiveSessionId) {
            agoraUsageStartedRef.current = true;
            await startAgoraUsageSession({
              liveSessionId: effectiveSessionId,
              channelName: session.agora_channel || session.channel_name,
              agoraUid: session.agora_uid_host ?? session.agora_uid ?? null,
              streamType: useMobileLiveUi ? 'mobile' : 'webcam',
            });
          }

          if (
            effectiveSessionId &&
            !recordingEnsureStartedRef.current &&
            !['recording', 'starting', 'stopping', 'stopped', 'ready'].includes(session.recording_status || '')
          ) {
            recordingEnsureStartedRef.current = true;
            ensureWebcamLiveRecordingStarted(effectiveSessionId)
              .then((result) => {
                if (!result.ok) {
                  setRecordingState('failed');
                  setRecordingError('Livestream vẫn tiếp tục, nhưng replay có thể đang xử lý lỗi.');
                  toast.warning('Livestream vẫn tiếp tục, nhưng replay có thể đang xử lý lỗi.');
                }
              })
              .catch((error) => {
                console.warn('[LiveHost] ensure webcam recording failed:', error);
                setRecordingError('Livestream vẫn tiếp tục, nhưng replay có thể đang xử lý lỗi.');
                toast.warning('Livestream vẫn tiếp tục, nhưng replay có thể đang xử lý lỗi.');
              });
          }

          // Legacy single-blob recording (when chunked is disabled)
          if (false) {
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
                setRecordingError('Không lấy được track video/audio để ghi hình.');
              }
            } catch (recErr: any) {
              setRecordingState('failed');
              setRecordingError(recErr?.message || 'Không thể bắt đầu ghi hình.');
              toast.error('Không thể bắt đầu ghi hình bằng trình duyệt.');
            }
          }
          return;
        } catch (error) {
          lastFriendly = toFriendlyLiveError(error);
          console.error('[LiveHost] Agora start failed:', {
            liveSessionId: effectiveSessionId,
            attempt,
            code: lastFriendly.code,
            internalMessage: lastFriendly.internalMessage,
            error,
          });

          await leave().catch(() => undefined);
          if (!lastFriendly.retryable || attempt >= maxAttempts) break;
          setBootError(lastFriendly.statusText || 'Đang khôi phục kết nối LIVE...');
          await new Promise((resolve) => setTimeout(resolve, 2000 + attempt * 1000));
        }
      }

      if (cancelled) return;
      const friendly = lastFriendly ?? toFriendlyLiveError(new Error('LIVE_UNKNOWN_ERROR'));
      startedRef.current = false;
      setRecoveryAttempt(0);
      setBootState('error');
      setBootError(friendly.message);
      setFriendlyLiveError(friendly);
      toast.error(friendly.title, { description: friendly.message });

      if (effectiveSessionId) {
        const endReason: AgoraEndReason =
          friendly.code === 'AGORA_QUOTA_EXCEEDED'
            ? 'quota_limit'
            : friendly.code === 'LIVE_NETWORK_ERROR' || friendly.code === 'LIVE_TIMEOUT'
              ? 'network_error'
              : 'agora_failed';
        await recordAgoraUsageError({
          liveSessionId: effectiveSessionId,
          errorCode: friendly.code,
          errorMessageInternal: friendly.internalMessage,
          endReason,
        });
        await finishAgoraUsage(endReason, 'failed');
        await markLiveSessionFailed(effectiveSessionId, {
          endReason,
          errorCode: friendly.code,
          errorMessageInternal: friendly.internalMessage,
        }).catch((err) => console.warn('[LiveHost] mark failed session failed:', err));
      }
    };

    runStartWithRetry();
    return () => {
      cancelled = true;
    };
  }, [effectiveSessionId, finishAgoraUsage, getLocalTracks, isHost, leave, session, start, useMobileLiveUi]);

  useEffect(() => {
    if (session?.status === 'ended') {
      if (manualEndingRef.current || endFlowState !== 'idle') {
        setEndFlowState('ended');
      }
      leave().catch(() => undefined);
    }
  }, [endFlowState, leave, session?.status]);

  useEffect(() => {
    return () => {
      if (viewerCountTimerRef.current) {
        clearTimeout(viewerCountTimerRef.current);
      }
      stopBrowserFallbackRecording().catch(() => undefined);
      leave().catch(() => undefined);
    };
  }, [leave, stopBrowserFallbackRecording]);

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

  const pollWebcamReplayStatus = (liveSessionId: string) => {
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const status = await getWebcamLiveStatus(liveSessionId);
        if (status.status === 'ready') {
          window.dispatchEvent(new Event('invalidate-feed'));
          toast.success('Replay đã sẵn sàng.');
          return;
        }
        if (status.status === 'failed') {
          toast.error(status.error_message || 'Replay xử lý thất bại. Vui lòng kiểm tra log backend.');
          return;
        }
      } catch (error) {
        console.warn('[LiveHost] replay status poll failed:', error);
      }
      if (attempts < 40) window.setTimeout(tick, 7500);
    };
    window.setTimeout(tick, 7500);
  };

  const handleEndLive = async (skipNavigate = false, reason: LiveEndReason = 'host_clicked_end') => {
    if (!effectiveSessionId) return;
    if (endingRequestRef.current) return;
    endingRequestRef.current = true;
    manualEndingRef.current = true;
    setEndFlowState('ending');
    setShowEndConfirm(false);
    setRecordingState((current) => current === 'ready' ? current : 'stopping');
    if (viewerCountTimerRef.current) {
      clearTimeout(viewerCountTimerRef.current);
      viewerCountTimerRef.current = null;
    }

    let playbackUrl: string | null = null;
    let recordingStatus: RecordingStatus = 'failed';
    let thumbnailUrl: string | null = null;

    try {
      await endLiveSessionBackend(effectiveSessionId, reason);
      await stopBrowserFallbackRecording();

      // === CHUNKED RECORDING PATH ===
      // KHÔNG chặn UI: dừng ghi xong là điều hướng về feed ngay,
      // còn việc flush chunk + ingest sang Cloudflare chạy ngầm.
      if (false) {
        setRecordingState('stopping');

        // Background finalize — không await
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
                endReason: reason,
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

        await finishAgoraUsage('user_ended', 'ended');
        await leave();
        evaluateAsync({ action_type: 'livestream', reference_id: effectiveSessionId });
        toast.success('Đã kết thúc live. Replay đang xử lý ngầm — sẽ tự xuất hiện trong vài phút.');
        if (!skipNavigate) navigate('/');
        return;
      }

      // === LEGACY SINGLE-BLOB PATH (giữ nguyên cho fallback) ===
      setRecordingState('processing');
      await finishAgoraUsage('user_ended', 'ended');
      await leave();
      evaluateAsync({ action_type: 'livestream', reference_id: effectiveSessionId });
      pollWebcamReplayStatus(effectiveSessionId);
      window.dispatchEvent(new Event('invalidate-feed'));
      setEndFlowState('ended');
      toast.success('Đã kết thúc live. Video replay đang được xử lý.');
      if (skipNavigate) return;
      return;

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
          setRecordingError('Video trống, không thể lưu replay.');
        }
      } else {
        setRecordingState('failed');
        setRecordingError('Không có bản ghi nào đang hoạt động.');
      }

      await finalizeLiveSession(effectiveSessionId, { playbackUrl, recordingStatus, endReason: reason });
      if (playbackUrl && recordingStatus === 'ready') {
        try {
          await attachLiveReplayToPost(effectiveSessionId, playbackUrl, undefined, thumbnailUrl);
        } catch (attachErr) {
          console.warn('[LiveHost] attachLiveReplayToPost failed:', attachErr);
        }
      }

      await finishAgoraUsage('user_ended', 'ended');
      await leave();
      evaluateAsync({ action_type: 'livestream', reference_id: effectiveSessionId });
      toast.success('Live đã kết thúc!');
      if (!skipNavigate) {
        return;
      }
    } catch (error: any) {
      manualEndingRef.current = false;
      endingRequestRef.current = false;
      setEndFlowState('failed');
      setRecordingState((current) => current === 'stopping' ? 'recording' : current);
      toast.error('Không thể kết thúc livestream lúc này. Vui lòng thử lại.');
    }
  };

  const clearEndCountdownTimer = useCallback(() => {
    if (endCountdownTimerRef.current !== null) {
      window.clearInterval(endCountdownTimerRef.current);
      endCountdownTimerRef.current = null;
    }
  }, []);

  const beginHostEndFlow = useCallback(() => {
    if (!effectiveSessionId || endingRequestRef.current || endFlowState === 'countdown' || endFlowState === 'ending') return;
    manualEndingRef.current = true;
    setShowEndConfirm(false);
    setEndFlowState('countdown');
    setEndCountdown(5);
    clearEndCountdownTimer();
    endCountdownTimerRef.current = window.setInterval(() => {
      setEndCountdown((prev) => {
        if (prev <= 1) {
          clearEndCountdownTimer();
          void handleEndLive(false, 'host_clicked_end');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [effectiveSessionId, endFlowState, clearEndCountdownTimer]);

  const cancelHostEndFlow = useCallback(() => {
    if (endFlowState !== 'countdown') return;
    clearEndCountdownTimer();
    manualEndingRef.current = false;
    setEndCountdown(5);
    setEndFlowState('idle');
    toast.info('Đã hủy. Bạn vẫn đang phát trực tiếp.');
  }, [endFlowState, clearEndCountdownTimer]);

  useEffect(() => () => { clearEndCountdownTimer(); }, [clearEndCountdownTimer]);


  const handleRetry = () => {
    startedRef.current = false;
    agoraUsageStartedRef.current = false;
    setCreatedSessionId(null);
    setRecordingId(null);
    setBootError(null);
    setFriendlyLiveError(null);
    setRecoveryAttempt(0);
    setBootState('idle');
    setRetryNonce((x) => x + 1);
  };

  const handleContactSupport = () => {
    toast.info('Bạn có thể gửi tin nhắn cho Admin FUN Profile trong mục Chat để được hỗ trợ.');
    navigate('/chat');
  };

  const isEnding = ['stopping', 'compressing', 'processing'].includes(recordingState)
    || endFlowState === 'countdown'
    || endFlowState === 'ending';
  const hostUiState = useMemo<HostLiveUiState>(() => {
    if (bootState === 'error' || session?.status === 'failed' || recordingState === 'failed') return 'failed';
    if (recordingState === 'ready' || session?.recording_status === 'ready') return 'replay_ready';
    if (recordingState === 'compressing' || recordingState === 'processing' || session?.status === 'processing_replay' || session?.status === 'processing') {
      return 'processing_replay';
    }
    if (recordingState === 'stopping') return 'ending';
    if (session?.status === 'reconnecting') return 'reconnecting';
    if (session?.status === 'live' && (!isJoined || liveHealth === 'network_weak' || statusText.toLowerCase().includes('ket noi lai') || statusText.toLowerCase().includes('reconnect'))) {
      return 'reconnecting';
    }
    if (session?.status === 'live' && isJoined) return 'live';
    return 'loading';
  }, [bootState, isJoined, liveHealth, recordingState, session?.recording_status, session?.status, statusText]);

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

  // Auto-end policy (07/2026, updated):
  // - offline > 60s ⇒ end với reason `host_network_lost`.
  // - pagehide (persisted=false) ⇒ beacon end với reason `host_pagehide`.
  // - beforeunload: giữ nguyên confirm dialog, KHÔNG tự end (chờ pagehide).
  // - visibilitychange=hidden KHÔNG còn tự end: mobile lock screen / kéo
  //   notification / chuyển app trả lời tin nhắn đều trigger hidden và cắt
  //   live giữa chừng (bug angelthutrang 15/07). Nếu tab thật sự chết,
  //   backend heartbeat cutoff 60s (`live-zombie-cleanup` + `duration-watchdog`)
  //   sẽ dọn với `host_disconnected_timeout` — vẫn có lưới an toàn.
  useEffect(() => {
    if (!shouldBlock || !effectiveSessionId) return;
    const AUTO_END_TICKS = 60;
    let ended = false;

    const clearAutoEndTimer = () => {
      if (autoEndTimerRef.current !== null) {
        window.clearInterval(autoEndTimerRef.current);
        autoEndTimerRef.current = null;
      }
    };

    const attemptEnd = (reason: LiveEndReason) => {
      if (ended) return;
      ended = true;
      clearAutoEndTimer();
      setAutoEndReason(null);
      // Fire-and-forget: leave() dọn Agora, handleEndLive dọn recording + post feed.
      void handleEndLive(true, reason);
    };

    const startCountdown = (reason: 'network', endReason: LiveEndReason) => {
      if (ended) return;
      clearAutoEndTimer();
      setAutoEndReason(reason);
      setAutoEndCountdown(AUTO_END_TICKS);
      autoEndTimerRef.current = window.setInterval(() => {
        setAutoEndCountdown((prev) => {
          if (prev <= 1) {
            attemptEnd(endReason);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };
    const cancelCountdown = () => {
      clearAutoEndTimer();
      setAutoEndReason(null);
    };

    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const pageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return; // vào bfcache — chưa đóng thật
      if (ended) return;
      ended = true;
      void sendWebcamLiveStopBeacon(effectiveSessionId, 'host_pagehide');
    };
    const onOffline = () => startCountdown('network', 'host_network_lost');
    const onOnline = () => cancelCountdown();

    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) onOffline();


    return () => {
      clearAutoEndTimer();
      setAutoEndReason(null);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('offline', onOffline);

      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSessionId, shouldBlock]);


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
    await handleEndLive(true, 'route_change');
    setShowLeaveDialog(false);
    if (pendingNavigationRef.current) {
      navigate(pendingNavigationRef.current);
      pendingNavigationRef.current = null;
    } else {
      navigate('/');
    }
  };

  const showLoader =
    ['idle', 'auth', 'creating', 'loading'].includes(bootState) ||
    (!!effectiveSessionId && sessionQuery.isLoading) ||
    (bootState === 'starting' && (!session || !isHost));

  if (showLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>
            {recoveryAttempt > 1
              ? `${bootError || statusText || 'Đang khôi phục kết nối LIVE...'} (${recoveryAttempt}/3)`
              : bootState === 'creating'
              ? 'Đang tạo phiên LIVE...'
              : bootState === 'starting'
                ? bootError || statusText || 'Đang kết nối...'
                : 'Đang tải...'}
          </span>
        </div>
      </div>
    );
  }

  if (bootState === 'error') {
    const title = friendlyLiveError?.title || LIVE_CONNECT_ERROR_TITLE;
    const rawMessage = friendlyLiveError?.message || bootError || '';
    const message = !rawMessage || rawMessage === '[object Object]' ? LIVE_CONNECT_ERROR_MESSAGE : rawMessage;
    const isNotFound = friendlyLiveError?.code === 'LIVE_SESSION_NOT_FOUND';
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        <div className="pt-20 px-4 max-w-xl mx-auto">
          <Card className="p-6 space-y-4 border-amber-200 bg-amber-50/40 shadow-lg">
            <div className="font-semibold text-lg text-foreground">{title}</div>
            <div className="text-sm leading-6 text-muted-foreground">{message}</div>
            <div className="flex flex-wrap items-center gap-2">
              {isNotFound ? (
                <Button onClick={() => navigate('/live/setup')}>
                  <Radio className="h-4 w-4 mr-2" />
                  Bắt đầu LIVE mới
                </Button>
              ) : (
                <Button onClick={handleRetry}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Thử lại
                </Button>
              )}
              <Button variant="secondary" onClick={handleContactSupport}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Liên hệ hỗ trợ
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                <Home className="h-4 w-4 mr-2" />
                Đóng
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
  const hasEndedHostLive = endFlowState === 'ended' || session.status === 'ended';
  const showNetworkOverlay = autoEndReason === 'network' && endFlowState === 'idle';
  const showEndOverlay = endFlowState === 'countdown' || endFlowState === 'ending' || showNetworkOverlay;
  const overlayTitle = showNetworkOverlay
    ? `Mất kết nối — chờ khôi phục ${autoEndCountdown}s`
    : endFlowState === 'countdown'
      ? 'Đang kết thúc buổi phát trực tiếp…'
      : 'Đang kết thúc buổi phát trực tiếp…';
  const canCancel = endFlowState === 'countdown' && endCountdown > 0;
  const endFlowOverlay = showEndOverlay ? (
    <div
      className="fixed inset-0 z-[100] flex h-[100dvh] flex-col items-center justify-center gap-6 bg-black/85 px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center text-white backdrop-blur-md"
      role="dialog"
      aria-live="polite"
    >
      <div
        className="h-16 w-16 rounded-full border-[5px] border-white/25 border-t-primary animate-spin"
        aria-hidden="true"
      />
      <div className="max-w-xs text-lg font-medium leading-snug">
        {overlayTitle}
      </div>
      {canCancel ? (
        <button
          type="button"
          onClick={cancelHostEndFlow}
          className="rounded-md bg-white/15 px-8 py-2.5 text-base font-medium text-white transition hover:bg-white/25 active:scale-95"
        >
          Hủy
        </button>
      ) : null}
      {showNetworkOverlay ? (
        <p className="max-w-xs text-xs text-white/60">
          Khi có mạng trở lại, buổi phát sẽ tiếp tục. Nếu hết {autoEndCountdown}s mà chưa khôi phục, buổi phát sẽ tự lưu và đăng lên feed.
        </p>
      ) : null}
    </div>
  ) : null;


  if (hasEndedHostLive) {
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        <main className="flex min-h-screen items-center justify-center px-4 py-20">
          <Card className="w-full max-w-lg p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-black">Livestream đã kết thúc</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Video đang được xử lý và sẽ sớm hiển thị trên bài viết.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => navigate('/')} className="gap-2">
                <Home className="h-4 w-4" />
                Quay về Feed
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(session.post_id ? `/post/${session.post_id}` : '/')}
                className="gap-2"
              >
                <Link2 className="h-4 w-4" />
                Xem bài viết
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  if (useMobileLiveUi) {
    return (
      <div className="fixed inset-0 z-50 h-[100dvh] overflow-hidden overscroll-none bg-black text-white">
        {endFlowOverlay}
        <div
          ref={setLocalContainerRef}
          className="absolute inset-0 h-[100dvh] w-full bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-contain [&_video]:object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/0 to-black/85 pointer-events-none" />

        {!isJoined && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 text-center text-white/90">
            <div className="rounded-2xl bg-black/45 px-4 py-3 backdrop-blur">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
              <div className="text-sm font-medium">{statusText}</div>
            </div>
          </div>
        )}

        {effectiveSessionId && <FloatingReactions sessionId={effectiveSessionId} />}

        <div className="absolute left-0 right-0 top-0 z-20 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <button
              onClick={() => guardedNavigate('/')}
              className="mt-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/30 backdrop-blur"
              aria-label="Quay lại"
            >
              <ArrowLeft className="h-7 w-7" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded bg-red-600 px-2.5 py-1 text-sm font-black uppercase tracking-wide">Trực tiếp</span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-white/85">
                  <Globe2 className="h-4 w-4" />
                  Công khai
                </span>
              </div>
              <div className="mt-2 line-clamp-2 text-lg font-bold drop-shadow">
                {session.title || 'Đang LIVE trên FUN Profile'}
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-white/75">
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{durationLimit.combinedLabel}</span>
                <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{audienceViewers.length}</span>
                <span>{recBadge.label}</span>
                {networkBadge && <span className={networkBadge.className}>{networkBadge.label}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="absolute right-3 top-[calc(6.25rem+env(safe-area-inset-top))] z-20 flex flex-col items-end gap-3">
          <button
            onClick={toggleMute}
            disabled={!isJoined || isEnding}
            className="flex items-center justify-end gap-3 font-semibold drop-shadow disabled:opacity-50"
          >
            <span className="hidden min-[380px]:inline text-sm">{isMuted ? 'Bật micrô' : 'Tắt tiếng micrô'}</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 shadow-lg backdrop-blur-md">
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </span>
          </button>
          <button
            onClick={toggleCamera}
            disabled={!isJoined || isEnding}
            className="flex items-center justify-end gap-3 font-semibold drop-shadow disabled:opacity-50"
          >
            <span className="hidden min-[380px]:inline text-sm">{isCameraOff ? 'Bật camera' : 'Tắt camera'}</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 shadow-lg backdrop-blur-md">
              {isCameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
            </span>
          </button>
          <button
            onClick={async () => {
              const ok = await switchCamera();
              if (!ok) toast.error('Không thể xoay camera trên thiết bị này.');
            }}
            disabled={!isJoined || isEnding || isCameraOff || isSwitchingCamera}
            className="flex items-center justify-end gap-3 font-semibold drop-shadow disabled:opacity-50"
          >
            <span className="hidden min-[380px]:inline text-sm">{isSwitchingCamera ? 'Đang xoay...' : 'Xoay'}</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 shadow-lg backdrop-blur-md">
              {isSwitchingCamera ? <Loader2 className="h-6 w-6 animate-spin" /> : <SwitchCamera className="h-6 w-6" />}
            </span>
          </button>
          <button className="flex items-center justify-end gap-3 font-semibold drop-shadow">
            <span className="hidden min-[380px]:inline text-sm">Tính năng cải thiện</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 shadow-lg backdrop-blur-md">
              <Wand2 className="h-6 w-6" />
            </span>
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-20 space-y-3 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-16">
          <div className="pointer-events-auto rounded-2xl bg-black/30 p-2 shadow-2xl shadow-black/30 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMobileChatOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-2 text-left text-white/85"
            >
              <span className="flex min-w-0 items-center gap-2">
                <MessageCircle className="h-7 w-7 shrink-0" />
                <span className="truncate text-sm">
                  {liveMessages.length > 0
                    ? `${liveMessages.length} bình luận trực tiếp`
                    : 'Bình luận sẽ xuất hiện tại đây'}
                </span>
              </span>
              {mobileChatOpen ? <X className="h-5 w-5 shrink-0" /> : <span className="text-xs text-white/60">Mở</span>}
            </button>

            {mobileChatOpen && (
              <div className="mt-2 space-y-2">
                <div ref={mobileChatListRef} className="max-h-[28vh] overflow-y-auto overscroll-contain pr-1">
                  {liveMessagesLoading && (
                    <div className="py-2 text-xs text-white/60">Đang tải bình luận...</div>
                  )}
                  {!liveMessagesLoading && liveMessages.length === 0 && (
                    <div className="py-2 text-xs text-white/60">Chưa có bình luận nào.</div>
                  )}
                  <div className="space-y-2">
                    {liveMessages.slice(-80).map((msg) => (
                      <div key={msg.id} className="rounded-xl bg-black/35 px-3 py-2 text-sm">
                        <span className="font-semibold text-white">
                          {msg.profile?.username || 'User'}
                        </span>
                        <span className="ml-2 text-white/90">{msg.content}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    value={mobileCommentText}
                    onChange={(event) => setMobileCommentText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSendMobileComment();
                      }
                    }}
                    disabled={isEnding}
                    placeholder="Viết bình luận..."
                    className="h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-white/15 px-4 text-[16px] text-white placeholder:text-white/55 outline-none focus:border-white/45 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={handleSendMobileComment}
                    disabled={isEnding || !mobileCommentText.trim()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black disabled:opacity-50"
                    aria-label="Gửi bình luận"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {!mobileChatOpen && liveMessages.length > 0 && (
              <div className="mt-2 space-y-1">
                {liveMessages.slice(-2).map((msg) => (
                  <div key={msg.id} className="truncate text-xs text-white/75">
                    <span className="font-semibold text-white/90">{msg.profile?.username || 'User'}:</span>{' '}
                    {msg.content}
                  </div>
                ))}
              </div>
            )}
          </div>
          {recordingError && (
            <div className="rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-100 backdrop-blur">
              Ghi hình: {recordingError}
            </div>
          )}
          {isEnding && (
            <div className="rounded-lg bg-black/45 px-3 py-2 text-xs text-white/85 backdrop-blur">
              Đang xử lý replay... {Math.max(uploadProgress, compressProgress)}%
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
            <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><Link2 className="h-6 w-6" /></button>
            <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><BarChart3 className="h-6 w-6" /></button>
            <button className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><Sparkles className="h-6 w-6" /></button>
            <button
              onClick={() => {
                setEndFlowState('confirming');
                setShowEndConfirm(true);
              }}
              disabled={isEnding}
              className="min-w-[104px] rounded-xl bg-white px-4 py-3 font-bold text-black disabled:opacity-60"
            >
              {isEnding ? 'Đang xử lý' : 'Kết thúc'}
            </button>
          </div>
        </div>

        <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rời khỏi Live Stream?</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn đang phát trực tiếp. Nếu rời đi, buổi live sẽ kết thúc và video sẽ được lưu lại.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowLeaveDialog(false)}>Ở lại</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmLeave}>Kết thúc & Rời đi</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={false} onOpenChange={setShowEndConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bạn có chắc kết thúc buổi Live Stream?</AlertDialogTitle>
              <AlertDialogDescription>
                Buổi live sẽ kết thúc và video replay sẽ được lưu lại.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Ở lại</AlertDialogCancel>
              <AlertDialogAction onClick={beginHostEndFlow} disabled={isEnding}>
                {isEnding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Kết thúc
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <EndLiveConfirmDialog
          open={showEndConfirm}
          onOpenChange={setShowEndConfirm}
          ending={isEnding}
          onConfirm={beginHostEndFlow}
        />
      </div>
    );
  }

  if (!useMobileLiveUi && effectiveSessionId) {
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        {endFlowOverlay}
        <WebcamHostLivePage
          session={session}
          sessionId={effectiveSessionId}
          uiState={hostUiState}
          liveDuration={liveDuration}
          durationLimit={durationLimit}
          viewers={audienceViewers}
          messages={liveMessages}
          messagesLoading={liveMessagesLoading}
          reactions={liveReactions}
          reactionCount={reactionCount}
          recording={{
            state: recordingState,
            error: recordingError,
            uploadProgress,
            compressProgress,
            chunkedEnabled: CHUNKED_RECORDING_ENABLED,
            uploadStats: recording.uploadStats,
            streamUploadProgress: recording.streamUploadProgress,
          }}
          isJoined={isJoined}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isSwitchingCamera={isSwitchingCamera}
          isEnding={isEnding}
          statusText={statusText}
          liveHealth={liveHealth}
          networkQuality={networkQuality}
          previewStats={hostPreviewStats}
          setLocalContainerRef={setLocalContainerRef}
          onSendMessage={handleSendHostComment}
          onReact={sendReaction}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onSwitchCamera={async () => {
            const ok = await switchCamera();
            if (!ok) toast.error('Khong the doi camera tren thiet bi nay.');
            return ok;
          }}
          onRequestEnd={() => {
            setEndFlowState('confirming');
            setShowEndConfirm(true);
          }}
          onViewPost={() => navigate(session.post_id ? `/post/${session.post_id}` : '/')}
          setShowEndConfirm={setShowEndConfirm}
        />
        <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Roi khoi Live Stream?</AlertDialogTitle>
              <AlertDialogDescription>
                Ban dang phat truc tiep. Neu roi di, buoi live se ket thuc va video se duoc luu lai.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowLeaveDialog(false)}>O lai</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmLeave}>Ket thuc & roi di</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <EndLiveConfirmDialog
          open={showEndConfirm}
          onOpenChange={setShowEndConfirm}
          ending={isEnding}
          onConfirm={beginHostEndFlow}
        />
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
                    {durationLimit.combinedLabel}
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
                  {audienceViewers.length}
                </Badge>
              </div>
            </div>

            {recordingError ? (
              <Card className="p-3 text-sm border-destructive/30 text-destructive">
                Ghi hình: {recordingError}
              </Card>
            ) : null}


            {recordingState === 'stopping' && (
              <Card className="p-3 text-sm border-primary/30 text-primary flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang dừng ghi hình...
              </Card>
            )}

            {recordingState === 'compressing' && (
              <Card className="p-4 border-primary/30">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Đang nén video...
                  </span>
                  <span className="ml-auto text-sm font-mono font-bold text-primary">
                    {compressProgress}%
                  </span>
                </div>
                <Progress value={compressProgress} className="h-2.5" />
                <p className="text-xs text-muted-foreground mt-2">
                  ⚠️ Vui lòng không đóng tab — đang nén video để giảm dung lượng
                </p>
              </Card>
            )}

            {recordingState === 'processing' && CHUNKED_RECORDING_ENABLED && (
              <Card className="p-4 border-primary/30">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">
                    {recording.streamUploadProgress > 0 ? 'Đang tải replay lên Cloudflare Stream...' : recording.uploadStats.total > 0
                      ? `Đang tải lên chunk ${recording.uploadStats.uploaded}/${recording.uploadStats.total}...`
                      : 'Đang xử lý...'}
                  </span>
                  <span className="ml-auto text-sm font-mono font-bold text-primary">
                    {uploadProgress}%
                  </span>
                </div>
                <Progress value={uploadProgress} className="h-2.5" />
                <p className="text-xs text-muted-foreground mt-2">
                  ⚠️ Chunked upload — video sẽ được lưu an toàn từng phần
                </p>
              </Card>
            )}

            {recordingState === 'processing' && !CHUNKED_RECORDING_ENABLED && (
              <Card className="p-4 border-primary/30">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Đang tải video lên...
                  </span>
                  <span className="ml-auto text-sm font-mono font-bold text-primary">
                    {uploadProgress}%
                  </span>
                </div>
                <Progress value={uploadProgress} className="h-2.5" />
                <p className="text-xs text-muted-foreground mt-2">
                  ⚠️ Vui lòng không đóng tab — video sẽ bị mất nếu thoát trang
                </p>
              </Card>
            )}


            <Card className="overflow-hidden">
              <div className="aspect-video bg-black relative">
                <div
                  ref={setLocalContainerRef}
                  className="h-full w-full bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-contain [&_video]:object-center"
                />
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
              <Button
                variant="outline"
                onClick={async () => {
                  const ok = await switchCamera();
                  if (!ok) toast.error('Không thể xoay camera trên thiết bị này.');
                }}
                disabled={!isJoined || isEnding || isCameraOff || isSwitchingCamera}
              >
                {isSwitchingCamera ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <SwitchCamera className="h-4 w-4 mr-2" />}
                {isSwitchingCamera ? 'Switching...' : 'Switch Camera'}
              </Button>
              <Button variant="destructive" onClick={() => setShowEndConfirm(true)} disabled={isEnding}>
                {isEnding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PhoneOff className="h-4 w-4 mr-2" />}
                {isEnding ? 'Đang xử lý...' : 'End Live'}
              </Button>
            </div>
          </section>

          {effectiveSessionId && <LiveChatPanel sessionId={effectiveSessionId} isHost={true} liveTitle={session?.title || undefined} className="h-[70vh] lg:h-[calc(100vh-120px)]" viewers={audienceViewers} />}
        </div>
      </main>
      {/* Navigation guard dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rời khỏi Live Stream?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn đang phát trực tiếp. Nếu rời đi, buổi live sẽ kết thúc và video sẽ được lưu lại.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowLeaveDialog(false)}>Ở lại</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLeave}>Kết thúc & Rời đi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* End Live confirmation dialog */}
      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn có chắc kết thúc buổi Live Stream?</AlertDialogTitle>
            <AlertDialogDescription>
              Buổi live sẽ kết thúc và video sẽ được lưu lại.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ở lại</AlertDialogCancel>
              <AlertDialogAction onClick={beginHostEndFlow} disabled={isEnding}>
                {isEnding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Kết thúc
              </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
