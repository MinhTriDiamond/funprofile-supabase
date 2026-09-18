import { memo, useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  duration?: number;
  format: (n: number) => string;
  className?: string;
}

// easeOutCubic for mượt
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export const CountUp = memo(({ value, duration = 2000, format, className }: CountUpProps) => {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const playedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || playedRef.current) {
      // Nếu đã chạy rồi mà value thay đổi → set thẳng giá trị mới
      if (playedRef.current) setDisplay(value);
      return;
    }

    const start = () => {
      if (playedRef.current) return;
      playedRef.current = true;
      const startTime = performance.now();
      const from = 0;
      const to = value;
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        setDisplay(from + (to - from) * ease(t));
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            start();
            io.disconnect();
          }
        });
      }, { threshold: 0.2 });
      io.observe(el);
      return () => {
        io.disconnect();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    start();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {format(display)}
    </span>
  );
});

CountUp.displayName = 'CountUp';
