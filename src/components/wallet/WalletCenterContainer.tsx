import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { bsc, bscTestnet } from 'wagmi/chains';
import { useAutoChainSwitch } from '@/hooks/useAutoChainSwitch';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Wallet, ChevronDown, CheckCircle2, ExternalLink, RefreshCw, Smartphone } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

import { useActiveAccount } from '@/contexts/ActiveAccountContext';

import { AccountSelectorModal } from './AccountSelectorModal';
import { AccountMismatchModal } from './AccountMismatchModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { MobileWalletConnectSheet } from './MobileWalletConnectSheet';
import { ReceiveTab } from './ReceiveTab';
import { UnifiedGiftSendDialog } from '@/components/donations/UnifiedGiftSendDialog';
import { BtcSendDialog } from './BtcSendDialog';
import { ClaimRewardDialog } from './ClaimRewardDialog';
import { RewardStats } from './RewardBreakdown';
import { ActivateDialog } from './ActivateDialog';
import { ClaimFunDialog } from './ClaimFunDialog';
import { AddCustomTokenDialog } from './AddCustomTokenDialog';
import { SwapTab } from './SwapTab';
import { useFunBalance } from '@/hooks/useFunBalance';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import { useCustomTokenActions } from '@/hooks/useCustomTokens';
import { useCamlyPrice } from '@/hooks/useCamlyPrice';
import bnbLogo from '@/assets/tokens/bnb-logo.webp';
import btcLogo from '@/assets/tokens/btc-logo.png';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  getBitgetDeepLink,
  getInjectedMobileBrowserType,
  getMetaMaskDeepLink,
  getTrustWalletDeepLink,
  isInjectedMobileBrowser,
  isMobileDevice,
} from '@/utils/mobileWalletConnect';
import { clearWalletLocalStorage } from '@/utils/walletSessionReset';

// Tab components
import { AssetTab } from './tabs/AssetTab';
import { RewardTab } from './tabs/RewardTab';
import { FunMoneyTab } from './tabs/FunMoneyTab';
import { HistoryTab } from './tabs/HistoryTab';

interface Profile {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  full_name: string | null;
  reward_status?: string;
  admin_notes?: string | null;
  created_at?: string;
  btc_address?: string | null;
  social_links?: Record<string, string> | null;
}

// Tab configuration
const getWalletTabLabels = (t: (key: string) => string) => [
  { id: 'asset', label: t('walletTabAsset'), path: '/wallet/asset' },
  { id: 'reward', label: t('walletTabReward'), path: '/wallet/reward' },
  { id: 'fun_money', label: t('walletTabFunMoney'), path: '/wallet/fun_money' },
  { id: 'history', label: t('walletTabHistory'), path: '/wallet/history' },
] as const;

const WALLET_DISCONNECTED_KEY = 'fun_profile_wallet_disconnected';

const WalletCenterContainer = () => {
  const { address, isConnected, chainId, connector } = useAccount();
  const { activeAddress, accounts, setActiveAddress } = useActiveAccount();
  const { connect } = useConnect();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { isWrongChain } = useAutoChainSwitch();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [claimableReward, setClaimableReward] = useState(0);
  const [claimedAmount, setClaimedAmount] = useState(0);
  const [dailyClaimed, setDailyClaimed] = useState(0);
  const [rewardStats, setRewardStats] = useState<RewardStats | null>(null);
  const [isRewardLoading, setIsRewardLoading] = useState(true);
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [showClaimFunDialog, setShowClaimFunDialog] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [showAddCustomToken, setShowAddCustomToken] = useState(false);
  const [showMobileConnectGuide, setShowMobileConnectGuide] = useState(false);
  const [todayPostCount, setTodayPostCount] = useState(0);
  const [copiedExternal, setCopiedExternal] = useState(false);
  
  const [selectedNetwork, setSelectedNetwork] = useState<'evm' | 'bitcoin'>('evm');
  const [showDisconnectedUI, setShowDisconnectedUI] = useState(() => {
    return localStorage.getItem(WALLET_DISCONNECTED_KEY) === 'true';
  });
  const intentionalDisconnectRef = useRef(false);

  const walletTabs = useMemo(() => getWalletTabLabels(t), [t]);

  // Active tab from route
  const activeTab = useMemo(() => {
    const path = location.pathname;
    const tab = walletTabs.find(t => path.startsWith(t.path));
    return tab?.id || 'asset';
  }, [location.pathname, walletTabs]);

  // Redirect /wallet to /wallet/asset
  useEffect(() => {
    if (location.pathname === '/wallet' || location.pathname === '/wallet/') {
      navigate('/wallet/asset', { replace: true });
    }
  }, [location.pathname, navigate]);


  const connectedWalletType = useMemo(() => {
    if (!connector) return null;
    const name = connector.name.toLowerCase();
    if (name.includes('metamask')) return 'metamask' as const;
    if (name.includes('bitget')) return 'bitget' as const;
    if (name.includes('trust')) return 'trust' as const;
    if (name.includes('fun')) return 'fun' as const;
    return 'other' as const;
  }, [connector]);

  const getWalletDisplayName = useCallback(() => {
    if (connector?.name) return connector.name;
    switch (connectedWalletType) {
      case 'metamask': return 'MetaMask';
      case 'bitget': return 'Bitget Wallet';
      case 'trust': return 'Trust Wallet';
      case 'fun': return 'FUN Wallet';
      default: return 'External Wallet';
    }
  }, [connector, connectedWalletType]);

  const effectiveAddress = activeAddress as `0x${string}` | undefined;
  const externalAddress = (effectiveAddress || address) as `0x${string}` | undefined;
  const displayWalletAddress = (activeAddress || address) as string | null;
  const hasWalletMismatch = Boolean(
    isConnected && activeAddress && address && activeAddress.toLowerCase() !== address.toLowerCase()
  );
  const { 
    tokens: externalTokens, 
    totalUsdValue: externalTotalValue, 
    isLoading: isExternalLoading, 
    refetch: refetchExternal,
    prices: tokenPrices,
    pricesUnavailable,
  } = useTokenBalances({ customAddress: externalAddress });

  const { locked: lockedFun, activated: activatedFun, refetch: refetchFunBalance } = useFunBalance(externalAddress);
  const { price: camlyPrice } = useCamlyPrice();
  const { hideToken } = useCustomTokenActions();

  useEffect(() => {
    const wasDisconnected = localStorage.getItem(WALLET_DISCONNECTED_KEY) === 'true';
    if (wasDisconnected && showDisconnectedUI && isConnected) {
      disconnect();
    }
  }, [isConnected, disconnect, showDisconnectedUI]);

  useEffect(() => {
    if (isConnected && !intentionalDisconnectRef.current) {
      localStorage.removeItem(WALLET_DISCONNECTED_KEY);
      setShowDisconnectedUI(false);
    }
  }, [isConnected]);

  const networkConfig = useMemo(() => {
    if (selectedNetwork === 'bitcoin') {
      return {
        name: 'Bitcoin',
        badgeColor: 'bg-orange-100 border-orange-300 text-orange-700',
        isTestnet: false,
        logo: btcLogo,
      };
    }
    if (chainId === bscTestnet.id) {
      return {
        name: 'BSC Testnet',
        badgeColor: 'bg-orange-100 border-orange-300 text-orange-700',
        isTestnet: true,
        logo: bnbLogo,
      };
    }
    return {
      name: 'BNB Mainnet',
      badgeColor: 'bg-yellow-100 border-yellow-300 text-yellow-700',
      isTestnet: false,
      logo: bnbLogo,
    };
  }, [chainId, selectedNetwork]);

  const handleSwitchToTestnet = useCallback(() => {
    switchChain(
      { chainId: bscTestnet.id },
      {
        onSuccess: () => toast.success(t('walletSwitchedTestnet')),
        onError: () => toast.error(t('walletCannotSwitch')),
      }
    );
  }, [switchChain]);

  const handleSwitchToMainnet = useCallback(() => {
    switchChain(
      { chainId: bsc.id },
      {
        onSuccess: () => toast.success(t('walletSwitchedMainnet')),
        onError: () => toast.error(t('walletCannotSwitch')),
      }
    );
  }, [switchChain]);

  // Auto chain switch is now handled by useAutoChainSwitch hook
  // It auto-requests switch on connect and only warns if user rejects

  // FIX: Gắn fetch vào auth session thay vì chỉ dựa vào mount/connect ví external.
  // Trước đây user dùng custodial wallet (chưa connect MetaMask) sẽ không bao giờ
  // refetch reward → 4 ô luôn hiện 0. Giờ:
  //   1) Chạy ngay khi mount (nếu đã có session)
  //   2) Lắng nghe onAuthStateChange để chạy đúng lúc session sẵn sàng
  //   3) Retry 1 lần sau 1.5s nếu lần đầu chưa có session (chống race condition)
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const runFetches = () => {
      fetchProfile();
      fetchClaimableReward();
      fetchTodayPostCount();
    };

    // Lần đầu: kiểm tra session ngay
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        runFetches();
      } else {
        // Retry 1 lần sau 1.5s phòng race condition
        retryTimer = setTimeout(() => {
          supabase.auth.getSession().then(({ data: d2 }) => {
            if (d2.session?.user) runFetches();
            else setIsRewardLoading(false);
          });
        }, 1500);
      }
    });

    // Lắng nghe thay đổi auth (đăng nhập, refresh token...)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        runFetches();
      }
    });

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      subscription.unsubscribe();
    };
  }, []);

  // Lắng nghe event "wallet:refetch-rewards" do nút "Tải lại" trong ClaimRewardsSection bắn ra
  useEffect(() => {
    const handler = () => {
      fetchProfile();
      fetchClaimableReward();
      fetchTodayPostCount();
    };
    window.addEventListener('wallet:refetch-rewards', handler);
    return () => window.removeEventListener('wallet:refetch-rewards', handler);
  }, []);

  // Refetch khi user kết nối ví external (cần sync wallet address mới)
  useEffect(() => {
    if (isConnected) {
      fetchProfile();
      fetchClaimableReward();
      fetchTodayPostCount();
    }
  }, [isConnected, address]);

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data } = await supabase
        .from('my_profile_moderation')
        .select('username, display_name, avatar_url, cover_url, full_name, reward_status, admin_notes, created_at, btc_address, social_links')
        .eq('id', session.user.id)
        .single();
      if (data) setProfile(data as Profile);
    }
  };

  const fetchTodayPostCount = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('created_at', todayStart.toISOString())
        .or('post_type.is.null,post_type.neq.gift_celebration');
      setTodayPostCount(count || 0);
    }
  };

  const fetchClaimableReward = async () => {
    setIsRewardLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setIsRewardLoading(false); return; }

      const userId = session.user.id;
      // Primary: hàm tối ưu chỉ tính cho chính user đang đăng nhập.
      // Fallback: nếu Cloud/RPC vừa deploy chưa ổn định hoặc trả rỗng thì dùng hàm per-user cũ,
      // tuyệt đối không để màn Claim rơi về 0 khi user thật sự có số dư.
      const { data: rewardsData, error: rpcError } = await supabase.rpc('get_my_rewards');
      let userData = rewardsData?.[0] as any;

      if (rpcError || !userData) {
        if (rpcError) console.error('[WalletCenter] get_my_rewards error:', rpcError);
        const { data: fallbackData, error: fallbackError } = await supabase.rpc('get_user_honor_stats', {
          p_user_id: userId,
        });
        if (fallbackError) console.error('[WalletCenter] get_user_honor_stats fallback error:', fallbackError);
        const fallback = fallbackData?.[0];
        if (fallback) {
          userData = {
            posts_count: fallback.posts_count,
            reactions_on_posts: fallback.reactions_on_posts,
            comments_count: fallback.comments_count,
            shares_count: fallback.shares_count,
            friends_count: fallback.friends_count,
            livestreams_count: fallback.livestreams_count,
            total_reward: fallback.total_reward,
            today_reward: fallback.today_reward,
          };
        }
      }
      
      if (userData) {
        setRewardStats({
          posts_count: Number(userData.posts_count) || 0,
          reactions_on_posts: Number(userData.reactions_on_posts) || 0,
          comments_count: Number(userData.comments_count) || 0,
          shares_count: Number(userData.shares_count) || 0,
          friends_count: Number(userData.friends_count) || 0,
          livestreams_count: Number(userData.livestreams_count) || 0,
          total_reward: Number(userData.total_reward) || 0,
          today_reward: Number(userData.today_reward) || 0,
        });
        const todayReward = Number(userData.today_reward) || 0;
        const totalReward = Number(userData.total_reward) || 0;
        const { data: claims } = await supabase.from('reward_claims').select('amount, created_at').eq('user_id', userId);
        const claimed = claims?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
        setClaimedAmount(claimed);
        // Không cộng dồn: claimable chỉ dựa trên thưởng hôm nay trừ đã claim hôm nay
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const todayCl = claims?.filter(c => new Date(c.created_at) >= todayStart).reduce((sum, c) => sum + Number(c.amount), 0) || 0;
        setDailyClaimed(todayCl);
        setClaimableReward(Math.max(0, totalReward - claimed));
      } else {
        setRewardStats({ posts_count: 0, reactions_on_posts: 0, comments_count: 0, shares_count: 0, friends_count: 0, livestreams_count: 0, total_reward: 50000, today_reward: 0 });
        setClaimableReward(50000);
        setClaimedAmount(0);
        setDailyClaimed(0);
      }
    } catch (error) {
      console.error('[WalletCenter] fetchClaimableReward error:', error);
    } finally {
      setIsRewardLoading(false);
    }
  };

  const handleInjectedMobileConnect = useCallback(() => {
    toast.info(t('wccConnectingToast'));
    connect(
      { connector: injected() },
      {
        onSuccess: () => {
          setShowMobileConnectGuide(false);
          toast.success(t('authWalletToastConnectedGeneric'));
        },
        onError: () => {
          toast.error(t('wccConnectErrorToast'));
        },
      }
    );
  }, [connect, t]);

  const handleOpenWalletConnect = useCallback(() => {
    setShowMobileConnectGuide(false);
    if (openConnectModal) { openConnectModal(); } else { toast.error(t('walletCannotOpenConnect')); }
  }, [openConnectModal, t]);

  const handleResetMobileWalletConnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    try {
      disconnect();
    } catch {
      // Ignore disconnect races.
    }
    clearWalletLocalStorage();
    localStorage.removeItem(WALLET_DISCONNECTED_KEY);
    setShowDisconnectedUI(false);
    setShowMobileConnectGuide(true);
    toast.success(t('wccResetDoneToast'));
  }, [disconnect, t]);

  const openWalletDeepLink = useCallback((url: string) => {
    if (!url) return;
    toast.info(t('mwcOpeningWalletApp'));
    window.location.href = url;
  }, [t]);

  const handleConnect = useCallback(() => {
    intentionalDisconnectRef.current = false;
    setShowDisconnectedUI(false);
    localStorage.removeItem(WALLET_DISCONNECTED_KEY);
    if (isMobileDevice()) {
      if (isInjectedMobileBrowser()) {
        handleInjectedMobileConnect();
        return;
      }
      toast.info(t('wccMobileBrowserToast'));
      setShowMobileConnectGuide(true);
      return;
    }
    if (openConnectModal) { openConnectModal(); } else { toast.error(t('walletCannotOpenConnect')); }
  }, [handleInjectedMobileConnect, openConnectModal, t]);

  const handleSwitchAccount = useCallback(() => { setShowAccountSelector(true); }, []);

  const handleOpenActivateDialog = useCallback(() => {
    if (hasWalletMismatch) {
      setShowMismatchModal(true);
      toast.error(t('wccMismatchToast'));
      return;
    }
    setShowActivateDialog(true);
  }, [hasWalletMismatch, t]);

  const handleOpenClaimFunDialog = useCallback(() => {
    if (hasWalletMismatch) {
      setShowMismatchModal(true);
      toast.error(t('wccMismatchToast'));
      return;
    }
    setShowClaimFunDialog(true);
  }, [hasWalletMismatch, t]);

  useEffect(() => {
    if (hasWalletMismatch) {
      setShowMismatchModal(true);
    }
  }, [hasWalletMismatch]);

  const handleDisconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    localStorage.setItem(WALLET_DISCONNECTED_KEY, 'true');
    setShowDisconnectedUI(true);
    try {
      localStorage.removeItem('wagmi.store');
      localStorage.removeItem('wagmi.connected');
      localStorage.removeItem('wagmi.wallet');
      localStorage.removeItem('wagmi.recentConnectorId');
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('wc@') || key.startsWith('walletconnect')) localStorage.removeItem(key);
      });
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('activeAccount:') || key.startsWith('lastUsedAt:')) localStorage.removeItem(key);
      });
    } catch (e) { console.warn('[WalletCenter] localStorage cleanup error:', e); }
    disconnect();
    toast.success(t('walletDisconnected'));
  }, [disconnect]);

  const copyExternalAddress = useCallback(() => {
    const addr = activeAddress || address;
    if (addr) {
      navigator.clipboard.writeText(addr);
      setCopiedExternal(true);
      toast.success(t('walletAddressCopied'));
      setTimeout(() => setCopiedExternal(false), 2000);
    }
  }, [activeAddress, address]);

  const renderMobileConnectGuide = () => (
    <MobileWalletConnectSheet
      open={showMobileConnectGuide}
      onOpenChange={setShowMobileConnectGuide}
      onInjectedConnect={handleInjectedMobileConnect}
      onOpenWalletConnect={handleOpenWalletConnect}
      onReset={handleResetMobileWalletConnect}
    />
  );

  if (!isConnected && showDisconnectedUI) {
    return (
      <div className="space-y-6">
        <div className="bg-white/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-800 via-emerald-600 to-green-500 p-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-yellow-400 drop-shadow-lg">{t('walletMyWallet')}</h1>
              <div className="flex items-center gap-2 bg-yellow-400/20 backdrop-blur-sm px-3 py-1.5 rounded-full border border-yellow-400/30">
                <img src={bnbLogo} alt="BNB" className="w-5 h-5" />
                <span className="text-sm font-medium text-white">BNB Smart Chain</span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white/80 rounded-2xl shadow-lg p-12 text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-green-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30">
            <Wallet className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">{t('walletConnectToContinue')}</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">{t('walletConnectDesc')}</p>
          <Button
            onClick={handleConnect}
            className="bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-700 hover:to-green-600 text-yellow-300 font-bold text-lg px-10 py-6 rounded-xl shadow-lg hover:shadow-green-500/40 transition-all duration-300 hover:scale-105"
          >
            <Wallet className="w-6 h-6 mr-2" />
            {t('walletConnectWallet')}
          </Button>
          <div className="sm:hidden mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {t('wccMobileHint')}
          </div>
        </div>
        {renderMobileConnectGuide()}
      </div>
    );
  }

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'asset':
        return (
          <AssetTab
            walletAddress={displayWalletAddress}
            walletName={isConnected ? getWalletDisplayName() : 'External Wallet'}
            connectorType={connectedWalletType}
            isConnected={isConnected}
            accountCount={accounts.length}
            tokens={externalTokens}
            totalUsdValue={externalTotalValue}
            pricesUnavailable={pricesUnavailable}
            isTokensLoading={isExternalLoading}
            copied={copiedExternal}
            chainId={chainId}
            btcAddress={profile?.btc_address || null}
            selectedNetwork={selectedNetwork}
            prices={tokenPrices}
            onCopy={copyExternalAddress}
            onRefresh={refetchExternal}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSwitchAccount={handleSwitchAccount}
            onAddCustomToken={() => setShowAddCustomToken(true)}
            onHideCustomToken={(tokenId) => {
              hideToken.mutate(tokenId, { onSuccess: () => refetchExternal() });
            }}
            onReceive={() => setShowReceive(true)}
            onSend={() => setShowSend(true)}
            onSwap={() => setShowSwap(true)}
            onBuy={() => window.open('https://www.moonpay.com/buy', '_blank')}
          />
        );
      case 'reward':
        return (
          <RewardTab
            claimableReward={claimableReward}
            claimedAmount={claimedAmount}
            dailyClaimed={dailyClaimed}
            rewardStats={rewardStats}
            camlyPrice={camlyPrice}
            isConnected={isConnected}
            rewardStatus={profile ? (profile.reward_status || 'inactive') : 'loading'}
            adminNotes={profile?.admin_notes}
            isLoading={isRewardLoading}
            hasAvatar={!!profile?.avatar_url}
            hasCover={!!profile?.cover_url}
            hasSocialLinks={(() => {
              const links = profile?.social_links;
              if (!links) return false;
              // Dạng array (chuẩn hiện tại): [{platform, url, ...}]
              if (Array.isArray(links)) {
                return links.some((l: any) => typeof l?.url === 'string' && l.url.trim().length > 0);
              }
              // Fallback dạng object cũ: {facebook: "url"}
              if (typeof links === 'object') {
                return Object.values(links as Record<string, unknown>).some(v => typeof v === 'string' && v.trim().length > 0);
              }
              return false;
            })()}
            hasTodayPost={todayPostCount > 0}
            hasFullName={(() => {
              const fn = (profile?.full_name || '').trim();
              return fn.length >= 4 && !/^\d+$/.test(fn) && /[a-zA-ZÀ-ỹ]/.test(fn);
            })()}
            accountAgeDays={profile?.created_at ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0}
            onClaimClick={() => setShowClaimDialog(true)}
            onConnectClick={handleConnect}
          />
        );
      case 'fun_money':
        return (
          <FunMoneyTab
            externalAddress={externalAddress}
            onActivate={handleOpenActivateDialog}
            onClaim={handleOpenClaimFunDialog}
            onClaimSuccess={() => { refetchFunBalance(); }}
          />
        );
      case 'history':
        return <HistoryTab walletAddress={externalAddress} userDisplayName={profile?.display_name} userAvatarUrl={profile?.avatar_url} username={profile?.username} userCreatedAt={profile?.created_at} selectedNetwork={selectedNetwork} btcAddress={profile?.btc_address} prices={tokenPrices} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white/80 rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="bg-primary text-white">
                {profile?.username?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('walletMyWallet')}</h1>
              <p className="text-sm text-muted-foreground">{profile?.display_name || profile?.username || 'Account'}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${networkConfig.badgeColor} hover:opacity-80 transition-opacity cursor-pointer`}>
                <img src={networkConfig.logo} alt={networkConfig.name} className="w-5 h-5" />
                <span className="text-sm font-medium">{networkConfig.name}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white/90 z-50">
              <DropdownMenuItem onClick={() => { setSelectedNetwork('evm'); handleSwitchToMainnet(); }} className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <img src={bnbLogo} alt="BNB" className="w-4 h-4" />
                  <span>BNB Mainnet (56)</span>
                </div>
                {selectedNetwork === 'evm' && chainId === bsc.id && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSelectedNetwork('evm'); handleSwitchToTestnet(); }} className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <img src={bnbLogo} alt="BNB" className="w-4 h-4" />
                  <span>BSC Testnet (97)</span>
                </div>
                {selectedNetwork === 'evm' && chainId === bscTestnet.id && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedNetwork('bitcoin')} className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <img src={btcLogo} alt="BTC" className="w-8 h-8" />
                  <span>Bitcoin</span>
                </div>
                {selectedNetwork === 'bitcoin' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto scrollbar-hide">
          {walletTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`flex-shrink-0 px-5 py-3.5 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {renderTabContent()}

      {/* Dialogs */}
      <Dialog open={showReceive} onOpenChange={setShowReceive}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('walletReceiveMoney')}</DialogTitle>
          </DialogHeader>
          <ReceiveTab
            walletAddress={(activeAddress || address) || undefined}
            btcAddress={profile?.btc_address}
            selectedNetwork={selectedNetwork}
          />
        </DialogContent>
      </Dialog>

      {selectedNetwork === 'bitcoin' ? (
        <BtcSendDialog
          isOpen={showSend}
          onClose={() => setShowSend(false)}
          btcAddress={profile?.btc_address || null}
        />
      ) : (
        <UnifiedGiftSendDialog
          isOpen={showSend}
          onClose={() => setShowSend(false)}
          mode="wallet"
          onSuccess={() => { refetchExternal(); fetchClaimableReward(); }}
        />
      )}

      <ClaimRewardDialog
        open={showClaimDialog}
        onOpenChange={setShowClaimDialog}
        claimableAmount={claimableReward}
        externalWallet={(isConnected ? (activeAddress || address) : null) || null}
        camlyPrice={camlyPrice}
        dailyClaimed={dailyClaimed}
        rewardStatus={profile?.reward_status || 'pending'}
        onSuccess={() => { fetchClaimableReward(); refetchExternal(); }}
      />

      <ActivateDialog
        open={showActivateDialog}
        onOpenChange={setShowActivateDialog}
        lockedBalance={lockedFun}
        onSuccess={() => { refetchFunBalance(); refetchExternal(); }}
      />

      <ClaimFunDialog
        open={showClaimFunDialog}
        onOpenChange={setShowClaimFunDialog}
        activatedBalance={activatedFun}
        onSuccess={() => { refetchFunBalance(); refetchExternal(); }}
      />

      <AddCustomTokenDialog
        open={showAddCustomToken}
        onOpenChange={setShowAddCustomToken}
        onAdded={refetchExternal}
      />

      <Dialog open={showSwap} onOpenChange={setShowSwap}>
        <DialogContent className="max-w-[100vw] h-auto max-h-[90dvh] overflow-x-hidden flex flex-col sm:max-w-md sm:max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Swap Token</DialogTitle>
          </DialogHeader>
          <SwapTab
            walletAddress={externalAddress}
            onSuccess={() => { refetchExternal(); setShowSwap(false); }}
          />
        </DialogContent>
      </Dialog>

      <AccountSelectorModal open={showAccountSelector} onOpenChange={setShowAccountSelector} />
      <AccountMismatchModal open={showMismatchModal} onOpenChange={setShowMismatchModal} />
      {renderMobileConnectGuide()}
    </div>
  );
};

export default WalletCenterContainer;
