import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ComposerActionVariant = 'iconOnly' | 'label' | 'toolbar';

interface CreatePostActionButtonProps {
  icon: ReactNode;
  label: string;
  colorClass?: string;
  active?: boolean;
  disabled?: boolean;
  variant?: ComposerActionVariant;
  onClick: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  className?: string;
}

export const CreatePostActionButton = forwardRef<HTMLButtonElement, CreatePostActionButtonProps>(function CreatePostActionButton({
  icon,
  label,
  colorClass,
  active = false,
  disabled = false,
  variant = 'label',
  onClick,
  onMouseEnter,
  onFocus,
  className,
}, ref) {
  const iconElement = (
    <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center [&_svg]:h-5 [&_svg]:w-5', colorClass)}>
      {icon}
    </span>
  );

  if (variant === 'iconOnly') {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onFocus={onFocus}
        disabled={disabled}
        title={label}
        aria-label={label}
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95',
          active && 'bg-primary/10',
          disabled && 'cursor-not-allowed opacity-50 active:scale-100',
          className,
        )}
      >
        {iconElement}
      </button>
    );
  }

  if (variant === 'toolbar') {
    return (
      <button
        ref={ref}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          onClick();
        }}
        onMouseEnter={onMouseEnter}
        onFocus={onFocus}
        disabled={disabled}
        aria-label={label}
        className={cn(
          'group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold shadow-sm transition',
          'hover:-translate-y-0.5 hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95',
          active ? 'border-primary/35 bg-primary/10 text-primary' : 'border-border/70 bg-card text-foreground',
          disabled && 'cursor-not-allowed opacity-50 hover:translate-y-0 hover:shadow-sm active:scale-100',
          className,
        )}
      >
        {iconElement}
        <span className="whitespace-nowrap">{label}</span>
      </button>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold transition-colors',
        'text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95',
        active && 'bg-primary/10 text-primary',
        disabled && 'cursor-not-allowed opacity-50 active:scale-100',
        className,
      )}
    >
      {iconElement}
      <span className="truncate">{label}</span>
    </button>
  );
});

CreatePostActionButton.displayName = 'CreatePostActionButton';
