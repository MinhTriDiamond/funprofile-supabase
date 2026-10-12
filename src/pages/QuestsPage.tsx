import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useQuests, useQuestStreak, useQuestEvaluator } from '@/hooks/useQuests';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { QuestCard } from '@/components/quests/QuestCard';
import { StreakCounter } from '@/components/quests/StreakCounter';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Info, Rocket, RefreshCw, BicepsFlexed, Gift, Sparkles as PetIcon, ShoppingBag, Gamepad2, ShieldAlert, BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { BackToHomeBar, BackToHomeCTA } from '@/components/layout/BackToHome';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function QuestsPage() {
  const { t } = useLanguage();
  useEffect(() => { document.title = t('queDocTitle'); }, [t]);
  const { data: quests, isLoading } = useQuests();
  const { data: streak } = useQuestStreak();
  const { data: trust } = useTrustProfile();
  const evaluate = useQuestEvaluator();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await evaluate(true);
    setRefreshing(false);
    toast.success(t('queProgressUpdated'));
  };

  const tier = trust?.trust_tier ?? null;
  const dailyQuests = (quests ?? []).filter((q) => q.frequency === 'daily');
  const weeklyQuests = (quests ?? []).filter((q) => q.frequency === 'weekly');
  const otherQuests = (quests ?? []).filter((q) => q.frequency === 'once' || q.frequency === 'per_event');

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container max-w-3xl py-4 pb-32 space-y-5">
          <BackToHomeBar />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold">{t('queTitle')}</h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('queRefresh')}</span>
            </Button>
          </div>

          <StreakCounter
            currentStreak={streak?.current_streak ?? 0}
            longestStreak={streak?.longest_streak ?? 0}
            freezePasses={streak?.freeze_passes_remaining ?? 0}
            totalLs={Number(streak?.total_ls_from_quests ?? 0)}
          />

          {/* Khu vực chơi game */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Gamepad2 className="w-4 h-4" />{t('queGameZone')}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                { to: '/pet/arena', icon: BicepsFlexed, label: t('queNavArena'), desc: t('queNavArenaDesc'), color: 'from-orange-500 to-pink-500' },
                { to: '/mystery-box', icon: Gift, label: t('queNavBox'), desc: t('queNavBoxDesc'), color: 'from-purple-500 to-fuchsia-500' },
                { to: '/pet', icon: PetIcon, label: t('petTitleLumi'), desc: t('queNavPetDesc'), color: 'from-amber-400 to-pink-400' },
                { to: '/pet/shop', icon: ShoppingBag, label: t('queNavShop'), desc: t('queNavShopDesc'), color: 'from-emerald-500 to-amber-400' },
                { to: '/pet/appeal', icon: ShieldAlert, label: t('queNavAppeal'), desc: t('queNavAppealDesc'), color: 'from-slate-500 to-zinc-600' },
                { to: '/docs/pet-game-guide', icon: BookOpen, label: '​', desc: t('queNavGuideDesc'), color: 'from-sky-500 to-indigo-500' },
              ].map(g => {
                const Icon = g.icon;
                return (
                  <Link
                    key={g.to}
                    to={g.to}
                    className={`group relative overflow-hidden rounded-xl p-3 bg-gradient-to-br ${g.color} text-white shadow-md hover:shadow-lg hover:scale-[1.03] transition-all`}
                  >
                    <Icon className="w-6 h-6 mb-1.5 drop-shadow group-hover:scale-110 transition-transform" />
                    <div className="font-bold text-sm leading-tight">{g.label}</div>
                    <div className="text-[11px] text-white/90 leading-tight mt-0.5">{g.desc}</div>
                  </Link>
                );
              })}
            </div>
          </section>

          {(!tier || tier === 'T0') && (
            <Card className="p-4 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-emerald-500/5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Info className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">
                    Trust Tier <span className="text-amber-600">{tier ?? 'T0'}</span>{t('queTrustB')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('queTrustDesc')}
                  </p>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <Button asChild size="sm" className="gap-1 bg-gradient-to-r from-emerald-500 to-amber-500 text-white">
                      <Link to="/identity?guide=1">
                        <Rocket className="w-3.5 h-3.5" />{t('queOpenGuide')}
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/identity/onboarding">Onboarding</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          )}

          {!isLoading && dailyQuests.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('queDaily')}</h2>
              <div className="space-y-2">
                {dailyQuests.map((q) => (
                  <QuestCard key={q.id} quest={q} currentStreak={streak?.current_streak ?? 0} trustTier={tier} />
                ))}
              </div>
            </section>
          )}

          {!isLoading && weeklyQuests.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('queWeekly')}</h2>
              <div className="space-y-2">
                {weeklyQuests.map((q) => (
                  <QuestCard key={q.id} quest={q} currentStreak={streak?.current_streak ?? 0} trustTier={tier} />
                ))}
              </div>
            </section>
          )}

          {!isLoading && otherQuests.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('queOther')}</h2>
              <div className="space-y-2">
                {otherQuests.map((q) => (
                  <QuestCard key={q.id} quest={q} currentStreak={streak?.current_streak ?? 0} trustTier={tier} />
                ))}
              </div>
            </section>
          )}

          <p className="text-[11px] text-muted-foreground text-center pt-2">
            {t('queFooter')}
          </p>

          <BackToHomeCTA />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
