import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Film } from 'lucide-react';
import { Progress } from './progress';

interface VideoProcessingStateProps {
  thumbnailUrl?: string;
  progress?: number; // 0-100
  className?: string;
}

/**
 * Friendly UI for videos still being encoded by Cloudflare Stream.
 * Shows thumbnail (if available), loading animation, and progress info.
 */
export const VideoProcessingState = memo(({
  thumbnailUrl,
  progress,
  className,
}: VideoProcessingStateProps) => {
  return (
    <div className={cn('relative bg-black aspect-video overflow-hidden', className)}>
      {/* Background thumbnail with blur overlay */}
      {thumbnailUrl ? (
        <img 
          src={thumbnailUrl} 
          alt="Video thumbnail"
          className="w-full h-full object-cover"
          fetchPriority="high"
          decoding="async"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50" />
      )}
      
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      {/* Processing content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
        {/* Animated icon */}
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <Film className="w-8 h-8 text-primary/60 absolute" />
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          </div>
        </div>
        
        {/* Text */}
        <span className="text-white text-base font-medium mb-1">
          Đang xử lý video...
        </span>
        <span className="text-white/60 text-sm text-center max-w-[200px]">
          Video đang được mã hóa, vui lòng đợi trong giây lát
        </span>
        
        {/* Progress bar */}
        {typeof progress === 'number' && progress > 0 && (
          <div className="w-full max-w-[200px] mt-4">
            <Progress value={progress} className="h-2" />
            <span className="text-white/60 text-xs mt-1 block text-center">
              {Math.round(progress)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

VideoProcessingState.displayName = 'VideoProcessingState';

export default VideoProcessingState;
