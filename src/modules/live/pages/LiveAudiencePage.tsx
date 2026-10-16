import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Loader2, Maximize, MessageCircle, Pause, Play, Settings, Square, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { getAbsoluteLiveUrl } from '@/lib/slug';
import { useLiveReplayStatus } from '@/hooks/live/useLiveReplayStatus';
import { useSlugResolver } from '@/hooks/useSlugResolver';
import { endLiveSession, resolveLiveRouteId } from '../liveService';
import { useLiveRtc } from '../hooks/useLiveRtc';
import { useLiveDurationLimit } from '../hooks/useLiveDurationLimit';
import { useLiveMessages } from '../hooks/useLiveMessages';
import { useLivePresence } from '../hooks/useLivePresence';
import { useLiveReactions } from '../hooks/useLiveReactions';
import { useLiveSession } from '../useLiveSession';
import { LiveActivityPanel } from '../components/viewer/LiveActivityPanel';
import { LiveFloatingReactions } from '../components/viewer/LiveFloatingReactions';
import { GiftBottomSheet } from '../components/viewer/GiftBottomSheet';
import { LiveStatsBar } from '../components/viewer/LiveStatsBar';
import { LiveSettingsSheet } from '../components/viewer/LiveSettingsSheet';
import { LiveVideoPlayer } from '../components/viewer/LiveVideoPlayer';
import { LiveViewerHeader } from '../components/viewer/LiveViewerHeader';
import type { LiveSession } from '../types';
import { toggleLiveLandscapeFullscreen, unlockLiveOrientation } from '../utils/liveFullscreen';
import { resolveLiveAudienceState, type LiveAudienceState } from '../liveAudienceState';

export default function LiveAudiencePage() {
  const navigate = useNavigate();
  const haptic = useHaptics();
  const playerFrameRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  const { liveSessionId, username, slug } = useParams<{ liveSessionId?: string; username?: string; slug?: string }>();
  const [fallbackSessionId, setFallbackSessionId] = useState<string | undefined>();
  const [isResolvingFallback, setIsResolvingFallback] = useState(false);

  const { resolvedId: resolvedSessionId } = useSlugResolver({
    contentType: 'live',
    table: 'live_sessions',
    userIdColumn: 'owner_id',
    directId: liveSessionId,
    username,
    slug,
    urlPrefix: 'live',
  });

  const effectiveSessionId = fallbackSessionId || resolvedSessionId;
  const { data: session, isLoading } = useLiveSession(effectiveSessionId);
  const durationLimit = useLiveDurationLimit(session?.started_at, session?.mode || 'agora_webcam', session?.status === 'live' || session?.status === 'disconnect_grace' || session?.status === 'reconnecting');
  const { viewers } = useLivePresence(effectiveSessionId);
  const { messages, sendMessage, isLoading: isChatLoading } = useLiveMessages(effectiveSessionId);
  const { reactions, reactionCount, sendReaction } = useLiveReactions(effectiveSessionId);
  const replayOverride = useLiveReplayStatus(effectiveSessionId, !!effectiveSessionId && !!session && session.status !== 'live');

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const [viewerPaused, setViewerPaused] = useState(false);
  const [viewerMuted, setViewerMuted] = useState(true);
  const [viewerVolume, setViewerVolume] = useState(0.8);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [giftOpen, setGiftOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [floatingComments, setFloatingComments] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [connectAttempts, setConnectAttempts] = useState(0);
  const [connectFailed, setConnectFailed] = useState(false);
  const startAttemptRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);


  const isRtmpLive = session?.mode === 'rtmp_obs';
  const sessionOwnerId = (session as (LiveSession & { owner_id?: string | null }) | undefined)?.owner_id;
  const isHost = !!currentUserId && !!session && (currentUserId === session.host_user_id || currentUserId === sessionOwnerId);
  const canEndLive = isHost && session?.status === 'live';

  const {
    remoteContainerRef,
    statusText,
    hasRemoteVideo,
    start,
    leave,
  } = useLiveRtc({
    sessionId: effectiveSessionId,
    role: 'audience',
    enabled: !!effectiveSessionId && session?.status === 'live' && !isRtmpLive && !viewerPaused,
    remoteAudioMuted: viewerMuted || viewerVolume <= 0,
    remoteAudioVolume: viewerVolume,
  });

  const sessionReplayUrl = session?.status && session.status !== 'live'
    ? session.r2_video_url || session.playback_url || null
    : null;
  const replayUrl = replayOverride?.playback_hls || replayOverride?.r2_video_url || sessionReplayUrl;

  const viewerState = useMemo<LiveAudienceState>(() => resolveLiveAudienceState({
    loading: isLoading,
    resolving: isResolvingFallback,
    hasSessionId: !!effectiveSessionId,
    hasSession: !!session,
    status: session?.status,
    archiveStatus: session?.archive_status,
    replayUrl,
    isRtmp: !!isRtmpLive,
    paused: viewerPaused,
    hasRemoteVideo,
  }), [effectiveSessionId, hasRemoteVideo, isLoading, isResolvingFallback, isRtmpLive, replayUrl, session, viewerPaused]);

  const healthLabel = useMemo(() => {
    if (viewerState === 'live') return 'Live đang phát';
    if (viewerState === 'reconnecting') return 'Mất tín hiệu';
    if (viewerState === 'replay_ready') return 'Replay sẵn sàng';
    if (viewerState === 'failed') return 'Cần thử lại';
    return 'Đang xử lý replay';
  }, [viewerState]);

  const liveStatusLabel = useMemo(() => {
    if (viewerState === 'loading') return 'Đang kết nối live';
    if (viewerState === 'live') return 'Live đang phát';
    if (viewerState === 'reconnecting') return 'Mất tín hiệu, đang tự kết nối lại';
    if (viewerState === 'replay_ready') return 'Replay đã sẵn sàng';
    if (viewerState === 'processing_replay') return 'Live đã kết thúc, replay đang được xử lý';
    if (viewerState === 'ended') return 'Live đã kết thúc';
    return 'Không thể mở live lúc này';
  }, [viewerState]);

  useEffect(() => {
    if (durationLimit.latestWarningMinute == null || !(session?.status === 'live' || session?.status === 'disconnect_grace' || session?.status === 'reconnecting')) return;
    const unit = durationLimit.latestWarningMinute === 1 ? '1 phút' : `${durationLimit.latestWarningMinute} phút`;
    toast.warning(`Livestream sẽ tự động kết thúc sau ${unit} để đảm bảo chất lượng hệ thống.`);
  }, [durationLimit.latestWarningMinute, session?.status]);

  useEffect(() => {
    if (session?.end_reason !== 'duration_limit' && session?.end_reason !== 'auto_duration_limit') return;
    toast.warning('Livestream đã kết thúc tự động sau khi đạt giới hạn thời lượng.');
  }, [session?.end_reason]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, authSession) => setCurrentUserId(authSession?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setFallbackSessionId(undefined);
  }, [resolvedSessionId]);

  useEffect(() => {
    if (!resolvedSessionId || fallbackSessionId || isLoading || session) return;

    let cancelled = false;
    const resolveFromLegacyIds = async () => {
      setIsResolvingFallback(true);
      try {
        const resolved = await resolveLiveRouteId(resolvedSessionId);
        if (!cancelled && resolved?.live_session_id && resolved.live_session_id !== resolvedSessionId) {
          setFallbackSessionId(resolved.live_session_id);
        }
      } finally {
        if (!cancelled) setIsResolvingFallback(false);
      }
    };

    resolveFromLegacyIds();

    return () => {
      cancelled = true;
    };
  }, [fallbackSessionId, isLoading, resolvedSessionId, session]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) unlockLiveOrientation();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      unlockLiveOrientation();
    };
  }, []);

  const MAX_AUDIENCE_RETRIES = 3;

  const attemptStart = useCallback(() => {
    startAttemptRef.current += 1;
    const attempt = startAttemptRef.current;
    setConnectAttempts(attempt);
    setConnectFailed(false);
    start().catch((err) => {
      console.warn('[LiveAudience] start failed', { attempt, err });
      if (attempt >= MAX_AUDIENCE_RETRIES) {
        setConnectFailed(true);
        return;
      }
      // Backoff: 2s, 4s
      const delay = attempt * 2000;
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = window.setTimeout(() => {
        attemptStart();
      }, delay);
    });
  }, [start]);

  useEffect(() => {
    if (!effectiveSessionId || !session || session.status !== 'live' || isRtmpLive || viewerPaused) return;
    if (connectFailed) return;
    if (startAttemptRef.current === 0) attemptStart();
  }, [effectiveSessionId, session, isRtmpLive, viewerPaused, attemptStart, connectFailed]);

  // Reset retry counter khi đổi session hoặc tạm dừng
  useEffect(() => {
    startAttemptRef.current = 0;
    setConnectAttempts(0);
    setConnectFailed(false);
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [effectiveSessionId]);

  useEffect(() => () => {
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
  }, []);

  const handleManualRetry = useCallback(() => {
    startAttemptRef.current = 0;
    setConnectAttempts(0);
    setConnectFailed(false);
    attemptStart();
  }, [attemptStart]);

  useEffect(() => {
    if (viewerPaused) leave().catch(() => undefined);
  }, [leave, viewerPaused]);

  useEffect(() => {
    if (session?.status && !['live', 'disconnect_grace', 'reconnecting'].includes(session.status)) {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setViewerPaused(true);
      setControlsVisible(true);
      leave().catch(() => undefined);
    }
  }, [leave, session?.status]);


  useEffect(() => {
    try {
      const storedMuted = localStorage.getItem('funprofile_live_muted');
      const storedVolume = localStorage.getItem('funprofile_live_volume');
      if (storedMuted !== null) setViewerMuted(storedMuted === 'true');
      if (storedVolume !== null) {
        const nextVolume = Number(storedVolume);
        if (Number.isFinite(nextVolume)) setViewerVolume(Math.max(0, Math.min(1, nextVolume)));
      }
    } catch {
      // Keep autoplay-safe defaults.
    }
  }, []);

  useEffect(() => {
    return () => {
      leave().catch(() => undefined);
    };
  }, [leave]);

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
    if (!immersiveMode || !controlsVisible) return;
    const timer = window.setTimeout(() => setControlsVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, [controlsVisible, immersiveMode]);

  useEffect(() => {
    if (immersiveMode) setControlsVisible(true);
  }, [immersiveMode]);

  const persistViewerAudio = useCallback((nextMuted: boolean, nextVolume: number) => {
    try {
      localStorage.setItem('funprofile_live_muted', String(nextMuted));
      localStorage.setItem('funprofile_live_volume', String(Math.max(0, Math.min(1, nextVolume))));
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const toggleViewerMuted = useCallback(() => {
    const nextMuted = !(viewerMuted || viewerVolume <= 0);
    const nextVolume = viewerVolume > 0 ? viewerVolume : 0.6;
    setViewerMuted(nextMuted);
    if (!nextMuted && viewerVolume <= 0) setViewerVolume(nextVolume);
    persistViewerAudio(nextMuted, nextVolume);
    if (!nextMuted) setNeedsUserGesture(false);
  }, [persistViewerAudio, viewerMuted, viewerVolume]);

  const changeViewerVolume = useCallback((nextVolume: number) => {
    const normalized = Math.max(0, Math.min(1, nextVolume));
    const nextMuted = normalized === 0;
    setViewerVolume(normalized);
    setViewerMuted(nextMuted);
    persistViewerAudio(nextMuted, normalized);
    if (normalized > 0) setNeedsUserGesture(false);
  }, [persistViewerAudio]);

  const toggleViewerPlay = useCallback(() => {
    setViewerPaused((value) => !value);
  }, []);

  const toggleViewerFullscreen = useCallback(() => {
    setControlsVisible(true);
    toggleLiveLandscapeFullscreen(playerFrameRef.current).catch(() => undefined);
  }, []);

  const enterImmersiveMode = useCallback(() => {
    haptic('light');
    setImmersiveMode(true);
    setControlsVisible(true);
  }, [haptic]);

  const exitImmersiveMode = useCallback(() => {
    haptic('light');
    setImmersiveMode(false);
    setControlsVisible(true);
  }, [haptic]);

  const handleVideoTap = useCallback(() => {
    if (!immersiveMode) {
      enterImmersiveMode();
      return;
    }
    setControlsVisible((value) => !value);
  }, [enterImmersiveMode, immersiveMode]);

  const handleTouchStart = useCallback((event: TouchEvent) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    const startY = touchStartYRef.current;
    touchStartYRef.current = null;
    if (startY == null) return;
    const endY = event.changedTouches[0]?.clientY ?? startY;
    const deltaY = endY - startY;
    if (deltaY < -48) {
      exitImmersiveMode();
    } else if (deltaY > 48) {
      exitImmersiveMode();
    }
  }, [exitImmersiveMode]);

  const handleEndLive = async () => {
    if (!effectiveSessionId) return;
    setEnding(true);
    try {
      if (isRtmpLive) {
        const { error } = await supabase.functions.invoke('end-rtmp-live-session', {
          body: { live_session_id: effectiveSessionId },
        });
        if (error) throw error;
      } else {
        await endLiveSession(effectiveSessionId);
      }
      toast.success('Đã kết thúc Live. Replay sẽ được xử lý và đăng lên feed.');
      setShowEndConfirm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể kết thúc Live';
      toast.error(msg);
    } finally {
      setEnding(false);
    }
  };

  const handleOpenPost = useCallback(() => {
    if (session?.post_id) navigate(`/post/${session.post_id}`);
  }, [navigate, session?.post_id]);

  const handleShare = useCallback(async () => {
    if (!effectiveSessionId) return;
    const liveUrl = getAbsoluteLiveUrl({
      id: effectiveSessionId,
      slug,
      profiles: session?.host_profile?.username ? { username: session.host_profile.username } : username ? { username } : null,
    });

    try {
      if (navigator.share) {
        await navigator.share({ title: session?.title || 'FUN Profile LIVE', url: liveUrl });
        return;
      }
      await navigator.clipboard.writeText(liveUrl);
      toast.success('Đã sao chép link LIVE!');
    } catch {
      toast.error('Không thể chia sẻ lúc này');
    }
  }, [effectiveSessionId, session?.host_profile?.username, session?.title, slug, username]);

  const handleReact = useCallback(
    async (emoji: string) => {
      try {
        return await sendReaction(emoji);
      } catch {
        toast.error('Không thể gửi tương tác');
        return false;
      }
    },
    [sendReaction],
  );

  if (viewerState === 'loading') {
    const loadingHost = session?.host_profile;
    const loadingName = loadingHost?.full_name || loadingHost?.username;
    return (
      <div className="min-h-screen bg-black text-white lg:bg-background lg:text-foreground">
        <div className="hidden lg:block">
          <FacebookNavbar />
        </div>
        <div className="flex min-h-screen items-center justify-center px-6 pt-0 lg:pt-16">
          <div className="space-y-4 text-center">
            {loadingHost?.avatar_url ? (
              <img
                src={loadingHost.avatar_url}
                alt={loadingName || 'Host'}
                className="mx-auto h-20 w-20 rounded-full border-2 border-emerald-400/60 object-cover shadow-lg"
              />
            ) : (
              <div className="mx-auto h-40 w-72 animate-pulse rounded-3xl bg-white/10 lg:bg-muted" />
            )}
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-300 lg:text-primary" />
            <p className="text-sm text-white/80 lg:text-muted-foreground">
              {loadingName ? `Đang kết nối tới live của ${loadingName}...` : 'Đang kết nối live...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Audience đã thử tối đa nhưng vẫn không vào được phòng LIVE
  if (
    connectFailed
    && session
    && session.status === 'live'
    && !isRtmpLive
    && !hasRemoteVideo
  ) {
    const failHostName = session.host_profile?.full_name || session.host_profile?.username || 'Host';
    return (
      <div className="min-h-screen bg-background">
        <div className="hidden lg:block">
          <FacebookNavbar />
        </div>
        <div className="flex min-h-screen items-center justify-center px-4 pt-0 lg:pt-16">
          <Card className="max-w-md space-y-4 p-6 text-center">
            {session.host_profile?.avatar_url && (
              <img
                src={session.host_profile.avatar_url}
                alt={failHostName}
                className="mx-auto h-16 w-16 rounded-full object-cover"
              />
            )}
            <div className="space-y-1">
              <p className="text-base font-semibold">Không kết nối được live của {failHostName}</p>
              <p className="text-sm text-muted-foreground">
                Đã thử lại {connectAttempts} lần nhưng máy chủ live chưa phản hồi. Mạng yếu hoặc host đang khôi phục tín hiệu.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={handleManualRetry}>Thử lại</Button>
              <Button variant="outline" onClick={() => navigate('/')}>Về trang chủ</Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }


  if (!session || !effectiveSessionId) {
    return (
      <div className="min-h-screen bg-background">
        <div className="hidden lg:block">
          <FacebookNavbar />
        </div>
        <div className="flex min-h-screen items-center justify-center px-4 pt-0 lg:pt-16">
          <Card className="space-y-4 p-6 text-center">
            <p>Không tìm thấy phiên Live hoặc link không còn khả dụng.</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/')}>
              Về trang chủ
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const hostName = session.host_profile?.full_name || session.host_profile?.username || 'Host';
  const showLiveChrome = viewerState === 'live' || viewerState === 'reconnecting';
  const ControlButton = ({
    children,
    label,
    onClick,
  }: {
    children: ReactNode;
    label: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-md transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      onClick={(event) => {
        event.stopPropagation();
        setControlsVisible(true);
        onClick();
      }}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );

  const mobileVideoChrome = showLiveChrome ? (
    <>
      {reactionsEnabled && <LiveFloatingReactions reactions={reactions} onReact={handleReact} />}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/75 via-black/25 to-transparent p-3 text-white transition-opacity duration-300',
          immersiveMode && !controlsVisible && 'opacity-0',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/45 backdrop-blur-md"
              onClick={(event) => {
                event.stopPropagation();
                immersiveMode ? exitImmersiveMode() : navigate('/');
              }}
              aria-label={immersiveMode ? 'Mở chat trực tiếp' : 'Quay lại'}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="relative inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[11px] font-black uppercase tracking-wide">
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-red-400" />
                  TRỰC TIẾP
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 text-xs font-semibold backdrop-blur">
                  <Eye className="h-3.5 w-3.5" />
                  {viewers.length}
                </span>
                <span className="rounded-full bg-black/35 px-2 py-1 text-xs font-semibold tabular-nums backdrop-blur">
                  {durationLimit.combinedLabel}
                </span>
              </div>
              {!immersiveMode && (
                <p className="mt-1 line-clamp-1 text-sm font-semibold text-white/90">{hostName} đang phát trực tiếp</p>
              )}
            </div>
          </div>
          <ControlButton label="Cài đặt live" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-5 w-5" />
          </ControlButton>
        </div>
      </div>

      {immersiveMode && floatingComments && messages.length > 0 && (
        <div
          className={cn(
            'pointer-events-none absolute bottom-24 left-3 z-20 max-w-[78vw] space-y-2 text-white transition-opacity duration-300',
            !controlsVisible && 'opacity-60',
          )}
        >
          {messages.slice(-2).map((message) => (
            <div key={message.id} className="rounded-2xl bg-black/42 px-3 py-2 text-sm shadow-lg backdrop-blur-md">
              <span className="mr-1 font-bold">{message.profile?.username || 'FUN Member'}:</span>
              <span className="line-clamp-2 text-white/90">{message.content}</span>
            </div>
          ))}
        </div>
      )}

      {showLiveChrome && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 text-white transition-opacity duration-300',
            immersiveMode && !controlsVisible && 'opacity-0',
          )}
        >
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-semibold">{session.title || 'FUN Profile Live'}</p>
              <p className="mt-1 text-xs text-white/65">{liveStatusLabel}</p>
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-2">
              <ControlButton label={viewerPaused ? 'Phát live' : 'Tạm dừng live'} onClick={toggleViewerPlay}>
                {viewerPaused ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
              </ControlButton>
              <ControlButton label={viewerMuted || viewerVolume <= 0 ? 'Bật âm thanh' : 'Tắt âm thanh'} onClick={toggleViewerMuted}>
                {viewerMuted || viewerVolume <= 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </ControlButton>
              <ControlButton label="Toàn màn hình" onClick={toggleViewerFullscreen}>
                <Maximize className="h-5 w-5" />
              </ControlButton>
              {immersiveMode && (
                <Button
                  type="button"
                  className="h-11 rounded-full bg-white text-black hover:bg-white/90"
                  onClick={(event) => {
                    event.stopPropagation();
                    exitImmersiveMode();
                  }}
                >
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  Chat trực tiếp
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  ) : null;

  return (
    <div className={cn('min-h-screen', immersiveMode ? 'bg-black' : 'bg-black text-white lg:bg-[linear-gradient(180deg,hsl(var(--background)),hsl(var(--primary)/0.06)_52%,hsl(var(--background)))] lg:text-foreground')}>
      <div className="hidden lg:block">
        <FacebookNavbar />
      </div>
      <main className={cn('lg:px-6 lg:pb-8 lg:pt-16', immersiveMode ? 'p-0' : 'pb-0')}>
        <div className={cn('mx-auto grid max-w-7xl grid-cols-1 gap-0 lg:gap-4 lg:grid-cols-[minmax(0,1fr)_380px]', immersiveMode && 'max-w-none')}>
          <section className={cn('space-y-0 lg:space-y-3', immersiveMode && 'lg:col-span-2')}>
            <div className="hidden lg:block">
              <LiveViewerHeader session={session} sessionId={effectiveSessionId} currentUserId={currentUserId} />
            </div>

            <div className="hidden lg:block">
              <LiveStatsBar
                state={viewerState}
                duration={durationLimit.combinedLabel}
                viewerCount={viewers.length}
                reactionCount={reactionCount}
                healthLabel={healthLabel}
              />
            </div>

            <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              {showLiveChrome && durationLimit.warningLevel === 'urgent' && (
                <div className="mb-2 hidden rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800 lg:block">
                  Livestream sẽ tự động kết thúc sau {Math.ceil((durationLimit.remainingSeconds || 0) / 60)} phút để đảm bảo chất lượng hệ thống.
                </div>
              )}
              <LiveVideoPlayer
                session={session}
                state={viewerState}
                replayUrl={replayUrl}
                remoteContainerRef={remoteContainerRef}
                playerFrameRef={playerFrameRef}
                isRtmpLive={!!isRtmpLive}
                hasRemoteVideo={hasRemoteVideo}
                statusText={liveStatusLabel}
                muted={viewerMuted}
                volume={viewerVolume}
                paused={viewerPaused}
                needsUserGesture={needsUserGesture}
                onToggleMuted={toggleViewerMuted}
                onVolumeChange={changeViewerVolume}
                onTogglePlay={toggleViewerPlay}
                onFullscreen={toggleViewerFullscreen}
                onPlaybackBlocked={() => setNeedsUserGesture(true)}
                onGoHome={() => navigate('/')}
                onOpenPost={handleOpenPost}
                immersive={immersiveMode}
                hideDefaultControls={immersiveMode}
                showControls={!immersiveMode}
                onFrameClick={handleVideoTap}
              >
                <div className="lg:hidden">{mobileVideoChrome}</div>
                <div className="hidden lg:block">
                  {reactionsEnabled && <LiveFloatingReactions reactions={reactions} onReact={handleReact} />}
                </div>
              </LiveVideoPlayer>
            </div>

            {!immersiveMode && (
              <div className="lg:hidden">
                <div className="border-y border-white/10 bg-zinc-950 px-3 py-2">
                  <div className="flex gap-2 overflow-x-auto">
                    {['Chat trực tiếp', 'Bình luận liên quan nhất', 'Câu trả lời của host'].map((tab, index) => (
                      <button
                        key={tab}
                        type="button"
                        className={cn(
                          'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition',
                          index === 0 ? 'bg-emerald-400 text-black' : 'bg-white/8 text-white/70',
                        )}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>
                <LiveActivityPanel
                  viewers={viewers}
                  messages={messages}
                  reactions={reactions}
                  isLoading={isChatLoading}
                  isLiveActive={showLiveChrome}
                  onSendMessage={sendMessage}
                  onReact={handleReact}
                  onShare={handleShare}
                  onGift={() => setGiftOpen(true)}
                  hostUserId={session.host_user_id}
                  dark
                  compact
                  className="h-[48dvh]"
                />
              </div>
            )}
          </section>

          {!immersiveMode && (
            <LiveActivityPanel
              viewers={viewers}
              messages={messages}
              reactions={reactions}
              isLoading={isChatLoading}
              isLiveActive={showLiveChrome}
              onSendMessage={sendMessage}
              onReact={handleReact}
              onShare={handleShare}
              onGift={() => setGiftOpen(true)}
              hostUserId={session.host_user_id}
              className="hidden h-[calc(100vh-88px)] lg:block"
            />
          )}
        </div>

        <div className="mx-auto mt-3 hidden max-w-7xl justify-end gap-2 lg:flex">
          {canEndLive && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowEndConfirm(true)}
              disabled={ending}
              className="gap-1.5"
            >
              {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-current" />}
              Kết thúc Live
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            Quay lại
          </Button>
        </div>
      </main>

      <GiftBottomSheet open={giftOpen} onOpenChange={setGiftOpen} />
      <LiveSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        floatingComments={floatingComments}
        reactionsEnabled={reactionsEnabled}
        onFloatingCommentsChange={setFloatingComments}
        onReactionsEnabledChange={setReactionsEnabled}
      />

      <AlertDialog open={showEndConfirm} onOpenChange={(open) => !ending && setShowEndConfirm(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kết thúc phiên Live?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn kết thúc phiên Live ngay bây giờ? Replay sẽ được xử lý và đăng lên feed của bạn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ending}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndLive} disabled={ending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {ending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Kết thúc Live
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
