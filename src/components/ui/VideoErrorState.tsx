import { memo } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Clock, FileVideo, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface VideoErrorStateProps {
  errorCode?: string;
  errorMessage?: string;
  thumbnailUrl?: string;
  className?: string;
  onRetry?: () => void;
}

/**
 * User-friendly error UI for Cloudflare Stream video errors.
 * Shows specific messages based on error codes.
 */
export const VideoErrorState = memo(({
  errorCode,
  errorMessage,
  thumbnailUrl,
  className,
  onRetry,
}: VideoErrorStateProps) => {
  // Map error codes to user-friendly messages
  const getErrorDetails = () => {
    switch (errorCode) {
      case 'ERR_DURATION_EXCEED_CONSTRAINT':
        return {
          icon: Clock,
          title: 'Video quá dài',
          description: 'Video vượt quá giới hạn thời lượng cho phép (tối đa 6 giờ). Vui lòng tải lên video ngắn hơn.',
          color: 'text-amber-500',
        };
      case 'ERR_FILE_SIZE_EXCEEDED':
        return {
          icon: FileVideo,
          title: 'File quá lớn',
          description: 'Video vượt quá giới hạn dung lượng cho phép. Vui lòng nén video và thử lại.',
          color: 'text-amber-500',
        };
      default:
        return {
          icon: AlertTriangle,
          title: 'Lỗi xử lý video',
          description: errorMessage || 'Đã xảy ra lỗi khi xử lý video. Vui lòng thử lại sau.',
          color: 'text-destructive',
        };
    }
  };

  const { icon: Icon, title, description, color } = getErrorDetails();

  return (
    <div className={cn('relative bg-black aspect-video overflow-hidden', className)}>
      {/* Background thumbnail with blur overlay */}
      {thumbnailUrl ? (
        <img 
          src={thumbnailUrl} 
          alt="Video thumbnail"
          className="w-full h-full object-cover opacity-30"
          fetchPriority="low"
          decoding="async"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50" />
      )}
      
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/70" />
      
      {/* Error content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
        {/* Error icon */}
        <div className={cn('w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4', color)}>
          <Icon className="w-8 h-8" />
        </div>
        
        {/* Text */}
        <h3 className="text-white text-lg font-semibold mb-2">
          {title}
        </h3>
        <p className="text-white/70 text-sm max-w-[280px] mb-4">
          {description}
        </p>
        
        {/* Retry button */}
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Thử lại
          </Button>
        )}
      </div>
    </div>
  );
});

VideoErrorState.displayName = 'VideoErrorState';

export default VideoErrorState;
