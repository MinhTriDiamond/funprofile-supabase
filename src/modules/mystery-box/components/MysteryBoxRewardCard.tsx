import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { TIER_COLORS, type BoxTier, type BoxRewardPayload } from '../types';
import { BoxTierBadge } from './BoxTierBadge';

export function formatRewardLabel(r: BoxRewardPayload): string {
  switch (r.type) {
    case 'ls': return `+${r.value_int} Light Score`;
    case 'camly': return `+${r.value_int.toLocaleString('vi-VN')} CAMLY`;
    case 'pet_xp': return `+${r.value_int} XP Lumi`;
    case 'pet_skin': return `Skin Lumi: ${(r.metadata?.skin_id as string) ?? 'mới'}`;
    case 'cosmetic': return `Cosmetic: ${(r.metadata?.frame_id as string) ?? 'mới'}`;
    case 'sbt_trigger': return `SBT: ${(r.metadata?.sbt_code as string) ?? ''}`;
    case 'box_upgrade': return `Nâng cấp: ${(r.metadata?.upgrade_to as string) ?? ''}`;
    default: return r.reward_code;
  }
}

interface Props {
  reward: BoxRewardPayload;
  tier?: BoxTier;
  compact?: boolean;
}

export function MysteryBoxRewardCard({ reward, tier, compact }: Props) {
  const t = tier ?? reward.tier ?? 'common';
  const c = TIER_COLORS[t];

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <BoxTierBadge tier={t} />
        <span className="font-medium">{formatRewardLabel(reward)}</span>
      </div>
    );
  }

  return (
    <Card className={`flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-br ${c.bg} p-6 ring-4 ${c.ring} shadow-2xl ${c.glow} border-0`}>
      <Sparkles className={`h-10 w-10 ${c.text}`} />
      <div className={`text-3xl font-extrabold ${c.text} text-center`}>{formatRewardLabel(reward)}</div>
      <div className={`text-xs uppercase tracking-widest ${c.text} opacity-80`}>{reward.rarity}</div>
    </Card>
  );
}
