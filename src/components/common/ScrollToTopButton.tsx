import { useState, useEffect, useCallback, memo } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ScrollToTopButtonProps {
  threshold?: number;
  className?: string;
}

const ScrollToTopButton = memo(({ threshold = 400, className }: ScrollToTopButtonProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const scrollTarget = document.querySelector<HTMLElement>('[data-app-scroll]');
    const isWindowTarget = !scrollTarget;

    const getScrollTop = () => {
      if (isWindowTarget) return window.scrollY;
      return scrollTarget?.scrollTop ?? 0;
    };

    const toggleVisibility = () => {
      setIsVisible(getScrollTop() > threshold);
    };

    // Set initial state
    toggleVisibility();

    const target: EventTarget = isWindowTarget ? window : (scrollTarget as unknown as EventTarget);
    target.addEventListener('scroll', toggleVisibility, { passive: true } as AddEventListenerOptions);

    return () => {
      target.removeEventListener('scroll', toggleVisibility as EventListener);
    };
  }, [threshold]);

  const scrollToTop = useCallback(() => {
    const scrollTarget = document.querySelector<HTMLElement>('[data-app-scroll]');
    if (scrollTarget) {
      scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (!isVisible) return null;

  return (
    <Button
      onClick={scrollToTop}
      size="icon"
      className={cn(
        'fixed bottom-20 right-4 z-50 rounded-full shadow-lg',
        'bg-primary hover:bg-primary/90 text-primary-foreground',
        'animate-fade-in transition-all duration-300',
        'md:bottom-6 md:right-6',
        className
      )}
      aria-label="Quay lại đầu trang"
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  );
});

ScrollToTopButton.displayName = 'ScrollToTopButton';

export default ScrollToTopButton;
