import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Gift, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getGiftTokenLabel } from '@/lib/giftTokenLabel';

interface ToastItem {
  id: string;
  recipientName: string;
  senderName: string;
  amount: string;
  token: string;
  createdAt: number;
}

const DISMISS_MS = 8000; // 8 giây mỗi toast rồi chuyển sang lệnh tiếp theo

/**
 * Format số có dấu chấm phân cách hàng nghìn (format tiếng Việt)
 */
const formatNumber = (num: string | number, locale: string): string => {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '0';
  return n.toLocaleString(locale);
};

export function GiftTransactionToast() {
  const { t, language } = useLanguage();
  const [currentToast, setCurrentToast] = useState<ToastItem | null>(null);
  const queueRef = useRef<ToastItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      setCurrentToast(null);
      return;
    }
    const next = queueRef.current.shift()!;
    setCurrentToast(next);
    timerRef.current = setTimeout(() => showNext(), DISMISS_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    showNext();
  }, [showNext]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('gift-toast-donations')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'donations' },
        async (payload) => {
          const d = payload.new as any;
          if (!d) return;

          const recipientId = d.recipient_id;
          const senderId = d.sender_id;
          const amount = d.amount || '0';
          const token = getGiftTokenLabel(d.token_symbol || 'USDT', d.chain_id);

          // Bỏ qua giao dịch ví ngoài hoặc thiếu người nhận (External Wallet No-Gift Policy)
          if (!recipientId || d.is_external === true) return;

          const shortenAddr = (addr: string) =>
            addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

          let recipientName = t('recipientLabel');
          let senderName = d.sender_address ? shortenAddr(d.sender_address) : t('anonymous');

          const ids = [recipientId, senderId].filter(Boolean);
          if (ids.length > 0) {
            const { data: profiles } = await supabase
              .from('public_profiles')
              .select('id, username, display_name')
              .in('id', ids);

            if (profiles) {
              for (const p of profiles as any[]) {
                const name = p.display_name || p.username;
                if (!name) continue;
                if (p.id === recipientId) recipientName = name;
                if (p.id === senderId) senderName = name;
              }
            }
          }

          const newToast: ToastItem = {
            id: d.id || crypto.randomUUID(),
            recipientName,
            senderName,
            amount,
            token,
            createdAt: Date.now(),
          };


          // Nếu đang không hiển thị toast nào → hiển thị ngay
          if (!currentToast && queueRef.current.length === 0) {
            setCurrentToast(newToast);
            timerRef.current = setTimeout(() => showNext(), DISMISS_MS);
          } else {
            // Thêm vào hàng đợi
            queueRef.current.push(newToast);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentToast, showNext]);

  if (!currentToast) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 max-w-[340px] sm:max-w-[400px]">
      <div
        key={currentToast.id}
        className={cn(
          "relative bg-gradient-to-r from-amber-500/90 to-yellow-400/90 backdrop-blur-md",
          "text-white rounded-xl p-3 pr-8 shadow-lg",
          "animate-in slide-in-from-right-full duration-500",
          "border border-yellow-300/30"
        )}
      >
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 text-white/70 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-2">
          <Gift className="w-5 h-5 mt-0.5 shrink-0 text-white" />
          <p className="text-sm leading-relaxed">
            {t('gttCongratsPrefix')}<strong>{currentToast.recipientName}</strong>{t('gttReceivedFrom')}<strong>{formatNumber(currentToast.amount, language === 'vi' ? 'vi-VN' : 'en-US')} {currentToast.token}</strong>{t('gttViaChannel')}<strong>{currentToast.senderName}</strong> 🌟💰✨💎🌈
          </p>
        </div>
        {queueRef.current.length > 0 && (
          <div className="mt-1.5 text-xs text-white/70 text-right">
            +{queueRef.current.length}{t('gttQueueSuffix')}
          </div>
        )}
      </div>
    </div>
  );
}