import { useState, useEffect, useCallback, useMemo } from 'react';

export interface BtcTransaction {
  txid: string;
  type: 'sent' | 'received';
  amount: number; // in BTC — số lượng thực gửi cho đối tác (sent) hoặc nhận về (received)
  timestamp: number; // unix seconds
  confirmed: boolean;
  blockHeight?: number;
}

export function useBtcTransactions(btcAddress: string | null | undefined) {
  const [transactions, setTransactions] = useState<BtcTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTxs = useCallback(async () => {
    if (!btcAddress) { setTransactions([]); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`https://mempool.space/api/address/${btcAddress}/txs`);
      if (!res.ok) throw new Error(`Mempool API error: ${res.status}`);
      const data = await res.json();

      const parsed: BtcTransaction[] = (data as any[]).slice(0, 50).map((tx: any) => {
        // Tính tổng input/output thuộc về địa chỉ này
        let inputSum = 0;
        let outputSum = 0;
        // Tổng output gửi tới địa chỉ KHÁC (= số thực gửi cho đối tác)
        let outputToOthers = 0;
        // Tổng output gửi tới địa chỉ này (= số thực nhận về)
        let outputToSelf = 0;

        for (const vin of tx.vin || []) {
          if (vin.prevout?.scriptpubkey_address === btcAddress) {
            inputSum += vin.prevout.value || 0;
          }
        }
        for (const vout of tx.vout || []) {
          const v = vout.value || 0;
          if (vout.scriptpubkey_address === btcAddress) {
            outputSum += v;
            outputToSelf += v;
          } else {
            outputToOthers += v;
          }
        }

        const net = outputSum - inputSum; // > 0 = nhận, < 0 = gửi
        const isSent = inputSum > 0 && net < 0;

        // Khi gửi: số thật chuyển đi = tổng vout đến địa chỉ khác (không tính change về lại sender)
        // Khi nhận: số thật nhận = vout đến địa chỉ này (trường hợp tx có cả input của ta thì lấy net dương)
        const realAmountSat = isSent
          ? outputToOthers
          : (net > 0 ? net : outputToSelf);

        return {
          txid: tx.txid,
          type: isSent ? 'sent' : 'received',
          amount: realAmountSat / 1e8,
          timestamp: tx.status?.block_time || Math.floor(Date.now() / 1000),
          confirmed: !!tx.status?.confirmed,
          blockHeight: tx.status?.block_height,
        } as BtcTransaction;
      });

      setTransactions(parsed);
    } catch (err) {
      console.error('[useBtcTransactions] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [btcAddress]);

  useEffect(() => { fetchTxs(); }, [fetchTxs]);

  // Listen for transaction updates dispatched after sends
  useEffect(() => {
    const handler = () => { fetchTxs(); };
    window.addEventListener('wallet-transactions-updated', handler);
    return () => window.removeEventListener('wallet-transactions-updated', handler);
  }, [fetchTxs]);

  // Derived stats: tổng nhận / gửi & số lượng giao dịch theo chiều
  const stats = useMemo(() => {
    let totalReceived = 0;
    let totalSent = 0;
    let receivedCount = 0;
    let sentCount = 0;
    for (const tx of transactions) {
      if (tx.type === 'received') {
        totalReceived += tx.amount;
        receivedCount += 1;
      } else {
        totalSent += tx.amount;
        sentCount += 1;
      }
    }
    return { totalReceived, totalSent, receivedCount, sentCount };
  }, [transactions]);

  return { transactions, isLoading, refetch: fetchTxs, ...stats };
}
