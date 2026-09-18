import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles, Wallet, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DonationCelebration } from '@/components/donations/DonationCelebration';
import { playCelebrationMusic } from '@/lib/celebrationSounds';
import funMoneyCoin from '@/assets/tokens/fun-money-coin.png';

interface EpochClaimData {
  id: string;
  epoch_month: string;
  amount: number;
}

const DISMISSED_KEY = 'epoch_claim_celebration_dismissed';

function getDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addDismissedId(id: string) {
  const set = getDismissedIds();
  set.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
}

export const EpochClaimCelebration = () => {
  const { userId } = useCurrentUser();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<EpochClaimData[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchUnread = useCallback(async () => {
    if (!userId) return;

    const { data: notifs } = await supabase
      .from('notifications')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('type', 'epoch_claim_ready')
      .eq('read', false)
      .order('created_at', { ascending: false });

    if (!notifs || notifs.length === 0) return;

    const dismissed = getDismissedIds();
    const pending: EpochClaimData[] = [];

    for (const n of notifs) {
      if (dismissed.has(n.id)) continue;
      const meta = typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata;
      pending.push({
        id: n.id,
        epoch_month: meta?.epoch_month || '',
        amount: Number(meta?.allocation_amount) || Number(meta?.amount) || 0,
      });
    }

    if (pending.length > 0) {
      setClaims(pending);
      setIsOpen(true);
      playCelebrationMusic('rich-1');
    }
  }, [userId]);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  // Also listen for new epoch_claim_ready inserts (realtime)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`epoch-claim-celebration-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.type === 'epoch_claim_ready') {
            const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
            if (!getDismissedIds().has(row.id)) {
              setClaims(prev => [...prev, {
                id: row.id,
                epoch_month: meta?.epoch_month || '',
                amount: Number(meta?.allocation_amount) || Number(meta?.amount) || 0,
              }]);
              setIsOpen(true);
              playCelebrationMusic('rich-1');
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const totalAmount = claims.reduce((sum, c) => sum + c.amount, 0);

  const handleDismiss = async () => {
    for (const c of claims) {
      addDismissedId(c.id);
      await supabase.from('notifications').update({ read: true }).eq('id', c.id);
    }
    setIsOpen(false);
    setClaims([]);
  };

  const handleGoToClaim = async () => {
    for (const c of claims) {
      addDismissedId(c.id);
      await supabase.from('notifications').update({ read: true }).eq('id', c.id);
    }
    setIsOpen(false);
    setClaims([]);
    navigate('/wallet/fun_money');
  };

  if (!isOpen || claims.length === 0) return null;

  return (
    <>
      {/* Fireworks celebration overlay */}
      <DonationCelebration isActive={isOpen} showRichText={false} />

      {/* Main popup card */}
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 animate-fade-in p-4">
        <div className="relative w-full max-w-md animate-scale-in overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-amber-50 via-white to-amber-50/95 shadow-[0_0_60px_rgba(255,215,0,0.3)]">
          {/* Close */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors z-10"
            aria-label="Đóng"
          >
            <X className="w-5 h-5 text-amber-500" />
          </button>

          {/* Header with party icon */}
          <div className="relative pt-8 pb-4 text-center overflow-hidden">
            {/* Decorative coins */}
            <div className="absolute top-2 left-6 animate-bounce" style={{ animationDelay: '0.2s' }}>
              <img src={funMoneyCoin} alt="" className="w-8 h-8 opacity-60" />
            </div>
            <div className="absolute top-4 right-8 animate-bounce" style={{ animationDelay: '0.5s' }}>
              <img src={funMoneyCoin} alt="" className="w-6 h-6 opacity-50" />
            </div>
            <div className="absolute bottom-2 left-12 animate-bounce" style={{ animationDelay: '0.8s' }}>
              <img src={funMoneyCoin} alt="" className="w-5 h-5 opacity-40" />
            </div>

            <div className="flex justify-center mb-3">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 animate-pulse">
                <PartyPopper className="w-8 h-8 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-amber-600 drop-shadow-lg">
              🎉 Chúc mừng!
            </h2>
            <p className="text-amber-700/80 text-sm mt-1">
              FUN Money của bạn đã sẵn sàng
            </p>
          </div>

          {/* Amount display */}
          <div className="px-6 pb-2">
            <div className="bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 rounded-2xl p-5 text-center border border-amber-300/40">
              <p className="text-sm text-amber-600 mb-1">Tổng phần thưởng</p>
              <div className="flex items-center justify-center gap-2">
                <img src={funMoneyCoin} alt="FUN" className="w-8 h-8" />
                <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 drop-shadow-[0_0_10px_rgba(255,150,0,0.4)] tracking-tight" style={{ WebkitTextStroke: '0.5px rgba(200,100,0,0.2)' }}>
                  {totalAmount.toLocaleString()}
                </span>
                <span className="text-xl font-black text-amber-600 drop-shadow-[0_0_6px_rgba(200,100,0,0.3)]">FUN</span>
              </div>
            </div>
          </div>

          {/* Month breakdown */}
          <div className="px-6 py-3 space-y-2">
            {claims.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-amber-50/80 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-amber-900 font-medium">
                    Tháng {c.epoch_month.split('-')[1]}/{c.epoch_month.split('-')[0]}
                  </span>
                </div>
                <span className="text-sm font-extrabold text-orange-600 drop-shadow-[0_0_4px_rgba(200,100,0,0.3)]">
                  +{c.amount.toLocaleString()} FUN
                </span>
              </div>
            ))}
          </div>

          {/* Guide */}
          <div className="px-6 pb-3">
            <p className="text-xs text-amber-700/70 text-center">
              Vào <strong>Ví → FUN Money</strong> để nhận phần thưởng của bạn
            </p>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-amber-400 text-amber-700 hover:bg-amber-100"
              onClick={handleDismiss}
            >
              Để sau
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold shadow-lg shadow-amber-500/30"
              onClick={handleGoToClaim}
            >
              <Wallet className="w-4 h-4 mr-2" />
              Claim ngay!
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
