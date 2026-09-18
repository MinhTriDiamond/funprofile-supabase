import { Badge } from '@/components/ui/badge';
import { Sparkles, Star, Sun, Zap, Crown, Infinity } from 'lucide-react';

const TIER_CONFIG: Record<string, { icon: any; gradient: string; text: string }> = {
  'Seed Light':    { icon: Sparkles, gradient: 'from-emerald-300 to-emerald-500',     text: 'text-emerald-50' },
  'Pure Light':    { icon: Star,     gradient: 'from-sky-400 to-sky-600',             text: 'text-sky-50' },
  'Guiding Light': { icon: Sun,      gradient: 'from-amber-400 to-orange-500',        text: 'text-amber-50' },
  'Radiant Light': { icon: Zap,      gradient: 'from-yellow-400 via-orange-400 to-pink-500', text: 'text-yellow-50' },
  'Legacy Light':  { icon: Crown,    gradient: 'from-purple-500 via-fuchsia-500 to-pink-500', text: 'text-purple-50' },
  'Cosmic Light':  { icon: Infinity, gradient: 'from-indigo-500 via-purple-500 to-fuchsia-600', text: 'text-indigo-50' },
};

interface TierBadgeProps {
  tier: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function TierBadge({ tier, size = 'md', showLabel = true }: TierBadgeProps) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG['Seed Light'];
  const Icon = cfg.icon;
  const sizeClass = size === 'sm' ? 'text-[10px] py-0.5 px-2' : size === 'lg' ? 'text-sm py-1.5 px-3' : 'text-xs py-1 px-2.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5';

  return (
    <Badge className={`bg-gradient-to-r ${cfg.gradient} ${cfg.text} border-0 inline-flex items-center gap-1 ${sizeClass}`}>
      <Icon className={iconSize} />
      {showLabel && <span className="font-semibold">{tier}</span>}
    </Badge>
  );
}
