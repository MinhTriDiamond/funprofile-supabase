import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LazyImage } from '@/components/ui/LazyImage';

import { AvatarEditor } from '@/components/profile/AvatarEditor';
import { CoverHonorBoard, MobileStats } from '@/components/profile/CoverHonorBoard';
import { AvatarOrbit } from '@/components/profile/AvatarOrbit';
import { FriendRequestButton } from '@/components/friends/FriendRequestButton';
import { DonationButton } from '@/components/donations/DonationButton';
import { ProfileHistoryEntry } from '@/components/profile/ProfileHistoryEntry';
import { BtcReceiveQRDialog } from '@/components/profile/BtcReceiveQRDialog';
import { MoreHorizontal, MapPin, Briefcase, MessageCircle, Eye, X, PenSquare, Copy, Wallet, Shield, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/utils/clipboard';
import { useLanguage } from '@/i18n/LanguageContext';
import type { ProfileData, FriendPreview } from '@/hooks/useProfile';
import { DIDBadge } from '@/components/identity/DIDBadge';
import { TrustTierBadge } from '@/components/identity/TrustTierBadge';
import { useUserIdentityBadge } from '@/hooks/useUserIdentityBadge';
import { OnboardingTrustCTA } from '@/components/identity/OnboardingTrustCTA';
import { KycVerifiedBadge } from '@/components/identity/KycVerifiedBadge';
import { FederationBadge } from '@/components/identity/federation/FederationBadge';
import { PublicPetCard } from '@/modules/pet/components/PublicPetCard';
import btcLogo from '@/assets/tokens/btc-logo.png';
import { LiveAvatarBadge } from '@/components/live/LiveAvatarBadge';
import { getProfileLiveState } from '@/components/live/getProfileLiveState';

interface ProfileHeaderProps {
  profile: ProfileData;
  currentUserId: string;
  isOwnProfile: boolean;
  isAdmin: boolean;
  showPrivateElements: boolean;
  viewAsPublic: boolean;
  friendsPreview: FriendPreview[];
  onSetProfile: (updater: (prev: ProfileData | null) => ProfileData | null) => void;
  onNavigateToTab: (tab: string) => void;
  onStartChat: () => void;
  onSetViewAsPublic: (v: boolean) => void;
  onSetShowAvatarViewer: (v: boolean) => void;
  chatPending: boolean;
}

export const ProfileHeader = ({
  profile,
  currentUserId,
  isOwnProfile,
  isAdmin,
  showPrivateElements,
  viewAsPublic,
  friendsPreview,
  onSetProfile,
  onNavigateToTab,
  onStartChat,
  onSetViewAsPublic,
  onSetShowAvatarViewer,
  chatPending,
}: ProfileHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const [showBtcQR, setShowBtcQR] = useState(false);
  const { data: identityBadge } = useUserIdentityBadge(profile?.id);
  const lumiAnchorRef = useRef<HTMLDivElement | null>(null);
  const [highlightLumi, setHighlightLumi] = useState(false);
  const [searchParams] = useSearchParams();
  const backParam = searchParams.get('back');
  const decodedBack = backParam ? (() => { try { return decodeURIComponent(backParam); } catch { return null; } })() : null;
  const profileLive = getProfileLiveState(profile);
  const openLiveSession = () => {
    if (profileLive.liveSessionId) navigate(`/live/${profileLive.liveSessionId}`);
  };

  useEffect(() => {
    if (location.hash !== '#lumi' || !profile?.id) return;
    const timer = setTimeout(() => {
      lumiAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightLumi(true);
      setTimeout(() => setHighlightLumi(false), 1800);
    }, 350);
    return () => clearTimeout(timer);
  }, [location.hash, profile?.id]);

  const displayAddress = profile?.public_wallet_address || profile?.external_wallet_address;

  return (
    <>
      {/* View As Banner */}
      {viewAsPublic && (
        <div className="fixed top-14 left-0 right-0 z-50 bg-primary text-primary-foreground py-3 px-4 flex items-center justify-center gap-4 shadow-lg">
          <Eye className="w-5 h-5" />
          <span className="font-medium">{t('viewingAsOther')}</span>
          <Button size="sm" variant="secondary" onClick={() => onSetViewAsPublic(false)} className="ml-2">
            <X className="w-4 h-4 mr-1" />
            {t('exitViewMode')}
          </Button>
        </div>
      )}

      {/* Mobile: Honor Board only (no cover photo) */}
      <div className="block md:hidden max-w-[1100px] mx-auto px-4">
        <div className="pt-2 pb-[70px]">
          <MobileStats userId={profile.id} username={profile?.username} avatarUrl={profile?.avatar_url ?? undefined} />
        </div>
      </div>

      {/* Desktop: Cover Photo with Honor Board overlay */}
      <div className="hidden md:block max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative">
          <div className="h-[280px] relative rounded-2xl">
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
              <LazyImage
                src={profile?.cover_url || 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&h=1080&fit=crop'}
                alt="Cover"
                className="w-full h-full object-cover"
                transformPreset="cover"
                priority
              />
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />
            </div>

            {/* Honor Board Desktop */}
            <div className="absolute z-20 top-3 right-3 lg:top-4 lg:right-4 rounded-2xl p-1.5 bg-white/30 backdrop-blur-sm" style={{ width: 'clamp(320px, 34vw, 460px)' }}>
              <CoverHonorBoard userId={profile.id} username={profile?.username} avatarUrl={profile?.avatar_url ?? undefined} />
            </div>
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-card/80 border-b border-border shadow-sm md:rounded-b-xl">
          <div className="px-4 md:px-8 py-4 md:py-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
              {/* Avatar */}
              <div className="-mt-12 md:-mt-[217px] relative z-20 flex justify-center md:justify-start flex-shrink-0 origin-top" style={{ overflow: 'visible' }}>
                <AvatarOrbit
                  key={profile?.id}
                  socialLinks={Array.isArray(profile?.social_links) ? profile.social_links : []}
                  isOwner={isOwnProfile}
                  userId={profile?.id}
                  onLinksChanged={(links) => onSetProfile(prev => prev && prev.id === profile.id ? { ...prev, social_links: links } : prev)}
                >
                  {showPrivateElements ? (
                    <div className={profileLive.isLive ? 'rounded-full p-[3px] bg-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.18)]' : undefined}>
                      <AvatarEditor
                        userId={currentUserId}
                        currentAvatarUrl={profile?.avatar_url ?? undefined}
                        username={profile?.username}
                        onAvatarUpdated={(newUrl) => onSetProfile(prev => prev ? { ...prev, avatar_url: newUrl } : prev)}
                        size="large"
                      />
                      {profileLive.isLive && (
                        <span className="absolute bottom-1 left-1/2 z-30 -translate-x-1/2 rounded-sm bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase leading-none tracking-wide text-white shadow-md ring-2 ring-background">
                          LIVE
                        </span>
                      )}
                    </div>
                  ) : (
                    <LiveAvatarBadge
                      avatarUrl={profile?.avatar_url}
                      username={profile?.username}
                      userId={profile?.id}
                      isLive={profileLive.isLive}
                      liveSessionId={profileLive.liveSessionId}
                      size="xl"
                      className={profileLive.isLive ? undefined : 'p-1 bg-[linear-gradient(135deg,#166534_0%,#22c55e_50%,#16a34a_100%)]'}
                      imageClassName="border-4 border-white"
                      onClick={profileLive.isLive ? openLiveSession : () => onSetShowAvatarViewer(true)}
                      ariaLabel={profileLive.isLive ? t('liveAriaIsLive', { name: profile?.username || 'User' }) : t('viewAvatarAria')}
                    />
                  )}
                </AvatarOrbit>
              </div>

              {/* Name & Info */}
              <div className="flex-1 text-center md:text-left md:ml-4 relative z-30">
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-green-700">
                  {profile?.display_name || profile?.username}
                </h1>
                {profileLive.isLive && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-black uppercase text-white shadow-sm">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      LIVE
                    </span>
                    <span className="text-sm font-semibold text-red-600">{t('liveBroadcastingLabel')}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-8 rounded-full px-3 text-xs font-bold"
                      onClick={openLiveSession}
                    >
                      {t('liveWatchBtn')}
                    </Button>
                  </div>
                )}
                {profile?.is_banned && (
                  <div className="mt-2 border-2 border-red-500 rounded-lg px-4 py-3 bg-red-50">
                    <p className="text-red-600 font-bold text-sm">{t('bannedTitle')}</p>
                    <p className="text-red-500 text-xs mt-0.5">{t('bannedDesc')}</p>
                  </div>
                )}
                <div className="flex items-center justify-center md:justify-start gap-1.5 text-sm font-bold text-green-600 mt-0.5 flex-wrap">
                  <span>@{profile?.username}</span>
                  <span className="text-muted-foreground font-normal">·</span>
                  <button
                    type="button"
                    onClick={() => { copyToClipboard(`https://fun.rich/${profile?.username}`).then((ok) => { if (ok) toast.success(t('copyProfileLinkSuccess')); else toast.error(t('copyFailed')); }); }}
                    className="inline-flex items-center gap-1 hover:text-primary hover:underline transition-colors cursor-pointer touch-manipulation active:scale-95"
                  >
                    <span>fun.rich/{profile?.username}</span>
                    <Copy className="w-4 h-4 text-primary flex-shrink-0" />
                  </button>
                </div>

                {/* Identity badges (DID + Trust Tier + KYC) — public */}
                {(identityBadge?.did_id || identityBadge?.identity_verified) && (
                  <div className="flex items-center justify-center md:justify-start gap-1.5 mt-1.5 flex-wrap">
                    {identityBadge?.did_id && (
                      <DIDBadge level={identityBadge.did_level} status={identityBadge.did_status} compact />
                    )}
                    {identityBadge?.trust_tier && (
                      <TrustTierBadge tier={identityBadge.trust_tier} tc={identityBadge.tc} compact />
                    )}
                    {identityBadge?.identity_verified && (
                      <KycVerifiedBadge
                        verified={identityBadge.identity_verified}
                        isTest={identityBadge.identity_is_test}
                        level={identityBadge.identity_level}
                        docMismatch={identityBadge.kyc_doc_mismatch}
                        compact
                      />
                    )}
                    {isOwnProfile && <FederationBadge userId={profile?.id} compact />}
                    {isOwnProfile && <OnboardingTrustCTA variant="compact" />}
                  </div>
                )}

                {/* Wallet Address */}
                {displayAddress ? (
                  <button
                    onClick={() => { copyToClipboard(displayAddress).then((ok) => { if (ok) toast.success(t('walletCopied')); else toast.error(t('copyFailed')); }); }}
                    className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-full bg-primary/10 border border-primary/20 touch-manipulation active:scale-95 hover:bg-primary/20 transition-all cursor-pointer"
                  >
                    <Wallet className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm text-foreground font-mono font-medium">{displayAddress.slice(0, 6)}...{displayAddress.slice(-4)}</span>
                    <Copy className="w-4 h-4 text-primary flex-shrink-0" />
                  </button>
                ) : showPrivateElements ? (
                  <button onClick={() => onNavigateToTab('edit')} className="flex items-center gap-2 mt-1 text-sm text-primary hover:underline">
                    <Wallet className="w-4 h-4" />{t('addPublicWallet')}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Wallet className="w-4 h-4" /><span>{t('notUpdated')}</span>
                  </div>
                )}

                {/* BTC Wallet Address */}
                {profile?.btc_address ? (
                  <div className="inline-flex items-center gap-1 mt-1">
                    <button
                      onClick={() => setShowBtcQR(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 touch-manipulation active:scale-95 hover:bg-orange-500/20 transition-all cursor-pointer"
                    >
                      <img src={btcLogo} alt="BTC" className="w-8 h-8 rounded-full flex-shrink-0" />
                      <span className="text-sm text-foreground font-mono font-medium">{profile.btc_address.slice(0, 8)}...{profile.btc_address.slice(-6)}</span>
                      <QrCode className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    </button>
                    <button
                      onClick={() => { copyToClipboard(profile.btc_address!).then((ok) => { if (ok) toast.success(t('copyBtcSuccess')); else toast.error(t('copyFailed')); }); }}
                      className="p-2 rounded-full hover:bg-orange-500/10 transition-colors touch-manipulation active:scale-95"
                    >
                      <Copy className="w-4 h-4 text-orange-500" />
                    </button>
                  </div>
                ) : showPrivateElements ? (
                  <button onClick={() => onNavigateToTab('edit')} className="flex items-center gap-2 mt-1 text-sm text-orange-500 hover:underline">
                    <img src={btcLogo} alt="BTC" className="w-8 h-8 rounded-full" /> {t('addBtcAddress')}
                  </button>
                ) : null}

                {profile?.bio && (
                  <p className="text-xs sm:text-sm text-green-700 mt-1 whitespace-pre-wrap break-words max-w-md">{profile.bio}</p>
                )}

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 mt-2 text-sm sm:text-base text-green-600 font-medium">
                  <div className="flex items-center gap-1.5"><MapPin className="w-5 h-5 flex-shrink-0" /><span>{t('countryVietnam')}</span></div>
                  <div className="flex items-center gap-1.5"><Briefcase className="w-5 h-5 flex-shrink-0" /><span>FUN Ecosystem</span></div>
                </div>

                {friendsPreview.length > 0 && (
                  <div className="hidden md:flex -space-x-2 mt-3">
                    {friendsPreview.slice(0, 6).map((friend) => {
                      const friendLive = getProfileLiveState(friend);
                      return (
                        <LiveAvatarBadge
                          key={friend.id}
                          avatarUrl={friend.avatar_url}
                          username={friend.username}
                          userId={friend.id}
                          isLive={friendLive.isLive}
                          liveSessionId={friendLive.liveSessionId}
                          size="sm"
                          className="border-2 border-card hover:z-10 hover:scale-110 transition-transform"
                          onClick={() => friendLive.isLive && friendLive.liveSessionId ? navigate(`/live/${friendLive.liveSessionId}`) : navigate(`/${friend.username}`)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {!viewAsPublic && (
                <div className="flex flex-wrap justify-center md:justify-end gap-2 pb-2">
                  {isOwnProfile ? (
                    <>
                      <Button variant="secondary" className="font-semibold px-4 h-10" onClick={() => onNavigateToTab('edit')}>
                        <PenSquare className="w-4 h-4 mr-2" />{t('editPersonalPage')}
                      </Button>
                      {isAdmin && (
                        <Button variant="outline" className="font-semibold px-4 h-10 border-primary/30 text-primary hover:bg-primary/10" onClick={() => navigate('/admin')}>
                          <Shield className="w-4 h-4 mr-2" />Admin
                        </Button>
                      )}
                      <ProfileHistoryEntry userId={profile.id} walletAddress={displayAddress} userDisplayName={profile.display_name} userAvatarUrl={profile.avatar_url} username={profile.username} userCreatedAt={profile.created_at} />
                    </>
                  ) : (
                    <>
                      <FriendRequestButton userId={profile.id} currentUserId={currentUserId} />
                      <Button variant="secondary" className="font-semibold px-4 h-10" onClick={onStartChat} disabled={chatPending}>
                        <MessageCircle className="w-4 h-4 mr-2" />{t('sendMessage')}
                      </Button>
                      <DonationButton
                        recipientId={profile.id}
                        recipientUsername={profile.username}
                        recipientDisplayName={profile.display_name}
                        recipientWalletAddress={profile.public_wallet_address || profile.external_wallet_address || profile.wallet_address}
                        recipientBtcAddress={profile.btc_address}
                        recipientAvatarUrl={profile.avatar_url}
                        variant="profile"
                      />
                      <ProfileHistoryEntry userId={profile.id} walletAddress={displayAddress} userDisplayName={profile.display_name} userAvatarUrl={profile.avatar_url} username={profile.username} userCreatedAt={profile.created_at} />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Banner quay lại nhiệm vụ (khi đến từ Đôi bạn cùng tiến) */}
        {decodedBack && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="truncate">✨ {t('profileMissionLumi')}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 px-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
              onClick={() => navigate(decodedBack)}
            >
              ← {t('profileBackToMission')}
            </Button>
          </div>
        )}

        {/* Public Pet card */}
        {profile?.id && (
          <div
            id="lumi"
            ref={lumiAnchorRef}
            className={`mt-3 rounded-xl transition-all duration-500 ${highlightLumi ? 'ring-4 ring-pink-400 ring-offset-2 ring-offset-background' : ''}`}
          >
            <PublicPetCard userId={profile.id} currentUserId={currentUserId} />
          </div>
        )}
      </div>

      {/* BTC Receive QR Dialog */}
      {profile?.btc_address && (
        <BtcReceiveQRDialog
          isOpen={showBtcQR}
          onClose={() => setShowBtcQR(false)}
          btcAddress={profile.btc_address}
          username={profile.username}
        />
      )}
    </>
  );
};
