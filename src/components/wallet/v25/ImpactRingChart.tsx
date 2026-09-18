import { Sparkles } from 'lucide-react';

interface ImpactRingChartProps {
  value: number; // 0..3
  size?: number;
}

export function ImpactRingChart({ value, size = 80 }: ImpactRingChartProps) {
  const clamped = Math.max(0, Math.min(3, value));
  const pct = (clamped / 3) * 100;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="hsl(var(--muted))" strokeWidth="6" fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="url(#im-grad)" strokeWidth="6" fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
        <defs>
          <linearGradient id="im-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(45, 100%, 60%)" />
            <stop offset="50%" stopColor="hsl(20, 100%, 55%)" />
            <stop offset="100%" stopColor="hsl(330, 100%, 60%)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Sparkles className="w-3 h-3 text-amber-500 mb-0.5" />
        <span className="text-sm font-bold leading-none">{clamped.toFixed(2)}</span>
        <span className="text-[9px] text-muted-foreground leading-none mt-0.5">/ 3.0</span>
      </div>
    </div>
  );
}
