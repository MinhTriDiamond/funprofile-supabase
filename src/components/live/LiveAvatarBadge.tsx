import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface LiveAvatarBadgeProps {
  avatarUrl?: string | null;
  username?: string | null;
  userId?: string | null;
  isLive?: boolean;
  liveSessionId?: string | null;
  size?: number | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  imageClassName?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  onTouchStart?: () => void;
  ariaLabel?: string;
}

const SIZE_CLASS: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-24 w-24 sm:h-28 sm:w-28 md:h-36 md:w-36',
};

function sizeClass(size: LiveAvatarBadgeProps['size']): string {
  if (typeof size === 'number') return '';
  return SIZE_CLASS[size || 'md'];
}

function avatarSizeHint(size: LiveAvatarBadgeProps['size']): 'sm' | 'md' | 'lg' {
  if (size === 'sm' || size === 32) return 'sm';
  if (size === 'lg' || size === 'xl' || (typeof size === 'number' && size >= 56)) return 'lg';
  return 'md';
}

export function LiveAvatarBadge({
  avatarUrl,
  username,
  userId,
  isLive = false,
  size = 'md',
  className,
  imageClassName,
  onClick,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ariaLabel,
}: LiveAvatarBadgeProps) {
  const fallback = (username || userId || 'U').slice(0, 1).toUpperCase();
  const style = typeof size === 'number' ? { width: size, height: size } : undefined;
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      onTouchStart={onTouchStart}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full align-middle',
        onClick && 'cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
        isLive && 'p-[2px] bg-red-600 shadow-[0_0_0_2px_rgba(220,38,38,0.18)]',
        isLive && 'before:absolute before:inset-0 before:rounded-full before:bg-red-500/30 before:animate-ping',
        className,
      )}
      style={style}
      aria-label={ariaLabel || (isLive ? `${username || 'User'} dang phat truc tiep` : username || 'Avatar')}
      data-live={isLive ? 'true' : 'false'}
    >
      <span className={cn('relative z-10 rounded-full bg-background', isLive && 'p-[2px]')}>
        <Avatar className={cn(sizeClass(size), imageClassName)}>
          <AvatarImage src={avatarUrl || ''} sizeHint={avatarSizeHint(size)} />
          <AvatarFallback className="bg-primary text-primary-foreground">
            {fallback}
          </AvatarFallback>
        </Avatar>
      </span>

      {isLive && (
        <span className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-sm bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-wide text-white shadow-md ring-2 ring-background">
          LIVE
        </span>
      )}
    </Wrapper>
  );
}
