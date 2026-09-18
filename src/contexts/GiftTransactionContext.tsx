/**
 * GiftTransactionContext — store trạng thái giao dịch tặng đang chạy,
 * để hiển thị `<GiftStatusFloatingBar />` ở Profile / Wallet kể cả khi dialog đã đóng
 * hoặc user vừa quay lại từ app ví.
 *
 * Persist sang sessionStorage để sống qua reload nhẹ trên mobile (Safari hay throw tab
 * khi switch sang MetaMask DApp browser).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPublicClient, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

export type GiftTxStep =
  | 'idle'
  | 'connecting'
  | 'signing'
  | 'broadcasted'
  | 'confirming'
  | 'finalizing'
  | 'success'
  | 'error';

export interface GiftTxState {
  id: string;
  step: GiftTxStep;
  recipientUsername?: string;
  recipientAvatarUrl?: string | null;
  recipientId?: string;
  tokenSymbol: string;
  amount: string;
  chainId?: number;
  txHash?: string | null;
  scanUrl?: string | null;
  errorTitle?: string;
  errorDescription?: string;
  startedAt: number;
  updatedAt: number;
}

interface ContextValue {
  current: GiftTxState | null;
  start: (payload: Omit<GiftTxState, 'id' | 'step' | 'startedAt' | 'updatedAt'> & { step?: GiftTxStep; id?: string }) => string;
  update: (patch: Partial<Omit<GiftTxState, 'id' | 'startedAt'>>) => void;
  finishSuccess: (txHash: string, scanUrl?: string | null) => void;
  finishError: (errorTitle: string, errorDescription?: string) => void;
  dismiss: () => void;
}

const GiftTransactionContext = createContext<ContextValue | null>(null);
const STORAGE_KEY = 'fun.giftTxState';

function loadFromStorage(): GiftTxState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GiftTxState;
    // Bỏ trạng thái đã xong/quá cũ (>15 phút)
    if (!parsed?.startedAt || Date.now() - parsed.startedAt > 15 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function GiftTransactionProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<GiftTxState | null>(() =>
    typeof window === 'undefined' ? null : loadFromStorage(),
  );
  const autoHideTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      if (current) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [current]);

  // Auto-hide khi success sau 6s
  useEffect(() => {
    if (autoHideTimer.current) {
      window.clearTimeout(autoHideTimer.current);
      autoHideTimer.current = null;
    }
    if (current?.step === 'success') {
      autoHideTimer.current = window.setTimeout(() => setCurrent(null), 3000);
    }
    return () => {
      if (autoHideTimer.current) window.clearTimeout(autoHideTimer.current);
    };
  }, [current?.step, current?.id]);

  // ── Self-resolve: poll on-chain để tự cập nhật success kể cả khi không component nào push update.
  //    Ngăn "kẹt broadcasted" trên Android khi tab bị throttle hoặc dialog đóng giữa flow.
  useEffect(() => {
    if (!current || !current.txHash) return;
    if (current.step !== 'broadcasted' && current.step !== 'confirming' && current.step !== 'finalizing') return;

    const chain = current.chainId === 97 ? bscTestnet : bsc;
    const client = createPublicClient({ chain, transport: http() });
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const receipt = await client.getTransactionReceipt({ hash: current.txHash as `0x${string}` });
        if (cancelled || !receipt) return;
        if (receipt.status === 'success') {
          setCurrent(prev => (prev && prev.id === current.id ? { ...prev, step: 'success', updatedAt: Date.now() } : prev));
        } else if (receipt.status === 'reverted') {
          setCurrent(prev => (prev && prev.id === current.id ? { ...prev, step: 'error', errorTitle: 'Giao dịch bị revert', updatedAt: Date.now() } : prev));
        }
      } catch {
        // Tx chưa được mine — bỏ qua, lần poll sau thử lại
      }
    };

    // Poll ngay + định kỳ 8s
    tick();
    const interval = window.setInterval(tick, 8000);

    // Auto-timeout 180s: nếu vẫn chưa success → giữ trạng thái "đang xác nhận" (KHÔNG flip đỏ
     // khi đã có txHash). Chỉ flip 'error' khi thật sự không có hash sau ngần đó thời gian.
    const elapsed = Date.now() - current.startedAt;
    const remaining = Math.max(0, 180_000 - elapsed);
    const timeout = window.setTimeout(() => {
      setCurrent(prev => {
        if (!prev || prev.id !== current.id) return prev;
        if (prev.step === 'success' || prev.step === 'error') return prev;
        if (prev.txHash) {
          // Đã có hash trên-chain — giữ trạng thái finalizing xanh, không báo đỏ.
          return { ...prev, step: 'finalizing', updatedAt: Date.now() };
        }
        return {
          ...prev,
          step: 'error',
          errorTitle: 'Chưa nhận được hash giao dịch',
          errorDescription: 'Vui lòng kiểm tra ví hoặc thử lại.',
          updatedAt: Date.now(),
        };
      });
    }, remaining);

    // Khi tab visible trở lại (Android quay về từ MetaMask), force tick ngay
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [current?.id, current?.txHash, current?.step, current?.chainId, current?.startedAt]);


  const start: ContextValue['start'] = useCallback((payload) => {
    const id = payload.id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`);
    const next: GiftTxState = {
      id,
      step: payload.step ?? 'connecting',
      recipientUsername: payload.recipientUsername,
      recipientAvatarUrl: payload.recipientAvatarUrl ?? null,
      recipientId: payload.recipientId,
      tokenSymbol: payload.tokenSymbol,
      amount: payload.amount,
      chainId: payload.chainId,
      txHash: payload.txHash ?? null,
      scanUrl: payload.scanUrl ?? null,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    setCurrent(next);
    return id;
  }, []);

  const update: ContextValue['update'] = useCallback((patch) => {
    setCurrent(prev => (prev ? { ...prev, ...patch, updatedAt: Date.now() } : prev));
  }, []);

  const finishSuccess: ContextValue['finishSuccess'] = useCallback((txHash, scanUrl) => {
    setCurrent(prev => (prev ? { ...prev, step: 'success', txHash, scanUrl: scanUrl ?? prev.scanUrl ?? null, updatedAt: Date.now() } : prev));
  }, []);

  const finishError: ContextValue['finishError'] = useCallback((errorTitle, errorDescription) => {
    setCurrent(prev => (prev ? { ...prev, step: 'error', errorTitle, errorDescription, updatedAt: Date.now() } : prev));
  }, []);

  const dismiss = useCallback(() => setCurrent(null), []);

  const value = useMemo<ContextValue>(
    () => ({ current, start, update, finishSuccess, finishError, dismiss }),
    [current, start, update, finishSuccess, finishError, dismiss],
  );

  return <GiftTransactionContext.Provider value={value}>{children}</GiftTransactionContext.Provider>;
}

export function useGiftTransaction(): ContextValue {
  const ctx = useContext(GiftTransactionContext);
  if (!ctx) {
    // Provider không bắt buộc — trả về no-op để component dùng được ở bất kỳ đâu
    return {
      current: null,
      start: () => '',
      update: () => {},
      finishSuccess: () => {},
      finishError: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
}
