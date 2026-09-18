import { useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import funMoneyCoin from '@/assets/tokens/fun-money-coin.png';

const RAINBOW_COLORS = [
  '#FFD700', '#FFEA00', '#FFFFFF',
  '#FFF700', '#FFFF00', '#FFFFFF',
  '#FFE100', '#FFFFFF', '#FFED4A',
];

interface DonationCelebrationProps {
  isActive: boolean;
  showRichText?: boolean;
}

export const DonationCelebration = ({ isActive, showRichText = false }: DonationCelebrationProps) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fireworkRef = useRef<NodeJS.Timeout | null>(null);

  const richItems = useMemo(() => 
    [...Array(15)].map((_, i) => ({
      left: `${5 + Math.random() * 90}%`,
      top: `${5 + Math.random() * 85}%`,
      color: RAINBOW_COLORS[i % RAINBOW_COLORS.length],
      delay: `${Math.random() * 3}s`,
      duration: `${3 + Math.random() * 2}s`,
      size: ['text-2xl', 'text-3xl', 'text-4xl'][Math.floor(Math.random() * 3)],
      rotation: Math.random() * 40 - 20,
    })), []);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (fireworkRef.current) clearInterval(fireworkRef.current);
      intervalRef.current = null;
      fireworkRef.current = null;
      return;
    }

    const fireConfetti = () => {
      confetti({ particleCount: 45, spread: 80, origin: { x: 0.15, y: 0.6 }, colors: RAINBOW_COLORS, ticks: 150, zIndex: 9998 });
      confetti({ particleCount: 45, spread: 80, origin: { x: 0.85, y: 0.6 }, colors: RAINBOW_COLORS, ticks: 150, zIndex: 9998 });
      confetti({ particleCount: 30, spread: 120, origin: { x: 0.5, y: 0.2 }, colors: RAINBOW_COLORS, scalar: 1.3, ticks: 150, zIndex: 9998 });
    };

    const fireFirework = () => {
      confetti({
        particleCount: 50,
        spread: 360,
        startVelocity: 50,
        gravity: 1.2,
        ticks: 150,
        origin: { x: 0.1 + Math.random() * 0.8, y: 0.9 + Math.random() * 0.1 },
        colors: RAINBOW_COLORS,
        zIndex: 9998,
      });
    };

    fireConfetti();
    fireFirework();
    intervalRef.current = setInterval(fireConfetti, 1500);
    fireworkRef.current = setInterval(fireFirework, 2500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (fireworkRef.current) clearInterval(fireworkRef.current);
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* Falling coins */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-fall"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
            }}
          >
            <img src={funMoneyCoin} alt="FUN Money" className="w-10 h-10 animate-spin-slow" style={{ filter: 'drop-shadow(0 0 6px rgba(255, 215, 0, 0.8))' }} />
          </div>
        ))}
      </div>

      {/* Sparkles */}
      <div className="absolute inset-0">
        {[...Array(15)].map((_, i) => (
          <div
            key={`sparkle-${i}`}
            className="absolute w-2 h-2 bg-gold rounded-full animate-sparkle"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 2}s` }}
          />
        ))}
      </div>

      {/* RICH rainbow text */}
      {showRichText && (
        <div className="absolute inset-0 overflow-hidden">
          {richItems.map((item, i) => (
            <span
              key={`rich-${i}`}
              className={`absolute font-extrabold ${item.size} animate-rich-float select-none`}
              style={{
                left: item.left,
                top: item.top,
                color: item.color,
                animationDelay: item.delay,
                animationDuration: item.duration,
                transform: `rotate(${item.rotation}deg)`,
                textShadow: `1px 1px 2px rgba(0,0,0,0.5), 0 0 4px ${item.color}`,
                WebkitTextStroke: `1px rgba(0,0,0,0.3)`,
              }}
            >
              RICH
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
