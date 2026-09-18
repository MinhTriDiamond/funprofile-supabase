import { memo, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, XCircle, Upload, Clock, Zap, Film } from 'lucide-react';
import { formatBytes, formatDuration } from '@/utils/streamUpload';

export type VideoUploadState = 
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'error';

interface VideoUploadProgressProps {
  state: VideoUploadState;
  progress: number;
  fileName?: string;
  errorMessage?: string;
  // Enhanced progress info
  bytesUploaded?: number;
  bytesTotal?: number;
  uploadSpeed?: number;
  eta?: number;
  // Processing state info
  processingState?: string;
  processingProgress?: number;
  // Video ID for thumbnail preview
  videoId?: string;
}

/**
 * Enhanced video upload progress indicator
 * Shows upload progress, speed, ETA, and file size
 */
export const VideoUploadProgress = memo(({
  state,
  progress,
  fileName,
  errorMessage,
  bytesUploaded = 0,
  bytesTotal = 0,
  uploadSpeed = 0,
  eta = 0,
  processingState,
  processingProgress,
  videoId,
}: VideoUploadProgressProps) => {
  const [thumbnailError, setThumbnailError] = useState(false);
  
  // Cloudflare Stream thumbnail URL
  const thumbnailUrl = videoId 
    ? `https://videodelivery.net/${videoId}/thumbnails/thumbnail.jpg?time=1s`
    : null;

  if (state === 'idle') return null;

  return (
    <div className="p-4 bg-secondary/50 rounded-lg border border-border/50">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {state === 'uploading' && (
            <div className="relative">
              <Upload className="w-5 h-5 text-primary animate-pulse" />
            </div>
          )}
          {state === 'processing' && (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          )}
          {state === 'ready' && (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          )}
          {state === 'error' && (
            <XCircle className="w-5 h-5 text-destructive" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium truncate max-w-[200px]">
              {fileName || 'Video'}
            </span>
            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0 font-mono">
              {state === 'uploading' && `${progress}%`}
              {state === 'processing' && 'Đang xử lý...'}
              {state === 'ready' && 'Hoàn thành!'}
              {state === 'error' && 'Lỗi'}
            </span>
          </div>

          {/* Progress bar */}
          {(state === 'uploading' || state === 'processing') && (
            <Progress 
              value={state === 'processing' ? 100 : progress} 
              className="h-2 mb-2"
            />
          )}

          {/* Upload details (only show when uploading) */}
          {state === 'uploading' && bytesTotal > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {/* File size progress */}
              <span className="font-mono">
                {formatBytes(bytesUploaded)} / {formatBytes(bytesTotal)}
              </span>
              
              {/* Upload speed */}
              {uploadSpeed > 0 && (
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {formatBytes(uploadSpeed)}/s
                </span>
              )}
              
              {/* ETA */}
              {eta > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  ~{formatDuration(eta)}
                </span>
              )}
            </div>
          )}

          {/* Processing message with thumbnail preview */}
          {state === 'processing' && (
            <div className="space-y-2">
              {/* Thumbnail preview */}
              {thumbnailUrl && !thumbnailError && (
                <div className="relative rounded-lg overflow-hidden">
                  <img
                    src={thumbnailUrl}
                    alt="Video thumbnail"
                    className="w-full h-32 object-cover animate-pulse"
                    onError={() => setThumbnailError(true)}
                  />
                  <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center">
                    <div className="flex items-center gap-2 text-white text-sm font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang mã hóa video...</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Fallback when no thumbnail */}
              {(!thumbnailUrl || thumbnailError) && (
                <div className="relative rounded-lg overflow-hidden bg-muted/50 h-32 flex items-center justify-center">
                  <Film className="w-12 h-12 text-muted-foreground/50 animate-pulse" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang mã hóa video...</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Progress bar */}
              {processingProgress !== undefined && processingProgress > 0 && (
                <Progress value={processingProgress} className="h-1.5" />
              )}
              <p className="text-xs text-muted-foreground">
                {processingState === 'queued' && '⏳ Đang chờ xử lý...'}
                {processingState === 'inprogress' && `🔄 Tiến trình: ${processingProgress || 0}%`}
                {(!processingState || processingState === 'processing') && '🔄 Cloudflare đang xử lý...'}
              </p>
            </div>
          )}

          {/* Success message */}
          {state === 'ready' && (
            <p className="text-xs text-green-600">
              Video đã sẵn sàng để phát!
            </p>
          )}

          {/* Error message */}
          {state === 'error' && errorMessage && (
            <p className="text-xs text-destructive mt-1">{errorMessage}</p>
          )}
        </div>
      </div>

      {/* Warning for large uploads */}
      {state === 'uploading' && bytesTotal > 100 * 1024 * 1024 && (
        <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-700 dark:text-yellow-400">
          ⚠️ Video lớn - vui lòng không đóng tab trong khi upload (có thể resume nếu mạng chập chờn)
        </div>
      )}
    </div>
  );
});

VideoUploadProgress.displayName = 'VideoUploadProgress';

export default VideoUploadProgress;
