import { ReactNode, useCallback } from 'react';
import { Loader2, ArrowDown, ArrowUp } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface PullToRefreshContainerProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function PullToRefreshContainer({
  onRefresh,
  children,
  disabled = false,
  className,
}: PullToRefreshContainerProps) {
  const isMobileOrTablet = useIsMobileOrTablet();
  
  const handleRefresh = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  const { isRefreshing, pullDistance, isPulling, containerRef } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
    maxPull: 150,
    disabled: disabled || !isMobileOrTablet,
  });

  const progress = Math.min(pullDistance / 80, 1);
  const isReady = pullDistance >= 80;

  // Don't add pull-to-refresh on desktop
  if (!isMobileOrTablet) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Pull Indicator */}
      <div
        className={cn(
          'absolute left-0 right-0 flex items-center justify-center z-50',
          'transition-opacity duration-200',
          (isPulling || isRefreshing) ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          top: 0,
          height: `${Math.max(pullDistance, isRefreshing ? 60 : 0)}px`,
          transform: `translateY(${isRefreshing ? 0 : -10}px)`,
        }}
      >
        <div 
          className={cn(
            'flex flex-col items-center justify-center gap-1 transition-all duration-200',
            isReady || isRefreshing ? 'text-primary' : 'text-muted-foreground'
          )}
          style={{
            opacity: isRefreshing ? 1 : progress,
            transform: `scale(${0.8 + progress * 0.2})`,
          }}
        >
          {isRefreshing ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs font-medium">Đang tải lại...</span>
            </>
          ) : isReady ? (
            <>
              <ArrowUp className="w-5 h-5" />
              <span className="text-xs font-medium">Thả để làm mới</span>
            </>
          ) : (
            <>
              <ArrowDown 
                className="w-5 h-5 transition-transform" 
                style={{ transform: `rotate(${progress * 180}deg)` }}
              />
              <span className="text-xs font-medium">Kéo để làm mới</span>
            </>
          )}
        </div>
      </div>

      {/* Content with transform */}
      <div
        className="h-full"
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}
