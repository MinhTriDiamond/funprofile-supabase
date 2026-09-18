import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DonationReceivedCard, DonationReceivedData } from './DonationReceivedCard';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getGiftTokenLabel } from '@/lib/giftTokenLabel';

type RawDonation = {
  id: string;
  amount: string;
  token_symbol: string;
  chain_id?: number | null;
  sender_id: string | null;
  sender_address?: string | null;
  is_external?: boolean | null;
  message?: string | null;
  tx_hash: string;
  created_at: string;
};

const LS_KEY = 'donation_celebration_seen_ids_v1';

function readSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistSeen(id: string) {
  try {
    const set = readSeenIds();
    set.add(id);
    // keep last 200
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export const DonationReceivedNotification = () => {
  const { userId } = useCurrentUser();
  const [current, setCurrent] = useState<DonationReceivedData | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // queue of raw donation rows waiting to be displayed
  const queueRef = useRef<RawDonation[]>([]);
  const enqueuedIdsRef = useRef<Set<string>>(new Set());
  const showingRef = useRef(false);

  const enqueue = useCallback((row: RawDonation) => {
    if (!row?.id) return;
    if (row.is_external) return;
    if (!row.sender_id) return;
    if (enqueuedIdsRef.current.has(row.id)) return;
    const seen = readSeenIds();
    if (seen.has(row.id)) return;
    enqueuedIdsRef.current.add(row.id);
    queueRef.current.push(row);
    void tryShowNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryShowNext = useCallback(async () => {
    if (showingRef.current) return;
    const next = queueRef.current.shift();
    if (!next || !userId) return;
    showingRef.current = true;

    try {
      // fetch sender profile
      let senderProfile: any = null;
      if (next.sender_id) {
        const { data } = await supabase
          .from('public_profiles')
          .select('full_name, display_name, username, avatar_url')
          .eq('id', next.sender_id)
          .maybeSingle();
        senderProfile = data;
      }

      const shortenAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
      const senderUsername =
        senderProfile?.username ||
        senderProfile?.full_name ||
        (next.sender_address ? shortenAddr(next.sender_address) : 'Ví ngoài');
      const senderDisplayName =
        senderProfile?.display_name || senderProfile?.full_name || senderUsername;

      const { data: recipientProfile } = await supabase
        .from('public_profiles')
        .select('full_name, display_name, username, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      const recipientUsername =
        recipientProfile?.username || recipientProfile?.full_name || 'Bạn';
      const recipientDisplayName =
        recipientProfile?.display_name ||
        recipientProfile?.full_name ||
        recipientProfile?.username ||
        'Bạn';

      setCurrent({
        id: next.id,
        amount: next.amount,
        tokenSymbol: getGiftTokenLabel(next.token_symbol, next.chain_id),
        chainId: next.chain_id ?? null,
        senderUsername,
        senderDisplayName,
        senderAvatarUrl: senderProfile?.avatar_url,
        senderId: next.sender_id || '',
        recipientUsername,
        recipientDisplayName,
        recipientAvatarUrl: recipientProfile?.avatar_url,

        message: next.message,
        txHash: next.tx_hash,
        createdAt: next.created_at,
      });
      setIsOpen(true);
    } catch (err) {
      console.error('[DonationReceivedNotification] show failed', err);
      showingRef.current = false;
      // try next item after small delay to avoid infinite loop
      setTimeout(() => void tryShowNext(), 500);
    }
  }, [userId]);

  // 1) Backlog: pull unseen confirmed donations on mount/login
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('donations')
        .select('id, amount, token_symbol, chain_id, sender_id, sender_address, is_external, message, tx_hash, created_at')
        .eq('recipient_id', userId)
        .eq('status', 'confirmed')
        .is('card_viewed_at', null)
        .eq('is_external', false)
        .not('sender_id', 'is', null)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true })
        .limit(20);

      if (cancelled) return;
      if (error) {
        console.error('[DonationReceivedNotification] backlog error', error);
        return;
      }
      (data || []).forEach((row) => enqueue(row as RawDonation));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, enqueue]);

  // 2) Realtime: listen for new INSERTs
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`donation-received-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'donations',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          enqueue(payload.new as RawDonation);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enqueue]);

  const handleClose = useCallback(async () => {
    setIsOpen(false);
    const closingId = current?.id;
    setCurrent(null);

    if (closingId) {
      persistSeen(closingId);
      try {
        await supabase
          .from('donations')
          .update({ card_viewed_at: new Date().toISOString() })
          .eq('id', closingId);
      } catch (err) {
        console.warn('[DonationReceivedNotification] mark viewed failed', err);
      }
    }

    showingRef.current = false;
    // show next after card close animation
    setTimeout(() => void tryShowNext(), 350);
  }, [current?.id, tryShowNext]);

  if (!current) return null;

  return (
    <DonationReceivedCard
      isOpen={isOpen}
      onClose={handleClose}
      data={current}
    />
  );
};
