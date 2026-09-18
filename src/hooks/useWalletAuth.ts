/**
 * useWalletAuth — State machine hook for mobile wallet authentication
 * Phases: idle → connecting → connected → wrong_chain → signing → verifying → authenticated
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { supabase } from '@/integrations/supabase/client';
import {
  AUTH_CHAIN_ID,
  type NoncePayload,
  type WalletAuthError,
  type WalletAuthMode,
  type WalletFlowPhase,
  classifyWalletError,
  clearWalletAuthSnapshot,
  completeSupabaseWalletSession,
  getConnectorType,
  isValidEvmAddress,
  loadWalletAuthSnapshot,
  logWalletAuth,
  normalizeAddress,
  requestBackendNonce,
  saveWalletAuthSnapshot,
  verifyWalletLoginSignature,
} from '@/lib/walletFlowShared';
import {
  ensureBscNetwork,
  getInjectedAccounts,
  getInjectedMobileBrowserType,
  getInjectedProvider,
  isInjectedMobileBrowser,
  normalizeChainId,
  requestInjectedAccounts,
  type Eip1193Provider,
} from '@/utils/mobileWalletConnect';
import {
  clearWalletLocalStorage,
  fullWalletDisconnect,
  requestWalletSwitch,
} from '@/utils/walletSessionReset';

export type WalletLoginResult = {
  user_id: string;
  isNewUser: boolean;
};

type ResetReason = 'manual' | 'retry' | 'disconnect' | 'switch_wallet' | 'account_changed' | 'chain_changed' | 'timeout' | 'walletconnect_cancel';
type LoginErrorState = WalletAuthError & { recoverable: boolean };

function isSupportedAuthChain(chainId: number | null | undefined) {
  return chainId === AUTH_CHAIN_ID;
}

function makeAttemptId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function requestPersonalSign(params: {
  provider: Eip1193Provider;
  account: string;
  message: string;
}) {
  try {
    return (await params.provider.request({
      method: 'personal_sign',
      params: [params.message, params.account],
    })) as string;
  } catch {
    return (await params.provider.request({
      method: 'personal_sign',
      params: [params.account, params.message],
    })) as string;
  }
}

export function useWalletAuth() {
  const account = useAccount();
  const chainId = useChainId();
  const { signMessageAsync, isPending: wagmiSigning } = useSignMessage();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();

  const authMode: WalletAuthMode = useMemo(
    () => (isInjectedMobileBrowser() ? 'injected_mobile_browser' : 'wallet_modal_or_walletconnect'),
    [],
  );
  const injectedProvider = useMemo(() => getInjectedProvider(), []);

  const wagmiAddress = useMemo(
    () => (account.address ? normalizeAddress(account.address) : null),
    [account.address],
  );
  const [injectedAddress, setInjectedAddress] = useState<string | null>(null);
  const [injectedChainId, setInjectedChainId] = useState<number | null>(null);

  const connectorType = useMemo(() => {
    if (authMode === 'injected_mobile_browser') return getInjectedMobileBrowserType();
    return getConnectorType({ connectorName: account.connector?.name ?? null });
  }, [account.connector?.name, authMode]);

  const connectedAddress = authMode === 'injected_mobile_browser'
    ? injectedAddress ?? wagmiAddress
    : wagmiAddress;
  const effectiveChainId = authMode === 'injected_mobile_browser'
    ? injectedChainId ?? normalizeChainId(chainId)
    : normalizeChainId(chainId);
  const isConnected = authMode === 'injected_mobile_browser'
    ? Boolean(connectedAddress)
    : account.isConnected;

  const [basePhase, setBasePhase] = useState<WalletFlowPhase>('idle');
  const [error, setError] = useState<LoginErrorState | null>(null);
  const [isSwitchingWallet, setIsSwitchingWallet] = useState(false);
  const [pendingRequestDetected, setPendingRequestDetected] = useState(false);
  const [wasBackgroundedDuringSign, setWasBackgroundedDuringSign] = useState(false);

  const signLockRef = useRef(false);
  const verifyLockRef = useRef(false);
  const activeAttemptIdRef = useRef<string | null>(null);
  const nonceRef = useRef<NoncePayload | null>(null);
  const signatureRef = useRef<string | null>(null);
  const trackedAddressRef = useRef<string | null>(null);
  const trackedChainIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // ─── Internal Helpers ───

  const clearTransientState = useCallback((reason: ResetReason) => {
    signLockRef.current = false;
    verifyLockRef.current = false;
    activeAttemptIdRef.current = null;
    nonceRef.current = null;
    signatureRef.current = null;
    setPendingRequestDetected(false);
    setWasBackgroundedDuringSign(false);
    clearWalletAuthSnapshot();
    logWalletAuth('flow_reset', { reason, authMode });
  }, [authMode]);

  const syncInjectedState = useCallback(async (requestAccess = false) => {
    if (authMode !== 'injected_mobile_browser' || !injectedProvider) return null;
    const accounts = requestAccess
      ? await requestInjectedAccounts(injectedProvider)
      : await getInjectedAccounts(injectedProvider);
    const nextAddress = normalizeAddress(accounts?.[0] ?? '');
    const rawChainId = await injectedProvider.request({ method: 'eth_chainId' });
    const nextChainId = normalizeChainId(rawChainId);
    setInjectedAddress(isValidEvmAddress(nextAddress) ? nextAddress : null);
    setInjectedChainId(nextChainId);
    return { address: isValidEvmAddress(nextAddress) ? nextAddress : null, chainId: nextChainId };
  }, [authMode, injectedProvider]);

  const resetWalletAuthFlow = useCallback((reason: ResetReason = 'manual') => {
    clearTransientState(reason);
    setError(null);
    if (reason === 'disconnect') { setBasePhase('idle'); return; }
    if (connectedAddress && isSupportedAuthChain(effectiveChainId)) setBasePhase('connected');
    else if (connectedAddress) setBasePhase('wrong_chain');
    else setBasePhase('idle');
  }, [clearTransientState, connectedAddress, effectiveChainId]);

  // ─── Effective Phase ───

  const effectivePhase = useMemo(() => {
    if (basePhase === 'authenticated') return 'authenticated';
    if (!isConnected || !connectedAddress) return basePhase === 'connecting' ? 'connecting' : 'idle';
    if (!isSupportedAuthChain(effectiveChainId)) return 'wrong_chain';
    if (['signing', 'signing_pending_wallet', 'verifying', 'error'].includes(basePhase)) return basePhase;
    if (nonceRef.current?.nonce && nonceRef.current?.message) return 'ready_to_sign';
    return 'connected';
  }, [basePhase, connectedAddress, effectiveChainId, isConnected]);

  // ─── Effects ───

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Sync injected state on mount
  useEffect(() => {
    if (authMode !== 'injected_mobile_browser') return;
    void syncInjectedState(false);
  }, [authMode, syncInjectedState]);

  // Restore snapshot
  useEffect(() => {
    const snapshot = loadWalletAuthSnapshot();
    if (!snapshot || !connectedAddress) return;
    if (snapshot.account !== connectedAddress || snapshot.authMode !== authMode) return;
    nonceRef.current = snapshot.nonce && snapshot.message
      ? { nonce: snapshot.nonce, message: snapshot.message, expiresAt: snapshot.expiresAt }
      : null;
    setPendingRequestDetected(snapshot.pendingRequestDetected);
    setBasePhase(snapshot.phase);
  }, [authMode, connectedAddress, effectiveChainId]);

  // Track address/chain
  useEffect(() => {
    trackedAddressRef.current = connectedAddress;
    trackedChainIdRef.current = effectiveChainId ?? null;
  }, [connectedAddress, effectiveChainId]);

  // React to connection/chain changes
  useEffect(() => {
    if (!isConnected || !connectedAddress) {
      clearTransientState('disconnect');
      setError(null);
      setBasePhase('idle');
      return;
    }
    if (isSupportedAuthChain(effectiveChainId)) {
      if (['idle', 'connecting', 'wrong_chain'].includes(basePhase)) setBasePhase('connected');
    } else if (basePhase !== 'authenticated') {
      clearTransientState('chain_changed');
      setBasePhase('wrong_chain');
    }
  }, [basePhase, clearTransientState, connectedAddress, effectiveChainId, isConnected]);

  // Visibility/focus detection for pending sign
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && (signLockRef.current || pendingRequestDetected)) {
        setWasBackgroundedDuringSign(true);
      }
    };
    const handleFocus = () => {
      if (signLockRef.current || pendingRequestDetected) setWasBackgroundedDuringSign(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [pendingRequestDetected]);

  // Listen for accountsChanged / chainChanged from injected provider
  useEffect(() => {
    const provider = authMode === 'injected_mobile_browser' ? injectedProvider : getInjectedProvider();
    if (!provider?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      const next = normalizeAddress(accounts?.[0] ?? '');
      const normalizedNext = isValidEvmAddress(next) ? next : null;
      if (authMode === 'injected_mobile_browser') setInjectedAddress(normalizedNext);
      if (!accounts.length) { resetWalletAuthFlow('disconnect'); return; }
      if (trackedAddressRef.current && normalizedNext !== trackedAddressRef.current) {
        clearTransientState('account_changed');
        setError(null);
        setBasePhase(isSupportedAuthChain(effectiveChainId) ? 'connected' : 'wrong_chain');
      }
    };

    const handleChainChanged = (rawChainId: string | number) => {
      const nextChainId = normalizeChainId(rawChainId);
      if (authMode === 'injected_mobile_browser') setInjectedChainId(nextChainId);
      clearTransientState('chain_changed');
      setError(null);
      setBasePhase(nextChainId === AUTH_CHAIN_ID ? 'connected' : 'wrong_chain');
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);
    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [authMode, clearTransientState, effectiveChainId, injectedProvider, resetWalletAuthFlow]);

  // ─── Actions ───

  const connectWallet = useCallback(async () => {
    if (authMode === 'injected_mobile_browser') {
      if (!injectedProvider) throw new Error('Không tìm thấy ví in-app hỗ trợ.');
      setBasePhase('connecting');
      setError(null);
      const state = await syncInjectedState(true);
      if (!state?.address) throw new Error('Không thể lấy tài khoản ví.');
      logWalletAuth('injected_connected', { connectorType, account: state.address, chainId: state.chainId, authMode });
      setBasePhase(isSupportedAuthChain(state.chainId) ? 'connected' : 'wrong_chain');
      return state;
    }
    setBasePhase('connecting');
    return null;
  }, [authMode, connectorType, injectedProvider, syncInjectedState]);

  const beginWalletConnectSession = useCallback(async () => {
    if (authMode === 'injected_mobile_browser') return connectWallet();
    clearTransientState('retry');
    setError(null);
    setBasePhase('connecting');
    await fullWalletDisconnect(disconnect);
    logWalletAuth('walletconnect_session_begin', { authMode, connectorType });
    return null;
  }, [authMode, clearTransientState, connectWallet, connectorType, disconnect]);

  const cancelWalletConnectSession = useCallback(async (reason: 'timeout' | 'walletconnect_cancel' = 'walletconnect_cancel') => {
    clearTransientState(reason);
    setError(null);
    setBasePhase('idle');
    await fullWalletDisconnect(disconnect);
    logWalletAuth('walletconnect_session_cancel', { reason, authMode, connectorType });
  }, [authMode, clearTransientState, connectorType, disconnect]);

  const ensureSupportedChain = useCallback(async () => {
    if (isSupportedAuthChain(effectiveChainId)) return true;
    try {
      if (authMode === 'injected_mobile_browser') {
        if (!injectedProvider) throw new Error('Wallet provider not available');
        const result = await ensureBscNetwork({ provider: injectedProvider, preferredChainId: bsc.id });
        setInjectedChainId(result.chainId);
        if (!result.ok || result.chainId !== AUTH_CHAIN_ID) throw new Error('Vui lòng chuyển sang đúng mạng.');
      } else {
        await switchChainAsync({ chainId: bsc.id });
      }
      setError(null);
      setBasePhase('connected');
      return true;
    } catch (switchError) {
      const parsed = classifyWalletError(switchError);
      setError({ ...parsed, recoverable: true });
      return false;
    }
  }, [authMode, effectiveChainId, injectedProvider, switchChainAsync]);

  const requestNonce = useCallback(async () => {
    if (!connectedAddress) throw new Error('Vui lòng kết nối ví trước.');
    if (!isSupportedAuthChain(effectiveChainId)) throw new Error('Vui lòng chuyển sang đúng mạng.');

    const payload = await requestBackendNonce({ address: connectedAddress, chainId: AUTH_CHAIN_ID });
    nonceRef.current = payload;
    setBasePhase('ready_to_sign');
    saveWalletAuthSnapshot({
      purpose: 'login', phase: 'ready_to_sign', authMode,
      account: connectedAddress, chainId: AUTH_CHAIN_ID, connectorType,
      nonce: payload.nonce, message: payload.message, expiresAt: payload.expiresAt,
      signRequestStarted: false, pendingRequestDetected: false, updatedAt: new Date().toISOString(),
    });
    return payload;
  }, [authMode, connectedAddress, connectorType, effectiveChainId]);

  const signNonceMessage = useCallback(async (attemptId: string, noncePayload: NoncePayload) => {
    if (!connectedAddress || !isConnected) throw new Error('Ví đã bị ngắt kết nối.');
    if (signLockRef.current) throw new Error('Yêu cầu ký đang chờ xử lý. Vui lòng mở lại ví.');

    signLockRef.current = true;
    activeAttemptIdRef.current = attemptId;
    setPendingRequestDetected(false);
    setWasBackgroundedDuringSign(false);
    setError(null);
    setBasePhase('signing');

    saveWalletAuthSnapshot({
      purpose: 'login', phase: 'signing', authMode,
      account: connectedAddress, chainId: AUTH_CHAIN_ID, connectorType,
      nonce: noncePayload.nonce, message: noncePayload.message, expiresAt: noncePayload.expiresAt,
      signRequestStarted: true, pendingRequestDetected: false, updatedAt: new Date().toISOString(),
    });

    try {
      const signature = authMode === 'injected_mobile_browser' && injectedProvider
        ? await requestPersonalSign({ provider: injectedProvider, account: connectedAddress, message: noncePayload.message })
        : await signMessageAsync({ account: connectedAddress as `0x${string}`, message: noncePayload.message });

      if (activeAttemptIdRef.current !== attemptId) throw new Error('Tài khoản đã thay đổi.');
      signatureRef.current = signature;
      signLockRef.current = false;
      return signature;
    } catch (signError) {
      signLockRef.current = false;
      const parsed = classifyWalletError(signError);
      if (parsed.code === 'pending_request') {
        setPendingRequestDetected(true);
        setBasePhase('signing_pending_wallet');
        saveWalletAuthSnapshot({
          purpose: 'login', phase: 'signing_pending_wallet', authMode,
          account: connectedAddress, chainId: AUTH_CHAIN_ID, connectorType,
          nonce: noncePayload.nonce, message: noncePayload.message, expiresAt: noncePayload.expiresAt,
          signRequestStarted: true, pendingRequestDetected: true, updatedAt: new Date().toISOString(),
        });
      } else {
        setError({ ...parsed, recoverable: true });
        setBasePhase('error');
        clearWalletAuthSnapshot();
      }
      throw signError;
    }
  }, [authMode, connectedAddress, connectorType, injectedProvider, isConnected, signMessageAsync]);

  const verifyWalletSignature = useCallback(async (
    attemptId: string, noncePayload: NoncePayload, signature: string,
  ): Promise<WalletLoginResult> => {
    if (verifyLockRef.current) throw new Error('Đang xác thực. Vui lòng chờ.');
    verifyLockRef.current = true;
    setBasePhase('verifying');
    setError(null);

    try {
      const payload = await verifyWalletLoginSignature({
        address: connectedAddress ?? '',
        nonce: noncePayload.nonce,
        message: noncePayload.message,
        signature,
      });

      if (activeAttemptIdRef.current !== attemptId) throw new Error('Tài khoản đã thay đổi.');

      await completeSupabaseWalletSession(payload.token_hash);

      // Update last_login_platform
      await supabase.from('profiles').update({ last_login_platform: 'FUN Profile' }).eq('id', payload.user_id);

      clearTransientState('manual');
      setBasePhase('authenticated');

      return { user_id: payload.user_id, isNewUser: payload.isNewUser };
    } catch (verifyError) {
      const parsed = classifyWalletError(verifyError);
      setError({ ...parsed, recoverable: true });
      setBasePhase('error');
      throw verifyError;
    } finally {
      verifyLockRef.current = false;
    }
  }, [clearTransientState, connectedAddress]);

  const startWalletLoginFlow = useCallback(async (): Promise<WalletLoginResult> => {
    if (!connectedAddress || !isConnected) throw new Error('Vui lòng kết nối ví trước.');
    if (signLockRef.current || effectivePhase === 'signing_pending_wallet') {
      setPendingRequestDetected(true);
      setBasePhase('signing_pending_wallet');
      throw new Error('Yêu cầu ký đang chờ xử lý trong ví.');
    }

    const chainOk = await ensureSupportedChain();
    if (!chainOk) throw new Error('Vui lòng chuyển sang đúng mạng.');

    const attemptId = makeAttemptId();
    activeAttemptIdRef.current = attemptId;
    setError(null);

    try {
      const noncePayload = await requestNonce();
      const signature = await signNonceMessage(attemptId, noncePayload);
      return await verifyWalletSignature(attemptId, noncePayload, signature);
    } catch (flowError) {
      if (!mountedRef.current) throw flowError;
      const parsed = classifyWalletError(flowError);
      if (parsed.code !== 'pending_request') {
        setError({ ...parsed, recoverable: true });
        if (parsed.code !== 'wrong_chain') setBasePhase('error');
      }
      throw flowError;
    }
  }, [connectedAddress, effectivePhase, ensureSupportedChain, isConnected, requestNonce, signNonceMessage, verifyWalletSignature]);

  const retryCurrentStep = useCallback(async () => {
    if (signLockRef.current || effectivePhase === 'signing_pending_wallet') {
      setPendingRequestDetected(true);
      setBasePhase('signing_pending_wallet');
      throw new Error('Yêu cầu ký đang chờ xử lý trong ví.');
    }
    if (effectivePhase === 'verifying' && nonceRef.current && signatureRef.current && activeAttemptIdRef.current) {
      return verifyWalletSignature(activeAttemptIdRef.current, nonceRef.current, signatureRef.current);
    }
    resetWalletAuthFlow('retry');
    return startWalletLoginFlow();
  }, [effectivePhase, resetWalletAuthFlow, startWalletLoginFlow, verifyWalletSignature]);

  const resumePendingFlowCheck = useCallback(async () => {
    if (effectivePhase === 'verifying' && nonceRef.current && signatureRef.current && activeAttemptIdRef.current) {
      return verifyWalletSignature(activeAttemptIdRef.current, nonceRef.current, signatureRef.current);
    }
    if (['signing', 'signing_pending_wallet'].includes(effectivePhase) || pendingRequestDetected) {
      setWasBackgroundedDuringSign(true);
      return null;
    }
    return null;
  }, [effectivePhase, pendingRequestDetected, verifyWalletSignature]);

  const disconnectWallet = useCallback(async () => {
    if (authMode === 'injected_mobile_browser') {
      setInjectedAddress(null);
      setInjectedChainId(null);
    }
    resetWalletAuthFlow('disconnect');
    await fullWalletDisconnect(disconnect);
  }, [authMode, disconnect, resetWalletAuthFlow]);

  const switchWalletAccount = useCallback(async () => {
    setIsSwitchingWallet(true);
    resetWalletAuthFlow('switch_wallet');
    clearWalletLocalStorage();
    try {
      const result = await requestWalletSwitch(connectedAddress);
      if (authMode === 'injected_mobile_browser') await syncInjectedState(false);
      return result;
    } finally {
      setIsSwitchingWallet(false);
    }
  }, [authMode, connectedAddress, resetWalletAuthFlow, syncInjectedState]);

  return {
    authMode,
    isConnected,
    connectedAddress,
    connectorType,
    chainId: effectiveChainId,
    isSupportedChain: isSupportedAuthChain(effectiveChainId),
    phase: effectivePhase,
    error,
    isSigning: signLockRef.current || wagmiSigning,
    isVerifying: verifyLockRef.current,
    isSwitchingWallet,
    isSwitchingChain: authMode === 'wallet_modal_or_walletconnect' ? isSwitchingChain : false,
    pendingRequestDetected,
    wasBackgroundedDuringSign,
    connectWallet,
    beginWalletConnectSession,
    cancelWalletConnectSession,
    ensureSupportedChain,
    startWalletLoginFlow,
    retryCurrentStep,
    resumePendingFlowCheck,
    switchWalletAccount,
    resetWalletAuthFlow,
    disconnectWallet,
  };
}
