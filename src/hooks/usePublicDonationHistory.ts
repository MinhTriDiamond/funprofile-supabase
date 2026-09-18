import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getGiftTokenLabel } from '@/lib/giftTokenLabel';
import { normalizeAddressForCompare } from "@/lib/btc/addressNormalize";

// [DEPRECATED — Batch 1/1.1] Legacy hook đọc trực tiếp `donations`/`wallet_transfers`/`swap_transactions`.
// Sẽ bị xoá trong Batch 2. Dùng `useUnifiedTransactionHistory({ scope: 'profile', targetUserId })` thay thế.
if (typeof window !== 'undefined' && !(window as unknown as { __warnedPublicDonationHistory?: boolean }).__warnedPublicDonationHistory) {
  console.warn('[DEPRECATED] usePublicDonationHistory — sẽ bị xoá trong Batch 2. Dùng useUnifiedTransactionHistory({scope:"profile",targetUserId}) thay thế.');
  (window as unknown as { __warnedPublicDonationHistory?: boolean }).__warnedPublicDonationHistory = true;
}

export type DonationFilter = 'all' | 'sent' | 'received' | 'swap' | 'transfer';

export interface DonationRecord {
  id: string;
  amount: string;
  token_symbol: string;
  tx_hash: string;
  status: string;
  message: string | null;
  created_at: string;
  chain_id: number;
  sender_id: string | null;
  recipient_id: string | null;
  sender_username: string | null;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  recipient_username: string | null;
  recipient_display_name: string | null;
  recipient_avatar_url: string | null;
  type: 'donation' | 'swap' | 'transfer';
  is_external?: boolean;
  sender_address?: string | null;
  from_symbol?: string;
  to_symbol?: string;
  from_amount?: number;
  to_amount?: number;
  direction?: 'in' | 'out';
  counterparty_address?: string;
}

interface TokenBreakdown {
  [symbol: string]: { amount: number; count: number };
}

export interface DonationSummary {
  received: TokenBreakdown;
  sent: TokenBreakdown;
  receivedCount: number;
  sentCount: number;
  totalCount: number;
}

const PAGE_SIZE = 200;

export function usePublicDonationHistory(userId: string | undefined, userCreatedAt?: string | null) {
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DonationFilter>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [summary, setSummary] = useState<DonationSummary>({ received: {}, sent: {}, receivedCount: 0, sentCount: 0, totalCount: 0 });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  const computeSummaryFromDonations = useCallback((records: DonationRecord[]) => {
    const received: TokenBreakdown = {};
    const sent: TokenBreakdown = {};
    let receivedCount = 0;
    let sentCount = 0;

    for (const d of records) {
      if (d.type === 'swap') {
        // swap FROM = sent, swap TO = received
        const fromSym = getGiftTokenLabel(d.from_symbol || d.token_symbol, d.chain_id);
        const toSym = getGiftTokenLabel(d.to_symbol || d.token_symbol, d.chain_id);
        if (fromSym) {
          if (!sent[fromSym]) sent[fromSym] = { amount: 0, count: 0 };
          sent[fromSym].amount += Number(d.from_amount || d.amount) || 0;
          sent[fromSym].count += 1;
          sentCount++;
        }
        if (toSym) {
          if (!received[toSym]) received[toSym] = { amount: 0, count: 0 };
          received[toSym].amount += Number(d.to_amount || 0);
          received[toSym].count += 1;
          receivedCount++;
        }
      } else if (d.type === 'transfer') {
        const sym = getGiftTokenLabel(d.token_symbol, d.chain_id);
        if (d.direction === 'in') {
          if (!received[sym]) received[sym] = { amount: 0, count: 0 };
          received[sym].amount += Number(d.amount) || 0;
          received[sym].count += 1;
          receivedCount++;
        } else {
          if (!sent[sym]) sent[sym] = { amount: 0, count: 0 };
          sent[sym].amount += Number(d.amount) || 0;
          sent[sym].count += 1;
          sentCount++;
        }
      } else {
        // donation
        const sym = getGiftTokenLabel(d.token_symbol, d.chain_id);
        const amt = Number(d.amount) || 0;
        const isSent = d.sender_id === userId;
        if (isSent) {
          if (!sent[sym]) sent[sym] = { amount: 0, count: 0 };
          sent[sym].amount += amt;
          sent[sym].count += 1;
          sentCount++;
        } else {
          if (!received[sym]) received[sym] = { amount: 0, count: 0 };
          received[sym].amount += amt;
          received[sym].count += 1;
          receivedCount++;
        }
      }
    }

    return { received, sent, receivedCount, sentCount, totalCount: receivedCount + sentCount };
  }, [userId]);

  const updateSummaryFromDonations = useCallback((records: DonationRecord[]) => {
    const computed = computeSummaryFromDonations(records);
    setSummary(computed);
  }, [computeSummaryFromDonations]);

  const fetchSummary = useCallback(async (fromDate?: string | null, toDate?: string | null) => {
    if (!userId) return;
    
    // If date range is active, skip RPC — summary will be computed client-side after fetchDonations
    if (fromDate || toDate) return;
    
    setSummaryLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_user_donation_summary', { p_user_id: userId });
      if (rpcError) throw rpcError;

      const raw = data as any;
      const received: TokenBreakdown = {};
      const sent: TokenBreakdown = {};
      let receivedCount = 0;
      let sentCount = 0;

      if (raw?.received) {
        for (const [sym, val] of Object.entries(raw.received as Record<string, any>)) {
          received[sym] = { amount: Number(val.amount) || 0, count: Number(val.count) || 0 };
          receivedCount += received[sym].count;
        }
      }
      if (raw?.sent) {
        for (const [sym, val] of Object.entries(raw.sent as Record<string, any>)) {
          sent[sym] = { amount: Number(val.amount) || 0, count: Number(val.count) || 0 };
          sentCount += sent[sym].count;
        }
      }

      setSummary({ received, sent, receivedCount, sentCount, totalCount: receivedCount + sentCount });
    } catch (err: any) {
      console.error('fetchSummary error:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, [userId]);

  const fetchDonations = useCallback(async (pageNum = 1, currentFilter: DonationFilter = filter, fromDate?: string | null, toDate?: string | null) => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    try {
      const from = (pageNum - 1) * PAGE_SIZE;
      const to = pageNum * PAGE_SIZE - 1;

      const needDonations = currentFilter === 'all' || currentFilter === 'sent' || currentFilter === 'received';
      const needSwaps = currentFilter === 'all' || currentFilter === 'swap' || currentFilter === 'sent' || currentFilter === 'received';
      const needTransfers = currentFilter === 'all' || currentFilter === 'transfer' || currentFilter === 'sent' || currentFilter === 'received';

      // NOTE: KHÔNG dùng userCreatedAt làm filter cứng vì giao dịch on-chain
      // có thể được ghi nhận trễ hoặc backfill với timestamp cũ hơn ngày tạo profile.
      // Filter này từng làm mất 7 lệnh CAMLY của user Trần Hải.

      // Swap records
      let swapRecords: DonationRecord[] = [];
      if (needSwaps) {
        let swapQuery = supabase
          .from('swap_transactions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (fromDate) swapQuery = swapQuery.gte('created_at', fromDate);
        if (toDate) swapQuery = swapQuery.lte('created_at', `${toDate}T23:59:59`);
        const { data: swapData, error: swapError } = await swapQuery.range(from, to);

        if (!swapError && swapData) {
          swapRecords = swapData.map((s: any) => ({
            id: `swap-${s.id}`,
            amount: String(s.from_amount),
            token_symbol: s.from_symbol,
            tx_hash: s.tx_hash,
            status: s.status,
            message: null,
            created_at: s.created_at,
            chain_id: s.chain_id,
            sender_id: s.user_id,
            recipient_id: s.user_id,
            sender_username: null, sender_display_name: null, sender_avatar_url: null,
            recipient_username: null, recipient_display_name: null, recipient_avatar_url: null,
            type: 'swap' as const,
            from_symbol: s.from_symbol, to_symbol: s.to_symbol,
            from_amount: Number(s.from_amount), to_amount: Number(s.to_amount),
          }));
        }
      }

      // Transfer records
      let transferRecords: DonationRecord[] = [];
      if (needTransfers) {
        let transferQuery = supabase
          .from('wallet_transfers')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (currentFilter === 'received') transferQuery = transferQuery.eq('direction', 'in');
        else if (currentFilter === 'sent') transferQuery = transferQuery.eq('direction', 'out');
        if (fromDate) transferQuery = transferQuery.gte('created_at', fromDate);
        if (toDate) transferQuery = transferQuery.lte('created_at', `${toDate}T23:59:59`);
        const { data: transferData, error: transferError } = await transferQuery.range(from, to);

        if (!transferError && transferData) {
          transferRecords = transferData.map((t: any) => ({
            id: `transfer-${t.id}`,
            amount: String(t.amount),
            token_symbol: t.token_symbol,
            tx_hash: t.tx_hash,
            status: t.status,
            message: null,
            created_at: t.created_at,
            chain_id: t.chain_id,
            sender_id: t.direction === 'out' ? t.user_id : null,
            recipient_id: t.direction === 'in' ? t.user_id : null,
            sender_username: null, sender_display_name: null, sender_avatar_url: null,
            recipient_username: null, recipient_display_name: null, recipient_avatar_url: null,
            type: 'transfer' as const,
            direction: t.direction as 'in' | 'out',
            counterparty_address: t.counterparty_address,
          }));
        }
      }

      // Donation records
      let donationRecords: DonationRecord[] = [];
      if (needDonations) {
        let query = supabase
          .from('donations')
          .select(`
            id, amount, token_symbol, tx_hash, status, message, created_at, chain_id,
            sender_id, recipient_id, is_external, sender_address,
            sender:profiles!donations_sender_id_fkey(username, display_name, avatar_url),
            recipient:profiles!donations_recipient_id_fkey(username, display_name, avatar_url)
          `)
          .or('filter_status.is.null,filter_status.neq.filtered_spam')
          .order('created_at', { ascending: false });

        if (currentFilter === 'sent') query = query.eq('sender_id', userId);
        else if (currentFilter === 'received') query = query.eq('recipient_id', userId);
        else query = query.or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);

        if (fromDate) query = query.gte('created_at', fromDate);
        if (toDate) query = query.lte('created_at', `${toDate}T23:59:59`);

        const { data, error: queryError } = await query.range(from, to);
        if (queryError) throw queryError;

        donationRecords = (data || []).map((d: any) => ({
          id: d.id,
          amount: d.amount,
          token_symbol: d.token_symbol,
          tx_hash: d.tx_hash,
          status: d.status,
          message: d.message,
          created_at: d.created_at,
          chain_id: d.chain_id,
          sender_id: d.sender_id,
          recipient_id: d.recipient_id,
          is_external: d.is_external || false,
          sender_address: d.sender_address || null,
          sender_username: d.sender?.username || null,
          sender_display_name: d.sender?.display_name || null,
          sender_avatar_url: d.sender?.avatar_url || null,
          recipient_username: d.recipient?.username || null,
          recipient_display_name: d.recipient?.display_name || null,
          recipient_avatar_url: d.recipient?.avatar_url || null,
          type: 'donation' as const,
        }));
      }

      // Remap swaps for sent/received
      if (currentFilter === 'received') {
        swapRecords = swapRecords.map(s => ({ ...s, amount: String(s.to_amount || 0), token_symbol: s.to_symbol || s.token_symbol }));
      } else if (currentFilter === 'sent') {
        swapRecords = swapRecords.map(s => ({ ...s, amount: String(s.from_amount || 0), token_symbol: s.from_symbol || s.token_symbol }));
      }

      // Deduplicate: if a tx_hash + token combo exists in donations, remove it from transfers.
      // Dùng key (tx_hash + token_symbol) thay vì chỉ tx_hash để không loại nhầm
      // các leg khác token trong cùng 1 transaction (vd: swap multi-leg).
      const donationKeys = new Set(donationRecords.map(d => `${d.tx_hash}::${d.token_symbol}`));
      let dedupedTransfers = transferRecords.filter(t => !donationKeys.has(`${t.tx_hash}::${t.token_symbol}`));

      // ENRICH các transfer còn lại bằng counterparty_address:
      // nếu counterparty trùng ví của 1 user nội bộ (btc/public/external/custodial/login/wallet)
      // thì gắn profile vào, đồng thời đánh dấu KHÔNG còn là "ví ngoài".
      const counterpartyAddrs = Array.from(new Set(
        dedupedTransfers
          .map(t => normalizeAddressForCompare(t.counterparty_address))
          .filter(Boolean)
      ));
      if (counterpartyAddrs.length > 0) {
        try {
          const walletCols = [
            'btc_address',
            'public_wallet_address',
            'external_wallet_address',
            'custodial_wallet_address',
            'login_wallet_address',
            'wallet_address',
          ];
          const orFilter = walletCols
            .map(c => counterpartyAddrs.map(a => `${c}.ilike.${a}`).join(','))
            .join(',');
          const { data: matched } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, btc_address, public_wallet_address, external_wallet_address, custodial_wallet_address, login_wallet_address, wallet_address')
            .or(orFilter)
            .limit(200);
          const addrToProfile = new Map<string, any>();
          for (const p of (matched || [])) {
            for (const c of walletCols) {
              const v = (p as any)[c];
              if (v) addrToProfile.set(normalizeAddressForCompare(String(v)), p);
            }
          }

          // Bổ sung: tra cứu profile_btc_aux_addresses ĐÃ XÁC MINH (verified=true).
          // Aux do heuristic tự sinh KHÔNG được dùng để resolve, tránh gán sai sender/recipient.
          const { data: auxRows } = await supabase
            .from('profile_btc_aux_addresses')
            .select('address, user_id')
            .eq('verified', true)
            .in('address', counterpartyAddrs);
          const auxUserIds = Array.from(new Set((auxRows || []).map((r: any) => r.user_id)));
          if (auxUserIds.length > 0) {
            const { data: auxProfiles } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .in('id', auxUserIds);
            const profById = new Map<string, any>();
            for (const p of (auxProfiles || [])) profById.set((p as any).id, p);
            for (const row of (auxRows || []) as any[]) {
              const prof = profById.get(row.user_id);
              if (prof) addrToProfile.set(normalizeAddressForCompare(String(row.address)), prof);
            }
          }
          if (addrToProfile.size > 0) {
            dedupedTransfers = dedupedTransfers.map(t => {
              const addr = normalizeAddressForCompare(t.counterparty_address);
              const prof = addr ? addrToProfile.get(addr) : null;
              if (!prof) return t;
              // Resolved → user nội bộ khác, không phải "ví ngoài"
              if (t.direction === 'in') {
                return {
                  ...t,
                  is_external: false,
                  sender_id: prof.id,
                  sender_username: prof.username,
                  sender_display_name: prof.display_name,
                  sender_avatar_url: prof.avatar_url,
                };
              }
              return {
                ...t,
                is_external: false,
                recipient_id: prof.id,
                recipient_username: prof.username,
                recipient_display_name: prof.display_name,
                recipient_avatar_url: prof.avatar_url,
              };
            });
          }
        } catch (e) {
          console.warn('[usePublicDonationHistory] enrich transfers failed:', e);
        }
      }

      // KHÔNG slice cứng — giữ tất cả record từ 3 nguồn để không bị "đẩy" ra ngoài
      // do nguồn nào nhiều hơn. Pagination dựa trên range của từng query.
      const merged = [...donationRecords, ...swapRecords, ...dedupedTransfers]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setDonations(prev => {
        const finalRecords = pageNum === 1 ? merged : [...prev, ...merged];
        if (fromDate || toDate) {
          const summaryData = computeSummaryFromDonations(finalRecords);
          setSummary(summaryData);
        }
        return finalRecords;
      });
      setPage(pageNum);
      setHasMore(merged.length >= PAGE_SIZE);
    } catch (err: any) {
      console.error('fetchDonations error:', err);
      setError(err.message || 'Không thể tải lịch sử');
    } finally {
      setLoading(false);
    }
  }, [userId, filter, computeSummaryFromDonations]);

  const loadMore = useCallback(() => {
    fetchDonations(page + 1, filter, dateFrom, dateTo);
  }, [fetchDonations, page, filter, dateFrom, dateTo]);

  const changeFilter = useCallback((f: DonationFilter) => {
    setFilter(f);
    setDonations([]);
    fetchDonations(1, f, dateFrom, dateTo);
  }, [fetchDonations, dateFrom, dateTo]);

  const changeDateRange = useCallback((from: string | null, to: string | null) => {
    setDateFrom(from);
    setDateTo(to);
    setDonations([]);
    fetchDonations(1, filter, from, to);
    // Always refresh summary from RPC
    fetchSummary(from, to);
  }, [fetchDonations, filter, fetchSummary]);

  // Auto-refresh when new donation is made
  useEffect(() => {
    const handler = () => {
      fetchDonations(1, filter, dateFrom, dateTo);
      fetchSummary(dateFrom, dateTo);
    };
    window.addEventListener('invalidate-donations', handler);
    return () => window.removeEventListener('invalidate-donations', handler);
  }, [fetchDonations, fetchSummary, filter, dateFrom, dateTo]);

  return {
    donations,
    loading,
    error,
    filter,
    hasMore,
    summary,
    summaryLoading,
    dateFrom,
    dateTo,
    changeFilter,
    changeDateRange,
    fetchDonations,
    fetchSummary,
    loadMore,
  };
}
