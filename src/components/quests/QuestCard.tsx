import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Check, Lock, ArrowRight,
  BookHeart, Gift, Heart, MessageCircle, UserPlus, Flame, ShieldCheck, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { QuestWithProgress } from '@/hooks/useQuests';
import { getStreakMultiplier } from '@/config/questConstants';

interface Props {
  quest: QuestWithProgress;
  currentStreak: number;
  trustTier?: string | null;
}

const FREQ_LABEL: Record<string, string> = {
  daily: 'Hằng ngày',
  weekly: 'Hằng tuần',
  once: 'Một lần',
  per_event: 'Theo sự kiện',
};

const ICON_MAP: Record<string, LucideIcon> = {
  BookHeart, Gift, Heart, MessageCircle, UserPlus, Flame, ShieldCheck, Sparkles,
};

function getQuestIcon(name?: string | null): LucideIcon {
  if (name && ICON_MAP[name]) return ICON_MAP[name];
  return Sparkles;
}

const QUEST_ACTION: Record<string, { label: string; to: string }> = {
  DAILY_INNER_WORK_POST: { label: 'Đăng bài Sám Hối', to: '/?compose=inner_work' },
  DAILY_GIFT_ANY: { label: 'Tặng quà ngay', to: '/users' },
  DAILY_REACT_5: { label: 'Vào Feed thả tim', to: '/' },
  DAILY_COMMENT_3: { label: 'Vào Feed bình luận', to: '/' },
  WEEKLY_INVITE_FRIEND: { label: 'Mời bạn', to: '/friends' },
  ONCE_IDENTITY_ONBOARD: { label: 'Bắt đầu Onboarding', to: '/identity/onboarding' },
  EVENT_CHANNELING_ZOOM: { label: 'Xem lịch Channeling', to: '/live' },
};

function getQuestAction(code?: string | null) {
  if (!code) return null;
  return QUEST_ACTION[code] ?? null;
}

export function QuestCard({ quest, currentStreak, trustTier }: Props) {
  const Icon = getQuestIcon(quest.icon);
  const completed = !!quest.progress?.completed_at;
  const pct = Math.min(100, Math.round((quest.current / quest.target_count) * 100));
  const tierOk = !trustTier || trustTier >= quest.trust_tier_min;
  const mul = getStreakMultiplier(currentStreak);
  const projectedLs = Math.round(quest.ls_base * mul);
  const earned = Number(quest.progress?.ls_awarded ?? 0);
  const isLocked = !tierOk;

  return (
    <Card
      className={`p-4 transition-all relative overflow-hidden ${
        completed
          ? 'border-emerald-500/50 bg-emerald-500/5'
          : isLocked
          ? 'border-amber-500/30 bg-amber-500/[0.03]'
          : 'hover:border-primary/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`relative shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden transition-transform hover:scale-105 ${
            completed
              ? 'bg-gradient-to-br from-emerald-400/25 to-emerald-600/10 ring-2 ring-emerald-400/50'
              : isLocked
              ? 'bg-gradient-to-br from-amber-400/20 to-amber-600/10'
              : 'bg-gradient-to-br from-pink-300/25 via-purple-300/20 to-sky-300/20'
          }`}
        >
          <Icon
            className={`w-7 h-7 drop-shadow-sm ${
              completed ? 'text-emerald-600' : isLocked ? 'text-amber-600 opacity-60' : 'text-primary'
            }`}
            aria-label={quest.title_vi}
          />

          {completed && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
              <Check className="w-3 h-3" />
            </span>
          )}
          {isLocked && (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center shadow">
              <Lock className="w-3 h-3" />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{quest.title_vi}</h3>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5">{FREQ_LABEL[quest.frequency]}</Badge>
            {isLocked && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-amber-600 border-amber-500/40">
                <Lock className="w-2.5 h-2.5 mr-1" /> Cần {quest.trust_tier_min}
              </Badge>
            )}
          </div>
          {quest.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{quest.description}</p>
          )}

          <div className="mt-3 space-y-1.5">
            <Progress value={pct} className="h-1.5" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{quest.current}/{quest.target_count}</span>
              <span className="flex items-center gap-1 font-medium">
                {completed ? (
                  <span className="text-emerald-600">
                    +{earned.toFixed(0)} LS {quest.progress?.ls_capped && '(cap)'}
                  </span>
                ) : isLocked ? (
                  <span className="text-amber-600">+{projectedLs} LS (khoá)</span>
                ) : (
                  <span className="text-primary">
                    +{projectedLs} LS{mul > 1 ? ` (×${mul})` : ''}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Action CTA — dẫn user đến trang thực hiện nhiệm vụ */}
          {!completed && !isLocked && (() => {
            const action = getQuestAction(quest.code);
            if (!action) return null;
            return (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs gap-1 mt-3"
              >
                <Link to={action.to}>
                  {action.label} <ArrowRight className="w-3 h-3" />
                </Link>
              </Button>
            );
          })()}

          {/* Locked explainer + CTA */}
          {isLocked && (
            <div className="mt-3 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-1.5">
              <p className="text-[11px] font-semibold flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <Lock className="w-3 h-3" /> Quest này yêu cầu Trust Tier {quest.trust_tier_min}
              </p>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-4 list-disc">
                <li>Liên kết & xác minh ví</li>
                <li>Hoàn thành Identity Onboarding</li>
                <li>TC ≥ 0.60 và Sybil ≠ High</li>
              </ul>
              <Button
                asChild
                size="sm"
                className="w-full h-7 text-xs gap-1 bg-gradient-to-r from-emerald-500 to-amber-500 text-white hover:opacity-90"
              >
                <Link to="/identity?guide=1">
                  🚀 Nâng cấp ngay <ArrowRight className="w-3 h-3" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
