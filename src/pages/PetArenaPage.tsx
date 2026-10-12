import { useState, useMemo, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useLocation } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, BicepsFlexed, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PetGuideLink } from '@/modules/pet/components/PetGuideLink';
import { MiniGameAppBar } from '@/modules/pet/components/MiniGameAppBar';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/integrations/supabase/client';
import {
  useArenaOpponents, useMyBattles, useChallengePet, useAcceptBattle,
  useDeclineBattle, useBattleLeaderboard, petBattleErrorToMessage,
  type PetBattle,
} from '@/modules/pet/hooks/usePetBattle';
import { BattleResultDialog } from '@/modules/pet/components/BattleResultDialog';
import { PetRiskBanner } from '@/modules/pet/components/PetRiskBanner';
import { PetSectionNav } from '@/modules/pet/components/PetSectionNav';
import { BackToHomeBar } from '@/components/layout/BackToHome';
import { ArenaHowToCard } from '@/modules/pet/components/ArenaHowToCard';
import { InvitePlayerDialog } from '@/modules/pet/components/InvitePlayerDialog';
import { BuddyCirclePanel } from '@/modules/pet/components/BuddyCirclePanel';
import { Heart } from 'lucide-react';

export default function PetArenaPage() {
  const { t } = useLanguage();
  const { userId } = useCurrentUser();
  const { data: opponents } = useArenaOpponents();
  const { data: battles } = useMyBattles();
  const { data: leaderboard } = useBattleLeaderboard();
  const challenge = useChallengePet();
  const accept = useAcceptBattle();
  const decline = useDeclineBattle();
  const [resultBattle, setResultBattle] = useState<PetBattle | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<string>(() => (location.hash === '#buddy' ? 'buddy' : 'opponents'));

  useEffect(() => {
    if (location.hash !== '#buddy') return;
    setActiveTab('buddy');
    const t = setTimeout(() => {
      document.getElementById('buddy')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => clearTimeout(t);
  }, [location.hash]);

  const pending = useMemo(() => (battles ?? []).filter(b => b.status === 'pending'), [battles]);
  const resolved = useMemo(() => (battles ?? []).filter(b => b.status === 'resolved').slice(0, 10), [battles]);

  const onChallenge = async (opponentId: string) => {
    try {
      await challenge.mutateAsync(opponentId);
      toast.success(t('parInviteSent'));
    } catch (e) {
      toast.error(petBattleErrorToMessage(e));
    }
  };

  const enrichWithProfiles = async (b: PetBattle): Promise<PetBattle> => {
    try {
      const ids = Array.from(new Set([b.challenger_id, b.opponent_id]));
      const { data: profiles } = await supabase
        .from('public_profiles' as never)
        .select('id, display_name, username, avatar_url')
        .in('id', ids);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.id, {
        display_name: p.display_name ?? null,
        username: p.username ?? null,
        avatar_url: p.avatar_url ?? null,
      }]));
      return {
        ...b,
        challenger_profile: pmap.get(b.challenger_id) ?? null,
        opponent_profile: pmap.get(b.opponent_id) ?? null,
      };
    } catch {
      return b;
    }
  };

  const onAccept = async (id: string) => {
    try {
      const result = await accept.mutateAsync(id);
      const enriched = await enrichWithProfiles(result);
      setResultBattle(enriched);
    } catch (e) {
      toast.error(petBattleErrorToMessage(e));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <div className="container mx-auto max-w-4xl px-3 py-4 space-y-4">
        <MiniGameAppBar
          title={t('queNavArena')}
          icon={BicepsFlexed}
          iconClassName="w-5 h-5 text-orange-500"
          right={<PetGuideLink />}
        />

        <BackToHomeBar fallback="/pet" inline />
        <PetSectionNav active="arena" />

        <PetRiskBanner />

        <p className="text-sm text-muted-foreground">
          {t('parDesc')}
        </p>

        <ArenaHowToCard />

        <Tabs value={activeTab} onValueChange={setActiveTab} id="buddy">
          <TabsList>
            <TabsTrigger value="opponents">{t('parTabOpponents')}</TabsTrigger>
            <TabsTrigger value="pending">
              {t('parTabInvites')}{pending.length > 0 && <Badge variant="destructive" className="ml-1 h-5">{pending.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="history">{t('parTabHistory')}</TabsTrigger>
            <TabsTrigger value="leaderboard">
              <Trophy className="w-3 h-3 mr-1" />{t('parTabHonor')}
            </TabsTrigger>
            <TabsTrigger value="buddy">
              <Heart className="w-3 h-3 mr-1" />{t('parTabBuddies')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="opponents" className="space-y-2">
            <div className="flex items-center justify-between gap-2 pb-1">
              <p className="text-xs text-muted-foreground">
                {t('parAllReady')}
              </p>
              <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
                <UserPlus className="w-4 h-4 mr-1" />{t('parFindInvite')}
              </Button>
            </div>
            {!opponents?.length ? (
              <div className="text-sm text-muted-foreground text-center py-8 space-y-3">
                <div>{t('parEmptyOpponents')}</div>
                <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="w-4 h-4 mr-1" />{t('parFindInvite2')}
                </Button>
              </div>
            ) : opponents.map(op => (
              <Card key={op.user_id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={op.avatar_url ?? undefined} />
                    <AvatarFallback>{(op.username ?? op.display_name)?.[0] ?? '?'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">{op.username ?? op.display_name ?? 'Ẩn danh'}</div>
                    <div className="text-xs text-muted-foreground">
                      Lv.{op.pet_level}
                    </div>
                  </div>
                </div>
                <Button size="sm" onClick={() => onChallenge(op.user_id)} disabled={challenge.isPending}>
                  {t('parInviteBtn')}
                </Button>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="pending" className="space-y-2">
            {pending.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">{t('parEmptyInvites')}</div>
            ) : pending.map(b => {
              const isOpp = b.opponent_id === userId;
              const other = isOpp ? b.challenger_profile : b.opponent_profile;
              const otherSnap = isOpp ? b.challenger_snapshot : b.opponent_snapshot;
              const otherName = other?.username ?? other?.display_name ?? 'Ẩn danh';
              return (
                <Card key={b.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={other?.avatar_url ?? undefined} />
                      <AvatarFallback>{otherName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {isOpp ? `${otherName}${t('parInviteFromSuffix')}` : `${t('parSentToPrefix')}${otherName}`}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Lv.{otherSnap.pet_level}{t('parExpires')}{format(new Date(b.expires_at), 'dd/MM HH:mm')}
                      </div>
                    </div>
                  </div>
                  {isOpp ? (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => decline.mutate(b.id)}>{t('parDecline')}</Button>
                      <Button size="sm" onClick={() => onAccept(b.id)} disabled={accept.isPending}>{t('parAccept')}</Button>
                    </div>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">{t('parWaiting')}</Badge>
                  )}
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {resolved.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">{t('parEmptyHistory')}</div>
            ) : resolved.map(b => {
              const won = b.winner_id === userId;
              const draw = b.winner_id === null;
              const isChallenger = b.challenger_id === userId;
              const otherSnap = isChallenger ? b.opponent_snapshot : b.challenger_snapshot;
              const otherProfile = isChallenger ? b.opponent_profile : b.challenger_profile;
              const otherName = otherProfile?.username ?? otherProfile?.display_name ?? 'Ẩn danh';
              return (
                <Card key={b.id} className="p-3 flex items-center justify-between gap-3 text-sm cursor-pointer hover:bg-muted/40"
                  onClick={() => setResultBattle(b)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={otherProfile?.avatar_url ?? undefined} />
                      <AvatarFallback>{otherName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t('parWithPrefix')}{otherName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        Lv.{otherSnap.pet_level} · {format(new Date(b.resolved_at ?? b.created_at), 'dd/MM HH:mm')}
                      </div>
                    </div>
                  </div>
                  <Badge variant={won ? 'default' : draw ? 'secondary' : 'destructive'} className="shrink-0">
                    {draw ? t('parDraw') : won ? t('parWon') : t('parLost')}
                  </Badge>
                </Card>
              );
            })}
          </TabsContent>


          <TabsContent value="leaderboard" className="space-y-2">
            {!leaderboard?.length ? (
              <div className="text-sm text-muted-foreground text-center py-8">{t('parEmptySeason')}</div>
            ) : leaderboard.map((row, i) => (
              <Card key={row.user_id} className="p-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-bold w-6 text-center">{i + 1}</span>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={row.avatar_url ?? undefined} />
                    <AvatarFallback>{(row.username ?? row.display_name)?.[0] ?? '?'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">{row.username ?? row.display_name ?? 'Ẩn danh'}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.wins}{t('parStatsA')}{row.losses}{t('parStatsB')}{row.draws}{t('parStatsC')}
                    </div>
                  </div>
                </div>
                <Badge variant="default">{row.points}{t('parPointsSuffix')}</Badge>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="buddy">
            <BuddyCirclePanel />
          </TabsContent>
        </Tabs>

        <BattleResultDialog
          battle={resultBattle}
          open={!!resultBattle}
          onOpenChange={(o) => !o && setResultBattle(null)}
        />

        <InvitePlayerDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      </div>
    </div>
  );
}
