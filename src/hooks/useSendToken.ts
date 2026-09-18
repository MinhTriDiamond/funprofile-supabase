import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, useSendTransaction, useSwitchChain, useChainId } from 'wagmi';
import { parseEther } from 'viem';
import { usePublicClient } from 'wagmi';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { encodeERC20Transfer } from '@/lib/erc20';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import { validateEvmAddress } from '@/utils/walletValidation';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { openWalletAppForSigning, getReturnToAppUrl, nudgeReturnToApp } from '@/utils/mobileWalletDeepLink';
import { isMobileDevice, isInjectedMobileBrowser } from '@/utils/mobileWalletConnect';
import { useDisconnect, useConnect } from 'wagmi';
import type { WalletToken } from '@/lib/tokens';
import logger from '@/lib/logger';

export type TxStep = 'idle' | 'signing' | 'broadcasted' | 'confirming' | 'finalizing' | 'success' | 'timeout';

interface SendTokenParams {
  token: WalletToken;
  recipient: string;
  amount: string;
  /** Khi true: return hash ngay, không chạy background polling/DB/toast. Dùng cho multi-send. */
  skipBackground?: boolean;
  /** Chain mong muốn để gửi. Nếu khác chainId hiện tại → tự switch trước khi gửi. */
  targetChainId?: number;
}

const DB_TIMEOUT_MS = 8_000;
const RECEIPT_TIMEOUT_MS = 60_000;
// Mobile: 45s đủ để user mở ví và xác nhận, tránh cảm giác app treo.
// Desktop: 75s vì user thường nhìn extension popup chậm hơn.
const SIGN_TIMEOUT_MS_MOBILE = 45_000;
const SIGN_TIMEOUT_MS_DESKTOP = 75_000;
const SWITCH_CHAIN_TIMEOUT_MS = 20_000;

// ── Chống gửi trùng 30s — sự cố 04/06/2026 mất 1.5 BNB vì double-submit ──
// Xem mem://policy/duplicate-send-guard-30s
const DUPLICATE_WINDOW_MS = 30_000;
const recentSendMap = new Map<string, number>();
function dupKey(recipient: string, symbol: string, amount: string) {
  return `${recipient.toLowerCase()}|${symbol.toUpperCase()}|${amount}`;
}

/** Bọc promise với timeout — không block UI */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}

export function useSendToken() {
  const { address: providerAddress, isConnected, chainId, connector } = useAccount();
  const { activeAddress, accounts } = useActiveAccount();
  const { sendTransactionAsync, isPending: wagmiPending, reset: wagmiReset } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const { disconnectAsync } = useDisconnect();
  const { connectAsync, connectors } = useConnect();
  const currentChainId = useChainId();
  const publicClient = usePublicClient();

  const [txStep, setTxStep] = useState<TxStep>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ── Cancellation flag for background tasks ──
  const bgCancelRef = useRef(0);
  // ── Lưu lại request gần nhất để có thể "Mở lại ví" ──
  const lastDeepLinkRef = useRef<{ connectorId?: string; connectorName?: string } | null>(null);

  const resetState = useCallback(() => {
    // Cancel any in-flight background tasks
    bgCancelRef.current += 1;
    setTxStep('idle');
    setTxHash(null);
    setIsProcessing(false);
    // Force wagmi to clear its stuck pending state
    try { wagmiReset(); } catch {}
  }, [wagmiReset]);

  // ── Safety timeout: if wagmiPending stuck > 10s while txStep is idle, auto-reset ──
  useEffect(() => {
    if (wagmiPending && txStep === 'idle') {
      const timer = setTimeout(() => {
        logger.debug('[SEND] Safety: wagmiPending stuck while idle, forcing reset');
        try { wagmiReset(); } catch {}
      }, 10_000);
      return () => clearTimeout(timer);
    }
  }, [wagmiPending, txStep, wagmiReset]);

  /** Kiểm tra lại receipt khi timeout */
  const recheckReceipt = useCallback(async () => {
    if (!txHash || !publicClient) return;
    setTxStep('confirming');
    try {
      const receipt = await withTimeout(
        publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}`, confirmations: 1 }),
        RECEIPT_TIMEOUT_MS,
        'RECHECK_RECEIPT',
      );
      if (receipt.status === 'success') {
        setTxStep('success');
        toast.success('Giao dịch đã được xác nhận thành công!');
      } else {
        toast.error('Giao dịch chưa hoàn tất (reverted). Vui lòng thử lại.');
        resetState();
      }
    } catch {
      setTxStep('timeout');
      toast('Chưa nhận được xác nhận. Vui lòng kiểm tra trên BscScan.');
    }
  }, [txHash, publicClient, resetState]);

  /** Mobile only — cho user "Mở lại ví" nếu lỡ tay swipe */
  const reopenWalletApp = useCallback(() => {
    if (!isMobileDevice() || isInjectedMobileBrowser()) {
      toast.info('Hãy mở app ví của bạn để xác nhận giao dịch.');
      return;
    }
    const opened = openWalletAppForSigning({
      connectorId: lastDeepLinkRef.current?.connectorId,
      connectorName: lastDeepLinkRef.current?.connectorName,
    });
    if (!opened) {
      toast.info('Hãy mở app ví đã kết nối để xác nhận giao dịch.');
    }
  }, []);

  const sendToken = async (params: SendTokenParams): Promise<string | null> => {
    const { token, recipient, amount, skipBackground = false, targetChainId } = params;
    const senderAddress = activeAddress || providerAddress;

    // --- Validation ---
    if (!isConnected || !senderAddress) {
      toast.error('Vui lòng kết nối ví trước');
      return null;
    }
    if (activeAddress && accounts.length > 0 && !accounts.includes(activeAddress.toLowerCase())) {
      toast.error('Tài khoản cần được xác minh lại. Vui lòng kết nối lại.');
      return null;
    }
    if (activeAddress && providerAddress && activeAddress.toLowerCase() !== providerAddress.toLowerCase()) {
      toast.error('Tài khoản trong ví khác với tài khoản đang chọn. Vui lòng đồng bộ trước khi gửi.');
      return null;
    }
    if (!validateEvmAddress(recipient)) return null;
    if (recipient.toLowerCase() === senderAddress.toLowerCase()) {
      toast.error('Vui lòng nhập địa chỉ người nhận khác');
      return null;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Số lượng chưa hợp lệ');
      return null;
    }

    // --- Chống gửi trùng 30s (cùng ví nhận + cùng token + cùng số tiền) ---
    const dKey = dupKey(recipient, token.symbol, amount);
    const lastTs = recentSendMap.get(dKey);
    if (lastTs && Date.now() - lastTs < DUPLICATE_WINDOW_MS) {
      const wait = Math.ceil((DUPLICATE_WINDOW_MS - (Date.now() - lastTs)) / 1000);
      toast.error(
        `Cha vừa gửi ${amount} ${token.symbol} cho ví này cách đây vài giây rồi ạ. Để tránh chuyển trùng, hệ thống tạm khoá ${wait}s. Nếu muốn gửi tiếp, hãy đổi số tiền hoặc đợi ${wait} giây nữa nhé.`,
        { duration: 7000 },
      );
      return null;
    }
    // DB guard: chống F5/2 tab gửi cùng số trong 30s
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const sinceIso = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
        const { data: dupRows } = await supabase
          .from('transactions')
          .select('tx_hash, created_at')
          .eq('user_id', session.user.id)
          .eq('to_address', recipient.toLowerCase())
          .eq('token_symbol', token.symbol)
          .eq('amount', amount)
          .gte('created_at', sinceIso)
          .limit(1);
        if (dupRows && dupRows.length > 0) {
          toast.error(
            `Hệ thống ghi nhận Cha vừa gửi ${amount} ${token.symbol} cho ví này cách đây <30s rồi ạ. Vui lòng đợi hết 30 giây hoặc đổi số tiền để tránh chuyển trùng.`,
            { duration: 7000 },
          );
          recentSendMap.set(dKey, Date.now());
          return null;
        }
      }
    } catch {
      // Nếu query DB lỗi → vẫn cho gửi nhưng giữ in-memory guard
    }

    // --- Begin send flow ---
    setIsProcessing(true);
    setTxHash(null);
    let hash: string | null = null;


    // Capture current cancel token for this send
    const cancelToken = bgCancelRef.current;

    // Lưu connector để có thể "Mở lại ví"
    lastDeepLinkRef.current = {
      connectorId: connector?.id,
      connectorName: connector?.name,
    };

    try {
      // Step 0: Auto-switch chain nếu cần (in-flow để user thấy progress thay vì chờ ngầm)
      const desiredChain = targetChainId ?? currentChainId;
      if (targetChainId && currentChainId && targetChainId !== currentChainId) {
        logger.debug('[SEND] SWITCH_CHAIN', { from: currentChainId, to: targetChainId });
        setTxStep('signing'); // Ví bật prompt switch chain — coi như đã bắt đầu signing
        try {
          await withTimeout(
            switchChainAsync({ chainId: targetChainId }),
            SWITCH_CHAIN_TIMEOUT_MS,
            'SWITCH_CHAIN',
          );
        } catch (switchErr: any) {
          const msg = switchErr?.message || '';
          if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
            toast.error('Bạn đã huỷ yêu cầu chuyển mạng');
          } else if (msg.includes('timeout')) {
            toast.error('Ví không phản hồi yêu cầu chuyển mạng. Hãy mở ví và chọn mạng phù hợp.');
          } else {
            toast.error('Không chuyển được mạng. Hãy chuyển thủ công trong ví rồi thử lại.');
          }
          resetState();
          return null;
        }
      }

      // Step 1: Signing
      logger.debug('[SEND] SIGN_REQUESTED');
      setTxStep('signing');
      (window as any).__TX_IN_PROGRESS__ = true;

      const isMobileWC = isMobileDevice() && !isInjectedMobileBrowser();
      if (isMobileWC) {
        // Mở app ví NGAY LẬP TỨC — bỏ delay 250ms để user thấy phản hồi tức thì
        openWalletAppForSigning({
          connectorId: connector?.id,
          connectorName: connector?.name,
        });
      }

      const signPromise = !token.address
        ? sendTransactionAsync({
            to: recipient as `0x${string}`,
            value: parseEther(amount),
          })
        : sendTransactionAsync({
            to: token.address,
            data: encodeERC20Transfer(recipient as `0x${string}`, amount, token.decimals),
          });

      const signTimeout = isMobileWC ? SIGN_TIMEOUT_MS_MOBILE : SIGN_TIMEOUT_MS_DESKTOP;
      hash = await withTimeout(signPromise, signTimeout, 'SIGN_REQUEST');

      // Step 2: Broadcasted — return hash IMMEDIATELY
      logger.debug('[SEND] TX_HASH_RECEIVED:', hash);
      setTxHash(hash);
      setTxStep('broadcasted');

      // Ghi nhận lần gửi thành công vào guard (chỉ khi đã có hash on-chain)
      recentSendMap.set(dKey, Date.now());
      // Don dep cache theo thời gian — tránh phình memory
      if (recentSendMap.size > 200) {
        const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
        for (const [k, ts] of recentSendMap) if (ts < cutoff) recentSendMap.delete(k);
      }

      // Best-effort: kéo focus về tab dApp NGAY sau khi có hash.
      // Trên Android Chrome việc này giúp tab thoát throttle để useEffect kịp đồng bộ
      // giftTx context, tránh tình trạng kẹt "Đang chờ mạng xác nhận".
      if (isMobileWC) {
        nudgeReturnToApp();
      }

      // skipBackground: dùng cho multi-send — caller tự quản lý receipt + DB
      if (skipBackground) {
        return hash;
      }

      // Background: receipt polling + DB insert (non-blocking)
      (async () => {
        // Check if this task was cancelled
        const isCancelled = () => bgCancelRef.current !== cancelToken;

        let receiptOk = false;
        try {
          if (publicClient && hash) {
            logger.debug('[SEND] WAIT_RECEIPT_START (background)');
            if (!isCancelled()) setTxStep('confirming');
            const receipt = await withTimeout(
              publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}`, confirmations: 1 }),
              RECEIPT_TIMEOUT_MS,
              'WAIT_RECEIPT',
            );
            logger.debug('[SEND] RECEIPT_RECEIVED:', receipt.status);
            if (receipt.status === 'reverted') {
              if (!isCancelled()) {
                toast.error('Giao dịch chưa hoàn tất (reverted).');
                setTxStep('idle');
              }
              return;
            }
            receiptOk = true;
          }
        } catch (receiptErr: any) {
          logger.debug('[SEND] RECEIPT_TIMEOUT_OR_ERROR:', receiptErr?.message);
        }

        // If cancelled (dialog closed/reopened), skip all state updates
        if (isCancelled()) {
          logger.debug('[SEND] Background task cancelled, skipping state updates');
          return;
        }

        // DB insert
        try {
          logger.debug('[SEND] DB_LOG_START (background)');
          if (!isCancelled()) setTxStep('finalizing');
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && hash && !isCancelled()) {
            await withTimeout(
              Promise.resolve(supabase.from('transactions').insert({
                user_id: session.user.id,
                tx_hash: hash,
                from_address: senderAddress,
                to_address: recipient,
                amount: amount,
                token_symbol: token.symbol,
                token_address: token.address,
                chain_id: chainId || 56,
                status: receiptOk ? 'confirmed' : 'pending',
              })),
              DB_TIMEOUT_MS,
              'DB_INSERT',
            );
            logger.debug('[SEND] DB_LOG_DONE');
            // Báo cho HistoryTab + useBtcTransactions refetch ngay
            try { window.dispatchEvent(new Event('wallet-transactions-updated')); } catch {}
          }
        } catch (dbErr: any) {
          logger.debug('[SEND] DB_LOG_SKIPPED:', dbErr?.message);
        }

        // Final state — only if not cancelled
        if (isCancelled()) return;

        if (receiptOk) {
          setTxStep('success');
          const scanUrl = getBscScanTxUrl(hash!, token.symbol);
          const isMobileWCFlow = isMobileDevice() && !isInjectedMobileBrowser();
          // Best-effort: kéo focus quay lại tab dApp khi user vẫn ở app ví
          nudgeReturnToApp();
          toast.success('Giao dịch đã được xác nhận thành công!', {
            duration: isMobileWCFlow ? 10000 : 5000,
            action: isMobileWCFlow
              ? {
                  label: '↩ Quay lại FUN',
                  onClick: () => { window.location.href = getReturnToAppUrl(); },
                }
              : { label: 'BscScan', onClick: () => window.open(scanUrl, '_blank') },
          });
        } else {
          setTxStep('timeout');
          const scanUrl = getBscScanTxUrl(hash!, token.symbol);
          toast('Giao dịch đã được gửi. Chưa nhận xác nhận kịp thời.', {
            action: { label: 'BscScan', onClick: () => window.open(scanUrl, '_blank') },
            duration: 8000,
          });
        }
      })();

      return hash;
    } catch (error: any) {
      logger.debug('[SEND] ERROR:', error?.message);
      const msg: string = error?.message || '';
      if (msg.includes('SIGN_REQUEST timeout')) {
        toast.error('Ví không phản hồi. Hãy mở app ví và xác nhận, hoặc thử lại.', {
          duration: 8000,
          action: {
            label: 'Mở lại ví',
            onClick: () => openWalletAppForSigning({
              connectorId: lastDeepLinkRef.current?.connectorId,
              connectorName: lastDeepLinkRef.current?.connectorName,
            }),
          },
        });
      } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        toast.error('Bạn đã huỷ giao dịch');
      } else if (msg.toLowerCase().includes('insufficient')) {
        toast.error('Cần thêm BNB để trả phí gas');
      } else if (
        msg.includes('Connection request reset') ||
        msg.includes('Session expired') ||
        msg.includes('No matching key') ||
        msg.toLowerCase().includes('session topic') ||
        msg.toLowerCase().includes('expired')
      ) {
        // Auto-reconnect WalletConnect: phiên đã chết → disconnect + connect lại cùng connector
        const isWC = (connector?.id || '').toLowerCase().includes('walletconnect') ||
                     (connector?.name || '').toLowerCase().includes('walletconnect');
        if (isWC && connector) {
          toast.loading('Phiên ví đã hết hạn — đang kết nối lại…', { id: 'wc-reconnect' });
          try {
            await disconnectAsync().catch(() => {});
            const wcConnector = connectors.find((c) => c.id === connector.id) || connector;
            await connectAsync({ connector: wcConnector });
            toast.success('Đã kết nối lại ví. Vui lòng bấm "Gửi" lần nữa.', { id: 'wc-reconnect' });
          } catch {
            toast.error('Không tự kết nối lại được. Vui lòng kết nối ví thủ công.', { id: 'wc-reconnect' });
          }
        } else {
          toast.error('Phiên ví đã hết hạn. Vui lòng kết nối lại ví.');
        }
      } else {
        toast.error(error?.shortMessage || msg || 'Mạng đang bận, vui lòng thử lại sau');
      }
      resetState();
      return null;
    } finally {
      logger.debug('[SEND] FLOW_FINALLY');
      (window as any).__TX_IN_PROGRESS__ = false;
      setIsProcessing(false);
    }
  };

  // Compute isPending: wagmiPending should be overridden if txStep moved past signing
  const effectivePending = isProcessing || (wagmiPending && txStep === 'signing');

  return {
    sendToken,
    txStep,
    txHash,
    isPending: effectivePending,
    recheckReceipt,
    resetState,
    reopenWalletApp,
  };
}
