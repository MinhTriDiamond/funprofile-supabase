/**
 * Full-screen celebration cho notification mystery_box_legendary.
 * Theo pattern EpochClaimDialog: tự mở khi có notif chưa đọc, nút CTA dẫn tới /mystery-box.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLanguage } from '@/i18n/LanguageContext';
import { BOX_SPRITES } from '../lib/sprites';
import { playRevealSound } from '../lib/sounds';
import { TIER_COLORS } from '../types';

interface CelebNotif {
  id: string;
  type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function MysteryBoxLegendaryCelebration() {
  const { userId } = useCurrentUser();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [notif, setNotif] = useState<CelebNotif | null>(null);

  // Poll notifications mỗi 30s tìm `mystery_box_legendary` chưa đọc + chưa hiện
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const SHOWN_KEY = 'mystery-box-legendary-shown';
    const shown: string[] = JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]');

    const poll = async () => {
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { eq: (k: string, v: boolean) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: CelebNotif[] | null }> } } } } };
        };
      })
        .from('notifications')
        .select('id, type, metadata, created_at')
        .eq('user_id', userId)
        .eq('type', 'mystery_box_legendary')
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (cancelled) return;
      const first = data?.[0];
      if (first && !shown.includes(first.id)) {
        setNotif(first);
        playRevealSound('legendary');
        const next = [...shown, first.id].slice(-50);
        localStorage.setItem(SHOWN_KEY, JSON.stringify(next));
      }
    };
    poll();
    const i = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(i); };
  }, [userId]);

  const handleClose = () => setNotif(null);
  const handleGo = () => {
    if (notif) {
      supabase.from('notifications').update({ read: true } as never).eq('id', notif.id).then(() => {});
    }
    setNotif(null);
    navigate('/mystery-box');
  };

  if (!notif) return null;
  const c = TIER_COLORS.legendary;

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg overflow-hidden p-0 border-0 bg-transparent shadow-none">
        <AnimatePresence>
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 14 }}
            className={`relative rounded-3xl bg-gradient-to-br ${c.bg} p-8 ring-4 ${c.ring} shadow-2xl ${c.glow}`}
          >
            {/* Confetti */}
            {Array.from({ length: 24 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute h-2 w-2 rounded-full bg-white/80"
                style={{ left: '50%', top: '50%' }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{
                  x: Math.cos((i / 24) * Math.PI * 2) * 220,
                  y: Math.sin((i / 24) * Math.PI * 2) * 220,
                  opacity: 0,
                }}
                transition={{ duration: 1.4, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.6 }}
              />
            ))}

            <div className="relative flex flex-col items-center gap-4 text-center">
              <motion.img
                src={BOX_SPRITES.legendary}
                alt="Legendary Box"
                className="h-32 w-32"
                animate={{ rotate: [-5, 5, -5], scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <Sparkles className={`absolute top-2 right-2 h-8 w-8 ${c.text}`} />
              <h2 className={`text-3xl font-extrabold ${c.text}`}>
                {t('mysteryBoxLegendaryHit')}
              </h2>
              <p className={`${c.text} opacity-90`}>{String((notif.metadata as { box_code?: string } | null)?.box_code ?? '')}</p>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={handleClose}>Để sau</Button>
                <Button onClick={handleGo} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Mở hộp ngay
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
