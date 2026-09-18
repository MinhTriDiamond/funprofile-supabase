import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveRtc } from '@/modules/live/hooks/useLiveRtc';
import { Loader2 } from 'lucide-react';
import { debugLivePost, getLivePostViewportDebug } from './livePostDebug';

interface LiveVideoPreviewProps {
  sessionId: string;
  muted: boolean;
  volume: number;
  paused?: boolean;
  onVideoReady?: (ready: boolean) => void;
}

export const LiveVideoPreview = ({ sessionId, muted, volume, paused = false, onVideoReady }: LiveVideoPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // Connect early inside the app scroll container so mobile feed cards do not miss the join window.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const { isMobile } = getLivePostViewportDebug();
    const root = document.querySelector<HTMLElement>('[data-app-scroll]');
    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextVisible = entry.isIntersecting;
        setIsVisible(nextVisible);
        debugLivePost('LiveVideoPreview visibility', {
          live_session_id: sessionId,
          render_decision: nextVisible ? 'visible_join_allowed' : 'not_visible_leave',
          intersection_ratio: entry.intersectionRatio,
          observer_root: root ? 'data-app-scroll' : 'viewport',
          threshold: isMobile ? 0.2 : 0.35,
        });
      },
      {
        root,
        rootMargin: isMobile ? '320px 0px 420px' : '220px 0px 320px',
        threshold: isMobile ? 0.2 : 0.35,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sessionId]);

  const {
    remoteContainerRef,
    hasRemoteVideo,
    isJoined,
    statusText,
    start,
    leave,
  } = useLiveRtc({
    sessionId,
    role: 'audience',
    enabled: isVisible && !paused,
    remoteAudioMuted: muted,
    remoteAudioVolume: volume,
  });

  // Start/leave based on visibility
  useEffect(() => {
    if (isVisible && !paused && !hasStarted) {
      setHasStarted(true);
      debugLivePost('LiveVideoPreview start', {
        live_session_id: sessionId,
        render_decision: 'start_agora_preview',
        paused,
      });
      start().catch(() => undefined);
    }
    if ((!isVisible || paused) && hasStarted) {
      setHasStarted(false);
      debugLivePost('LiveVideoPreview leave', {
        live_session_id: sessionId,
        render_decision: 'leave_agora_preview',
        paused,
        is_visible: isVisible,
      });
      leave().catch(() => undefined);
    }
  }, [isVisible, paused, hasStarted, start, leave, sessionId]);

  // Notify parent when remote video is available
  useEffect(() => {
    onVideoReady?.(hasRemoteVideo);
    debugLivePost('LiveVideoPreview rtc state', {
      live_session_id: sessionId,
      has_remote_video: hasRemoteVideo,
      is_joined: isJoined,
      status_text: statusText,
      render_decision: hasRemoteVideo ? 'remote_video_ready' : 'waiting_remote_video',
    });
  }, [hasRemoteVideo, isJoined, onVideoReady, sessionId, statusText]);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full">
      {/* Agora remote video container */}
      <div
        ref={remoteContainerRef}
        className="absolute inset-0 w-full h-full [&_video]:object-contain [&_video]:w-full [&_video]:h-full"
      />

      {/* Loading state when joined but no video yet */}
      {isJoined && !hasRemoteVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-2 text-white/70">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-xs">{statusText}</span>
          </div>
        </div>
      )}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-sm font-semibold text-white">
          Tam dung
        </div>
      )}
    </div>
  );
};
