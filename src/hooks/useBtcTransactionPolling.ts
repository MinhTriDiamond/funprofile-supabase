import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchBtcManualConfirmEnabled } from './useBtcManualConfirmFlag';


export interface BtcPollingResult {
  status: 'idle' | 'polling' | 'found' | 'timeout';
  txid: string | null;
  confirmed: boolean;
}

const POLL_INTERVAL = 12_000;      // 12s
const TIMEOUT = 20 * 60_000;        // 20 minutes
const TIME_WINDOW_BEFORE = 30 * 60; // chấp nhận tx có block_time trong vòng 30' trước khi bật polling

interface VoutLike {
  scriptpubkey_address?: string;
  value?: number;
}
interface TxLike {
  txid: string;
  vout?: VoutLike[];
  status?: { confirmed?: boolean; block_time?: number };
  firstSeen?: number;
}

async function fetchMempool(addr: string): Promise<TxLike[]> {
  try {
    const r = await fetch(`https://mempool.space/api/address/${addr}/txs`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchBlockstream(addr: string): Promise<TxLike[]> {
  try {
    const r = await fetch(`https://blockstream.info/api/address/${addr}/txs`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchAllTxs(addr: string): Promise<TxLike[]> {
  const [a, b] = await Promise.all([fetchMempool(addr), fetchBlockstream(addr)]);
  const map = new Map<string, TxLike>();
  for (const tx of [...a, ...b]) {
    if (!map.has(tx.txid)) map.set(tx.txid, tx);
  }
  return Array.from(map.values());
}

export function useBtcTransactionPolling(
  recipientBtcAddress: string | null | undefined,
  expectedAmountBtc: number,
  enabled: boolean,
) {
  const [result, setResult] = useState<BtcPollingResult>({ status: 'idle', txid: null, confirmed: false });
  const baselineTxidsRef = useRef<Set<string>>(new Set());
  const startTimeRef = useRef<number>(0);
  const startTimeSecRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  }, []);

  /**
   * markManualSend — ĐANG TẠM KHOÁ (P0).
   * Chỉ chạy khi `app_settings.btc_manual_confirm_enabled = true`
   * (đọc qua RPC `btc_manual_confirm_enabled`). Không xoá hàm để dễ mở lại.
   * Trả về true nếu ghi nhận thủ công được cho phép, false nếu bị chặn.
   */
  const markManualSend = useCallback(async (): Promise<boolean> => {
    const allowed = await fetchBtcManualConfirmEnabled();
    if (!allowed) {
      console.warn('[useBtcTransactionPolling] manual confirm bị khoá bởi feature flag');
      return false;
    }
    stop();
    const manualHash = `btc-manual-${Date.now()}`;
    setResult({ status: 'found', txid: manualHash, confirmed: false });
    return true;
  }, [stop]);


  useEffect(() => {
    if (!enabled || !recipientBtcAddress) {
      setResult({ status: 'idle', txid: null, confirmed: false });
      return;
    }

    let cancelled = false;
    startTimeRef.current = Date.now();
    startTimeSecRef.current = Math.floor(Date.now() / 1000);
    // Reset baseline mỗi lần bật để tránh kẹt giữa các lần gửi
    baselineTxidsRef.current = new Set<string>();

    const expectedSat = Math.round((expectedAmountBtc || 0) * 1e8);

    const matchTx = (tx: TxLike): boolean => {
      const outs = tx.vout || [];
      // Tổng giá trị output gửi tới recipient (1 tx có thể có nhiều vout cùng addr)
      let totalSat = 0;
      for (const o of outs) {
        if (o.scriptpubkey_address === recipientBtcAddress) totalSat += o.value || 0;
      }
      if (totalSat <= 0) return false;
      // Nếu biết amount mong đợi → so khớp tuyệt đối (sai số 2 sat cho phép phí round)
      if (expectedSat > 0 && Math.abs(totalSat - expectedSat) > 2) return false;

      // Tx phải "mới" — chưa confirmed (mempool) HOẶC block_time >= startTime - 30'
      const confirmed = !!tx.status?.confirmed;
      if (!confirmed) return true;
      const bt = tx.status?.block_time || 0;
      return bt >= startTimeSecRef.current - TIME_WINDOW_BEFORE;
    };

    const tick = async () => {
      if (cancelled) return;

      if (Date.now() - startTimeRef.current > TIMEOUT) {
        stop();
        setResult((prev) => (prev.status === 'found' ? prev : { status: 'timeout', txid: null, confirmed: false }));
        return;
      }

      const txs = await fetchAllTxs(recipientBtcAddress);

      // Lần đầu chạy: ghi nhận txid đã có nhưng KHÔNG match (cũ) — chỉ dùng làm tie-breaker phụ
      const isFirstScan = baselineTxidsRef.current.size === 0;

      let candidate: TxLike | null = null;
      for (const tx of txs) {
        if (matchTx(tx)) {
          // Ưu tiên tx chưa từng thấy trong baseline → tránh nhầm tx cũ giống amount
          if (!baselineTxidsRef.current.has(tx.txid) || isFirstScan === false) {
            candidate = tx;
            break;
          }
        }
      }

      if (isFirstScan) {
        // Sau lần đầu: lưu mọi txid cũ vào baseline cho lần sau (nhưng vẫn cho phép match nếu thấy đúng amount + time window)
        for (const tx of txs) baselineTxidsRef.current.add(tx.txid);
      }

      if (candidate) {
        stop();
        setResult({
          status: 'found',
          txid: candidate.txid,
          confirmed: !!candidate.status?.confirmed,
        });
      }
    };

    setResult({ status: 'polling', txid: null, confirmed: false });
    // Quét ngay 1 lần, rồi đặt interval
    tick();
    intervalRef.current = setInterval(tick, POLL_INTERVAL);

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, recipientBtcAddress, expectedAmountBtc, stop]);

  return { ...result, stop, markManualSend };
}
