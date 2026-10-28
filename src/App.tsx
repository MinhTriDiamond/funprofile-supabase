import { Suspense, useEffect, useRef, useState } from "react";
import { ensureAutoplay, registerAudioElement } from '@/lib/globalAudio';
import ScrollToTop from "./components/ScrollToTop";
import { NavigationHistoryTracker } from "./components/layout/NavigationHistoryTracker";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { LawOfLightGuard } from "@/components/auth/LawOfLightGuard";
import { ConditionalWeb3Provider } from "@/components/providers/ConditionalWeb3Provider";
import { DonationReceivedNotification } from "@/components/donations/DonationReceivedNotification";
import { RewardAdjustmentNotification } from "@/components/notifications/RewardAdjustmentNotification";
import { EpochClaimCelebration } from "@/components/notifications/EpochClaimCelebration";
import { MysteryBoxLegendaryCelebration } from "@/modules/mystery-box/components/MysteryBoxLegendaryCelebration";
import { CallProvider } from "@/contexts/CallContext";
import { GiftTransactionProvider } from "@/contexts/GiftTransactionContext";
import { GiftStatusFloatingBar } from "@/components/donations/GiftStatusFloatingBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateNotification } from "@/components/UpdateNotification";
import { InstallBanner } from "@/components/install/InstallBanner";
import { applyHardUpdate, lazyWithChunkRecovery, recoverFromChunkLoadError, resetChunkRecoveryAfterHealthyLoad } from "@/lib/appUpdateRecovery";
import { loadProfilePage } from "@/lib/profilePreload";
import Feed from "./pages/Feed";

import { usePendingDonationRecovery } from "@/hooks/usePendingDonationRecovery";
import { useNewMemberWelcome } from "@/hooks/useNewMemberWelcome";
// Feed cũng lazy để giảm initial bundle. ChunkLoadRecovery xử lý nếu Feed chunk lỗi sau deploy.
const RtmpLivePage = lazyWithChunkRecovery(() => import("@/modules/live/pages/RtmpLivePage"), "RtmpLivePage");
const PreLivePage = lazyWithChunkRecovery(() => import("@/modules/live/pages/PreLivePage"), "PreLivePage");

const Wallet = lazyWithChunkRecovery(() => import("./pages/Wallet"), "Wallet");
const Auth = lazyWithChunkRecovery(() => import("./pages/Auth"), "Auth");
const Friends = lazyWithChunkRecovery(() => import("./pages/Friends"), "Friends");
const Profile = lazyWithChunkRecovery(loadProfilePage, "Profile");
const Post = lazyWithChunkRecovery(() => import("./pages/Post"), "Post");
const ShareRedirect = lazyWithChunkRecovery(() => import("./pages/ShareRedirect"), "ShareRedirect");
const About = lazyWithChunkRecovery(() => import("./pages/About"), "About");
const PrivacyPolicy = lazyWithChunkRecovery(() => import("./pages/PrivacyPolicy"), "PrivacyPolicy");
const Leaderboard = lazyWithChunkRecovery(() => import("./pages/Leaderboard"), "Leaderboard");
const AdminMigration = lazyWithChunkRecovery(() => import("./pages/AdminMigration"), "AdminMigration");
const AdminShell = lazyWithChunkRecovery(
  () => import("./components/admin/shell/AdminShell").then((m) => ({ default: m.AdminShell })),
  "AdminShell",
);
const AdminSection = lazyWithChunkRecovery(
  () => import("./components/admin/shell/AdminShell").then((m) => ({ default: m.AdminSection })),
  "AdminSection",
);
const AdminReplayDebug = lazyWithChunkRecovery(() => import("./pages/AdminReplayDebug"), "AdminReplayDebug");
const AdminKycPage = lazyWithChunkRecovery(() => import("./pages/admin/AdminKycPage"), "AdminKycPage");
const FunCoreDebugPage = lazyWithChunkRecovery(() => import("./pages/admin/FunCoreDebugPage"), "FunCoreDebugPage");
// FederationBackfillPage giờ render bên trong AdminShell qua AdminSection.
const FounderDashboard = lazyWithChunkRecovery(() => import("./pages/FounderDashboard"), "FounderDashboard");
const NotFound = lazyWithChunkRecovery(() => import("./pages/NotFound"), "NotFound");
const LawOfLight = lazyWithChunkRecovery(() => import("./pages/LawOfLight"), "LawOfLight");
const Notifications = lazyWithChunkRecovery(() => import("./pages/Notifications"), "Notifications");
const DocsRouter = lazyWithChunkRecovery(() => import("./pages/DocsRouter"), "DocsRouter");
const ConnectedApps = lazyWithChunkRecovery(() => import("./pages/ConnectedApps"), "ConnectedApps");
const SetPassword = lazyWithChunkRecovery(() => import("./pages/SetPassword"), "SetPassword");
const ResetPassword = lazyWithChunkRecovery(() => import("./pages/ResetPassword"), "ResetPassword");
const Chat = lazyWithChunkRecovery(() => import("./pages/Chat"), "Chat");
const Install = lazyWithChunkRecovery(() => import("./pages/Install"), "Install");
const SecuritySettings = lazyWithChunkRecovery(() => import("./pages/SecuritySettings"), "SecuritySettings");
const Settings = lazyWithChunkRecovery(() => import("./pages/Settings"), "Settings");
const Benefactors = lazyWithChunkRecovery(() => import("./pages/Benefactors"), "Benefactors");
const Donations = lazyWithChunkRecovery(() => import("./pages/Donations"), "Donations");
const Users = lazyWithChunkRecovery(() => import("./pages/Users"), "Users");
const Reels = lazyWithChunkRecovery(() => import("./pages/Reels"), "Reels");
const VerifyEmail = lazyWithChunkRecovery(() => import("./pages/VerifyEmail"), "VerifyEmail");
const ConfirmEmail = lazyWithChunkRecovery(() => import("./pages/ConfirmEmail"), "ConfirmEmail");
const AuthCallback = lazyWithChunkRecovery(() => import("./pages/AuthCallback"), "AuthCallback");
const IdentityDashboard = lazyWithChunkRecovery(() => import("./pages/identity/IdentityDashboard"), "IdentityDashboard");
const IdentityOnboarding = lazyWithChunkRecovery(() => import("./pages/identity/IdentityOnboarding"), "IdentityOnboarding");
const ConnectorPage = lazyWithChunkRecovery(() => import("./pages/connector/ConnectorPage"), "ConnectorPage");
const ConnectorGivenPage = lazyWithChunkRecovery(() => import("./pages/connector/ConnectorGivenPage"), "ConnectorGivenPage");
const QuestsPage = lazyWithChunkRecovery(() => import("./pages/QuestsPage"), "QuestsPage");
const MysteryBoxPage = lazyWithChunkRecovery(() => import("./pages/MysteryBoxPage"), "MysteryBoxPage");
const PetPage = lazyWithChunkRecovery(() => import("./pages/PetPage"), "PetPage");
const PetShopPage = lazyWithChunkRecovery(() => import("./pages/PetShopPage"), "PetShopPage");
const PetAppealPage = lazyWithChunkRecovery(() => import("./pages/PetAppealPage"), "PetAppealPage");
const PetArenaPage = lazyWithChunkRecovery(() => import("./pages/PetArenaPage"), "PetArenaPage");
const TreasuryPublicPage = lazyWithChunkRecovery(() => import("./pages/TreasuryPublicPage"), "TreasuryPublicPage");

const LiveDiscoveryPage = lazyWithChunkRecovery(() => import("./pages/LiveDiscoveryPage"), "LiveDiscoveryPage");
const LiveHostPage = lazyWithChunkRecovery(() => import("./modules/live/pages/LiveHostPage"), "LiveHostPage");
const LiveAudiencePage = lazyWithChunkRecovery(() => import("./modules/live/pages/LiveAudiencePage"), "LiveAudiencePage");
const WalletHistoryPage = lazyWithChunkRecovery(() => import("./pages/WalletHistoryPage"), "WalletHistoryPage");
const ProfileHistoryPage = lazyWithChunkRecovery(() => import("./pages/ProfileHistoryPage"), "ProfileHistoryPage");

function ChunkLoadRecovery() {
  useEffect(() => {
    resetChunkRecoveryAfterHealthyLoad();

    const recover = (reason: unknown) => {
      recoverFromChunkLoadError(reason);
    };

    const handleError = (event: ErrorEvent) => recover(event.error ?? event.message);
    const handleRejection = (event: PromiseRejectionEvent) => recover(event.reason);
    const handleVitePreloadError = (event: Event) => {
      event.preventDefault();
      const payload = (event as Event & { payload?: unknown }).payload;
      recover(payload ?? "vite:preloadError");
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('vite:preloadError', handleVitePreloadError);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('vite:preloadError', handleVitePreloadError);
    };
  }, []);

  return null;
}

function AuthSessionKeeper() {
  return null;
}

// Các route auth/guest KHÔNG cần (và không nên) chạy các hook nền cần session.
// Tránh tạo query lúc user chưa đăng nhập làm nặng /auth.
const AUTH_ONLY_PATHS = new Set([
  '/auth',
  '/auth/callback',
  '/set-password',
  '/reset-password',
  '/verify-email',
  '/confirm-email',
]);

function useIsAuthOnlyRoute() {
  const { pathname } = useLocation();
  return AUTH_ONLY_PATHS.has(pathname) || pathname.startsWith('/auth/');
}

function PendingDonationRecovery() {
  usePendingDonationRecovery();
  return null;
}

function NewMemberWelcome() {
  useNewMemberWelcome();
  return null;
}

function AuthenticatedOnlyBackground() {
  const isAuthRoute = useIsAuthOnlyRoute();
  if (isAuthRoute) return null;
  return (
    <>
      <PendingDonationRecovery />
      <NewMemberWelcome />
    </>
  );
}

function AuthenticatedOnlyOverlays() {
  const isAuthRoute = useIsAuthOnlyRoute();
  if (isAuthRoute) return null;
  return (
    <>
      <DonationReceivedNotification />
      <RewardAdjustmentNotification />
      <EpochClaimCelebration />
      <MysteryBoxLegendaryCelebration />
      <InstallBanner />
      <GiftStatusFloatingBar />
    </>
  );
}

function PageLoader() {
  const [showRescue, setShowRescue] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const isRescueLoad =
        url.pathname === '/' ||
        url.searchParams.has('__fun_rescue') ||
        url.searchParams.has('__fun_update') ||
        url.searchParams.has('__fun_reload');
      if (isRescueLoad) setShowRescue(true);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, []);

  const hardReload = () => {
    applyHardUpdate({ resetRecovery: true, fallbackToHome: true, rescue: true, reason: 'unknown' });
  };

  const openHomeWithoutWeb3 = () => {
    const stamp = String(Date.now());
    window.location.replace(`/?__fun_rescue=${stamp}&__fun_no_web3=${stamp}`);
  };

  return (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-4 animate-fade-in">
      <div className="w-10 h-10 md:w-12 md:h-12 border-3 md:border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Đang tải...</p>
      {showRescue && (
        <div className="mt-2 max-w-md space-y-4 rounded-2xl border border-primary/20 bg-card/80 p-5 text-center shadow-sm">
          <div className="space-y-1">
            <h1 className="text-base font-semibold text-foreground">Ứng dụng đang tải lâu hơn bình thường</h1>
            <p className="text-sm text-muted-foreground">
              Có thể trình duyệt vẫn giữ một phần phiên bản cũ. Hãy tải lại bản mới hoặc mở trang chủ ở chế độ nhẹ.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={hardReload}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Tải lại bản mới
            </button>
            <button
              type="button"
              onClick={openHomeWithoutWeb3}
              className="inline-flex items-center justify-center rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              Vào trang chủ không dùng ví
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}

/**
 * Phase 4 �€” A7: Defer audio loading.
 * Ch�‰ mount thẻ <audio> sau khi user tương tác lần �‘ầu (click/touch/keydown).
 * Trư�›c �‘ó: không tải file MP3 �†’ tiết ki�‡m b�ƒng thông + t�ƒng t�‘c FCP.
 */
function GlobalAudioBootstrap() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed) return;
    const arm = () => {
      setArmed(true);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('touchstart', arm);
    };
    window.addEventListener('pointerdown', arm, { once: true, passive: true });
    window.addEventListener('keydown', arm, { once: true });
    window.addEventListener('touchstart', arm, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('touchstart', arm);
    };
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    registerAudioElement(audioRef.current);
    ensureAutoplay();
  }, [armed]);

  if (!armed) return null;

  return (
    <audio
      ref={audioRef}
      src="/sounds/light-economy-anthem.mp3"
      autoPlay
      loop
      preload="metadata"
      playsInline
      className="hidden"
      aria-hidden="true"
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <GiftTransactionProvider>
          <GlobalAudioBootstrap />
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <ChunkLoadRecovery />
            <UpdateNotification />
            <AuthSessionKeeper />
            <BrowserRouter>
              <ConditionalWeb3Provider>
                <ScrollToTop />
                <NavigationHistoryTracker />
                <AuthenticatedOnlyBackground />
                <CallProvider>
                  <Suspense fallback={<PageLoader />}>
                    <LawOfLightGuard>
                      <Routes>
                        <Route path="/begin" element={<Navigate to="/law-of-light" replace />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/set-password" element={<SetPassword />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/verify-email" element={<VerifyEmail />} />
                        <Route path="/confirm-email" element={<ConfirmEmail />} />
                        <Route path="/auth/callback" element={<AuthCallback />} />
                        <Route path="/law-of-light" element={<LawOfLight />} />
                        <Route path="/" element={<Feed />} />
                        <Route path="/friends" element={<Friends />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/profile/:userId" element={<Profile />} />
                        <Route path="/profile/connected-apps" element={<ConnectedApps />} />
                        <Route path="/@:username" element={<Profile />} />
                        <Route path="/wallet/history" element={<WalletHistoryPage />} />
                        <Route path="/wallet/*" element={<Wallet />} />
                        <Route path="/profile/:username/history" element={<ProfileHistoryPage />} />
                        <Route path="/p/:shareCode" element={<ShareRedirect />} />
                        <Route path="/post/:postId" element={<Post />} />
                        <Route path="/:username/posts/:publicId" element={<Post />} />
                        <Route path="/:username/post/:slug" element={<Post />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                        <Route path="/leaderboard" element={<Leaderboard />} />
                        <Route path="/leaderboard/:tab" element={<Leaderboard />} />
                        <Route path="/admin/migration" element={<AdminMigration />} />
                        <Route path="/admin/replay-debug" element={<AdminReplayDebug />} />
                        <Route path="/admin/kyc" element={<AdminKycPage />} />
                        <Route path="/admin/fun-core-debug" element={<FunCoreDebugPage />} />
                        <Route path="/admin" element={<AdminShell />}>
                          <Route index element={<AdminSection />} />
                          <Route path="*" element={<AdminSection />} />
                        </Route>
                        <Route path="/founder" element={<FounderDashboard />} />
                        <Route path="/notifications" element={<Notifications />} />
                        <Route path="/chat" element={<Chat />} />
                        <Route path="/chat/:conversationId" element={<Chat />} />
                        <Route path="/identity/onboarding" element={<IdentityOnboarding />} />
                        <Route path="/identity" element={<IdentityDashboard />} />
                        <Route path="/identity/:tab" element={<IdentityDashboard />} />
                        <Route path="/connector" element={<ConnectorPage />} />
                        <Route path="/connector/given" element={<ConnectorGivenPage />} />
                        <Route path="/quests" element={<QuestsPage />} />
                        <Route path="/mystery-box" element={<MysteryBoxPage />} />
                        <Route path="/pet" element={<PetPage />} />
                        <Route path="/pet/shop" element={<PetShopPage />} />
                        <Route path="/pet/appeal" element={<PetAppealPage />} />
                        <Route path="/pet/arena" element={<PetArenaPage />} />
                        <Route path="/treasury" element={<TreasuryPublicPage />} />
                        <Route path="/docs/*" element={<DocsRouter />} />
                        <Route path="/install" element={<Install />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/settings/:tab" element={<Settings />} />
                        <Route path="/benefactors" element={<Benefactors />} />
                        <Route path="/donations" element={<Donations />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="/reels" element={<Reels />} />
                        <Route path="/reels/:reelId" element={<Reels />} />
                        <Route path="/:username/video/:slug" element={<Reels />} />
                        <Route path="/mint" element={<Navigate to="/wallet/fun_money" replace />} />
                        <Route path="/live" element={<LiveDiscoveryPage />} />
                        <Route path="/live/setup" element={<PreLivePage />} />
                        <Route path="/live/new" element={<LiveHostPage />} />
                        <Route path="/live/obs" element={<RtmpLivePage />} />
                        <Route path="/live/obs/:sessionId" element={<RtmpLivePage />} />
                        <Route path="/live/stream" element={<Navigate to="/live/new" replace />} />
                        <Route path="/live/:liveSessionId" element={<LiveAudiencePage />} />
                        <Route path="/live/:liveSessionId/host" element={<LiveHostPage />} />
                        <Route path="/:username/live/:slug" element={<LiveAudiencePage />} />
                        <Route path="/:username" element={<Profile />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </LawOfLightGuard>
                    <AuthenticatedOnlyOverlays />
                  </Suspense>
                </CallProvider>
              </ConditionalWeb3Provider>
            </BrowserRouter>
          </TooltipProvider>
          </GiftTransactionProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
