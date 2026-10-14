import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, RadioTower, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { type ChecklistStep, type ChecklistStepStatus } from '@/modules/live/components/ProgressChecklist';
import { EndLiveConfirmDialog } from '@/modules/live/components/rtmp/EndLiveConfirmDialog';
import { LiveControlRoom } from '@/modules/live/components/rtmp/LiveControlRoom';
import { LiveSetupPanel } from '@/modules/live/components/rtmp/LiveSetupPanel';
import { useLivePresence } from '@/modules/live/hooks/useLivePresence';
import { useLiveDurationLimit } from '@/modules/live/hooks/useLiveDurationLimit';
import { toast } from 'sonner';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { readFunctionError } from '@/modules/live/rtmpFunctionError';

interface ProducerSession {
  live_session_id: string;
  live_post_id?: string | null;
  post_id?: string | null;
  rtmps_url: string;
  stream_key: string;
  hls_url?: string | null;
  playback_url?: string | null;
  cloudflare_video_uid?: string | null;
  rtmp_config_id?: string | null;
  is_persistent_stream?: boolean;
  producer_url?: string | null;
  status: string;
  title?: string | null;
  description?: string | null;
  source_connected_at?: string | null;
  source_connected?: boolean | null;
  connection_status?: string | null;
  connected_at?: string | null;
  disconnected_at?: string | null;
  last_disconnected_at?: string | null;
  last_connection_check_at?: string | null;
  live_input_status?: string | null;
  signal_status?: string | null;
  signal_lost_at?: string | null;
  reconnect_deadline_at?: string | null;
  auto_end_reason?: string | null;
  preview_ready?: boolean | null;
  preview_url?: string | null;
  reconnect_count?: number | null;
  end_reason?: string | null;
  started_at?: string | null;
  go_live_clicked_at?: string | null;
  archive_error?: string | null;
  auto_end_at?: string | null;
  armed_session_token?: string | null;
}

interface StatusPayload {
  live_session?: Partial<ProducerSession> & { id?: string; live_post_id?: string | null; post_id?: string | null };
  source_connected?: boolean;
  sourceConnected?: boolean;
  input_connected?: boolean;
  inputConnected?: boolean;
  video_streaming?: boolean;
  videoStreaming?: boolean;
  details_complete?: boolean;
  can_go_live?: boolean;
  status?: string;
  playbackUrl?: string | null;
  hlsUrl?: string | null;
  previewReady?: boolean;
  previewUrl?: string | null;
  preview_ready?: boolean;
  cloudflareVideoUid?: string | null;
  updatedAt?: string;
  connectionStatus?: string;
  signal_status?: string | null;
  signalStatus?: string | null;
  signal_lost_at?: string | null;
  signalLostAt?: string | null;
  reconnect_deadline_at?: string | null;
  reconnectDeadlineAt?: string | null;
  cloudflareLiveInputState?: string | null;
  cloudflareDiagnostics?: {
    liveInputIdExists?: boolean;
    liveInputState?: string;
    liveInputConnected?: boolean;
    videoStreaming?: boolean;
    videoCount?: number;
    selectedVideoUidExists?: boolean;
    previewUrlExists?: boolean;
    reason?: string;
    errors?: string[];
  };
  lastDisconnectedAt?: string | null;
  disconnectGraceSeconds?: number;
  auto_ended?: boolean;
  liveInputMissing?: boolean;
  live_input_missing?: boolean;
  streamKeyInvalid?: boolean;
  stream_key_invalid?: boolean;
  configError?: string | null;
  configErrorMessage?: string | null;
}


async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  toast.success(`${label} đã sao chép`);
}

export default function RtmpLivePage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const { userId } = useCurrentUser();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sourceConnected, setSourceConnected] = useState(false);
  const [inputConnected, setInputConnected] = useState(false);
  const [credentials, setCredentials] = useState<ProducerSession | null>(null);
  const [persistentStream, setPersistentStream] = useState(false);
  const [previewReloadToken, setPreviewReloadToken] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [previewVolume, setPreviewVolume] = useState(0.8);
  const [previewPaused, setPreviewPaused] = useState(false);
  const [previewNeedsGesture, setPreviewNeedsGesture] = useState(false);
  const [statusCheckError, setStatusCheckError] = useState<string | null>(null);
  const [streamKeyInvalidMessage, setStreamKeyInvalidMessage] = useState<string | null>(null);

  const [lockedLiveSessionId, setLockedLiveSessionId] = useState<string | null>(null);
  const [publishedLiveSessionId, setPublishedLiveSessionId] = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const connectionNoticeRef = useRef<string | null>(null);
  const statusErrorNoticeRef = useRef<string | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previousPreviewStateRef = useRef<{
    sourceConnected: boolean;
    status?: string;
    playbackUrl: string | null;
    cloudflareVideoUid?: string | null;
  }>({ sourceConnected: false, playbackUrl: null });

  const detailsComplete = title.trim().length > 0 && description.trim().length > 0;
  const playbackUrl = credentials?.preview_url || credentials?.hls_url || credentials?.playback_url || null;
  const producerPreviewReady = !!credentials?.preview_ready && !!playbackUrl && sourceConnected && !!credentials?.cloudflare_video_uid;
  // FE phòng vệ: chỉ render preview khi BACKEND xác nhận source_connected + cloudflare_video_uid + playback_url thật.
  // Thiếu UID ⇒ là VOD/replay stale, KHÔNG render.
  const canShowPreview = !!playbackUrl
    && (sourceConnected || credentials?.status === 'disconnect_grace')
    && !!credentials?.cloudflare_video_uid
    && credentials?.status !== 'ended'
    && credentials?.status !== 'posted'
    && credentials?.status !== 'processing'
    && credentials?.status !== 'processing_replay'
    && credentials?.status !== 'archiving'
    && credentials?.status !== 'archived'
    && credentials?.status !== 'failed';
  const livePreviewSrc = useMemo(() => {
    if (!playbackUrl) return null;
    if (previewReloadToken === 0) return playbackUrl;
    const separator = playbackUrl.includes('?') ? '&' : '?';
    return `${playbackUrl}${separator}fp_live_preview=${previewReloadToken}`;
  }, [playbackUrl, previewReloadToken]);
  const livePreviewKey = [
    playbackUrl || 'no-src',
    credentials?.cloudflare_video_uid || 'no-video',
    credentials?.live_session_id || 'no-session',
    credentials?.armed_session_token || 'no-token',
    previewReloadToken,
  ].join(':');
  const isLockedLive = !!credentials?.live_session_id && lockedLiveSessionId === credentials.live_session_id;
  const isLocallyPublishedLive = !!credentials?.live_session_id && publishedLiveSessionId === credentials.live_session_id;
  const { viewers } = useLivePresence(credentials?.live_session_id);
  const audienceViewers = useMemo(
    () => viewers.filter((viewer) => viewer.userId !== userId),
    [userId, viewers],
  );
  const canGoLive = !!credentials && sourceConnected && producerPreviewReady && detailsComplete && credentials.status !== 'live' && !isLockedLive;
  const canEndLive = !!credentials && (
    credentials.status === 'live'
    || credentials.status === 'disconnect_grace'
    || credentials.status === 'reconnecting'
    || isLockedLive
    || isLocallyPublishedLive
  );
  const disabledReason = useMemo(() => {
    if (publishing) return 'Đang phát trực tiếp...';
    if (isLockedLive) return 'Đang live — vui lòng bấm Kết thúc live trước khi phát lại.';
    if (inputConnected && !sourceConnected) return 'Nguồn phát đã kết nối nhưng chưa gửi dữ liệu video. Đang chờ Cloudflare nhận khung hình đầu tiên...';
    if (!sourceConnected) return 'Đang chờ nguồn phát kết nối.';
    if (!producerPreviewReady) return 'Đang tải preview live.';
    if (!title.trim() || !description.trim()) return 'Vui lòng nhập tiêu đề và mô tả.';
    if (credentials?.status === 'live') return 'Live đã public.';
    return null;
  }, [credentials?.status, description, inputConnected, isLockedLive, producerPreviewReady, publishing, sourceConnected, title]);

  const persistentStreamRef = useRef(false);
  useEffect(() => { persistentStreamRef.current = persistentStream; }, [persistentStream]);

  useEffect(() => {
    try {
      const storedMuted = localStorage.getItem('funprofile_live_muted');
      const storedVolume = localStorage.getItem('funprofile_live_volume');
      if (storedMuted !== null) setPreviewMuted(storedMuted === 'true');
      if (storedVolume !== null) {
        const nextVolume = Number(storedVolume);
        if (Number.isFinite(nextVolume)) setPreviewVolume(Math.max(0, Math.min(1, nextVolume)));
      }
    } catch {
      // Keep autoplay-safe defaults if storage is unavailable.
    }
  }, []);

  const persistPreviewAudioPreference = useCallback((nextMuted: boolean, nextVolume: number) => {
    try {
      localStorage.setItem('funprofile_live_muted', String(nextMuted));
      localStorage.setItem('funprofile_live_volume', String(Math.max(0, Math.min(1, nextVolume))));
    } catch {
      // Storage can be unavailable in private/browser-restricted contexts.
    }
  }, []);

  const togglePreviewMuted = useCallback(() => {
    const nextVolume = previewVolume > 0 ? previewVolume : 0.6;
    const nextMuted = !(previewMuted || previewVolume <= 0);
    setPreviewMuted(nextMuted);
    if (previewVolume <= 0) setPreviewVolume(nextVolume);
    setPreviewNeedsGesture(false);
    persistPreviewAudioPreference(nextMuted, nextVolume);
  }, [persistPreviewAudioPreference, previewMuted, previewVolume]);

  const changePreviewVolume = useCallback((nextVolume: number) => {
    const normalizedVolume = Math.max(0, Math.min(1, nextVolume));
    const nextMuted = normalizedVolume === 0;
    setPreviewVolume(normalizedVolume);
    setPreviewMuted(nextMuted);
    if (normalizedVolume > 0) setPreviewNeedsGesture(false);
    persistPreviewAudioPreference(nextMuted, normalizedVolume);
  }, [persistPreviewAudioPreference]);

  const togglePreviewPaused = useCallback(() => {
    setPreviewPaused((value) => !value);
  }, []);

  const requestPreviewFullscreen = useCallback(() => {
    const target = previewContainerRef.current;
    if (!target?.requestFullscreen) {
      toast.error('Trinh duyet khong ho tro phong to preview.');
      return;
    }
    target.requestFullscreen().catch(() => {
      toast.error('Khong the phong to preview. Vui long thu lai.');
    });
  }, []);

  const createOrResumeSession = useCallback(async (options?: { persistent?: boolean; forceNew?: boolean; updatePreference?: boolean; resumeOnly?: boolean }) => {
    setCreating(true);
    try {
      const explicitPersistent = options?.persistent;
      // Mặc định resume_only=true khi URL có sessionId — backend sẽ KHÔNG xoá preview/uid stale fields,
      // Chỉ verify Cloudflare input còn enable. Tránh bug reload mất preview khi nguồn phát đang chảy.
      const resumeOnly = options?.resumeOnly ?? (!!sessionId && options?.forceNew !== true);
      const body: Record<string, unknown> = {
        privacy: 'public',
        live_session_id: options?.forceNew === true ? undefined : sessionId,
        force_new: options?.forceNew === true,
        resume_only: resumeOnly,
      };
      if (explicitPersistent !== undefined) {
        body.is_persistent_stream = explicitPersistent;
        if (options?.updatePreference) body.update_preference = true;
      }
      const { data, error } = await supabase.functions.invoke('create-rtmp-live-session', { body });
      if (error) {
        // Phiên đã kết thúc → chuyển sang luồng tạo phiên mới (xoá sessionId trên URL).
        const info = await readFunctionError(error);
        if (info.code === 'SESSION_ENDED') {
          if (sessionId) navigate('/live/obs', { replace: true });
          toast.info('Phiên cũ đã kết thúc, đã tạo phiên Live Producer mới cho bạn.');
          // Gọi lại không kèm sessionId để backend tự tạo session mới.
          return await createOrResumeSession({ persistent: explicitPersistent, forceNew: true, resumeOnly: false });
        }
        const reason = info.message || 'Edge Function không cung cấp chi tiết lỗi.';
        const status = info.status ? ` (HTTP ${info.status})` : '';
        throw new Error(`Không thể tạo hoặc khôi phục phiên Live Producer: ${reason}${status}`);
      }
      if (!data?.rtmps_url || !data?.stream_key) {
        if (data && (data as any).key_reset_required) {
          toast.warning('Stream Key cũ không còn hợp lệ. Vui lòng bấm "Đặt lại Stream Key" để tạo key mới.');
        }
        throw new Error('Không nhận được thông tin RTMP');
      }
      if ((data as any).persistent_key_rescued) {
        toast.info('Đã làm mới Stream Key do thay đổi cấu hình bảo mật. Hãy cập nhật Stream Key mới vào OBS.');
      }
      const next = data as ProducerSession & { is_locked_live?: boolean };
      setCredentials(next);
      setPublishedLiveSessionId((current) => {
        if (next.live_session_id !== current) return null;
        if (next.status === 'ended' || next.status === 'posted' || next.status === 'failed' || next.status === 'archived') return null;
        return current;
      });
      setTitle(next.title || '');
      setDescription(next.description || '');
      setPersistentStream(!!next.is_persistent_stream);
      // Tin source_connected từ DB (server đã verify Cloudflare).
      setSourceConnected(!!next.source_connected);
      // Khoá UI nếu user còn phiên LIVE/grace đang chạy → tránh tạo post đè lên.
      if (next.is_locked_live) {
        setLockedLiveSessionId(next.live_session_id);
      }
      if (next.live_session_id && next.live_session_id !== sessionId) {
        navigate(`/live/obs/${next.live_session_id}`, { replace: true });
      }
      return next;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Tạo phiên RTMP Live thất bại');
      throw error;
    } finally {
      setCreating(false);
    }
  }, [navigate, sessionId]);

  const didInitRef = useRef<string | null>(null);
  useEffect(() => {
    const key = sessionId || '__new__';
    if (didInitRef.current === key) return;
    didInitRef.current = key;
    (async () => {
      // Fetch user preference BEFORE creating/resuming the session so the
      // toggle reflects the last chosen mode and the right session is used.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('preferred_rtmp_stream_mode')
            .eq('id', user.id)
            .maybeSingle();
          const initialPersistent = (profile as { preferred_rtmp_stream_mode?: string } | null)?.preferred_rtmp_stream_mode === 'persistent';
          setPersistentStream(initialPersistent);
          persistentStreamRef.current = initialPersistent;
          await createOrResumeSession({ persistent: initialPersistent });
          return;
        }
      } catch {
        // fall through to default behavior
      }
      await createOrResumeSession();
    })();
  }, [createOrResumeSession, sessionId]);

  const refreshStatus = useCallback(async () => {
    if (!credentials?.live_session_id) return;
    try {
      const { data, error } = await supabase.functions.invoke('get-rtmp-live-session-status', {
        body: { live_session_id: credentials.live_session_id },
      });
      if (error) throw error;
      const payload = data as StatusPayload;
      const keyInvalid = !!(payload.liveInputMissing ?? payload.live_input_missing ?? payload.streamKeyInvalid ?? payload.stream_key_invalid);
      if (keyInvalid) {
        setStreamKeyInvalidMessage(
          payload.configErrorMessage
            || 'Stream Key đã hết hiệu lực (nguồn phát trên Cloudflare không còn tồn tại). Vui lòng bấm "Đặt lại Stream Key" rồi dán lại vào OBS.',
        );
        setStatusCheckError(null);
      } else {
        setStreamKeyInvalidMessage(null);
        if (payload.cloudflareDiagnostics?.errors?.length) {
          console.warn('[RTMP_STATUS_CLOUDFLARE_DIAGNOSTICS]', payload.cloudflareDiagnostics);
          setStatusCheckError(payload.cloudflareDiagnostics.errors.join(' | '));
        } else {
          setStatusCheckError(null);
        }
      }

      const liveSession = payload.live_session || {};
      const nextPreviewUrl = payload.previewUrl || liveSession.preview_url || payload.hlsUrl || payload.playbackUrl || liveSession.hls_url || liveSession.playback_url;
      // Backend treats Cloudflare Live Input connected as the RTMP source truth.
      // Active video/UID may lag and is only required for preview.
      const nextSourceConnected = !!(payload.sourceConnected ?? payload.source_connected ?? liveSession.source_connected);
      const nextInputConnected = !!(payload.inputConnected ?? payload.input_connected ?? payload.cloudflareDiagnostics?.liveInputConnected);
      const nextHlsUrl = payload.hlsUrl || liveSession.hls_url || nextPreviewUrl;
      const nextPlaybackUrl = payload.playbackUrl || liveSession.playback_url || nextPreviewUrl;
      const nextPreviewReady = !!(payload.previewReady ?? payload.preview_ready ?? liveSession.preview_ready ?? (nextSourceConnected && nextPreviewUrl));
      const nextCloudflareVideoUid = payload.cloudflareVideoUid || liveSession.cloudflare_video_uid;
      const nextStatus = payload.status || liveSession.status || credentials.status;
      const isTerminalStatus = nextStatus === 'ended' || nextStatus === 'posted' || nextStatus === 'failed' || nextStatus === 'archived';
      if (liveSession.end_reason === 'duration_limit' || liveSession.end_reason === 'auto_duration_limit') {
        toast.warning('Livestream đã kết thúc tự động sau khi đạt giới hạn thời lượng.');
        setLockedLiveSessionId(null);
        setPublishedLiveSessionId(null);
        connectionNoticeRef.current = 'duration_limit';
      } else if (payload.auto_ended || liveSession.end_reason === 'obs_signal_lost_timeout' || liveSession.auto_end_reason === 'obs_signal_lost_timeout') {
        toast.warning('Live đã tự động kết thúc vì không nhận được tín hiệu từ OBS trong 60 giây.');
        setLockedLiveSessionId(null);
        setPublishedLiveSessionId(null);
        connectionNoticeRef.current = 'auto_ended';
      } else if (!nextSourceConnected && !nextInputConnected && nextStatus === 'reconnecting' && connectionNoticeRef.current !== 'disconnected') {
        toast.warning('Mất tín hiệu từ OBS. Đang chờ OBS kết nối lại...');
        connectionNoticeRef.current = 'disconnected';
      } else if (nextSourceConnected && connectionNoticeRef.current === 'disconnected') {
        toast.success('Nguồn video đã kết nối lại.');
        connectionNoticeRef.current = 'connected';
      }
      if (isTerminalStatus) setPublishedLiveSessionId(null);
      const keepPublishedLive = publishedLiveSessionId === credentials.live_session_id
        || !!credentials.go_live_clicked_at
        || !!liveSession.go_live_clicked_at;
      const resolvedStatus = keepPublishedLive && (nextStatus === 'source_connected' || nextStatus === 'ready_to_go_live')
        ? 'live'
        : nextStatus;
      setSourceConnected(nextSourceConnected);
      setInputConnected(nextInputConnected);
      setCredentials((current) => current ? {
        ...current,
        ...liveSession,
        live_session_id: current.live_session_id,
        status: current.live_session_id === credentials.live_session_id ? resolvedStatus : nextStatus,
        source_connected: nextSourceConnected,
        connection_status: payload.connectionStatus || liveSession.connection_status || current.connection_status,
        signal_status: payload.signalStatus || payload.signal_status || liveSession.signal_status || current.signal_status,
        signal_lost_at: payload.signalLostAt || payload.signal_lost_at || liveSession.signal_lost_at || current.signal_lost_at,
        reconnect_deadline_at: payload.reconnectDeadlineAt || payload.reconnect_deadline_at || liveSession.reconnect_deadline_at || current.reconnect_deadline_at,
        auto_end_reason: liveSession.auto_end_reason || current.auto_end_reason,
        preview_ready: nextPreviewReady,
        preview_url: nextPreviewUrl || current.preview_url,
        hls_url: nextHlsUrl || current.hls_url,
        playback_url: nextPlaybackUrl || current.playback_url,
        cloudflare_video_uid: nextCloudflareVideoUid || current.cloudflare_video_uid,
        rtmp_config_id: liveSession.rtmp_config_id || current.rtmp_config_id,
        is_persistent_stream: typeof liveSession.is_persistent_stream === 'boolean' ? liveSession.is_persistent_stream : current.is_persistent_stream,
        post_id: liveSession.post_id || current.post_id,
        live_post_id: liveSession.live_post_id || current.live_post_id,
      } : current);
      console.debug('[RTMP_STATUS_POLL]', {
        sessionId: credentials.live_session_id,
        previousStatus: credentials.status,
        nextStatus: payload.status || liveSession.status || credentials.status,
        sourceConnected: nextSourceConnected,
        previewReady: nextPreviewReady,
        playbackUrlExists: !!(nextPlaybackUrl || credentials.playback_url),
        hlsUrlExists: !!(nextHlsUrl || credentials.hls_url),
        previewUrlExists: !!(nextPreviewUrl || credentials.preview_url),
        cloudflareVideoUid: nextCloudflareVideoUid || credentials.cloudflare_video_uid || null,
        updatedAt: payload.updatedAt,
        cloudflareLiveInputState: payload.cloudflareLiveInputState,
        cloudflareDiagnostics: payload.cloudflareDiagnostics,
        previousSourceConnected: sourceConnected,
        disabledReason,
      });
    } catch (error) {
      const info = await readFunctionError(error);
      const message = info.message || 'Không kiểm tra được trạng thái nguồn phát';
      console.warn('[RTMP_STATUS_POLL_FAILED]', {
        sessionId: credentials.live_session_id,
        message,
        code: info.code,
        status: info.status,
        details: info.details,
      });
      const friendly = info.code === 'UNAUTHORIZED'
        ? 'Phiên đăng nhập hết hạn. Vui lòng tải lại trang và đăng nhập lại.'
        : `Không kiểm tra được nguồn phát: ${message}`;
      setStatusCheckError(friendly);
      if (statusErrorNoticeRef.current !== friendly) {
        toast.warning(friendly);
        statusErrorNoticeRef.current = friendly;
      }
    }
  }, [credentials?.cloudflare_video_uid, credentials?.go_live_clicked_at, credentials?.hls_url, credentials?.live_session_id, credentials?.playback_url, credentials?.preview_url, credentials?.status, disabledReason, publishedLiveSessionId, sourceConnected]);

  const changeStreamMode = useCallback(async (checked: boolean) => {
    if (sourceConnected || credentials?.status === 'live') {
      toast.error('Không thể đổi chế độ khi nguồn phát đang kết nối hoặc đang live');
      return;
    }
    setPersistentStream(checked);
    try {
      await createOrResumeSession({ persistent: checked, forceNew: true, updatePreference: true });
      toast.success(checked
        ? 'Đã bật Luồng cố định cho các lần live sau.'
        : 'Đã tắt Luồng cố định cho các lần live sau.');
    } catch {
      setPersistentStream(!checked);
    }
  }, [createOrResumeSession, credentials?.status, sourceConnected]);

  useEffect(() => {
    const liveSessionId = credentials?.live_session_id;
    if (!liveSessionId) return;

    const channel = supabase
      .channel(`rtmp-live-session-${liveSessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${liveSessionId}` },
        (payload) => {
          const row = payload.new as Partial<ProducerSession> & { id?: string };
          const nextPreviewUrl = row.preview_url || row.hls_url || row.playback_url || null;
          // Realtime: chỉ tin source_connected từ DB, KHÔNG suy ra từ status
          const nextSourceConnected = !!row.source_connected;
          const nextPreviewReady = !!row.preview_ready || (!!nextPreviewUrl && nextSourceConnected);
          const nextStatus = row.status || credentials?.status;
          const keepPublishedLive = publishedLiveSessionId === liveSessionId
            || !!credentials?.go_live_clicked_at
            || !!row.go_live_clicked_at;
          const resolvedStatus = keepPublishedLive && (nextStatus === 'source_connected' || nextStatus === 'ready_to_go_live')
            ? 'live'
            : nextStatus;
          if (nextStatus === 'ended' || nextStatus === 'posted' || nextStatus === 'failed' || nextStatus === 'archived') {
            setPublishedLiveSessionId(null);
          }

          setSourceConnected(nextSourceConnected);
          setCredentials((current) => current ? {
            ...current,
            ...row,
            live_session_id: current.live_session_id,
            status: current.live_session_id === liveSessionId ? resolvedStatus : row.status,
            hls_url: row.hls_url || current.hls_url,
            playback_url: row.playback_url || current.playback_url,
            preview_url: row.preview_url || current.preview_url,
            preview_ready: nextPreviewReady,
            cloudflare_video_uid: row.cloudflare_video_uid || current.cloudflare_video_uid,
            signal_status: row.signal_status || current.signal_status,
            signal_lost_at: row.signal_lost_at || current.signal_lost_at,
            reconnect_deadline_at: row.reconnect_deadline_at || current.reconnect_deadline_at,
            auto_end_reason: row.auto_end_reason || current.auto_end_reason,
          } : current);

          if (nextSourceConnected && connectionNoticeRef.current === 'disconnected') {
            toast.success('Nguồn video đã kết nối lại.');
            connectionNoticeRef.current = 'connected';
          } else if (nextSourceConnected && connectionNoticeRef.current !== 'connected') {
            toast.success('Nguồn phát đã kết nối. Preview live đang sẵn sàng.');
            connectionNoticeRef.current = 'connected';
          } else if (!nextSourceConnected && row.status === 'reconnecting' && row.connection_status === 'reconnecting' && connectionNoticeRef.current !== 'disconnected') {
            toast.warning('Mất tín hiệu từ OBS. Đang chờ OBS kết nối lại...');
            connectionNoticeRef.current = 'disconnected';
          } else if (!nextSourceConnected && row.status === 'waiting_for_obs' && connectionNoticeRef.current !== 'waiting') {
            toast.warning('Nguồn phát đã ngắt kết nối. Hãy bấm Start Streaming để kết nối lại.');
            connectionNoticeRef.current = 'waiting';
          }

          console.debug('[RTMP_REALTIME_SESSION_UPDATE]', {
            sessionId: liveSessionId,
            status: row.status,
            sourceConnected: nextSourceConnected,
            previewReady: nextPreviewReady,
            previewUrlExists: !!nextPreviewUrl,
            liveInputStatus: row.live_input_status,
            connectionStatus: row.connection_status,
          });
        },
      )
      .subscribe((status, error) => {
        if (error) {
          console.warn('[RTMP_REALTIME_SUBSCRIBE_FAILED]', {
            sessionId: liveSessionId,
            error: error.message,
          });
          return;
        }
        console.debug('[RTMP_REALTIME_SUBSCRIBE_STATUS]', { sessionId: liveSessionId, status });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [credentials?.go_live_clicked_at, credentials?.live_session_id, credentials?.status, publishedLiveSessionId]);

  useEffect(() => {
    if (!credentials?.live_session_id) return;
    console.debug('[RTMP_PRODUCER_STATE]', {
      sessionId: credentials.live_session_id,
      sessionStatus: credentials.status,
      sourceConnected,
      producerPreviewReady,
      playbackUrlExists: !!playbackUrl,
      hlsUrlExists: !!credentials.hls_url,
      previewUrlExists: !!credentials.preview_url,
      cloudflareVideoUid: credentials.cloudflare_video_uid || null,
      previewReloadToken,
      titleValid: !!title.trim(),
      descriptionValid: !!description.trim(),
      canGoLive,
      disabledReason,
    });
  }, [canGoLive, credentials?.cloudflare_video_uid, credentials?.hls_url, credentials?.live_session_id, credentials?.preview_url, credentials?.status, description, disabledReason, playbackUrl, previewReloadToken, producerPreviewReady, sourceConnected, title]);

  useEffect(() => {
    if (!credentials?.live_session_id || !canShowPreview) return;
    console.debug('[RTMP_PREVIEW_PLAYER_MOUNTED]', {
      sessionId: credentials.live_session_id,
      sourceConnected,
      status: credentials.status,
      playbackUrlExists: true,
      hlsUrlExists: !!credentials.hls_url,
      cloudflareVideoUid: credentials.cloudflare_video_uid || null,
      previewKey: livePreviewKey,
    });
  }, [canShowPreview, credentials?.cloudflare_video_uid, credentials?.hls_url, credentials?.live_session_id, credentials?.status, livePreviewKey, playbackUrl, sourceConnected]);

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
      || previous.sourceConnected !== next.sourceConnected;

    previousPreviewStateRef.current = next;
    if (!canShowPreview) {
      setPreviewReady(false);
      return;
    }
    if (sourceChanged) {
      setPreviewReady(false);
      console.debug('[RTMP_PREVIEW_RELOAD_TRIGGERED]', {
        sessionId: credentials?.live_session_id,
        previousStatus: previous.status,
        nextStatus: next.status,
        playbackUrlExists: !!next.playbackUrl,
        previousPlaybackUrlExists: !!previous.playbackUrl,
        previousCloudflareVideoUid: previous.cloudflareVideoUid,
        nextCloudflareVideoUid: next.cloudflareVideoUid,
        sourceConnected,
      });
    }
  }, [canShowPreview, credentials?.cloudflare_video_uid, credentials?.live_session_id, credentials?.status, playbackUrl, sourceConnected]);

  useEffect(() => {
    if (!credentials?.live_session_id || credentials.status === 'ended' || credentials.status === 'posted') return;
    const pollMs = producerPreviewReady
      ? 5000
      : (sourceConnected || inputConnected || credentials.status === 'reconnecting' ? 1000 : 750);
    const tick = () => {
      if (document.hidden) return;
      refreshStatus();
    };
    const timer = window.setInterval(tick, pollMs);
    // Burst 400ms x 15 (~6s) khi CHƯA có preview sẵn, để bắt khoảnh khắc Cloudflare vừa mở HLS.
    const burstTimers = producerPreviewReady
      ? []
      : Array.from({ length: 15 }, (_, i) => window.setTimeout(tick, 400 * (i + 1)));
    refreshStatus();
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      burstTimers.forEach((timeout) => window.clearTimeout(timeout));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [credentials?.live_session_id, credentials?.status, inputConnected, producerPreviewReady, refreshStatus, sourceConnected]);

  // Auto bump preview reload khi vừa có nguồn / vừa có playback URL, thay cho việc user phải bấm "Tải lại preview".
  const lastAutoReloadRef = useRef<{ src: string | null; connected: boolean }>({ src: null, connected: false });
  useEffect(() => {
    if (!canShowPreview) return;
    const prev = lastAutoReloadRef.current;
    const flippedConnected = !prev.connected && sourceConnected;
    const gotNewSrc = playbackUrl && prev.src !== playbackUrl;
    if (flippedConnected || gotNewSrc) {
      lastAutoReloadRef.current = { src: playbackUrl, connected: sourceConnected };
      setPreviewReloadToken((t) => t + 1);
    }
  }, [canShowPreview, playbackUrl, sourceConnected]);

  // Self-heal: producer báo ready nhưng player không lên trong 3s → bump thêm 1 lần (chống hls.js fail lần đầu).
  useEffect(() => {
    if (!producerPreviewReady || previewReady) return;
    const t = window.setTimeout(() => {
      if (!previewReady) setPreviewReloadToken((n) => n + 1);
    }, 3000);
    return () => window.clearTimeout(t);
  }, [producerPreviewReady, previewReady, previewReloadToken]);


  // Disarm khi đóng tab CHỈ trong các trạng thái rỗng (chưa có nguồn video) để giải phóng input.
  // Đang có source_connected/ready_to_go_live/live/disconnect_grace ⇒ KHÔNG disarm — server +
  // watchdog tự lo. Tránh bug reload mất nguồn video do FE chủ động disable Cloudflare input.
  useEffect(() => {
    const sid = credentials?.live_session_id;
    if (!sid) return;
    const handler = () => {
      try {
        const status = credentials?.status;
        const hasActiveSource = sourceConnected
          || status === 'live'
          || status === 'disconnect_grace'
          || status === 'reconnecting'
          || status === 'source_connected'
          || status === 'ready_to_go_live';
        if (hasActiveSource) {
          console.debug('[RTMP_PAGEHIDE_SKIP_DISARM]', { sid, status, sourceConnected });
          return;
        }
        if (status === 'ended' || status === 'posted' || status === 'processing') return;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/disarm-rtmp-live-session`;
        const blob = new Blob([JSON.stringify({ live_session_id: sid, reason: 'page_close' })], { type: 'application/json' });
        // sendBeacon không gắn auth header được — dùng fetch keepalive với access token thay thế.
        supabase.auth.getSession().then(({ data }) => {
          const token = data.session?.access_token;
          if (!token) return;
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            body: blob,
            keepalive: true,
          }).catch(() => {});
        }).catch(() => {});
      } catch {/* ignore */}
    };
    window.addEventListener('pagehide', handler);
    return () => window.removeEventListener('pagehide', handler);
  }, [credentials?.live_session_id, credentials?.status, sourceConnected]);


  const saveDetails = async (): Promise<boolean> => {
    if (!credentials?.live_session_id) return false;
    if (!detailsComplete) {
      toast.error('Tiêu đề và mô tả là bắt buộc');
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
      toast.success('Đã lưu chi tiết bài live');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Lưu chi tiết thất bại');
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
      const response = data as StatusPayload & { live_post_id?: string; post_id?: string };
      const liveSession = response.live_session || {};
      const livePostId = response.live_post_id || liveSession.live_post_id || liveSession.post_id || credentials.live_post_id;
      const postId = response.post_id || liveSession.post_id || livePostId || credentials.post_id;
      setCredentials((current) => current ? {
        ...current,
        ...liveSession,
        live_session_id: current.live_session_id,
        status: 'live',
        go_live_clicked_at: liveSession.go_live_clicked_at || current.go_live_clicked_at || new Date().toISOString(),
        started_at: liveSession.started_at || current.started_at,
        post_id: postId,
        live_post_id: livePostId,
        preview_ready: liveSession.preview_ready ?? true,
        hls_url: liveSession.hls_url || response.hlsUrl || response.playbackUrl || current.hls_url,
        playback_url: liveSession.playback_url || response.playbackUrl || response.hlsUrl || current.playback_url,
        preview_url: liveSession.preview_url || response.previewUrl || response.hlsUrl || response.playbackUrl || current.preview_url,
        cloudflare_video_uid: liveSession.cloudflare_video_uid || response.cloudflareVideoUid || current.cloudflare_video_uid,
      } : current);
      setPublishedLiveSessionId(credentials.live_session_id);
      setLockedLiveSessionId(credentials.live_session_id);
      window.setTimeout(() => {
        refreshStatus().catch((err) => console.warn('[RTMP_GO_LIVE_REFRESH_FAILED]', err));
      }, 750);
      toast.success('Đã phát trực tiếp lên feed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Phát trực tiếp thất bại');
    } finally {
      setPublishing(false);
    }
  };

  const resetKey = async () => {
    if (!credentials?.live_session_id) return;
    const confirmReset = sourceConnected || credentials.status === 'live'
      ? window.confirm('Nguồn phát đang kết nối hoặc đang live. Đặt lại key sẽ làm key cũ không dùng được. Tiếp tục?')
      : true;
    if (!confirmReset) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-rtmp-stream-key', {
        body: { live_session_id: credentials.live_session_id, confirm_reset: confirmReset },
      });
      if (error) throw error;
      setCredentials({ ...credentials, ...(data as ProducerSession) });
      setPersistentStream(!!(data as ProducerSession).is_persistent_stream);
      setSourceConnected(false);
      setLockedLiveSessionId(null);
      setPublishedLiveSessionId(null);
      toast.success('Đã đặt lại Stream Key');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Đặt lại Stream Key thất bại');
    } finally {
      setResetting(false);
    }
  };

  const endSession = async () => {
    if (!credentials?.live_session_id || !canEndLive) return;
    setShowEndConfirm(false);
    setEnding(true);
    // Dừng polling ngay để tránh race ghi đè status='ended' về 'live'.
    const snapshot = credentials;
    setCredentials({ ...credentials, status: 'ended', connection_status: 'ended', source_connected: false, preview_ready: false, end_reason: 'manual' });
    setSourceConnected(false);
    setLockedLiveSessionId(null);
    setPublishedLiveSessionId(null);
    try {
      const { error } = await supabase.functions.invoke('end-rtmp-live-session', {
        body: { live_session_id: snapshot.live_session_id },
      });
      if (error) throw error;
      toast.success('Đã kết thúc live. Replay đang được xử lý.');
    } catch (error) {
      // Khôi phục trạng thái nếu invoke thất bại để user có thể thử lại.
      setCredentials(snapshot);
      const info = await readFunctionError(error);
      toast.error(info.message || 'Kết thúc live thất bại');
    } finally {
      setEnding(false);
    }
  };

  const handlePreviewReady = useCallback(() => {
    setPreviewReady(true);
    setCredentials((current) => current ? { ...current, preview_ready: true } : current);
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

  const reloadPreview = useCallback(() => {
    setPreviewReady(false);
    setPreviewNeedsGesture(false);
    setPreviewPaused(false);
    setPreviewReloadToken((value) => value + 1);
    toast.info('Đang tải lại preview...');
    console.debug('[RTMP_PREVIEW_MANUAL_RELOAD]', {
      sessionId: credentials?.live_session_id,
      status: credentials?.status,
      playbackUrl,
    });
  }, [credentials?.live_session_id, credentials?.status, playbackUrl]);

  const statusLabel = useMemo(() => {
    if (!credentials) return 'Đang tạo';
    if (credentials.status === 'live') return 'Đang live';
    if (credentials.status === 'reconnecting') return 'Mất tín hiệu, đang chờ OBS';
    if (credentials.status === 'ended' && (credentials.end_reason === 'obs_signal_lost_timeout' || credentials.auto_end_reason === 'obs_signal_lost_timeout')) return 'Đã tự kết thúc do mất tín hiệu OBS';
    if (credentials.status === 'ended') return 'Đã kết thúc';
    if (sourceConnected && detailsComplete) return 'Sẵn sàng phát';
    if (sourceConnected) return 'Đã nhận tín hiệu RTMP/RTMPS';
    if (inputConnected) return 'Nguồn phát kết nối — chờ video';
    return 'Chờ nguồn phát kết nối';
  }, [credentials, detailsComplete, inputConnected, sourceConnected]);

  const checklistSteps = useMemo<ChecklistStep[]>(() => {
    const step1Done = sourceConnected;
    const step2Done = detailsComplete;
    const step3Done = credentials?.status === 'live';

    const dones = [step1Done, step2Done, step3Done];
    const firstPending = dones.findIndex((d) => !d);

    const compute = (i: number, done: boolean): ChecklistStepStatus =>
      done ? 'completed' : i === firstPending ? 'active' : 'pending';

    return [
      {
        id: 'source',
        title: 'Kết nối nguồn video',
        description: step1Done
          ? 'Đã nhận tín hiệu RTMP/RTMPS từ nguồn phát'
          : inputConnected
            ? 'Nguồn phát đã kết nối — đang chờ Cloudflare nhận khung hình đầu tiên'
            : 'Mở phần mềm phát và bấm Start Streaming',
        status: compute(0, step1Done),
      },
      {
        id: 'details',
        title: 'Hoàn tất chi tiết bài viết',
        description: step2Done ? 'Đã có tiêu đề và mô tả' : 'Nhập tiêu đề và mô tả live',
        status: compute(1, step2Done),
      },
      {
        id: 'golive',
        title: 'Phát trực tiếp',
        description: step3Done
          ? 'Đang phát sóng'
          : canGoLive
            ? 'Sẵn sàng — bấm Phát trực tiếp'
            : 'Hoàn tất các bước trên',
        status: compute(2, step3Done),
      },
    ];
  }, [sourceConnected, inputConnected, detailsComplete, credentials?.status, canGoLive]);
  const previewProps = {
    containerRef: previewContainerRef,
    canShowPreview,
    creating,
    livePreviewKey,
    livePreviewSrc,
    playbackUrl,
    previewMuted,
    previewVolume,
    previewPaused,
    previewNeedsGesture,
    onReady: handlePreviewReady,
    onError: handlePreviewError,
    onPlaybackBlocked: () => setPreviewNeedsGesture(true),
    onToggleMuted: togglePreviewMuted,
    onVolumeChange: changePreviewVolume,
    onTogglePlay: togglePreviewPaused,
    onFullscreen: requestPreviewFullscreen,
  };

  const liveControlStatuses = new Set(['live', 'disconnect_grace', 'reconnecting', 'ended', 'processing', 'processing_replay', 'archiving', 'archived', 'posted', 'failed']);
  const isLiveControlRoom = !!credentials?.live_session_id && (
    (!!credentials.status && liveControlStatuses.has(credentials.status))
    || isLocallyPublishedLive
    || isLockedLive
    || !!credentials.go_live_clicked_at
  );
  const liveStartedAt = credentials?.go_live_clicked_at || credentials?.started_at || credentials?.connected_at || credentials?.source_connected_at || null;
  const durationLimit = useLiveDurationLimit(liveStartedAt, 'rtmp_obs', credentials?.status === 'live' || credentials?.status === 'disconnect_grace' || credentials?.status === 'reconnecting');
  const viewPost = () => {
    const nextPostId = credentials?.live_post_id || credentials?.post_id;
    if (nextPostId) navigate(`/post/${nextPostId}`);
  };

  useEffect(() => {
    if (durationLimit.latestWarningMinute == null || !(credentials?.status === 'live' || credentials?.status === 'disconnect_grace' || credentials?.status === 'reconnecting')) return;
    const unit = durationLimit.latestWarningMinute === 1 ? '1 phút' : `${durationLimit.latestWarningMinute} phút`;
    toast.warning(`Livestream sẽ tự động kết thúc sau ${unit} để đảm bảo chất lượng hệ thống.`);
  }, [credentials?.status, durationLimit.latestWarningMinute]);

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
              <p className="text-sm text-muted-foreground">
                {isLiveControlRoom
                  ? 'Phòng điều khiển livestream: theo dõi preview, tương tác và sức khỏe nguồn phát.'
                  : 'Phát trực tiếp bằng phần mềm hỗ trợ RTMP/RTMPS như OBS, Zoom, Restream, OneStream, vMix.'}
              </p>
            </div>
            <Badge variant={credentials?.status === 'live' ? 'destructive' : 'secondary'}>{statusLabel}</Badge>
          </div>

          {streamKeyInvalidMessage && (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span className="text-foreground">{streamKeyInvalidMessage}</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0"
                onClick={resetKey}
                disabled={resetting}
              >
                {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                Đặt lại Stream Key
              </Button>
            </div>
          )}



          {isLiveControlRoom ? (
            <LiveControlRoom
              sessionId={credentials?.live_session_id}
              liveTitle={title}
              status={credentials?.status}
              startedAt={liveStartedAt}
              durationLimit={durationLimit}
              endReason={credentials?.end_reason}
              archiveError={credentials?.archive_error}
              statusCheckError={statusCheckError}
              sourceConnected={sourceConnected}
              inputConnected={inputConnected}
              previewReady={credentials?.preview_ready}
              connectionStatus={credentials?.connection_status}
              liveInputStatus={credentials?.live_input_status}
              signalStatus={credentials?.signal_status}
              signalLostAt={credentials?.signal_lost_at}
              reconnectDeadlineAt={credentials?.reconnect_deadline_at}
              autoEndReason={credentials?.auto_end_reason}
              reconnectCount={credentials?.reconnect_count}
              viewers={audienceViewers}
              previewProps={previewProps}
              canEndLive={canEndLive}
              ending={ending}
              rtmpsUrl={credentials?.rtmps_url}
              streamKey={credentials?.stream_key}
              persistentStream={persistentStream}
              creating={creating}
              resetting={resetting}
              livePostId={credentials?.live_post_id}
              postId={credentials?.post_id}
              onRequestEnd={() => setShowEndConfirm(true)}
              onViewPost={viewPost}
              onReloadPreview={reloadPreview}
              onCopy={(value, label) => void copyText(value, label)}
              onResetKey={resetKey}
              onChangeStreamMode={changeStreamMode}
            />
          ) : (
            <LiveSetupPanel
              checklistSteps={checklistSteps}
              previewProps={previewProps}
              title={title}
              description={description}
              detailsComplete={detailsComplete}
              persistentStream={persistentStream}
              creating={creating}
              saving={saving}
              publishing={publishing}
              resetting={resetting}
              sourceConnected={sourceConnected}
              inputConnected={inputConnected}
              canGoLive={canGoLive}
              disabledReason={disabledReason}
              statusCheckError={statusCheckError}
              rtmpsUrl={credentials?.rtmps_url}
              streamKey={credentials?.stream_key}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
              onSaveDetails={() => void saveDetails()}
              onGoLive={() => void goLive()}
              onResetKey={resetKey}
              onChangeStreamMode={changeStreamMode}
              onCopy={(value, label) => void copyText(value, label)}
              onReloadPreview={reloadPreview}
            />
          )}
        </div>
      </main>

      <EndLiveConfirmDialog
        open={showEndConfirm}
        ending={ending}
        onOpenChange={setShowEndConfirm}
        onConfirm={() => void endSession()}
      />
    </div>
  );
}
