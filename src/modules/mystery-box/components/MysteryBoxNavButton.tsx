import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useMysteryBoxInventory } from '@/modules/mystery-box/hooks/useMysteryBox';

interface Props { variant?: 'desktop' | 'mobile'; className?: string; }

export function MysteryBoxNavButton({ variant = 'desktop', className = '' }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: items = [] } = useMysteryBoxInventory();
  const unopened = items.filter(i => !i.opened_at).length;
  const isActive = location.pathname.startsWith('/mystery-box');

  if (variant === 'mobile') {
    return (
      <button
        onClick={() => navigate('/mystery-box')}
        aria-label="Hộp bí ẩn"
        className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[52px] rounded-full transition-all ${isActive ? 'text-primary-foreground bg-primary' : 'text-foreground hover:bg-primary/10'} ${className}`}
      >
        <Sparkles className="w-6 h-6 text-amber-500" strokeWidth={1.8} />
        {unopened > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-red-500 text-white flex items-center justify-center">
            {unopened > 99 ? '99+' : unopened}
          </span>
        )}
        <span className="text-[10px] mt-0.5 font-medium">Hộp</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => navigate('/mystery-box')}
      aria-label="Hộp bí ẩn"
      title={`Hộp bí ẩn${unopened > 0 ? ` (${unopened} chưa mở)` : ''}`}
      className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all ${isActive ? 'bg-amber-500/15' : 'hover:bg-amber-500/10'} ${unopened > 0 ? 'animate-pulse' : ''} ${className}`}
    >
      <Sparkles className="w-7 h-7 text-amber-500 drop-shadow-[0_0_6px_hsl(45_95%_55%/0.5)]" strokeWidth={1.8} />
      {unopened > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-red-500 text-white flex items-center justify-center">
          {unopened > 99 ? '99+' : unopened}
        </span>
      )}
    </button>
  );
}
