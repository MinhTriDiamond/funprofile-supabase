import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Shield, ShieldAlert } from 'lucide-react';

const LEVEL_MAP: Record<string, { label: string; color: string; icon: any }> = {
  L0: { label: 'L0 · Anonymous', color: 'bg-muted text-muted-foreground', icon: Shield },
  L1: { label: 'L1 · Basic', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', icon: Shield },
  L2: { label: 'L2 · Verified', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', icon: ShieldCheck },
  L3: { label: 'L3 · Trusted', color: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', icon: ShieldCheck },
  L4: { label: 'L4 · Core', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', icon: ShieldCheck },
};

export function DIDBadge({ level, status, compact }: { level?: string; status?: string; compact?: boolean }) {
  if (!level) return null;
  const cfg = LEVEL_MAP[level] ?? LEVEL_MAP.L0;
  const Icon = status === 'restricted' || status === 'suspended' ? ShieldAlert : cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.color} border-0 gap-1 font-medium`}>
      <Icon className="w-3 h-3" />
      {compact ? level : cfg.label}
    </Badge>
  );
}
