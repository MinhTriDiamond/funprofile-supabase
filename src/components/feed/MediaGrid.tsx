import { useState, memo, useCallback, useRef, Suspense } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { ImageViewer } from './ImageViewer';
import { LazyImage } from '@/components/ui/LazyImage';
import { FeedVideoPlayer } from './FeedVideoPlayer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, X, Play, Download, Loader2 } from 'lucide-react';
import { SocialVideoPlayer } from '@/components/ui/SocialVideoPlayer';
import { downloadChunkedVideo, downloadCloudflareMp4 } from '@/utils/chunkedVideoDownload';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { debugLivePost } from './livePostDebug';

// Lazy load ChunkedVideoPlayer for gallery
const ChunkedVideoPlayer = lazyNamedWithChunkRecovery(
  () => import('@/modules/live/components/ChunkedVideoPlayer'),
  'ChunkedVideoPlayer',
);
const ReplayPlayer = lazyNamedWithChunkRecovery(
  () => import('@/components/ui/ReplayPlayer'),
  'ReplayPlayer',
);

/** Detect if a URL points to a chunked recording manifest */
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

interface MediaItem {
  url: string;
  type: 'image' | 'video';
  poster?: string;
  isLiveReplay?: boolean;
  aspectRatio?: 'landscape_16_9' | 'portrait_9_16' | 'square';
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

  // Track per-URL transient video errors so we do NOT blacklist a working video
  // because of a single abort/network blip (common when feed re-renders due to
  // realtime invalidations). Only blacklist on fatal codes (DECODE / SRC_NOT_SUPPORTED)
  // or after 3+ errors within 30s.
  const videoErrorStatsRef = useRef<Map<string, { count: number; firstAt: number }>>(new Map());
  const imageErrorOnceRef = useRef<Set<string>>(new Set());

  const handleMediaError = useCallback((url: string, code?: number) => {
    // Images / hard-fail callsites (no code provided): keep legacy behaviour but
    // require the same URL to fail at least twice to avoid spurious image aborts.
    if (typeof code !== 'number') {
      if (imageErrorOnceRef.current.has(url)) {
        setBrokenUrls(prev => (prev.has(url) ? prev : new Set(prev).add(url)));
      } else {
        imageErrorOnceRef.current.add(url);
      }
      return;
    }

    // MEDIA_ERR_ABORTED (1): ignore — almost always caused by src reassignment
    //   or unmount during loading, not a real failure.
    if (code === 1) return;

    // MEDIA_ERR_DECODE (3) / MEDIA_ERR_SRC_NOT_SUPPORTED (4): truly broken.
    if (code === 3 || code === 4) {
      debugLivePost('MediaGrid blacklist (fatal)', { url, code, feedId });
      setBrokenUrls(prev => (prev.has(url) ? prev : new Set(prev).add(url)));
      return;
    }

    // MEDIA_ERR_NETWORK (2) or unknown: rate-limit. Need 3+ errors within 30s
    // before we hide the video; otherwise transient network blips would
    // permanently kill a working stream.
    const now = Date.now();
    const stat = videoErrorStatsRef.current.get(url);
    if (!stat || now - stat.firstAt > 30_000) {
      videoErrorStatsRef.current.set(url, { count: 1, firstAt: now });
      return;
    }
    stat.count += 1;
    if (stat.count >= 3) {
      debugLivePost('MediaGrid blacklist (rate-limited)', { url, code, feedId, count: stat.count });
      videoErrorStatsRef.current.delete(url);
      setBrokenUrls(prev => (prev.has(url) ? prev : new Set(prev).add(url)));
    }
  }, [feedId]);

  // Memoise per-URL onError callbacks so their identity stays stable across
  // renders. Without this, every render hands FacebookVideoPlayer a fresh
  // arrow function, which re-triggers its useEffect, re-assigns video.src,
  // and synthesises spurious abort/error events — that was the root cause of
  // "video flashes briefly then disappears".
  const onErrorByUrlRef = useRef<Map<string, (code?: number) => void>>(new Map());
  const getOnError = useCallback((url: string) => {
    let fn = onErrorByUrlRef.current.get(url);
    if (!fn) {
      fn = (code?: number) => handleMediaError(url, code);
      onErrorByUrlRef.current.set(url, fn);
    }
    return fn;
  }, [handleMediaError]);
  const getOnImageError = useCallback((url: string) => () => handleMediaError(url), [handleMediaError]);

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
              aspectRatio={item.aspectRatio}
              feedId={feedId}
              onError={getOnError(item.url)}
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
              onLoadError={getOnImageError(item.url)}
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
                    aspectRatio={item.aspectRatio}
                    feedId={feedId}
                    compact
                    onError={getOnError(item.url)}
                  />
                </div>
              ) : (
                <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                  <LazyImage
                    src={item.url}
                    alt={`Media ${index + 1}`}
                    className="w-full h-full hover:opacity-95 transition-opacity"
                    hideOnError
                    onLoadError={getOnImageError(item.url)}
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
                    aspectRatio={media[0].aspectRatio}
                    feedId={feedId}
                  compact
                  onError={getOnError(media[0].url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(0)} className="cursor-pointer h-full">
                <LazyImage
                  src={media[0].url}
                  alt="Media 1"
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={getOnImageError(media[0].url)}
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
                    aspectRatio={media[1].aspectRatio}
                    feedId={feedId}
                  compact
                  onError={getOnError(media[1].url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(1)} className="cursor-pointer h-full">
                <LazyImage
                  src={media[1].url}
                  alt="Media 2"
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={getOnImageError(media[1].url)}
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
                    aspectRatio={media[2].aspectRatio}
                    feedId={feedId}
                  compact
                  onError={getOnError(media[2].url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(2)} className="cursor-pointer h-full">
                <LazyImage
                  src={media[2].url}
                  alt="Media 3"
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={getOnImageError(media[2].url)}
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
                      aspectRatio={item.aspectRatio}
                      feedId={feedId}
                  compact
                  onError={getOnError(item.url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                <LazyImage
                  src={item.url}
                  alt={`Media ${index + 1}`}
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={getOnImageError(item.url)}
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
  const { t } = useLanguage();
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
                  title={t('mdgDownloadVideo')}
                >
                  <Download className="w-5 h-5" />
                </button>
              ) : isHlsUrl(currentMedia.url) ? (
                <button
                  onClick={() => downloadCloudflareMp4(currentMedia.url)}
                  className="w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
                  title={t('mdgDownloadMp4')}
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
                  title={t('mdgDownloadVideo')}
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
              isHlsUrl(currentMedia.url) ? (
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
                  {t('mdgReplayProcessing')}
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
