import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditProfile } from '@/components/profile/EditProfile';
import { FriendsList } from '@/components/friends/FriendsList';
import { UserFriendsList } from '@/components/friends/UserFriendsList';
import { CoverHonorBoard } from '@/components/profile/CoverHonorBoard';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { MyBadgesSection } from '@/components/profile/MyBadgesSection';
import { ProfilePosts } from '@/components/profile/ProfilePosts';
import { Button } from '@/components/ui/button';
import { LazyImage } from '@/components/ui/LazyImage';
import { AvatarViewer } from '@/components/ui/AvatarViewer';
import { MoreHorizontal, MapPin, Briefcase, GraduationCap, Heart, Clock, PenSquare, Copy, Wallet } from 'lucide-react';
import btcLogo from '@/assets/tokens/btc-logo.png';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { PullToRefreshContainer } from '@/components/common/PullToRefreshContainer';
import { useConversations } from '@/modules/chat/hooks/useConversations';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { SEOHead, buildPersonJsonLd } from '@/components/seo/SEOHead';
import { useProfile } from '@/hooks/useProfile';
import { AccountUpgradeBanner } from '@/components/security/AccountUpgradeBanner';
import { OnboardingTrustCTA } from '@/components/identity/OnboardingTrustCTA';

const LOCALES: Record<string, string> = {
  vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR', th: 'th-TH',
  fr: 'fr-FR', id: 'id-ID', ar: 'ar-EG', ru: 'ru-RU', de: 'de-DE', es: 'es-ES', pt: 'pt-PT',
};

const Profile = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();

  const {
    profile,
    setProfile,
    loading,
    timelineLoading,
    loadingMorePosts,
    currentUserId,
    isOwnProfile,
    friendsCount,
    friendsPreview,
    activeTab,
    setActiveTab,
    isAdmin,
    viewAsPublic,
    setViewAsPublic,
    showAvatarViewer,
    setShowAvatarViewer,
    showPrivateElements,
    originalPosts,
    sortedPosts,
    displayedPosts,
    hasMorePosts,
    buildInitialStats,
    navigateToTab,
    loadMorePosts,
    handleRefresh,
  } = useProfile();

  const { createDirectConversation } = useConversations(currentUserId);

  const handleStartChat = async () => {
    if (!currentUserId || !profile?.id) return;
    try {
      const result = await createDirectConversation.mutateAsync(profile.id);
      if (result) navigate(`/chat/${result.id}`);
    } catch (error) {
      console.error('Error starting chat:', error);
    }
  };

  if (loading && !profile) {
    return (
      <div className="min-h-screen overflow-hidden">
        <FacebookNavbar />
        <main className="app-main">
          <Skeleton className="h-[350px] w-full" />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen overflow-hidden">
        <FacebookNavbar />
        <main className="app-main">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-12">
            <p className="text-muted-foreground">{t('profileNotFound')}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden">
      <SEOHead
        title={profile.display_name || profile.username || 'Profile'}
        description={profile.bio || `${profile.display_name || profile.username} on FUN Profile`}
        canonicalPath={profile.username ? `/${profile.username}` : `/profile/${profile.id}`}
        image={profile.avatar_url}
        jsonLd={buildPersonJsonLd({
          name: profile.display_name || profile.username || 'FUN User',
          url: `https://fun.rich/${profile.username || profile.id}`,
          image: profile.avatar_url,
          description: profile.bio,
        })}
      />
      <FacebookNavbar />

      <main data-app-scroll className={`app-main app-pb-nav profile-page-main ${viewAsPublic ? 'profile-public-offset' : ''}`}>
        <PullToRefreshContainer onRefresh={handleRefresh}>
          {isOwnProfile && (
            <div className="max-w-5xl mx-auto px-4 pt-2 space-y-2">
              <AccountUpgradeBanner />
              <OnboardingTrustCTA variant="banner" />
            </div>
          )}
          <ProfileHeader
            profile={profile}
            currentUserId={currentUserId}
            isOwnProfile={isOwnProfile}
            isAdmin={isAdmin}
            showPrivateElements={showPrivateElements}
            viewAsPublic={viewAsPublic}
            friendsPreview={friendsPreview}
            onSetProfile={(updater) => setProfile(updater)}
            onNavigateToTab={navigateToTab}
            onStartChat={handleStartChat}
            onSetViewAsPublic={setViewAsPublic}
            onSetShowAvatarViewer={setShowAvatarViewer}
            chatPending={createDirectConversation.isPending}
          />

          <MyBadgesSection userId={profile.id} isOwner={isOwnProfile} />

          {/* Tabs Section */}
          <div className="max-w-[1100px] mx-auto px-0 sm:px-6 lg:px-8">
            <div className="border-t border-border px-0 sm:px-4 md:px-8">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" id="profile-tabs">
                <TabsList className="h-auto bg-transparent p-0 border-0 justify-start gap-1 flex overflow-x-auto scrollbar-hide -mb-px snap-x snap-mandatory px-2 sm:px-0">
                  {['posts', 'about', 'friends', 'photos', 'videos'].map(tab => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="px-4 py-4 min-h-[44px] rounded-t-lg border-b-[3px] border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary hover:bg-muted/50 font-semibold text-base whitespace-nowrap transition-colors snap-start"
                    >
                      {tab === 'posts' ? t('allPosts') : tab === 'about' ? t('about') : tab === 'friends' ? t('friends') : tab === 'photos' ? t('photos') : t('reels')}
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="honorboard" className="px-4 py-4 min-h-[44px] rounded-t-lg border-b-[3px] border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent hover:bg-muted/50 font-semibold text-base whitespace-nowrap transition-colors snap-start md:hidden">
                    <span
                      style={{
                        background: 'linear-gradient(90deg, #FF3B3B 0%, #FF7A1A 15%, #FFC700 30%, #8BD600 45%, #00C853 58%, #00BCD4 72%, #2979FF 85%, #8E24AA 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      Honor Board
                    </span>
                  </TabsTrigger>
                  {showPrivateElements && (
                    <TabsTrigger value="edit" className="px-4 py-4 min-h-[44px] rounded-t-lg border-b-[3px] border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary hover:bg-muted/50 font-semibold text-base whitespace-nowrap transition-colors snap-start">
                      {t('editProfile')}
                    </TabsTrigger>
                  )}
                  <div className="flex-1" />
                  <Button variant="secondary" size="icon" className="h-11 w-11 my-1 mr-2 flex-shrink-0">
                    <MoreHorizontal className="w-5 h-5" />
                  </Button>
                </TabsList>

                <div className="py-3 sm:py-4 px-0 sm:px-4 md:px-8">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
                    {/* Left Sidebar */}
                    <div className="hidden lg:block lg:col-span-2 space-y-4">
                      <TabsContent value="posts" className="mt-0 space-y-4 lg:sticky lg:top-0">
                        {/* Intro Card */}
                        <div className="bg-card/70 rounded-xl shadow-sm border border-border p-4">
                          <h3 className="font-bold text-lg text-foreground mb-3">{t('about')}</h3>
                          <div className="space-y-3 text-sm">
                            {profile?.bio && <p className="text-foreground whitespace-pre-wrap">{profile.bio}</p>}
                            {(profile?.workplace || showPrivateElements) && (
                              <div className="flex items-center gap-3 text-foreground">
                                <Briefcase className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                                <span>{t('worksAt')} <strong>{profile?.workplace || (showPrivateElements ? '—' : '')}</strong></span>
                              </div>
                            )}
                            {(profile?.education || showPrivateElements) && (
                              <div className="flex items-center gap-3 text-foreground">
                                <GraduationCap className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                                <span>{t('studiesAt')} <strong>{profile?.education || (showPrivateElements ? '—' : '')}</strong></span>
                              </div>
                            )}
                            {(profile?.relationship_status || showPrivateElements) && (
                              <div className="flex items-center gap-3 text-foreground">
                                <Heart className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                                <span>{profile?.relationship_status || (showPrivateElements ? '—' : t('single'))}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3 text-foreground">
                              <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                              <span>{t('joinedSince')} {new Date(profile?.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'long', year: 'numeric' })}</span>
                            </div>
                          </div>
                          {showPrivateElements && (
                            <Button variant="secondary" className="w-full mt-4" onClick={() => navigateToTab('edit')}>
                              {t('editDetails')}
                            </Button>
                          )}
                        </div>

                        {/* Photos Card */}
                        <div className="bg-card/70 rounded-xl shadow-sm border border-border p-4">
                          <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-lg text-foreground">{t('photos')}</h3>
                            <button className="text-primary hover:underline text-sm font-medium" onClick={() => navigateToTab('photos')}>{t('viewAllPhotos')}</button>
                          </div>
                          <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
                            {originalPosts.filter(p => p.image_url).slice(0, 9).map((post, i) => (
                              <LazyImage key={i} src={post.image_url} alt="" className="w-full aspect-square cursor-pointer" onClick={() => navigateToTab('photos')} />
                            ))}
                            {originalPosts.filter(p => p.image_url).length === 0 && (
                              <div className="col-span-3 py-8 text-center text-muted-foreground text-sm">{t('noPhotosYet')}</div>
                            )}
                          </div>
                        </div>

                        {/* Friends Card */}
                        <div className="bg-card/70 rounded-xl shadow-sm border border-border p-3">
                          <div className="flex justify-between items-center mb-3">
                            <div>
                              <h3 className="font-bold text-lg text-foreground">{t('friends')}</h3>
                              <p className="text-sm text-muted-foreground">{friendsCount} {t('friendsSuffix')}</p>
                            </div>
                            <button className="text-primary hover:underline text-sm font-medium" onClick={() => navigateToTab('friends')}>{t('viewAllFriends')}</button>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {friendsPreview.length > 0 ? (
                              friendsPreview.map((friend) => (
                                <div key={friend.id} className="text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate(`/${friend.username}`)}>
                                  <Avatar className="w-full h-auto aspect-square rounded-xl mb-1 border border-border overflow-hidden">
                                    <AvatarImage src={friend.avatar_url || undefined} sizeHint="lg" className="object-cover" />
                                    <AvatarFallback className="rounded-xl text-lg bg-gradient-to-br from-primary/20 to-gold/20 text-foreground">
                                      {(friend.full_name || friend.username)?.[0]?.toUpperCase() || 'U'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <p className="text-sm leading-tight text-foreground truncate font-medium">{friend.full_name || friend.username}</p>
                                </div>
                              ))
                            ) : (
                              <div className="col-span-3 py-8 text-center text-muted-foreground text-sm">{t('noFriendsYet')}</div>
                            )}
                          </div>
                        </div>
                      </TabsContent>
                    </div>

                    {/* Right Content - Posts */}
                    <div className="lg:col-span-3 space-y-3 sm:space-y-4 profile-feed-column">
                      <TabsContent value="posts" className="mt-0 space-y-3 sm:space-y-4">
                        <ProfilePosts
                          profile={profile}
                          currentUserId={currentUserId}
                          showPrivateElements={showPrivateElements}
                          isOwnProfile={isOwnProfile}
                          viewAsPublic={viewAsPublic}
                          displayedPosts={displayedPosts}
                          hasMorePosts={hasMorePosts}
                          sortedPostsLength={sortedPosts.length}
                          timelineLoading={timelineLoading}
                          loadingMorePosts={loadingMorePosts}
                          onLoadMorePosts={loadMorePosts}
                          onSetProfile={(updater) => setProfile(updater)}
                          buildInitialStats={buildInitialStats}
                          onRefresh={handleRefresh}
                        />
                      </TabsContent>

                      <TabsContent value="about" className="mt-0">
                        <div className="bg-card/70 rounded-xl shadow-sm border border-border p-6">
                          <h3 className="font-bold text-xl mb-4 text-foreground">{t('about')}</h3>
                          <div className="space-y-4">
                            {profile?.bio ? (
                              <div className="flex items-start gap-3 text-foreground">
                                <PenSquare className="w-6 h-6 text-muted-foreground flex-shrink-0 mt-0.5" />
                                <span className="whitespace-pre-wrap">{profile.bio}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <PenSquare className="w-6 h-6 text-muted-foreground" />
                                <span className="text-muted-foreground text-sm italic">{showPrivateElements ? t('profAddBio') : t('notUpdated')}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3 text-foreground">
                              <Wallet className="w-6 h-6 text-muted-foreground" />
                              {profile?.public_wallet_address ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm">{profile.public_wallet_address.slice(0, 6)}...{profile.public_wallet_address.slice(-4)}</span>
                                  <button onClick={() => { navigator.clipboard.writeText(profile.public_wallet_address!); toast.success(t('walletCopied')); }} className="p-1 rounded hover:bg-muted transition-colors">
                                    <Copy className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                  {showPrivateElements && (
                                    <button onClick={() => navigateToTab('edit')} className="text-xs text-primary hover:underline ml-1">{t('edit')}</button>
                                  )}
                                </div>
                              ) : showPrivateElements ? (
                                <button onClick={() => navigateToTab('edit')} className="text-primary hover:underline text-sm">{t('addPublicWallet')}</button>
                              ) : (
                                <span className="text-muted-foreground text-sm italic">{t('notUpdated')}</span>
                              )}
                            </div>
                            {/* BTC Address */}
                            <div className="flex items-center gap-3 text-foreground">
                              <img src={btcLogo} alt="BTC" className="w-12 h-12 rounded-full" />
                              {profile?.btc_address ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm">{profile.btc_address.slice(0, 8)}...{profile.btc_address.slice(-6)}</span>
                                  <button onClick={() => { navigator.clipboard.writeText(profile.btc_address!); toast.success(t('profBtcCopied')); }} className="p-1 rounded hover:bg-muted transition-colors">
                                    <Copy className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                </div>
                              ) : showPrivateElements ? (
                                <button onClick={() => navigateToTab('edit')} className="text-primary hover:underline text-sm">{t('profAddBtc')}</button>
                              ) : (
                                <span className="text-muted-foreground text-sm italic">{t('notUpdated')}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-foreground">
                              <Briefcase className="w-6 h-6 text-muted-foreground" />
                              {profile?.workplace ? <span>{t('worksAt')} <strong>{profile.workplace}</strong></span> : <span className="text-muted-foreground text-sm italic">{showPrivateElements ? t('profAddWorkplace') : t('notUpdated')}</span>}
                            </div>
                            <div className="flex items-center gap-3 text-foreground">
                              <GraduationCap className="w-6 h-6 text-muted-foreground" />
                              {profile?.education ? <span>{t('studiesAt')} <strong>{profile.education}</strong></span> : <span className="text-muted-foreground text-sm italic">{showPrivateElements ? t('profAddEducation') : t('notUpdated')}</span>}
                            </div>
                            <div className="flex items-center gap-3 text-foreground">
                              <MapPin className="w-6 h-6 text-muted-foreground" />
                              {profile?.location ? <span>{t('livesIn')} <strong>{profile.location}</strong></span> : <span className="text-muted-foreground text-sm italic">{showPrivateElements ? t('profAddLocation') : t('notUpdated')}</span>}
                            </div>
                            <div className="flex items-center gap-3 text-foreground">
                              <Heart className="w-6 h-6 text-muted-foreground" />
                              {profile?.relationship_status ? <span>{profile.relationship_status}</span> : <span className="text-muted-foreground text-sm italic">{showPrivateElements ? t('profAddRelationship') : t('notUpdated')}</span>}
                            </div>
                            <div className="flex items-center gap-3 text-foreground">
                              <Clock className="w-6 h-6 text-muted-foreground" />
                              <span className="text-sm">{t('profJoinedPrefix')}{profile?.created_at ? new Date(profile.created_at).toLocaleDateString(LOCALES[language] || 'en-US', { month: 'long', year: 'numeric' }) : '...'}</span>
                            </div>
                            {profile?.social_links && Array.isArray(profile.social_links) && profile.social_links.length > 0 && (
                              <div className="pt-3 border-t border-border">
                                <p className="text-sm font-semibold text-muted-foreground mb-2">{t('profSocialLinks')}</p>
                                <div className="flex flex-wrap gap-2">
                                  {(profile.social_links as Array<{ url?: string; favicon?: string; label?: string; platform?: string }>).map((link, idx) => (
                                    <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary hover:bg-primary/10 text-sm transition-colors">
                                      {link.favicon && <img src={link.favicon} alt="" className="w-4 h-4 rounded-full" />}
                                      <span>{link.label || link.platform}</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="friends" className="mt-0">
                        <div className="bg-card/70 rounded-xl shadow-sm border border-border p-3 sm:p-6">
                          <h3 className="font-bold text-xl mb-3 sm:mb-4 text-foreground">{t('friends')}</h3>
                          {isOwnProfile ? (
                            <FriendsList userId={profile.id} />
                          ) : (
                            <UserFriendsList profileUserId={profile.id} currentUserId={currentUserId} />
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="photos" className="mt-0">
                        <div className="bg-card/70 rounded-xl shadow-sm border border-border p-6">
                          <h3 className="font-bold text-xl mb-4 text-foreground">{t('photos')}</h3>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {originalPosts.filter(p => p.image_url).map((post, i) => (
                              <img key={i} src={post.image_url} alt="" className="w-full aspect-square object-cover rounded-lg" />
                            ))}
                          </div>
                          {originalPosts.filter(p => p.image_url).length === 0 && <p className="text-center text-muted-foreground py-8">{t('noPhotosYet')}</p>}
                        </div>
                      </TabsContent>

                      <TabsContent value="videos" className="mt-0">
                        <div className="bg-card/70 rounded-xl shadow-sm border border-border p-6">
                          <h3 className="font-bold text-xl mb-4 text-foreground">{t('reels')}</h3>
                          <div className="grid grid-cols-2 gap-4">
                            {originalPosts.filter(p => p.video_url).map((post, i) => (
                              <video key={i} src={post.video_url} className="w-full aspect-video object-cover rounded-lg" controls />
                            ))}
                          </div>
                          {originalPosts.filter(p => p.video_url).length === 0 && <p className="text-center text-muted-foreground py-8">{t('noReelsYet')}</p>}
                        </div>
                      </TabsContent>

                      <TabsContent value="honorboard" className="mt-0 md:hidden">
                        <div className="bg-card/70 rounded-xl shadow-sm border border-border p-6">
                          <CoverHonorBoard userId={profile.id} username={profile?.username} avatarUrl={profile?.avatar_url ?? undefined} />
                        </div>
                      </TabsContent>

                      {showPrivateElements && (
                        <TabsContent value="edit" className="mt-0">
                          <div className="bg-card/70 rounded-xl shadow-sm border border-border p-6">
                            <EditProfile onSaved={() => { setActiveTab('posts'); handleRefresh(); }} />
                          </div>
                        </TabsContent>
                      )}
                    </div>
                  </div>
                </div>
              </Tabs>
            </div>
          </div>
        </PullToRefreshContainer>
      </main>

      <MobileBottomNav />
      <AvatarViewer
        imageUrl={profile?.avatar_url}
        isOpen={showAvatarViewer}
        onClose={() => setShowAvatarViewer(false)}
        fallbackText={profile?.username?.[0]?.toUpperCase() || 'U'}
      />
    </div>
  );
};

export default Profile;
