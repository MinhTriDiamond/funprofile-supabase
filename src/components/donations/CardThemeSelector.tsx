import { cn } from '@/lib/utils';

export interface CardTheme {
  id: string;
  name: string;
  emoji: string;
  backgrounds: string[];
  textColor: string;
  borderColor: string;
  accentColor: string;
}

export const CARD_THEMES: CardTheme[] = [
  {
    id: 'celebration',
    name: 'Chúc mừng',
    emoji: '🎉',
    backgrounds: [
      'linear-gradient(135deg, #fffef5 0%, #fff9e6 30%, #fff3cc 70%, #ffe4a0 100%)',
      'linear-gradient(135deg, #ffd700 0%, #ffb347 50%, #ffd700 100%)',
      'linear-gradient(135deg, #fff8e1 0%, #ffe082 50%, #ffca28 100%)',
    ],
    textColor: 'text-amber-800',
    borderColor: 'border-amber-400',
    accentColor: '#ffd700',
  },
  {
    id: 'gratitude',
    name: 'Tri ân',
    emoji: '🙏',
    backgrounds: [
      'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%)',
      'linear-gradient(135deg, #059669 0%, #34d399 50%, #6ee7b7 100%)',
      'linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 50%, #86efac 100%)',
    ],
    textColor: 'text-emerald-800',
    borderColor: 'border-emerald-400',
    accentColor: '#10b981',
  },
  {
    id: 'birthday',
    name: 'Sinh nhật',
    emoji: '🎂',
    backgrounds: [
      'linear-gradient(135deg, #fff1f2 0%, #fecdd3 50%, #fda4af 100%)',
      'linear-gradient(135deg, #f43f5e 0%, #fb7185 50%, #fda4af 100%)',
      'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 50%, #fbbf24 100%)',
    ],
    textColor: 'text-rose-800',
    borderColor: 'border-rose-400',
    accentColor: '#f43f5e',
  },
  {
    id: 'love',
    name: 'Tình yêu',
    emoji: '❤️',
    backgrounds: [
      'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 50%, #fda4af 100%)',
      'linear-gradient(135deg, #e11d48 0%, #f43f5e 50%, #fb7185 100%)',
      'linear-gradient(135deg, #fce7f3 0%, #f9a8d4 50%, #f472b6 100%)',
    ],
    textColor: 'text-red-800',
    borderColor: 'border-red-400',
    accentColor: '#ef4444',
  },
  {
    id: 'newyear',
    name: 'Năm mới',
    emoji: '🎊',
    backgrounds: [
      'linear-gradient(135deg, #fef2f2 0%, #fecaca 30%, #ffd700 100%)',
      'linear-gradient(135deg, #dc2626 0%, #ef4444 50%, #ffd700 100%)',
      'linear-gradient(135deg, #fffbeb 0%, #fde68a 50%, #dc2626 100%)',
    ],
    textColor: 'text-red-800',
    borderColor: 'border-red-500',
    accentColor: '#dc2626',
  },
  {
    id: 'family',
    name: 'Gia đình',
    emoji: '👨‍👩‍👧‍👦',
    backgrounds: [
      'linear-gradient(135deg, #eef2ff 0%, #c7d2fe 50%, #a5b4fc 100%)',
      'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%)',
      'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 50%, #a5b4fc 100%)',
    ],
    textColor: 'text-indigo-800',
    borderColor: 'border-indigo-400',
    accentColor: '#6366f1',
  },
];

interface CardThemeSelectorProps {
  selectedTheme: CardTheme;
  selectedBgIndex: number;
  onSelectTheme: (theme: CardTheme) => void;
  onSelectBackground: (index: number) => void;
}

export const CardThemeSelector = ({
  selectedTheme,
  selectedBgIndex,
  onSelectTheme,
  onSelectBackground,
}: CardThemeSelectorProps) => {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-muted-foreground block">Chủ đề card:</label>
      
      {/* Theme chips */}
      <div className="flex flex-wrap gap-2">
        {CARD_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => onSelectTheme(theme)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border',
              selectedTheme.id === theme.id
                ? `bg-primary/10 border-primary text-primary`
                : 'bg-muted hover:bg-muted/80 border-border hover:border-primary/50'
            )}
          >
            <span>{theme.emoji}</span>
            <span>{theme.name}</span>
          </button>
        ))}
      </div>

      {/* Background options */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1.5">Chọn nền:</label>
        <div className="flex gap-2">
          {selectedTheme.backgrounds.map((bg, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectBackground(idx)}
              className={cn(
                'w-16 h-10 rounded-lg border-2 transition-all',
                selectedBgIndex === idx
                  ? 'border-primary ring-2 ring-primary/30 scale-105'
                  : 'border-border hover:border-primary/50'
              )}
              style={{ background: bg }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
