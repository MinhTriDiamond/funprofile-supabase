import { memo, useEffect, useId, useCallback, useMemo, useRef, useState, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { FacebookVideoPlayer } from '@/components/ui/FacebookVideoPlayer';
import { VideoErrorBoundary } from '@/components/ui/VideoErrorBoundary';
import { videoPlaybackCoordinator } from './videoPlaybackCoordinator';
import { Download, Play } from 'lucide-react';
import { downloadChunkedVideo, downloadCloudflareMp4, downloadDirectMp4 } from '@/utils/chunkedVideoDownload';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { debugLivePost, isLivePostDebugEnabled } from './livePostDebug';

const ChunkedVideoPlayer = lazyNamedWithChunkRecovery(
  () => import('@/modules/live/components/ChunkedVideoPlayer'),
  'ChunkedVideoPlayer',
);
const ReplayPlayer = lazyNamedWithChunkRecovery(
  () => import('@/components/ui/ReplayPlayer'),
  'ReplayPlayer',
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

function isHlsUrl(url: string): boolean {
  return /\.m3u8(?:\?|$)/i.test(url);
}

function isAppleMobileSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const appleMobile = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return appleMobile && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

export interface FeedVideoPlayerProps {
  src: string;
  poster?: string;
  isLiveReplay?: boolean;
  aspectRatio?: 'landscape_16_9' | 'portrait_9_16' | 'square';
  itemId?: string;
  feedId?: string;
  className?: string;
  compact?: boolean;
  onError?: (code?: number) => void;
}

export const FeedVideoPlayer = memo(({
  src,
  poster,
  isLiveReplay = false,
  aspectRatio = 'landscape_16_9',
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
  const isHlsReplay = isHlsUrl(normalizedSrc);
  const blockChunkedOnIos = isChunked && isAppleMobileSafari();
  const isMobile = isMobileViewport();
  const retryCountRef = useRef(0);
  const [retryNonce, setRetryNonce] = useState(0);

  // Bỏ poster nếu trỏ tới Cloudflare Stream thumbnail (UID đã xoá sau archive → 404).
  const safePoster = useMemo(() => {
    if (!poster) return undefined;
    if (/customer-[a-z0-9]+\.cloudflarestream\.com\/[^/]+\/thumbnails\//i.test(poster)) return undefined;
    return poster;
  }, [poster]);

  if (isLivePostDebugEnabled()) {
    const route = isHlsReplay ? 'hls' : isChunked ? 'chunked' : 'r2-or-mp4';
    debugLivePost('FeedVideoPlayer route', {
      route,
      src: normalizedSrc,
      poster: safePoster,
      posterDropped: !!poster && !safePoster,
      isLiveReplay,
      isMobile,
      blockChunkedOnIos,
      itemId: coordId,
    });
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
    const root = document.querySelector<HTMLElement>('[data-app-scroll]');
    const getViewportHeight = () => root?.clientHeight || window.innerHeight || document.documentElement.clientHeight || 0;
    const getTopOffset = () => root?.getBoundingClientRect().top || 0;
    const rect = el.getBoundingClientRect();
    const viewportHeight = getViewportHeight();
    const topOffset = getTopOffset();
    const visibleAtMount = rect.bottom >= topOffset - (isMobile ? 360 : 200)
      && rect.top <= topOffset + viewportHeight + (isMobile ? 520 : 200);

    if (visibleAtMount) setIsNearViewport(true);

    debugLivePost('FeedVideoPlayer viewport init', {
      src: normalizedSrc,
      isMobile,
      rootFound: Boolean(root),
      visibleAtMount,
      rect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) },
      viewportHeight,
      topOffset: Math.round(topOffset),
    });

    if (typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      setDebouncedNear(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
        if (isLivePostDebugEnabled()) {
          const nextRect = el.getBoundingClientRect();
          debugLivePost('FeedVideoPlayer viewport change', {
            src: normalizedSrc,
            isMobile,
            rootFound: Boolean(root),
            isNearViewport: entry.isIntersecting,
            debouncedNear,
            rect: {
              top: Math.round(nextRect.top),
              bottom: Math.round(nextRect.bottom),
              height: Math.round(nextRect.height),
            },
            viewportHeight,
          });
        }
      },
      {
        root,
        rootMargin: isMobile ? '360px 0px 520px' : '200px',
        threshold: isMobile ? 0 : 0,
      }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [debouncedNear, isMobile, normalizedSrc]);

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

  useEffect(() => {
    retryCountRef.current = 0;
    setRetryNonce(0);
  }, [normalizedSrc]);

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

  const handlePlayerError = useCallback((code?: number) => {
    const shouldRetryMobileReplay = isMobile
      && isLiveReplay
      && !isHlsReplay
      && !isChunked
      && (code === 2 || code === 3 || code === 4 || typeof code === 'undefined')
      && retryCountRef.current < 2;

    debugLivePost('FeedVideoPlayer error', {
      src: normalizedSrc,
      code,
      retryCount: retryCountRef.current,
      willRetry: shouldRetryMobileReplay,
      isMobile,
      isLiveReplay,
      isHlsReplay,
      isChunked,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });

    if (shouldRetryMobileReplay) {
      retryCountRef.current += 1;
      window.setTimeout(() => {
        setRetryNonce((value) => value + 1);
        setDebouncedNear(true);
      }, 450 * retryCountRef.current);
      return;
    }

    onError?.(code);
  }, [isChunked, isHlsReplay, isLiveReplay, isMobile, normalizedSrc, onError]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden rounded-xl bg-black',
        aspectRatio === 'landscape_16_9' ? 'aspect-video' : aspectRatio === 'portrait_9_16' ? 'mx-auto aspect-[9/16] max-h-[85vh] max-w-[min(100%,480px)]' : 'aspect-square',
        className
      )}
      data-feed-video-id={coordId}
    >
      {/* Layer 1: Blurred backdrop �€” poster img or gradient (NEVER a <video>) */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {safePoster ? (
          <img
            src={safePoster}
            alt=""
            className="w-full h-full object-cover blur-2xl opacity-35 scale-110"
            aria-hidden="true"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black" aria-hidden="true" />
        )}
      </div>

      {/* Layer 2: Foreground �€” lazy mounted video or static placeholder */}
      <div className="relative z-10 w-full h-full">
        {debouncedNear ? (
          // Near viewport: mount real player
          isHlsReplay ? (
            <VideoErrorBoundary>
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse" />}>
                <ReplayPlayer
                  src={normalizedSrc}
                  poster={safePoster}
                  className="w-full h-full"
                  controls
                />
              </Suspense>
            </VideoErrorBoundary>
          ) : blockChunkedOnIos ? (
            <div className="flex h-full w-full items-center justify-center bg-black p-4 text-center text-sm text-white/80">
              Replay đang được xử lý HLS cho Safari.
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
            <VideoErrorBoundary>
              <FacebookVideoPlayer
                key={`${normalizedSrc}-${retryNonce}`}
                src={normalizedSrc}
                poster={safePoster}
                className="w-full h-full"
                compact={compact}
                mutedByDefault
                autoPlayInView
                objectFit="contain"
                onPlayStart={handlePlayStart}
                onError={handlePlayerError}
              />
            </VideoErrorBoundary>
          )
        ) : (
          // Off-screen placeholder: poster + play icon (zero video elements)
          <div
            className="w-full h-full flex items-center justify-center"
            role="button"
            tabIndex={0}
            aria-label="Load video player"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsNearViewport(true);
              setDebouncedNear(true);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              setIsNearViewport(true);
              setDebouncedNear(true);
            }}
          >
            {safePoster && (
              <img
                src={safePoster}
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

      {/* Live replay download */}
      {isLiveReplay && (
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-30">
          <div aria-hidden="true" />
          {isChunked ? (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); downloadChunkedVideo(src); }}
              className="pointer-events-auto w-9 h-9 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
              title="Tải video về máy"
            >
              <Download className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isHlsReplay) downloadCloudflareMp4(normalizedSrc);
                else downloadDirectMp4(normalizedSrc);
              }}
              className="pointer-events-auto w-9 h-9 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
              title="Tải MP4 về máy"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});

FeedVideoPlayer.displayName = 'FeedVideoPlayer';
