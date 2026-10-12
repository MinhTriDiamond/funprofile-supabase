import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { PullToRefreshContainer } from '@/components/common/PullToRefreshContainer';
import { FriendsList } from '@/components/friends/FriendsList';
import { FriendCarousel } from '@/components/friends/FriendCarousel';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Search, UserPlus, Users, UserCheck, Gift, Settings, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

interface FriendProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  friendship_id?: string;
  created_at?: string;
}

const Friends = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { userId: currentUserId, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = usePersistedTab('friends-tab', 'all', ['all', 'requests', 'suggestions', 'friends', 'birthdays'] as const);
  const [friendRequests, setFriendRequests] = useState<FriendProfile[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendProfile[]>([]);
  const [suggestions, setSuggestions] = useState<FriendProfile[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (currentUserId) {
      fetchFriendRequests(currentUserId);
      fetchSentRequests(currentUserId);
      fetchSuggestions(currentUserId);
    } else {
      fetchSuggestionsForGuest();
    }
    setLoading(false);
  }, [currentUserId, authLoading]);

  const fetchFriendRequests = async (userId: string) => {
    const { data } = await supabase
      .from('friendships')
      .select('*')
      .eq('friend_id', userId)
      .eq('status', 'pending');
    
    if (!data?.length) {
      setFriendRequests([]);
      return;
    }

    const userIds = data.map(f => f.user_id);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', userIds);
    
    const formatted = data.map(item => {
      const profile = profilesData?.find(p => p.id === item.user_id);
      return {
        id: profile?.id || item.user_id,
        username: profile?.username || 'Unknown',
        full_name: profile?.full_name || null,
        avatar_url: profile?.avatar_url || null,
        friendship_id: item.id,
        created_at: item.created_at,
      };
    });
    
    setFriendRequests(formatted);
  };

  const fetchSentRequests = async (userId: string) => {
    const { data } = await supabase
      .from('friendships')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');
    
    if (!data?.length) {
      setSentRequests([]);
      return;
    }

    const friendIds = data.map(f => f.friend_id);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', friendIds);
    
    const formatted = data.map(item => {
      const profile = profilesData?.find(p => p.id === item.friend_id);
      return {
        id: profile?.id || item.friend_id,
        username: profile?.username || 'Unknown',
        full_name: profile?.full_name || null,
        avatar_url: profile?.avatar_url || null,
        friendship_id: item.id,
        created_at: item.created_at,
      };
    });
    
    setSentRequests(formatted);
  };

  const fetchSuggestions = async (userId: string) => {
    const { data: existingRelations } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    const excludedUserIds = new Set([userId]);
    existingRelations?.forEach(rel => {
      excludedUserIds.add(rel.user_id);
      excludedUserIds.add(rel.friend_id);
    });

    const { data } = await supabase
      .from('public_profiles')
      .select('id, username, avatar_url, full_name')
      .limit(20);
    
    const filtered = (data || []).filter(p => !excludedUserIds.has(p.id!)) as FriendProfile[];
    setSuggestions(filtered);
  };

  const fetchSuggestionsForGuest = async () => {
    const { data } = await supabase
      .from('public_profiles')
      .select('id, username, avatar_url, full_name')
      .limit(20);
    
    setSuggestions((data || []) as FriendProfile[]);
  };

  const handleRequestAction = async (id: string, action: string) => {
    if (action === 'accept') {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', id);
      if (!error) {
        toast.success(t('friAccepted'));
        if (currentUserId) fetchFriendRequests(currentUserId);
      }
    } else if (action === 'reject') {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', id);
      if (!error) {
        toast.success(t('friDeclined'));
        if (currentUserId) fetchFriendRequests(currentUserId);
      }
    }
  };

  const handleSentAction = async (id: string, action: string) => {
    if (action === 'cancel') {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', id);
      if (!error) {
        toast.success(t('friCancelled'));
        if (currentUserId) fetchSentRequests(currentUserId);
      }
    }
  };

  const handleSuggestionAction = async (id: string, action: string) => {
    if (action === 'add' && currentUserId) {
      const { error } = await supabase
        .from('friendships')
        .insert({
          user_id: currentUserId,
          friend_id: id,
          status: 'pending'
        });
      if (!error) {
        toast.success(t('friSent'));
        fetchSuggestions(currentUserId);
        fetchSentRequests(currentUserId);
      }
    }
  };

  const handleDismissSuggestion = (id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
  };

  const menuItems = [
    { icon: Users, label: t('friMenuHome'), value: 'all' },
    { icon: UserPlus, label: t('friMenuRequests'), value: 'requests', badge: friendRequests.length },
    { icon: UserCheck, label: t('friMenuSuggestions'), value: 'suggestions' },
    { icon: Users, label: t('friMenuAll'), value: 'friends' },
    { icon: Gift, label: t('friMenuBirthdays'), value: 'birthdays' },
  ];

  const handlePullRefresh = useCallback(async () => {
    if (currentUserId) {
      await Promise.all([
        fetchFriendRequests(currentUserId),
        fetchSentRequests(currentUserId),
        fetchSuggestions(currentUserId),
      ]);
    }
  }, [currentUserId]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen overflow-hidden">
        <FacebookNavbar />
        <main data-app-scroll className="app-main app-pb-nav px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto py-4">
            <Skeleton className="h-10 w-48 mb-4" />
            <div className="flex gap-3 overflow-hidden">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="w-[160px] h-[240px] rounded-xl flex-shrink-0" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav px-4 sm:px-6 lg:px-8">
        <PullToRefreshContainer onRefresh={handlePullRefresh}>
          <div className="flex">
            {/* Left Sidebar */}
          <aside className={`
            fixed inset-y-0 left-0 z-40 w-[300px] lg:w-[360px] bg-card/80 shadow-lg 
            transform transition-transform duration-300 ease-in-out
            lg:translate-x-0 lg:top-[calc(var(--header-h)+var(--safe-top))] lg:h-[calc(100dvh-var(--header-h)-var(--safe-top))]
            ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
          `}>
            <button 
              className="lg:hidden absolute top-4 right-4 p-2 rounded-full hover:bg-muted"
              onClick={() => setShowSidebar(false)}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="p-4 pt-14 lg:pt-4 h-full overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold">{t('friTitle')}</h1>
                <button className="w-9 h-9 bg-muted rounded-full flex items-center justify-center hover:bg-muted/80">
                  <Settings className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1">
                {menuItems.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => {
                      setActiveTab(item.value);
                      setShowSidebar(false);
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-full border transition-all duration-300 ${
                      activeTab === item.value 
                        ? 'bg-primary/10 text-primary border-[#C9A84C]/60' 
                        : 'hover:bg-white hover:shadow-[0_0_12px_rgba(34,197,94,0.5)] border-transparent hover:border-[#C9A84C]/40'
                    }`}
                  >
                    <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${
                      activeTab === item.value ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      <item.icon className="w-5 h-5" />
                    </div>
                    <span className="font-medium flex-1 text-left truncate">{item.label}</span>
                    {item.badge && item.badge > 0 && (
                      <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {showSidebar && (
            <div 
              className="fixed inset-0 bg-black/50 z-30 lg:hidden"
              onClick={() => setShowSidebar(false)}
            />
          )}

          {/* Main Content */}
          <div className="flex-1 lg:ml-[360px] min-w-0">
            <div className="lg:hidden sticky top-0 z-20 bg-card/80 border-b border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowSidebar(true)}
                    className="p-2 -ml-2 rounded-full hover:bg-muted"
                  >
                    <Users className="w-5 h-5" />
                  </button>
                  <h1 className="text-lg font-bold truncate">
                    {menuItems.find(m => m.value === activeTab)?.label || t('friTitle')}
                  </h1>
                </div>
                <button className="p-2 rounded-full hover:bg-muted">
                  <Search className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="py-4">
              {activeTab === 'all' && (
                <div className="space-y-6">
                  {sentRequests.length > 0 && (
                    <FriendCarousel
                      title={t('friSentTitle')}
                      subtitle={`${sentRequests.length}${t('friSentSuffix')}`}
                      items={sentRequests}
                      type="sent"
                      onAction={handleSentAction}
                    />
                  )}

                  {friendRequests.length > 0 && (
                    <FriendCarousel
                      title={t('friMenuRequests')}
                      subtitle={`${friendRequests.length}${t('friRequestsSuffix')}`}
                      items={friendRequests}
                      type="request"
                      onAction={handleRequestAction}
                    />
                  )}

                  <FriendCarousel
                    title={t('friSuggestionsTitle')}
                    items={suggestions}
                    type="suggestion"
                    onAction={handleSuggestionAction}
                    onDismiss={handleDismissSuggestion}
                    showMoreOptions
                  />
                </div>
              )}

              {activeTab === 'requests' && (
                <div className="px-4">
                  <h2 className="text-xl font-bold mb-4 hidden lg:block">{t('friMenuRequests')}</h2>
                  <FriendCarousel
                    title=""
                    items={friendRequests}
                    type="request"
                    onAction={handleRequestAction}
                  />
                </div>
              )}

              {activeTab === 'suggestions' && (
                <div className="px-4">
                  <h2 className="text-xl font-bold mb-4 hidden lg:block">{t('friSuggestionsTitle')}</h2>
                  <FriendCarousel
                    title=""
                    items={suggestions}
                    type="suggestion"
                    onAction={handleSuggestionAction}
                    onDismiss={handleDismissSuggestion}
                  />
                </div>
              )}

              {activeTab === 'friends' && (
                <div className="px-4 lg:px-6">
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-xl font-bold hidden lg:block">{t('friMenuAll')}</h2>
                    <div className="relative flex-1 lg:max-w-xs lg:ml-auto">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input 
                        placeholder={t('friSearchPlaceholder')} 
                        className="pl-10 bg-muted border-0 h-10" 
                      />
                    </div>
                  </div>
                  <div className="bg-card/70 rounded-xl shadow-sm">
                    <FriendsList userId={currentUserId || ''} />
                  </div>
                </div>
              )}

              {activeTab === 'birthdays' && (
                <div className="px-4">
                  <h2 className="text-xl font-bold mb-4 hidden lg:block">{t('friMenuBirthdays')}</h2>
                  <div className="bg-card/70 rounded-xl shadow-sm p-8 text-center">
                    <Gift className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">{t('friNoBirthdays')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </PullToRefreshContainer>
      </main>
      
      <MobileBottomNav />
    </div>
  );
};

export default Friends;
