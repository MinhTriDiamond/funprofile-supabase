import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Landmark, RefreshCw, Sparkles, Users, Heart } from 'lucide-react';
import { usePetLeaderboard } from '@/modules/pet/hooks/usePublicPet';
import { useLanguage } from '@/i18n/LanguageContext';
import { resolvePetSprite, STAGE_NAMES } from '@/modules/pet/lib/petAssets';

interface LightCommunityMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  light_level: string;
  light_emoji: string;
  trend: string;
  trend_emoji: string;
}

const getLevelStyle = (level: string) => {
  switch (level) {
    case "Light Architect": return "border-yellow-400 text-yellow-600 bg-yellow-50/60";
    case "Light Guardian": return "border-rose-400 text-rose-600 bg-rose-50/50";
    case "Light Builder": return "border-emerald-400 text-emerald-600 bg-emerald-50/50";
    case "Light Sprout": return "border-sky-400 text-sky-600 bg-sky-50/50";
    default: return "border-stone-300 text-stone-500 bg-stone-50/50";
  }
};

const TAB_KEY = 'leaderboard-tab';
const VALID_TABS = ['community', 'pet'] as const;
type LeaderboardTab = typeof VALID_TABS[number];
const DEFAULT_TAB: LeaderboardTab = 'community';

const isValidTab = (v: string | null | undefined): v is LeaderboardTab =>
  !!v && (VALID_TABS as readonly string[]).includes(v);

const Leaderboard = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const [searchParams] = useSearchParams();

  // Legacy redirect & default redirect khi không có tab trên path
  useEffect(() => {
    if (!tabParam) {
      const legacyTab = searchParams.get('tab');
      let target: LeaderboardTab = DEFAULT_TAB;
      if (isValidTab(legacyTab)) {
        target = legacyTab;
      } else {
        let stored: string | null = null;
        try { stored = localStorage.getItem(TAB_KEY); } catch {}
        if (isValidTab(stored)) target = stored;
      }
      navigate(`/leaderboard/${target}`, { replace: true });
      return;
    }
    if (!isValidTab(tabParam)) {
      navigate(`/leaderboard/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tabParam, searchParams, navigate]);

  const tab: LeaderboardTab = isValidTab(tabParam) ? tabParam : DEFAULT_TAB;

  // Persist tab cuối vào localStorage
  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab); } catch {}
  }, [tab]);

  const handleTabChange = (next: string) => {
    if (!isValidTab(next) || next === tab) return;
    navigate(`/leaderboard/${next}`);
  };



  const [members, setMembers] = useState<LightCommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchLightCommunity();
  }, []);

  const fetchLightCommunity = async () => {
    try {
      const { data, error } = await supabase.rpc('get_light_community', { p_limit: 1000 });
      if (error) throw error;
      if (data) setMembers(data as LightCommunityMember[]);
    } catch (error) {
      console.error('Error fetching light community:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const { data: petRows = [], isLoading: petLoading, refetch: refetchPet, isFetching: petRefetching } = usePetLeaderboard(50);

  const handleRefresh = () => {
    if (tab === 'pet') {
      refetchPet();
    } else {
      setRefreshing(true);
      fetchLightCommunity();
    }
  };

  const handleUserClick = (userId: string) => navigate(`/profile/${userId}`);

  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => navigate(-1)} className="p-1 hover:opacity-70 transition-opacity">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing || petRefetching}
                className="p-1 hover:opacity-70 transition-opacity disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${(refreshing || petRefetching) ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h1
                  className="text-2xl font-black tracking-wider uppercase"
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    background: 'linear-gradient(90deg, #FF6B9D 0%, #C44FE2 15%, #7B68EE 30%, #00CED1 50%, #98FB98 70%, #FFFF00 85%, #FFB347 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  LEADERBOARD
                </h1>
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('lbSubtitle')}
              </p>
            </div>
          </div>

          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="community">
                <Users className="w-4 h-4 mr-1.5" /> Light Community
              </TabsTrigger>
              <TabsTrigger value="pet">
                <Sparkles className="w-4 h-4 mr-1.5" />{t('lbTabPets')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="community">
              {loading ? (
                <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
              ) : (
                <div className="space-y-3">
                  {members.map(member => (
                    <div
                      key={member.user_id}
                      onClick={() => handleUserClick(member.user_id)}
                      className="flex items-center gap-3 p-4 bg-card rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="w-10 h-10 flex items-center justify-center text-lg shrink-0">
                        {member.light_level === 'Light Architect'
                          ? <Landmark className="w-5 h-5 text-emerald-600" />
                          : member.light_emoji}
                      </div>
                      <Avatar className="w-11 h-11 shrink-0">
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className="bg-muted">{member.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-semibold text-sm truncate">{member.display_name || member.username}</span>
                        <span className="text-xs text-muted-foreground truncate">@{member.username}</span>
                      </div>
                      <span className={`text-[11px] font-medium px-3 py-1 rounded-full border whitespace-nowrap shrink-0 ${getLevelStyle(member.light_level)}`}>
                        {member.light_level}
                      </span>
                      <span className="text-sm shrink-0" title={member.trend}>{member.trend_emoji}</span>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">{t('lbEmptyCommunity')}</div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pet">
              {petLoading ? (
                <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
              ) : (
                <div className="space-y-3">
                  {petRows.map((row, idx) => (
                    <div
                      key={row.user_id}
                      onClick={() => handleUserClick(row.user_id)}
                      className="flex items-center gap-3 p-4 bg-gradient-to-r from-pink-50/40 to-purple-50/30 dark:from-pink-950/20 dark:to-purple-950/10 rounded-xl border border-pink-200/50 dark:border-pink-900/30 shadow-sm hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="w-8 h-8 flex items-center justify-center font-bold text-muted-foreground shrink-0">
                        #{idx + 1}
                      </div>
                      <img
                        src={resolvePetSprite(row.evolution_stage, row.equipped_skin_slug)}
                        alt={row.name}
                        className="w-12 h-12 object-contain shrink-0"
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-semibold text-sm truncate">{row.name || 'Lumi'}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{STAGE_NAMES[row.evolution_stage] || '—'}</Badge>
                          <span>Lv {row.level}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-sm shrink-0">
                        <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />
                        <span className="font-semibold">{row.cheers_received_total}</span>
                      </div>
                    </div>
                  ))}
                  {petRows.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">{t('lbEmptyPets')}</div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
};

export default Leaderboard;
