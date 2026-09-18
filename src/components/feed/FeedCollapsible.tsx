/**
 * FeedCollapsible — wrapper animate cho các khối chrome trên Home Feed.
 *
 * - KHÔNG unmount children (Carousel/Livestream/Stories giữ state).
 * - Đo chiều cao thực tế bằng ResizeObserver → set --feed-collapsible-h.
 * - Khi `collapsed`, max-height → 0, opacity → 0, pointer-events tắt.
 * - Reduced motion: snap instant, không transition.
 */
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface FeedCollapsibleProps {
  collapsed: boolean;
  reducedMotion?: boolean;
  /** Nếu set, thay vì collapse hoàn toàn, sẽ scale xuống chiều cao này (px). */
  miniHeight?: number;
  mini?: boolean;
  className?: string;
  children: ReactNode;
  /** Cho phép tương tác khi mini (mặc định true với mini, false với collapsed). */
  ariaLabel?: string;
}

export const FeedCollapsible = ({
  collapsed,
  reducedMotion = false,
  miniHeight,
  mini = false,
  className,
  children,
  ariaLabel,
}: FeedCollapsibleProps) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  // Đo chiều cao thực tế của children.
  useLayoutEffect(() => {
    if (!innerRef.current) return;
    const el = innerRef.current;
    const update = () => {
      const h = el.scrollHeight;
      if (h > 0) setNaturalHeight(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tính max-height hiệu lực
  let effectiveMax: string;
  if (collapsed) {
    effectiveMax = '0px';
  } else if (mini && miniHeight != null) {
    effectiveMax = `${miniHeight}px`;
  } else if (naturalHeight != null) {
    effectiveMax = `${naturalHeight}px`;
  } else {
    effectiveMax = 'none';
  }

  const transition = reducedMotion
    ? 'none'
    : 'max-height 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms ease, transform 280ms cubic-bezier(0.4, 0, 0.2, 1)';

  const opacity = collapsed ? 0 : 1;
  const transform = collapsed ? 'translateY(-6px)' : 'translateY(0)';

  return (
    <div
      aria-hidden={collapsed || undefined}
      aria-label={ariaLabel}
      className={cn('feed-collapsible', className)}
      style={{
        maxHeight: effectiveMax,
        opacity,
        transform,
        overflow: 'hidden',
        pointerEvents: collapsed ? 'none' : 'auto',
        transition,
        // Tránh giật khi nội dung động: nếu chưa đo được, dùng auto.
        willChange: 'max-height, opacity',
      }}
    >
      <div ref={innerRef}>
        {children}
      </div>
    </div>
  );
};
