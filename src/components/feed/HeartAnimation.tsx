import { useEffect, useState } from 'react';

interface HeartAnimationProps {
  show: boolean;
  onComplete?: () => void;
}

/**
 * GPU-accelerated heart animation for double-tap like.
 * Uses CSS transform: scale() for 60fps on mobile.
 */
export const HeartAnimation = ({ show, onComplete }: HeartAnimationProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      navigator.vibrate?.(10);
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
      <span
        className="text-7xl drop-shadow-2xl"
        style={{
          willChange: 'transform, opacity',
          animation: 'heart-pop 1s ease-out forwards',
        }}
      >
        ❤️
      </span>
      <style>{`
        @keyframes heart-pop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          15% {
            transform: scale(1.3);
            opacity: 1;
          }
          30% {
            transform: scale(0.95);
            opacity: 1;
          }
          45% {
            transform: scale(1.1);
            opacity: 1;
          }
          70% {
            transform: scale(1);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
