import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNavigate } from 'react-router-dom';
import { X, Wallet, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AdjustmentData {
  id: string;
  reason?: string;
  amount?: number;
  gift_count?: number;
  post_count?: number;
  message?: string;
}

const DISMISSED_KEY = 'reward_adjustment_dismissed';

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

export const RewardAdjustmentNotification = () => {
  const { userId } = useCurrentUser();
  const [data, setData] = useState<AdjustmentData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const showNotification = useCallback((notif: { id: string; metadata: any }) => {
    if (getDismissedIds().has(notif.id)) return;
    const meta = typeof notif.metadata === 'string' ? JSON.parse(notif.metadata) : notif.metadata;
    setData({
      id: notif.id,
      reason: meta?.reason,
      amount: meta?.amount,
      gift_count: meta?.gift_count,
      post_count: meta?.post_count,
      message: meta?.message,
    });
    setIsOpen(true);
  }, []);

  // Fetch unread on mount
  useEffect(() => {
    if (!userId) return;

    const fetchUnread = async () => {
      const { data: notifs } = await supabase
        .from('notifications')
        .select('id, metadata')
        .eq('user_id', userId)
        .eq('type', 'reward_adjustment')
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (notifs && notifs.length > 0) {
        showNotification(notifs[0]);
      }
    };

    fetchUnread();
  }, [userId, showNotification]);

  // Realtime for new inserts
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`reward-adj-${userId}`)
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
          if (row.type === 'reward_adjustment') {
            showNotification(row);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, showNotification]);

  const handleDismiss = async () => {
    if (data) {
      addDismissedId(data.id);
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', data.id);
    }
    setIsOpen(false);
    setData(null);
  };

  const handleViewWallet = async () => {
    if (data) {
      addDismissedId(data.id);
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', data.id);
    }
    setIsOpen(false);
    setData(null);
    navigate('/wallet');
  };

  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 animate-fade-in p-4">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors z-10"
          aria-label="Đóng"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 px-6 pt-6 pb-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
            <Wallet className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-lg">Thông báo điều chỉnh CAMLY</h3>
            <p className="text-sm text-muted-foreground">Từ Angel AI Fun.rich</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {data.message ? (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
              {data.message}
            </p>
          ) : (
            <p className="text-sm text-foreground">
              Số dư CAMLY của bạn đã được điều chỉnh. Vui lòng kiểm tra ví để biết thêm chi tiết.
            </p>
          )}

          {/* Stats */}
          {(data.amount || data.gift_count || data.post_count) && (
            <div className="flex flex-wrap gap-2">
              {data.amount != null && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 text-xs font-medium">
                  -{data.amount.toLocaleString()} CAMLY
                </span>
              )}
              {data.gift_count != null && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                  {data.gift_count} lệnh gift
                </span>
              )}
              {data.post_count != null && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                  {data.post_count} bài viết
                </span>
              )}
            </div>
          )}

        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDismiss}
          >
            Đã hiểu
          </Button>
          <Button
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={handleViewWallet}
          >
            <Wallet className="w-4 h-4 mr-2" />
            Xem ví
          </Button>
        </div>
      </div>
    </div>
  );
};
