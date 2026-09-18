import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Gift } from 'lucide-react';
import { useOpenMysteryBox } from '../hooks/useMysteryBox';
import { TIER_COLORS, TIER_LABEL_VI, type BoxInventoryItem, type BoxRewardPayload } from '../types';
import { BOX_SPRITES } from '../lib/sprites';
import { playShakeSound, playBurstSound, playRevealSound } from '../lib/sounds';
import { toast } from 'sonner';

type Phase = 'idle' | 'shake' | 'burst' | 'reveal';

interface Props {
  open: boolean;
  onClose: () => void;
  item: BoxInventoryItem | null;
}

export function MysteryBoxOpenDialog({ open, onClose, item }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [reward, setReward] = useState<BoxRewardPayload | null>(null);
  const openBox = useOpenMysteryBox();

  const tier = item?.definition?.tier ?? 'common';
  const colors = TIER_COLORS[tier];

  const handleOpen = async () => {
    if (!item) return;
    setPhase('shake');
    playShakeSound();
    setTimeout(() => { setPhase('burst'); playBurstSound(); }, 1200);
    try {
      const r = await openBox.mutateAsync(item.id);
      setReward(r);
      setTimeout(() => { setPhase('reveal'); playRevealSound(tier); }, 1800);
    } catch (e) {
      const err = e as { message?: string; details?: string; hint?: string; code?: string };
      const raw = (err?.message ?? '') + ' ' + (err?.details ?? '') + ' ' + (err?.hint ?? '');
      let friendly = 'Mở hộp thất bại, vui lòng thử lại sau ít phút.';
      if (raw.includes('ALREADY_OPENED')) friendly = 'Hộp này đã được mở trước đó.';
      else if (raw.includes('LOCKED_NEED_T1')) friendly = 'Hộp đang khoá. Bạn cần đạt Trust Tier T1 để mở.';
      else if (raw.includes('EXPIRED')) friendly = 'Hộp này đã quá hạn 90 ngày và không thể mở được nữa.';
      else if (raw.includes('FORBIDDEN')) friendly = 'Bạn không có quyền mở hộp này.';
      else if (raw.includes('INVENTORY_NOT_FOUND')) friendly = 'Không tìm thấy hộp trong kho của bạn.';
      else if (err?.message) friendly = `Mở hộp thất bại: ${err.message}`;
      toast.error(friendly);
      setPhase('idle');
    }
  };

  const handleClose = () => {
    setPhase('idle');
    setReward(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md flex flex-col items-center gap-6 py-10 overflow-hidden">
        <h2 className={`text-2xl font-bold bg-gradient-to-r ${colors.bg} bg-clip-text text-transparent`}>
          Hộp {TIER_LABEL_VI[tier]}
        </h2>

        <div className="relative h-48 w-48 flex items-center justify-center">
          {/* Gold radiant aura during shake/burst */}
          {(phase === 'shake' || phase === 'burst') && (
            <>
              <motion.div
                key="gold-halo"
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle, rgba(255,215,0,0.85) 0%, rgba(255,193,7,0.5) 35%, rgba(255,165,0,0.15) 60%, transparent 75%)',
                  filter: 'blur(12px)',
                }}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{
                  scale: phase === 'burst' ? [1.2, 2.6] : [0.9, 1.3, 1.0, 1.4],
                  opacity: phase === 'burst' ? [1, 0] : [0.6, 1, 0.7, 1],
                }}
                transition={{ duration: phase === 'burst' ? 0.7 : 1.2, ease: 'easeOut' }}
              />
              {/* Rotating light rays */}
              <motion.div
                key="gold-rays"
                className="absolute inset-[-40px] pointer-events-none"
                style={{
                  background:
                    'conic-gradient(from 0deg, transparent 0deg, rgba(255,223,90,0.55) 12deg, transparent 24deg, transparent 60deg, rgba(255,215,0,0.45) 72deg, transparent 84deg, transparent 120deg, rgba(255,236,150,0.5) 132deg, transparent 144deg, transparent 180deg, rgba(255,215,0,0.45) 192deg, transparent 204deg, transparent 240deg, rgba(255,223,90,0.55) 252deg, transparent 264deg, transparent 300deg, rgba(255,236,150,0.5) 312deg, transparent 324deg, transparent 360deg)',
                  maskImage: 'radial-gradient(circle, black 30%, transparent 75%)',
                  WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 75%)',
                }}
                initial={{ rotate: 0, opacity: 0 }}
                animate={{ rotate: 360, opacity: phase === 'burst' ? [0.9, 0] : [0.4, 0.9] }}
                transition={{
                  rotate: { duration: 2.5, ease: 'linear', repeat: Infinity },
                  opacity: { duration: phase === 'burst' ? 0.7 : 1.2 },
                }}
              />
            </>
          )}

          <AnimatePresence mode="wait">
            {phase !== 'reveal' && (
              <motion.div
                key="box"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={
                  phase === 'shake'
                    ? { rotate: [-8, 8, -8, 8, 0], scale: [1, 1.1, 1.05, 1.1, 1.2] }
                    : phase === 'burst'
                      ? { scale: [1.2, 2.5], opacity: [1, 0] }
                      : { scale: 1, opacity: 1 }
                }
                transition={{ duration: phase === 'shake' ? 1.2 : 0.6 }}
                exit={{ opacity: 0 }}
                className={`relative z-10 ${phase === 'shake' || phase === 'burst' ? 'text-amber-300' : colors.text}`}
                style={
                  phase === 'shake' || phase === 'burst'
                    ? { filter: 'drop-shadow(0 0 24px rgba(255,215,0,0.95)) drop-shadow(0 0 48px rgba(255,180,0,0.7))' }
                    : undefined
                }
              >
                <img
                  src={BOX_SPRITES[tier]}
                  alt={`Hộp ${TIER_LABEL_VI[tier]}`}
                  width={192}
                  height={192}
                  className="h-48 w-48 object-contain select-none pointer-events-none"
                  draggable={false}
                />
              </motion.div>
            )}

            {phase === 'burst' && (
              <>
                {Array.from({ length: 24 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute h-2.5 w-2.5 rounded-full"
                    style={{
                      background:
                        'radial-gradient(circle, #fff7c2 0%, #ffd700 45%, #ff9d00 100%)',
                      boxShadow: '0 0 12px rgba(255,215,0,0.95), 0 0 24px rgba(255,180,0,0.7)',
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: Math.cos((i / 24) * Math.PI * 2) * 160,
                      y: Math.sin((i / 24) * Math.PI * 2) * 160,
                      opacity: 0,
                      scale: 0.3,
                    }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  />
                ))}
              </>
            )}

            {phase === 'reveal' && reward && (
              <motion.div
                key="reward"
                initial={{ scale: 0.5, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 14 }}
                className={`flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-br ${colors.bg} p-6 ring-4 ${colors.ring} shadow-2xl ${colors.glow}`}
              >
                <Sparkles className={`h-10 w-10 ${colors.text}`} />
                <div className={`text-3xl font-extrabold ${colors.text}`}>
                  {formatReward(reward)}
                </div>
                <div className={`text-xs uppercase tracking-widest ${colors.text} opacity-80`}>
                  {reward.rarity}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {phase === 'idle' && (
          <Button size="lg" onClick={handleOpen} disabled={openBox.isPending} className="gap-2">
            <Gift className="h-5 w-5" /> Mở hộp ngay
          </Button>
        )}
        {phase === 'reveal' && (
          <Button variant="outline" onClick={handleClose}>Tuyệt vời, đóng lại</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatReward(r: BoxRewardPayload): string {
  switch (r.type) {
    case 'ls': return `+${r.value_int} Light Score`;
    case 'camly': return `+${r.value_int.toLocaleString('vi-VN')} CAMLY`;
    case 'pet_xp': return `+${r.value_int} XP Lumi`;
    case 'pet_skin': return `Skin Lumi: ${(r.metadata?.skin_id as string) ?? 'mới'}`;
    case 'cosmetic': return `Cosmetic: ${(r.metadata?.frame_id as string) ?? 'mới'}`;
    case 'sbt_trigger': return `SBT: ${(r.metadata?.sbt_code as string) ?? ''}`;
    case 'box_upgrade': return `Nâng cấp: ${(r.metadata?.upgrade_to as string) ?? ''}`;
    default: return r.reward_code;
  }
}
