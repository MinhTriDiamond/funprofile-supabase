/**
 * SR-2: UnifiedGiftSendDialog — Orchestrator
 * Refactored from 1293-line God Component into ~200-line orchestrator.
 * UI delegated to GiftFormStep + GiftConfirmStep.
 * Search logic in useRecipientSearch hook.
 * Donation recording remains here (interacts with celebration state).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { copyToClipboard } from '@/utils/clipboard';
import { useLanguage } from '@/i18n/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Gift } from 'lucide-react';
import logger from '@/lib/logger';
import { SUPPORTED_TOKENS, TokenOption } from './TokenSelector';
import { MessageTemplate, MESSAGE_TEMPLATES } from './QuickGiftPicker';
import { GiftCardData } from './GiftCelebrationModal';
import { DonationSuccessCard, DonationCardData } from './DonationSuccessCard';
import { useSendToken } from '@/hooks/useSendToken';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import { validateMinSendValue } from '@/lib/minSendValidation';
import { useAccount, useBalance, useReadContract, useChainId, useSwitchChain, usePublicClient, useConnect } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import {
  getInjectedProvider,
  isInjectedMobileBrowser,
  isMobileDevice,
  requestInjectedAccounts,
} from '@/utils/mobileWalletConnect';
import { MobileWalletConnectSheet } from '@/components/wallet/MobileWalletConnectSheet';
import { useLinkedWallet } from '@/hooks/useLinkedWallet';
import { useAutoChainSwitch } from '@/hooks/useAutoChainSwitch';
import { useGiftTransaction } from '@/contexts/GiftTransactionContext';
import { logWalletEvent, exportWalletDebugLog } from '@/lib/walletDebugLog';
import { getFriendlyWalletError } from '@/lib/walletErrorMessages';
import { rememberPendingGiftIntent, readPendingGiftIntent, clearPendingGiftIntent } from '@/utils/pendingGiftIntent';
import { toast } from 'sonner';
import { formatUnits } from 'viem';
import { supabase } from '@/integrations/supabase/client';
import { getGiftTokenLabel } from '@/lib/giftTokenLabel';
import { queryClient } from '@/lib/queryClient';
import { BSC_MAINNET, BSC_TESTNET, BTC_MAINNET, getTokenAddress, getDisabledTokens, getBscScanTxUrlByChain, isTokenAvailableOnChain } from '@/lib/chainTokenMapping';
import { MAX_RECIPIENTS_TOTAL, isDisperseAvailable } from '@/config/disperse';
import { useDisperseSend, type DisperseRecipientPayload } from '@/hooks/useDisperseSend';
import { MultiSendModeBanner } from './gift-dialog/MultiSendModeBanner';
import { useBtcBalance } from '@/hooks/useBtcBalance';
import { useBtcManualConfirmFlag, BTC_MANUAL_CONFIRM_LOCK_MESSAGE } from '@/hooks/useBtcManualConfirmFlag';
import { useBtcTransactionPolling } from '@/hooks/useBtcTransactionPolling';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useRecipientSearch } from './gift-dialog/useRecipientSearch';
import { GiftFormStep } from './gift-dialog/GiftFormStep';
import { GiftConfirmStep } from './gift-dialog/GiftConfirmStep';
import type { ResolvedRecipient, MultiSendResult } from './gift-dialog/types';

const ERC20_BALANCE_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

function getStepConfig(t: (key: any) => string): Record<string, { label: string; progress: number }> {
  return {
    idle: { label: '', progress: 0 },
    signing: { label: t('walletSignPrompt'), progress: 15 },
    broadcasted: { label: t('txBroadcasted'), progress: 35 },
    confirming: { label: t('txConfirming'), progress: 60 },
    finalizing: { label: t('txFinalizing'), progress: 85 },
    success: { label: t('txDone'), progress: 100 },
    timeout: { label: t('txTimeout'), progress: 70 },
  };
}

type FlowStep = 'form' | 'confirm' | 'celebration';

interface SenderProfile {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  public_wallet_address: string | null;
  btc_address?: string | null;
}

export interface UnifiedGiftSendDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'wallet' | 'post' | 'navbar';
  presetRecipient?: {
    id?: string;
    username?: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    walletAddress?: string | null;
    btcAddress?: string | null;
  };
  postId?: string;
  onSuccess?: () => void;
}

export const UnifiedGiftSendDialog = ({
  isOpen, onClose, mode, presetRecipient, postId, onSuccess,
}: UnifiedGiftSendDialogProps) => {
  const { t } = useLanguage();
  // ── Wallet hooks ──
  const { address, isConnected } = useAccount();
  const { activeAddress } = useActiveAccount();
  const effectiveAddress = activeAddress || address;
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { connectAsync, connectors } = useConnect();
  useAutoChainSwitch(); // Auto-switch to BSC on connect
  const { tokens: tokenBalanceList, prices } = useTokenBalances();
  const { sendToken, isPending, txStep, txHash, recheckReceipt, resetState, reopenWalletApp } = useSendToken();
  const { disperseSend } = useDisperseSend();
  const publicClient = usePublicClient();
  const { userId: currentUserId } = useCurrentUser();

  // ── Local state ──
  const [estimatedGasPerTx, setEstimatedGasPerTx] = useState(0.0005);
  const defaultToken = SUPPORTED_TOKENS.find(t => t.symbol === 'CAMLY') || SUPPORTED_TOKENS[0];
  const [flowStep, setFlowStep] = useState<FlowStep>('form');
  const [selectedToken, setSelectedToken] = useState<TokenOption>(defaultToken);
  const [amount, setAmount] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState<GiftCardData | null>(null);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [senderProfile, setSenderProfile] = useState<SenderProfile | null>(null);
  const [senderUserId, setSenderUserId] = useState<string | null>(null);
  const [multiSendProgress, setMultiSendProgress] = useState<{ current: number; total: number; results: MultiSendResult[] } | null>(null);
  const [isMultiSending, setIsMultiSending] = useState(false);
  const [currentSendingIndex, setCurrentSendingIndex] = useState(-1);
  const [btcTxStep, setBtcTxStep] = useState<string>('idle');
  const [btcPollingEnabled, setBtcPollingEnabled] = useState(false);
  const [btcBip21Url, setBtcBip21Url] = useState<string>('');
  const [showMobileConnectGuide, setShowMobileConnectGuide] = useState(false);

  // ── Linked wallet (cross-browser fallback) ──
  const { linkedWalletAddress } = useLinkedWallet();

  // ── Gift transaction context (FloatingBar trên Profile/Wallet) ──
  const giftTx = useGiftTransaction();


  
  // ── Network selection ──
  const defaultChainId = (chainId === BSC_TESTNET) ? BSC_TESTNET : BSC_MAINNET;
  const [selectedChainId, setSelectedChainId] = useState(defaultChainId);
  const disabledTokens = useMemo(() => getDisabledTokens(selectedChainId), [selectedChainId]);
  const walletCustomTokenOptions = useMemo<TokenOption[]>(() => {
    if (mode !== 'wallet' || selectedChainId !== BSC_MAINNET) return [];
    return tokenBalanceList
      .filter((token) => token.isCustomToken && token.contractAddress)
      .map((token) => ({
        symbol: token.symbol,
        name: token.name,
        address: token.contractAddress!,
        decimals: token.decimals,
        logo: token.icon,
        color: 'from-amber-500 to-yellow-400',
      }));
  }, [mode, selectedChainId, tokenBalanceList]);

  const IS_MAINTENANCE = false;

  // ── Recipient search hook ──
  const isPresetMode = mode === 'post' || ((mode === 'navbar' || mode === 'wallet') && !!presetRecipient?.id);
  // Allow searching/bulk-adding extra recipients even in preset mode → hook should always run
  const search = useRecipientSearch({ isOpen, isPresetMode: false, senderUserId });

  // ── Re-fetch recipient wallet if preset has no wallet (stale prop fix) ──
  const [freshWallet, setFreshWallet] = useState<{ walletAddress: string | null; btcAddress: string | null } | null>(null);
  useEffect(() => {
    if (!isOpen || !presetRecipient?.id) { setFreshWallet(null); return; }
    // If preset already has a wallet, skip fetch
    if (presetRecipient.walletAddress) { setFreshWallet(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('public_wallet_address, external_wallet_address, wallet_address, btc_address')
        .eq('id', presetRecipient.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const addr = (data.public_wallet_address || data.external_wallet_address || data.wallet_address) as string | null;
      if (addr || data.btc_address) {
        setFreshWallet({ walletAddress: addr, btcAddress: (data.btc_address as string) || null });
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, presetRecipient?.id, presetRecipient?.walletAddress]);

  // ── Effective recipients (preset + extras merged, dedupe theo id và walletAddress) ──
  const effectiveRecipients = useMemo(() => {
    const preset = presetRecipient?.id && presetRecipient?.username ? {
      id: presetRecipient.id,
      username: presetRecipient.username,
      displayName: presetRecipient.displayName ?? null,
      avatarUrl: presetRecipient.avatarUrl ?? null,
      walletAddress: freshWallet?.walletAddress ?? presetRecipient.walletAddress ?? null,
      btcAddress: freshWallet?.btcAddress ?? presetRecipient.btcAddress ?? null,
    } as ResolvedRecipient : null;

    const list: ResolvedRecipient[] = preset ? [preset] : [];
    const seenIds = new Set<string>(preset ? [preset.id] : []);
    const seenWallets = new Set<string>(
      preset?.walletAddress ? [preset.walletAddress.toLowerCase()] : []
    );
    for (const r of search.resolvedRecipients) {
      if (seenIds.has(r.id)) continue;
      const wl = r.walletAddress?.toLowerCase();
      if (wl && seenWallets.has(wl)) continue;
      list.push(r);
      seenIds.add(r.id);
      if (wl) seenWallets.add(wl);
    }
    return list;
  }, [presetRecipient, search.resolvedRecipients, freshWallet]);

  const isBtcNetworkEarly = selectedChainId === BTC_MAINNET;
  const recipientsWithWallet = effectiveRecipients.filter(r => isBtcNetworkEarly ? !!r.btcAddress : !!r.walletAddress);
  const recipientsWithoutWallet = effectiveRecipients.filter(r => isBtcNetworkEarly ? !r.btcAddress : !r.walletAddress);
  const hasRecipients = effectiveRecipients.length > 0;
  const isMultiMode = effectiveRecipients.length > 1;

  // ── Balances — use selectedChainId ──
  const resolvedTokenAddress = useMemo(() => {
    if (selectedToken.symbol === 'BNB') return undefined;
    if (selectedToken.address) return selectedToken.address as `0x${string}`;
    const addr = getTokenAddress(selectedToken.symbol, selectedChainId);
    return addr ? (addr as `0x${string}`) : undefined;
  }, [selectedToken.symbol, selectedToken.address, selectedChainId]);

  const { data: bnbBalance } = useBalance({ address: effectiveAddress as `0x${string}` | undefined, chainId: selectedChainId });
  const { data: tokenBalance } = useReadContract({
    address: resolvedTokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: effectiveAddress ? [effectiveAddress as `0x${string}`] : undefined,
    chainId: selectedChainId,
  });

  // BTC balance
  const senderBtcAddress = senderProfile?.btc_address || null;
  const { balance: btcBalance } = useBtcBalance(selectedChainId === BTC_MAINNET ? senderBtcAddress : null);

  // BTC transaction polling (hook called unconditionally, enabled flag controls it)
  const btcRecipientAddr = recipientsWithWallet[0]?.btcAddress || null;
  const btcPolling = useBtcTransactionPolling(btcRecipientAddr, parseFloat(amount) || 0, btcPollingEnabled);
  const btcManualConfirm = useBtcManualConfirmFlag();

  const formattedBalance = useMemo(() => {
    if (selectedChainId === BTC_MAINNET) return btcBalance;
    if (selectedToken.symbol === 'BNB') return bnbBalance ? parseFloat(bnbBalance.formatted) : 0;
    if (selectedToken.address) {
      const found = tokenBalanceList.find(t =>
        t.contractAddress?.toLowerCase() === selectedToken.address?.toLowerCase()
      );
      if (found) return found.balance;
    }
    if (!isTokenAvailableOnChain(selectedToken.symbol, selectedChainId)) return 0;
    if (tokenBalance) return parseFloat(formatUnits(tokenBalance as bigint, selectedToken.decimals));
    return 0;
  }, [selectedToken, bnbBalance, tokenBalance, selectedChainId, btcBalance, tokenBalanceList]);

  const bnbBalanceNum = useMemo(() => bnbBalance ? parseFloat(bnbBalance.formatted) : 0, [bnbBalance]);

  const selectedTokenPrice = useMemo(() => {
    if (selectedChainId === BTC_MAINNET) {
      return prices?.BTC?.usd ?? 100000;
    }
    const found = tokenBalanceList.find(t => t.symbol === selectedToken.symbol);
    return found?.price ?? null;
  }, [tokenBalanceList, selectedToken, selectedChainId, prices]);

  // ── Derived values ──
  const parsedAmountNum = parseFloat(amount) || 0;
  const totalAmount = parsedAmountNum * recipientsWithWallet.length;
  const isBtcNetwork = selectedChainId === BTC_MAINNET;
  const isWalletCustomToken = mode === 'wallet' && !!selectedToken.address && tokenBalanceList.some(t =>
    t.isCustomToken && t.contractAddress?.toLowerCase() === selectedToken.address?.toLowerCase()
  );
  const minSendCheck = parsedAmountNum > 0
    ? (selectedChainId === BSC_TESTNET || isBtcNetwork || isWalletCustomToken
        ? { valid: true }
        : validateMinSendValue(parsedAmountNum, selectedTokenPrice))
    : { valid: false } as { valid: boolean; message?: string };
  const estimatedUsd = parsedAmountNum * (selectedTokenPrice || 0);
  const totalEstimatedUsd = estimatedUsd * recipientsWithWallet.length;
  const isValidAmount = minSendCheck.valid;
  const hasEnoughBalance = formattedBalance >= totalAmount;
  const isWrongNetwork = isBtcNetwork ? false : chainId !== selectedChainId;
  const needsGasWarning = !isBtcNetwork && selectedToken.symbol !== 'BNB' && bnbBalanceNum < estimatedGasPerTx * recipientsWithWallet.length && parsedAmountNum > 0;
  const isLargeAmount = totalAmount > formattedBalance * 0.8 && totalAmount > 0;
  const effectiveTxStep = isBtcNetwork ? btcTxStep : txStep;
  const isInProgress = ['signing', 'broadcasted', 'confirming', 'finalizing'].includes(effectiveTxStep);
  const STEP_CONFIG = useMemo(() => getStepConfig(t), [t]);
  const stepInfo = STEP_CONFIG[effectiveTxStep] || STEP_CONFIG.idle;
  const recipientsExceedLimit = recipientsWithWallet.length > MAX_RECIPIENTS_TOTAL;
  const canProceedToConfirm = (isBtcNetwork || isConnected) && recipientsWithWallet.length > 0 && isValidAmount && (isBtcNetwork || hasEnoughBalance) && !isWrongNetwork && !recipientsExceedLimit;
  const scanUrl = txHash ? getBscScanTxUrlByChain(txHash, selectedChainId) : null;
  const isSendDisabled = (!isBtcNetwork && !isConnected) || recipientsWithWallet.length === 0 || !isValidAmount || (!isBtcNetwork && !hasEnoughBalance) || isPending || isInProgress || isWrongNetwork || isMultiSending || recipientsExceedLimit;

  // ── BTC polling effect ──
  useEffect(() => {
    if (!btcPollingEnabled) return;
    if (btcPolling.status === 'found' && btcPolling.txid) {
      const recipient = recipientsWithWallet[0];
      setBtcTxStep('confirming');
      setBtcPollingEnabled(false);
      
      const finalize = async () => {
        setBtcTxStep('finalizing');
        try {
          if (recipient?.id) await recordDonationBackground(btcPolling.txid!, recipient);
        } catch (err) {
          logger.error('[GIFT] BTC recordDonation error:', (err as Error)?.message);
        }
        setBtcTxStep('success');
        await new Promise(r => setTimeout(r, 500));
        const cardData = buildCardData(btcPolling.txid!, recipient, parsedAmountNum);
        setCelebrationData(cardData);
        setShowCelebration(true);
        setFlowStep('celebration');
        onSuccess?.();
      };
      finalize();
    }
  }, [btcPolling.status, btcPolling.txid, btcPollingEnabled]);

  // ── Effects ──
  useEffect(() => {
    if (!isOpen || !currentUserId) return;
    (async () => {
      setSenderUserId(currentUserId);
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url, wallet_address, public_wallet_address, btc_address')
        .eq('id', currentUserId)
        .single();
      if (data) setSenderProfile(data as SenderProfile);
    })();
  }, [isOpen, currentUserId, effectiveAddress]);

  useEffect(() => {
    if (!isOpen || !publicClient) return;
    const fetchGasPrice = async () => {
      try {
        const gasPrice = await publicClient.getGasPrice();
        const gasLimit = selectedToken.address ? 65000n : 21000n;
        const totalWei = gasPrice * gasLimit;
        setEstimatedGasPerTx(Number(totalWei) / 1e18 * 1.2);
      } catch { setEstimatedGasPerTx(0.0005); }
    };
    fetchGasPrice();
    const interval = setInterval(fetchGasPrice, 30000);
    return () => clearInterval(interval);
  }, [isOpen, publicClient, selectedToken.address]);

  useEffect(() => {
    if (isOpen) {
      setAmount(''); setSelectedTemplate(null); setCustomMessage('');
      setSelectedToken(defaultToken); setShowCelebration(false); setCelebrationData(null);
      setMultiSendProgress(null); setIsMultiSending(false); setFlowStep('form');
      setBtcTxStep('idle'); setBtcPollingEnabled(false); setBtcBip21Url('');
      setSelectedChainId((chainId === BSC_TESTNET) ? BSC_TESTNET : BSC_MAINNET);
      search.resetSearch(); resetState();

      // Khôi phục pending intent nếu user vừa quay lại từ MetaMask
      const pending = readPendingGiftIntent();
      if (pending) {
        if (pending.amount) setAmount(pending.amount);
        if (pending.message) setCustomMessage(pending.message);
        if (pending.tokenSymbol) {
          const tk = SUPPORTED_TOKENS.find(t => t.symbol === pending.tokenSymbol);
          if (tk) setSelectedToken(tk);
        }
        logWalletEvent('gift.intent.restored', { recipient: pending.recipientUsername, token: pending.tokenSymbol, amount: pending.amount });
        toast.info('Đã khôi phục bản nháp quà từ phiên trước. Bạn có thể tiếp tục gửi.');
      }
    }
  }, [isOpen]);

  // ── Emit txStep → GiftTransactionContext để FloatingBar hiển thị ──
  // QUAN TRỌNG: KHÔNG được early-return khi dialog đóng. GiftTransactionProvider
  // sống ở App.tsx, thanh nổi phải tiếp tục nhận update để không kẹt ở "broadcasted".
  useEffect(() => {
    // Multi-send có UI progress riêng (MultiSendProgress modal). KHÔNG để FloatingBar
    // tự bật theo `txStep` của hook single-send → tránh kẹt "Đã gửi giao dịch — chưa nhận xác nhận".
    if (isMultiMode || isMultiSending) return;

    const effective = isBtcNetworkEarly ? btcTxStep : txStep;
    if (effective === 'idle') return;

    const recipient = recipientsWithWallet[0];
    const scanUrl = txHash ? getBscScanTxUrlByChain(txHash, selectedChainId) : null;

    if (!giftTx.current || giftTx.current.step === 'idle' || giftTx.current.step === 'success' || giftTx.current.step === 'error') {
      if (effective === 'signing') {
        giftTx.start({
          recipientUsername: recipient?.username,
          recipientAvatarUrl: recipient?.avatarUrl ?? null,
          recipientId: recipient?.id,
          tokenSymbol: getGiftTokenLabel(selectedToken.symbol, selectedChainId),
          amount,
          chainId: selectedChainId,
          step: 'signing',
          txHash,
          scanUrl,
        });
        return;
      }
    }

    if (effective === 'success') {
      giftTx.finishSuccess(txHash ?? giftTx.current?.txHash ?? '', scanUrl);
      clearPendingGiftIntent();
    } else if (effective === 'timeout') {
      giftTx.finishError('Giao dịch quá thời gian chờ', 'Kiểm tra ví hoặc thử lại sau giây lát.');
    } else {
      giftTx.update({ step: effective as any, txHash, scanUrl });
    }
  }, [txStep, btcTxStep, txHash, isBtcNetworkEarly, selectedChainId, selectedToken.symbol, amount, recipientsWithWallet, giftTx, isMultiMode, isMultiSending]);


  // ── Handlers ──
  const handleSelectTemplate = (template: MessageTemplate) => {
    setSelectedTemplate(template);
    if (template.id !== 'custom') setCustomMessage(template.message);
  };

  const handleMaxAmount = () => {
    if (formattedBalance > 0 && recipientsWithWallet.length > 0) {
      const perPerson = selectedToken.symbol === 'BNB'
        ? Math.max(0, (formattedBalance - estimatedGasPerTx * recipientsWithWallet.length) / recipientsWithWallet.length)
        : formattedBalance / recipientsWithWallet.length;
      setAmount(perPerson.toString());
    }
  };

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast.success(t('copiedAddressToast'));
  };

  const handleEmojiSelect = (emoji: string) => setCustomMessage(prev => prev + emoji);

  const handleConnectWallet = useCallback(async () => {
    if (isConnectingWallet) return;

    setIsConnectingWallet(true);
    logWalletEvent('gift.connect.click', {
      isMobile: isMobileDevice(),
      isInjectedMobile: isInjectedMobileBrowser(),
      hasOpenConnectModal: Boolean(openConnectModal),
      selectedChainId,
    });
    try {
      const injectedProvider = getInjectedProvider();

      // Trong dApp browser của ví (MetaMask/Trust/Bitget) → connect injected trực tiếp.
      if (isInjectedMobileBrowser() && injectedProvider) {
        const connector = connectors.find((item) => item.id === 'injected' || item.type === 'injected');
        if (connector) {
          await connectAsync({ connector });
        } else {
          await requestInjectedAccounts(injectedProvider);
        }
        logWalletEvent('gift.connect.success', { via: 'injected-mobile' });
        toast.success('Ví đã được kết nối.');
        return;
      }

      // Mobile browser thường (Safari/Chrome) → mở sheet hướng dẫn deep-link thay vì
      // mở thẳng RainbowKit (popup WC không deep-link được, gây "không kết nối được").
      if (isMobileDevice() && !injectedProvider) {
        // Lưu pending intent để khôi phục form khi user quay về Fun.Rich từ MetaMask
        const recipient = recipientsWithWallet[0] || effectiveRecipients[0];
        rememberPendingGiftIntent({
          recipientId: recipient?.id,
          recipientUsername: recipient?.username,
          tokenSymbol: selectedToken.symbol,
          amount,
          message: customMessage,
          chainId: selectedChainId,
          postId,
        });
        logWalletEvent('gift.intent.saved', { recipient: recipient?.username });
        setShowMobileConnectGuide(true);
        return;
      }


      // Desktop có injected → mở RainbowKit (cho phép chọn FUN Wallet, MetaMask extension...).
      if (openConnectModal) {
        openConnectModal();
        return;
      }

      if (injectedProvider) {
        await requestInjectedAccounts(injectedProvider);
        logWalletEvent('gift.connect.success', { via: 'injected-desktop' });
        toast.success('Ví đã được kết nối.');
        return;
      }

      toast.info('Vui lòng cài hoặc mở ví MetaMask/Trust Wallet/Bitget để kết nối.');
    } catch (error) {
      logger.warn('[GIFT] connect wallet failed', { error });
      logWalletEvent('gift.connect.error', {
        message: (error as any)?.message,
        code: (error as any)?.code,
      });
      const friendly = getFriendlyWalletError(error);
      toast.error(friendly.title, {
        description: friendly.description,
        duration: 8000,
        action: friendly.showReportAction
          ? { label: 'Báo lỗi', onClick: () => exportWalletDebugLog() }
          : undefined,
      });
    } finally {
      setIsConnectingWallet(false);
    }
  }, [connectAsync, connectors, isConnectingWallet, openConnectModal, selectedChainId]);

  const handleInjectedSheetConnect = useCallback(async () => {
    const connector = connectors.find((item) => item.id === 'injected' || item.type === 'injected');
    if (!connector) {
      toast.error('Không tìm thấy ví injected.');
      return;
    }
    try {
      await connectAsync({ connector });
      setShowMobileConnectGuide(false);
      logWalletEvent('gift.connect.success', { via: 'sheet-injected' });
      toast.success('Ví đã được kết nối.');
    } catch (e) {
      logWalletEvent('gift.connect.error', { via: 'sheet-injected', message: (e as any)?.message });
      const friendly = getFriendlyWalletError(e);
      toast.error(friendly.title, {
        description: friendly.description,
        action: friendly.showReportAction
          ? { label: 'Báo lỗi', onClick: () => exportWalletDebugLog() }
          : undefined,
      });
    }
  }, [connectAsync, connectors]);


  const handleSheetWalletConnect = useCallback(() => {
    setShowMobileConnectGuide(false);
    if (openConnectModal) openConnectModal();
  }, [openConnectModal]);

  // ── Donation recording ──
  const invalidateDonationCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['donation-history'] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['public-donation-history'] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['transaction-history'] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['wallet-transfers'] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['btc-transactions'] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['reward-stats'] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['notifications'] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['feed-posts'] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['admin-donation-history'] }).catch(() => {});
    window.dispatchEvent(new Event('invalidate-feed'));
    window.dispatchEvent(new Event('invalidate-donations'));
    // Báo cho HistoryTab + useBtcTransactions refetch ngay
    window.dispatchEvent(new Event('wallet-transactions-updated'));
  }, []);

  const recordDonationWithRetry = useCallback(async (hash: string, recipient: ResolvedRecipient, session: { user: { id: string } }): Promise<boolean> => {
    // GUARD: kiểm tra recipient snapshot có đầy đủ thông tin trước khi ghi DB
    if (!recipient?.id || (!recipient.walletAddress && !recipient.btcAddress)) {
      logger.error('[GIFT] Invalid recipient snapshot — abort record', { recipient });
      toast.error('Lỗi: thông tin người nhận không hợp lệ, không ghi giao dịch');
      return false;
    }
    const body = {
      sender_id: session.user.id, recipient_id: recipient.id, amount,
      token_symbol: selectedToken.symbol, token_address: resolvedTokenAddress || null,
      chain_id: selectedChainId, tx_hash: hash, message: customMessage,
      message_template: selectedTemplate?.id, post_id: postId,
      card_theme: 'celebration', card_sound: 'rich-1',
    };
    // SAFETY NET: lưu pending NGAY khi có hash để usePendingDonationRecovery
    // bắt được nếu mobile in-app browser bị unmount giữa chừng (user back/close).
    // Sẽ remove khi record-donation thành công.
    try {
      localStorage.setItem(`pending_donation_${hash}`, JSON.stringify({
        txHash: hash, recipientId: recipient.id, senderId: session.user.id,
        amount, tokenSymbol: selectedToken.symbol, tokenAddress: resolvedTokenAddress || null,
        chainId: selectedChainId, message: customMessage, messageTemplate: selectedTemplate?.id,
        postId, timestamp: Date.now(),
      }));
    } catch (e) { logger.warn('[GIFT] Could not write pending_donation safety net', (e as Error)?.message); }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data: donationData, error } = await supabase.functions.invoke('record-donation', { body });
        if (!error && donationData?.donation?.id) {
          logger.debug(`[GIFT] record-donation OK (attempt ${attempt + 1}):`, donationData.donation.id);
          localStorage.removeItem(`pending_donation_${hash}`);
          return true;
        }
        throw new Error(error?.message || 'Record failed');
      } catch (err: unknown) {
        logger.error(`[GIFT] record-donation attempt ${attempt + 1} failed:`, (err as Error)?.message);
        if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
      }
    }
    localStorage.setItem(`pending_donation_${hash}`, JSON.stringify({
      txHash: hash, recipientId: recipient.id, senderId: session.user.id,
      amount, tokenSymbol: selectedToken.symbol, tokenAddress: resolvedTokenAddress || null,
      chainId: selectedChainId, message: customMessage, messageTemplate: selectedTemplate?.id,
      postId, timestamp: Date.now(),
    }));
    return false;
  }, [amount, selectedChainId, resolvedTokenAddress, customMessage, postId, selectedTemplate?.id, selectedToken]);

  const recordDonationBackground = useCallback(async (hash: string, recipient: ResolvedRecipient) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const ok = await recordDonationWithRetry(hash, recipient, session);
      if (ok) invalidateDonationCache();
    } catch (err) { logger.error('[GIFT] recordDonationBackground error:', err); }
  }, [recordDonationWithRetry, invalidateDonationCache]);

  const recordMultiDonationsSequential = useCallback(async (successResults: MultiSendResult[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let recorded = 0;
      for (let i = 0; i < successResults.length; i++) {
        const result = successResults[i];
        if (result.txHash) {
          const ok = await recordDonationWithRetry(result.txHash, result.recipient, session);
          if (ok) {
            recorded++;
            invalidateDonationCache();
            logger.debug(`[GIFT] Recorded ${recorded}/${successResults.length} donations`);
          }
          // Delay 1.5s giữa mỗi lần gọi để tránh race condition
          if (i < successResults.length - 1) {
            await new Promise(r => setTimeout(r, 1500));
          }
        }
      }
      logger.debug(`[GIFT] Final: Recorded ${recorded}/${successResults.length} donations`);
      if (recorded < successResults.length) toast.warning(t('unrecordedWarning').replace('{count}', String(successResults.length - recorded)), { duration: 10000 });
    } catch (err) { logger.error('[GIFT] recordMultiDonationsSequential error:', err); }
  }, [recordDonationWithRetry, invalidateDonationCache]);

  // ── Send logic ──
  const walletToken = {
    symbol: selectedToken.symbol, name: selectedToken.name,
    address: (resolvedTokenAddress || null) as `0x${string}` | null,
    decimals: selectedToken.decimals, logo: selectedToken.logo, color: selectedToken.color,
  };

  /** Wait for blockchain receipt before recording donation */
  const waitForReceipt = useCallback(async (hash: string): Promise<boolean> => {
    if (!publicClient) return false;
    try {
      // txStep is managed by useSendToken, no override needed
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        confirmations: 1,
        timeout: 60_000,
      });
      return receipt.status === 'success';
    } catch (err) {
      logger.error('[GIFT] waitForReceipt failed:', (err as Error)?.message);
      return false;
    }
  }, [publicClient]);

  const handleSend = async () => {
    // BTC send via BIP21 deep link with full confirm flow
    if (isBtcNetwork) {
      const recipient = recipientsWithWallet[0];
      const btcAddr = recipient?.btcAddress;
      if (!btcAddr) { toast.error('Người nhận chưa có địa chỉ ví BTC'); return; }
      const bip21Url = `bitcoin:${btcAddr}?amount=${amount}`;
      setBtcBip21Url(bip21Url);
      setBtcPollingEnabled(true);
      setBtcTxStep('signing');

      // Mobile: hiện panel QR rồi deep-link ví BTC native sau 350ms.
      // Desktop: KHÔNG auto deep-link (MetaMask cướp protocol `bitcoin:` gây kẹt).
      // User tự quét QR hoặc bấm "Mở ví BTC / Copy link" trong panel.
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        setTimeout(() => {
          try { window.location.href = bip21Url; } catch { /* ignore */ }
        }, 350);
      }

      return;
    }

    if (recipientsWithWallet.length === 1) {
      // Single send — FREEZE recipient snapshot để tránh prop đổi giữa async flow
      const frozenRecipient: ResolvedRecipient = { ...recipientsWithWallet[0] };
      if (!frozenRecipient?.walletAddress) { toast.error(t('recipientNoWalletToast')); return; }
      try {
        const hash = await sendToken({ token: walletToken, recipient: frozenRecipient.walletAddress, amount, skipBackground: true, targetChainId: selectedChainId });
        if (hash) {
          // VERIFY: recipient hiện tại (sau await) phải khớp với snapshot lúc bấm Gửi
          const currentRecipient = recipientsWithWallet[0];
          if (currentRecipient?.id !== frozenRecipient.id || currentRecipient?.walletAddress !== frozenRecipient.walletAddress) {
            logger.warn('[GIFT] Recipient changed during send — using FROZEN snapshot', {
              frozen: { id: frozenRecipient.id, wallet: frozenRecipient.walletAddress },
              current: { id: currentRecipient?.id, wallet: currentRecipient?.walletAddress },
            });
          }
          // Optimistic: show celebration immediately after hash received (dùng snapshot)
          const cardData = buildCardData(hash, frozenRecipient, parsedAmountNum);
          setCelebrationData(cardData); setShowCelebration(true); setFlowStep('celebration');
          onSuccess?.();

          // Background: receipt check + record donation (non-blocking) — dùng snapshot
          (async () => {
            try {
              const confirmed = await waitForReceipt(hash);
              if (!confirmed) {
                logger.warn('[GIFT] Receipt not confirmed, tx may have reverted:', hash);
              }
            } catch (e) {
              logger.error('[GIFT] Background receipt check failed:', (e as Error)?.message);
            }
            try {
              if (frozenRecipient.id) recordDonationBackground(hash, frozenRecipient);
            } catch (recordErr) {
              logger.error('[GIFT] recordDonation failed:', (recordErr as Error)?.message);
            }
          })();
        }
      } catch (err) {
        logger.error('[GIFT] Single send error:', (err as Error)?.message);
        toast.error(t('sendGiftError'));
        resetState();
      }
    } else {
      // ──────────────────────────────────────────────────────────────
      // NHÁNH A: FunDisperse — 1 (hoặc vài) chữ ký cho cả lô.
      // Kích hoạt khi: không phải BTC, contract đã deploy trên chain hiện tại, >1 recipient.
      // ──────────────────────────────────────────────────────────────
      if (isDisperseAvailable(selectedChainId)) {
        const frozenRecipients: ResolvedRecipient[] = recipientsWithWallet.map(r => ({ ...r }));
        const payload: DisperseRecipientPayload[] = frozenRecipients
          .filter(r => !!r.walletAddress)
          .map(r => ({
            address: r.walletAddress as `0x${string}`,
            amount,
            refId: r.id,
          }));
        if (payload.length === 0) { toast.error('Không có người nhận có ví hợp lệ'); return; }
        giftTx.dismiss(); // Xoá state single-send cũ để FloatingBar không bật sai
        setIsMultiSending(true); setCurrentSendingIndex(-1);
        setMultiSendProgress({ current: 0, total: payload.length, results: [] });
        try {
          const batchResults = await disperseSend({
            token: walletToken,
            recipients: payload,
            targetChainId: selectedChainId,
            onProgress: ({ phase, batchIndex, totalBatches }) => {
              if (phase === 'signing' || phase === 'confirming') {
                const done = (batchIndex ?? 0) * 250;
                setMultiSendProgress(prev => prev ? {
                  ...prev,
                  current: Math.min(done + (phase === 'confirming' ? 250 : 0), payload.length),
                } : prev);
              }
            },
          });
          // Build kết quả: mọi recipient trong cùng lô share txHash của lô
          const allResults: MultiSendResult[] = [];
          for (const batch of batchResults) {
            for (const rec of batch.recipients) {
              const original = frozenRecipients.find(r => r.id === rec.refId);
              if (original) {
                allResults.push({ recipient: original, success: true, txHash: batch.txHash });
              }
            }
          }
          setMultiSendProgress({ current: payload.length, total: payload.length, results: allResults });
          // Ghi DB tuần tự (mỗi recipient = 1 donation row, share tx_hash)
          recordMultiDonationsSequential(allResults);
          // Hiện celebration tổng kết với lô đầu tiên
          const firstSuccess = allResults[0];
          if (firstSuccess?.txHash) {
            const cardData = buildCardData(firstSuccess.txHash, firstSuccess.recipient, parsedAmountNum);
            setCelebrationData(cardData); setShowCelebration(true); setFlowStep('celebration');
          }
          onSuccess?.();
          setIsMultiSending(false);
          giftTx.dismiss();
          return;
        } catch (err) {
          logger.error('[GIFT] Disperse send failed:', (err as Error)?.message);
          toast.error('Gửi disperse thất bại: ' + ((err as Error)?.message || 'Lỗi không xác định'));
          setIsMultiSending(false);
          giftTx.dismiss();
          return;
        }
      }

      // ──────────────────────────────────────────────────────────────
      // NHÁNH B (fallback): ký tuần tự — giữ nguyên logic cũ.
      // ──────────────────────────────────────────────────────────────
      const frozenRecipients: ResolvedRecipient[] = recipientsWithWallet.map(r => ({ ...r }));
      giftTx.dismiss(); // Xoá state single-send cũ để FloatingBar không tự bật giữa loop
      setIsMultiSending(true); setCurrentSendingIndex(-1);
      const results: MultiSendResult[] = [];
      const backgroundTasks: Array<{ hash: string; recipient: ResolvedRecipient }> = [];
      setMultiSendProgress({ current: 0, total: frozenRecipients.length, results: [] });
      for (let i = 0; i < frozenRecipients.length; i++) {
        const recipient = frozenRecipients[i];
        if (!recipient?.id || !recipient.walletAddress) {
          results.push({ recipient, success: false, error: 'Thiếu thông tin người nhận' });
          continue;
        }
        setCurrentSendingIndex(i);
        setMultiSendProgress(prev => prev ? { ...prev, current: i + 1 } : prev);
        // Bỏ sleep 500ms giữa các tx — wagmi v2 đã tự xếp hàng nonce.
        try {
          const hash = await sendToken({ token: walletToken, recipient: recipient.walletAddress, amount, skipBackground: true, targetChainId: selectedChainId });
          if (hash) {
            // Optimistic: treat hash as success
            results.push({ recipient, success: true, txHash: hash });
            backgroundTasks.push({ hash, recipient });
            // SAFETY NET: lưu pending NGAY khi có hash (đề phòng unmount giữa chừng)
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) {
                localStorage.setItem(`pending_donation_${hash}`, JSON.stringify({
                  txHash: hash, recipientId: recipient.id, senderId: session.user.id,
                  amount, tokenSymbol: selectedToken.symbol, tokenAddress: resolvedTokenAddress || null,
                  chainId: selectedChainId, message: customMessage, messageTemplate: selectedTemplate?.id,
                  postId, timestamp: Date.now(),
                }));
              }
            } catch (e) { logger.warn('[GIFT] multi pending safety net failed', (e as Error)?.message); }
          } else {
            results.push({ recipient, success: false, error: t('txRejected') });
          }
        } catch (err: unknown) {
          results.push({ recipient, success: false, error: (err as Error)?.message || t('sendError') });
        }
        setMultiSendProgress(prev => prev ? { ...prev, results: [...results] } : prev);
      }
      // Reset state hook 1 lần duy nhất sau khi loop xong — tránh re-render giữa các tx
      // (re-render có thể disconnect ví mobile trên iOS Safari + MetaMask DApp).
      resetState();
      setCurrentSendingIndex(-1); setIsMultiSending(false);
      giftTx.dismiss();
      const successResults = results.filter(r => r.success);
      if (successResults.length > 0) {
        const cardData = buildMultiCardData(successResults, results, parsedAmountNum);
        setCelebrationData(cardData); setShowCelebration(true); setFlowStep('celebration'); onSuccess?.();
        if (results.some(r => !r.success)) {
          toast.warning(`Không gửi được cho: ${results.filter(r => !r.success).map(r => `@${r.recipient.username}`).join(', ')}`, { duration: 8000 });
        }
        // Background: receipt checks PARALLEL + record donations (non-blocking)
        (async () => {
          await Promise.allSettled(backgroundTasks.map(task => waitForReceipt(task.hash)));
          await recordMultiDonationsSequential(successResults);
        })();
      } else {
        toast.error(t('noRecipientSuccess'));
      }
    }
  };


  const shortenAddr = (addr?: string | null) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'Người nhận';

  const buildCardData = (hash: string, recipient: ResolvedRecipient, parsedAmount: number): GiftCardData => ({
    id: crypto.randomUUID(), amount, tokenSymbol: getGiftTokenLabel(selectedToken.symbol, selectedChainId), chainId: selectedChainId,
    senderUsername: senderProfile?.username || 'Người gửi',
    senderDisplayName: senderProfile?.display_name || senderProfile?.username || 'Người gửi',
    senderAvatarUrl: senderProfile?.avatar_url, senderId: senderUserId || undefined,
    senderWalletAddress: effectiveAddress,
    recipientUsername: recipient.username || shortenAddr(recipient.walletAddress || recipient.btcAddress),
    recipientDisplayName: recipient.displayName || recipient.username || shortenAddr(recipient.walletAddress || recipient.btcAddress),
    recipientAvatarUrl: recipient.avatarUrl, recipientId: recipient.id,
    recipientWalletAddress: recipient.walletAddress, message: customMessage, txHash: hash,
    lightScoreEarned: Math.floor(parsedAmount / 100), createdAt: new Date().toISOString(),
  });


  const buildMultiCardData = (successResults: MultiSendResult[], allResults: MultiSendResult[], parsedAmount: number): GiftCardData => {
    const first = successResults[0];
    const successNames = successResults.map(r => `@${r.recipient.username}`).join(', ');
    return {
      id: crypto.randomUUID(), amount: (parsedAmount * successResults.length).toString(),
      tokenSymbol: getGiftTokenLabel(selectedToken.symbol, selectedChainId),
      chainId: selectedChainId,
      senderUsername: senderProfile?.username || 'Người gửi',
      senderDisplayName: senderProfile?.display_name || senderProfile?.username || 'Người gửi',

      senderAvatarUrl: senderProfile?.avatar_url, senderId: senderUserId || undefined,
      senderWalletAddress: address,
      recipientUsername: successResults.length === 1 ? first.recipient.username : successNames,
      recipientDisplayName: successResults.length === 1 ? (first.recipient.displayName || first.recipient.username) : `${successResults.length} ${t('multiRecipientLabel')}`,
      recipientAvatarUrl: successResults.length === 1 ? first.recipient.avatarUrl : null,
      recipientId: first.recipient.id,
      recipientWalletAddress: first.recipient.walletAddress || '',
      message: customMessage, txHash: first.txHash || '',
      lightScoreEarned: Math.floor(parsedAmount * successResults.length / 100),
      createdAt: new Date().toISOString(),
      multiRecipients: allResults.map(r => ({
        username: r.recipient.username, avatarUrl: r.recipient.avatarUrl,
        recipientId: r.recipient.id, walletAddress: r.recipient.walletAddress || '',
        success: r.success, txHash: r.txHash, error: r.error,
      })),
    };
  };

  const handleSendReminder = async () => {
    const noWalletRecipient = recipientsWithoutWallet[0];
    if (!noWalletRecipient?.id) return;
    setIsSendingReminder(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error(t('loginRequiredToast')); return; }
      const { error } = await supabase.functions.invoke('notify-gift-ready', {
        body: { recipientId: noWalletRecipient.id, notificationType: 'no_wallet' },
      });
      if (error) throw error;
      toast.success(t('reminderSentToast').replace('{username}', noWalletRecipient.username));
    } catch (error) {
      logger.error('[GIFT] Error sending reminder:', error);
      toast.error(t('cannotSendReminderToast'));
    } finally { setIsSendingReminder(false); }
  };

  const handleCloseCelebration = () => {
    setShowCelebration(false); setCelebrationData(null);
    // Reset send state triệt để trước khi đóng — đảm bảo lần gửi tiếp không bị kẹt
    resetState();
    onClose();
  };

  const handleDialogClose = () => {
    if (txStep === 'signing' || isMultiSending) return;
    onClose();
  };

  const dialogTitle = useMemo(() => {
    if (effectiveRecipients.length === 1) return `${t('giftDialogTitle')} @${effectiveRecipients[0].username} 🎁❤️🎉`;
    if (effectiveRecipients.length > 1) return `${t('giftDialogTitle')} ${effectiveRecipients.length} ${t('giftDialogTitlePeople')}`;
    return t('giftDialogTitleGeneric');
  }, [effectiveRecipients, t]);

  const showMainDialog = isOpen && flowStep !== 'celebration';

  // ── Mobile UX: Watchdog reset nếu tx kẹt quá 90s (user bỏ ví, không quay lại) ──
  useEffect(() => {
    if (!isPending || txStep === 'idle') return;
    const timer = setTimeout(() => {
      toast.error('Quá thời gian chờ giao dịch. Vui lòng kiểm tra ví và thử lại.', { duration: 8000 });
      resetState();
    }, 90_000);
    return () => clearTimeout(timer);
  }, [txStep, isPending, resetState]);

  // ── Mobile UX: Khi user quay lại tab từ ví ngoài → recheck receipt nếu có txHash treo ──
  useEffect(() => {
    if (!showMainDialog) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && txHash && txStep !== 'idle') {
        recheckReceipt?.();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [showMainDialog, txHash, txStep, recheckReceipt]);

  // ── Render ──
  return (
    <>
      <Dialog open={showMainDialog} onOpenChange={(open) => !open && handleDialogClose()}>
        <DialogContent
          className="!grid-rows-none !flex !flex-col w-[100vw] sm:w-[95vw] max-w-md lg:max-w-[720px] h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg p-0 sm:p-0 overflow-hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)' }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base pr-10">
                <Gift className="w-5 h-5 text-gold shrink-0" />
                <span className="break-words">{dialogTitle}</span>
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-6 sm:px-6 sm:pb-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent" style={{ WebkitOverflowScrolling: 'touch' as any }}>

          {IS_MAINTENANCE && (
            <div className="py-4 space-y-4">
              <div className="bg-destructive/10 border-2 border-destructive/30 rounded-xl p-5 text-center space-y-3">
                <div className="text-4xl">🔧</div>
                <h3 className="font-bold text-destructive text-lg">{t('maintenancePause')}</h3>
                <p className="text-sm text-muted-foreground">{t('maintenancePauseDesc')}</p>
              </div>
              <Button variant="outline" className="w-full" onClick={handleDialogClose}>{t('closeBtnText')}</Button>
            </div>
          )}

          {!IS_MAINTENANCE && (<>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-2">
              {['form', 'confirm'].map((step, idx) => (
                <div key={step} className="flex items-center gap-1 flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    flowStep === step ? 'bg-primary text-primary-foreground' :
                    (flowStep === 'confirm' && idx === 0) ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>{idx + 1}</div>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{idx === 0 ? t('stepInfoLabel') : t('stepConfirmLabel')}</span>
                  {idx < 1 && <div className="flex-1 h-px bg-border" />}
                </div>
              ))}
            </div>

            {flowStep === 'form' && (
              <GiftFormStep
                senderProfile={senderProfile}
                effectiveAddress={effectiveAddress}
                selectedToken={selectedToken}
                onSelectToken={(t) => { setSelectedToken(t); setAmount(''); }}
                formattedBalance={formattedBalance}
                disabledTokens={disabledTokens}
                extraTokens={walletCustomTokenOptions}
                selectedChainId={selectedChainId}
                onChainChange={(id) => {
                  setSelectedChainId(id);
                  setAmount('');
                  // Auto-switch token theo chain mới:
                  // - BTC mainnet → token BTC (tránh ghi nhầm BNB/BTCB vào biên nhận)
                  // - BSC mà token hiện tại không khả dụng → fallback BNB
                  if (id === BTC_MAINNET) {
                    const btcToken = SUPPORTED_TOKENS.find(t => t.symbol === 'BTC');
                    if (btcToken && selectedToken.symbol !== 'BTC') setSelectedToken(btcToken);
                  } else if ((selectedToken.address && id !== BSC_MAINNET) || !isTokenAvailableOnChain(selectedToken.symbol, id)) {
                    const bnbToken = SUPPORTED_TOKENS.find(t => t.symbol === 'BNB');
                    if (bnbToken) setSelectedToken(bnbToken);
                  }
                }}
                walletChainId={chainId}
                amount={amount}
                onAmountChange={(v) => {
                  let sanitized = v;
                  if (isBtcNetwork && sanitized.length > 1 && sanitized[0] === '0' && sanitized[1] !== '.') {
                    sanitized = '0.' + sanitized.slice(1);
                  }
                  setAmount(sanitized);
                }}
                onMaxAmount={handleMaxAmount}
                onSelectQuickAmount={(n) => setAmount(n.toString())}
                isMultiMode={isMultiMode}
                parsedAmountNum={parsedAmountNum}
                totalAmount={totalAmount}
                estimatedUsd={estimatedUsd}
                totalEstimatedUsd={totalEstimatedUsd}
                minSendCheck={minSendCheck}
                hasEnoughBalance={hasEnoughBalance}
                isLargeAmount={isLargeAmount}
                isPresetMode={isPresetMode}
                effectiveRecipients={effectiveRecipients}
                recipientsWithWallet={recipientsWithWallet}
                recipientsWithoutWallet={recipientsWithoutWallet}
                hasRecipients={hasRecipients}
                resolvedRecipients={search.resolvedRecipients}
                searchTab={search.searchTab}
                searchQuery={search.searchQuery}
                searchResults={search.searchResults}
                isSearching={search.isSearching}
                searchError={search.searchError}
                onSearchTabChange={search.handleChangeTab}
                onSearchQueryChange={search.setSearchQuery}
                onSelectRecipient={search.handleSelectRecipient}
                onRemoveRecipient={search.handleRemoveRecipient}
                onClearAllRecipients={search.handleClearAll}
                onBulkAddRecipients={search.handleBulkAdd}
                senderUserId={senderUserId}
                customMessage={customMessage}
                onMessageChange={setCustomMessage}
                selectedTemplate={selectedTemplate}
                onSelectTemplate={handleSelectTemplate}
                onEmojiSelect={handleEmojiSelect}
                isConnected={isConnected}
                isConnectingWallet={isConnectingWallet}
                isWrongNetwork={isWrongNetwork}
                needsGasWarning={needsGasWarning}
                bnbBalanceNum={bnbBalanceNum}
                estimatedGasPerTx={estimatedGasPerTx}
                onConnectWallet={handleConnectWallet}
                linkedWalletAddress={!isConnected ? linkedWalletAddress : null}
                onSwitchChain={() => switchChain({ chainId: selectedChainId })}
                canProceedToConfirm={canProceedToConfirm}
                isInProgress={isInProgress}
                onGoToConfirm={() => {
                  if (recipientsExceedLimit) {
                    toast.error(`Vượt giới hạn ${MAX_RECIPIENTS_TOTAL} ví/lần. Vui lòng bớt ${recipientsWithWallet.length - MAX_RECIPIENTS_TOTAL} ví.`);
                    return;
                  }
                  if (canProceedToConfirm) setFlowStep('confirm');
                }}
                onClose={handleDialogClose}
                onSendReminder={handleSendReminder}
                isSendingReminder={isSendingReminder}
                onCopyAddress={handleCopyAddress}
              />
            )}

            {flowStep === 'confirm' && (
              <>
                {!isBtcNetwork && (
                  <MultiSendModeBanner
                    chainId={selectedChainId}
                    recipientCount={recipientsWithWallet.length}
                  />
                )}
              <GiftConfirmStep
                senderProfile={senderProfile}
                address={address}
                selectedToken={selectedToken}
                amount={amount}
                parsedAmountNum={parsedAmountNum}
                totalAmount={totalAmount}
                totalEstimatedUsd={totalEstimatedUsd}
                selectedTokenPrice={selectedTokenPrice}
                isMultiMode={isMultiMode}
                selectedChainId={selectedChainId}
                recipientsWithWallet={recipientsWithWallet}
                customMessage={customMessage}
                multiSendProgress={multiSendProgress}
                isMultiSending={isMultiSending}
                currentSendingIndex={currentSendingIndex}
                txStep={effectiveTxStep}
                stepInfo={stepInfo}
                isInProgress={isInProgress}
                isPending={isPending}
                txHash={txHash}
                scanUrl={scanUrl}
                isSendDisabled={isSendDisabled}
                onSend={handleSend}
                onGoBack={() => !isInProgress && !isMultiSending && setFlowStep('form')}
                onClose={handleDialogClose}
                onRecheckReceipt={recheckReceipt}
                onCopyAddress={handleCopyAddress}
                onForceCancel={() => {
                  // Mobile safety: MetaMask không phản hồi → reset toàn bộ trạng thái
                  resetState();
                  setBtcTxStep('idle');
                  setBtcPollingEnabled(false);
                  toast.info('Đã huỷ giao dịch. Bạn có thể thử lại.');
                }}
                onReopenWallet={reopenWalletApp}
                isBtcSigning={isBtcNetwork && btcTxStep === 'signing'}
                btcBip21Url={btcBip21Url}
                btcRecipientAddress={btcRecipientAddr || ''}
                btcAmount={amount}
                btcPollingStatus={btcPolling.status}
                btcTxid={btcPolling.txid}
                btcManualConfirmEnabled={btcManualConfirm.data === true}
                onBtcMarkManualSend={() => {
                  void btcPolling.markManualSend().then((ok) => {
                    if (!ok) toast.info(BTC_MANUAL_CONFIRM_LOCK_MESSAGE);
                  });
                }}
                onBtcCancelPolling={() => {
                  setBtcPollingEnabled(false);
                  setBtcTxStep('idle');
                }}
              />
              </>
            )}
          </>)}
          </div>


        </DialogContent>
      </Dialog>

      <MobileWalletConnectSheet
        open={showMobileConnectGuide}
        onOpenChange={setShowMobileConnectGuide}
        onInjectedConnect={handleInjectedSheetConnect}
        onOpenWalletConnect={handleSheetWalletConnect}
      />

      {celebrationData && (
        <DonationSuccessCard
          isOpen={showCelebration}
          onClose={handleCloseCelebration}
          data={{
            id: celebrationData.id, amount: celebrationData.amount,
            tokenSymbol: celebrationData.tokenSymbol,
            chainId: celebrationData.chainId,
            senderUsername: celebrationData.senderUsername,
            senderDisplayName: celebrationData.senderDisplayName || celebrationData.senderUsername,
            senderAvatarUrl: celebrationData.senderAvatarUrl,
            senderId: celebrationData.senderId,
            recipientUsername: celebrationData.recipientUsername,
            recipientDisplayName: celebrationData.recipientDisplayName || celebrationData.recipientUsername,
            recipientAvatarUrl: celebrationData.recipientAvatarUrl,
            recipientId: celebrationData.recipientId,
            message: celebrationData.message, txHash: celebrationData.txHash,
            lightScoreEarned: celebrationData.lightScoreEarned,
            createdAt: celebrationData.createdAt,
          } as DonationCardData}
        />
      )}
    </>
  );
};
