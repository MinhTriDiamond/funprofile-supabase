import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuests } from '@/hooks/useQuests';
import questIcon from '@/assets/quest-icon.png';

interface Props {
  variant?: 'desktop' | 'mobile' | 'compact';
  className?: string;
}

/**
 * Nút Quests với progress ring quanh icon checklist.
 * - Vòng xanh emerald = % daily quest đã hoàn thành hôm nay
 * - Phần còn lại = vàng đậm (chưa xong)
 * - Pulse glow vàng nếu có quest đã hoàn thành nhưng LS chưa được award (pending evaluate)
 */
export function QuestNavButton({ variant = 'desktop', className = '' }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: quests } = useQuests();
  const isActive = location.pathname.startsWith('/quests');

  const { pct, hasPending } = useMemo(() => {
    const dailies = (quests ?? []).filter((q) => q.frequency === 'daily');
    if (dailies.length === 0) return { pct: 0, hasPending: false };
    const done = dailies.filter((q) => !!q.progress?.completed_at).length;
    const pending = dailies.some(
      (q) => q.current >= q.target_count && !q.progress?.completed_at
    );
    return { pct: Math.round((done / dailies.length) * 100), hasPending: pending };
  }, [quests]);

  // SVG ring config — desktop to bằng music icon (~40px), mobile vẫn 36
  const size = variant === 'mobile' ? 36 : 40;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  const ring = (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0 -rotate-90 pointer-events-none"
    >
      {/* Track (vàng đậm = chưa hoàn thành) */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="hsl(45 95% 55% / 0.55)"
        strokeWidth={stroke}
      />
      {/* Progress (xanh emerald = đã hoàn thành) */}
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(152 70% 45%)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className="transition-all duration-500"
        />
      )}
    </svg>
  );

  const label = 'Quests';

  if (variant === 'mobile') {
    return (
      <button
        onClick={() => navigate('/quests')}
        aria-label={label}
        className={`flex flex-col items-center justify-center min-w-[56px] min-h-[52px] rounded-full transition-all duration-300 group border-[0.5px] ${
          isActive
            ? 'text-primary-foreground bg-primary border-gold'
            : 'text-foreground hover:text-primary hover:bg-primary/10 border-transparent hover:border-gold/40 active:text-primary-foreground active:bg-primary'
        } ${hasPending ? 'animate-pulse' : ''} ${className}`}
      >
        <div className="relative w-9 h-9 flex items-center justify-center">
          {ring}
          <img
            src={questIcon}
            alt={label}
            className="w-6 h-6 object-contain transition-transform duration-300 group-hover:scale-110 drop-shadow-[0_0_6px_hsl(45_95%_55%/0.6)]"
          />
        </div>
        <span className="text-[10px] mt-0.5 font-medium">{label}</span>
      </button>
    );
  }

  // Desktop / compact (cho top navbar bên trái music) — to bằng icon nhạc (40px)
  return (
    <button
      onClick={() => navigate('/quests')}
      aria-label={label}
      title={label}
      className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 group ${
        isActive ? 'bg-emerald-500/10' : 'hover:bg-emerald-500/10'
      } ${hasPending ? 'animate-pulse' : ''} ${className}`}
    >
      {ring}
      <img
        src={questIcon}
        alt={label}
        className="w-7 h-7 object-contain transition-all duration-300 group-hover:scale-110 drop-shadow-[0_0_6px_hsl(45_95%_55%/0.5)] group-hover:drop-shadow-[0_0_10px_hsl(45_95%_55%/0.8)]"
      />
    </button>
  );
}
