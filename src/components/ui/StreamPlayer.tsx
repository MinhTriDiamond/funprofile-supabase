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
