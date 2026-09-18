import { memo, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface FeedPostViewportGateProps {
  children: ReactNode;
  priority?: boolean;
  fallbackHeight?: number;
}

export const FeedPostViewportGate = memo(function FeedPostViewportGate({
  children,
  priority = false,
  fallbackHeight = 520,
}: FeedPostViewportGateProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [isActive, setIsActive] = useState(priority);
  const [measuredHeight, setMeasuredHeight] = useState(fallbackHeight);

  useEffect(() => {
    if (priority) {
      setIsActive(true);
      return;
    }

    const node = shellRef.current;
    if (!node) return;
    const root = document.querySelector<HTMLElement>('[data-app-scroll]');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsActive(true);
          return;
        }

        const height = node.getBoundingClientRect().height;
        if (height > 120) setMeasuredHeight(Math.ceil(height));
        setIsActive(false);
      },
      {
        root,
        rootMargin: '1400px 0px 1800px',
        threshold: 0,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [priority]);

  useLayoutEffect(() => {
    if (!isActive || !shellRef.current) return;
    const node = shellRef.current;
    const syncHeight = () => {
      const height = node.getBoundingClientRect().height;
      if (height > 120) setMeasuredHeight(Math.ceil(height));
    };
    syncHeight();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isActive]);

  return (
    <div ref={shellRef} className="feed-post-shell">
      {isActive ? (
        children
      ) : (
        <div
          className="rounded-lg bg-card/40"
          style={{ height: measuredHeight }}
          aria-hidden="true"
        />
      )}
    </div>
  );
});

FeedPostViewportGate.displayName = 'FeedPostViewportGate';
