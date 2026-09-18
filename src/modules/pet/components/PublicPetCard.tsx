import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Heart, Sparkles, Loader2, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { usePublicPet, usePetCheer, petErrorToMessage } from '../hooks/usePublicPet';
import { resolvePetSprite, resolveFrameSprite, resolveHatSprite, resolveAuraSprite, resolveAccessorySprite, getAccessoryPlacement, STAGE_NAMES } from '../lib/petAssets';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  currentUserId?: string | null;
  compact?: boolean;
}

export function PublicPetCard({ userId, currentUserId, compact }: Props) {
  const { data: pet, isLoading } = usePublicPet(userId);
  const cheerMutation = usePetCheer();
  const [message, setMessage] = useState('');
  const [showInput, setShowInput] = useState(false);

  if (isLoading) return null;

  const isOwn = currentUserId === userId;

  // Fallback: pet không tồn tại hoặc đang ẩn
  if (!pet || !pet.visible) {
    const guideText =
      'Cách bật Linh thú Lumi trên fun.rich:\n' +
      '1) Bấm vào Lumi nổi ở góc dưới-trái màn hình → biểu tượng ⚙️ → bật "Hiện Lumi".\n' +
      '2) Hoặc vào mục Lumi (fun.rich → Lumi) → Cài đặt Lumi → bật "Hiện".';

    const handleCopyGuide = async () => {
      try {
        await navigator.clipboard.writeText(guideText);
        toast.success('Đã sao chép hướng dẫn, gửi cho bạn ấy nhé!');
      } catch {
        toast.error('Không sao chép được, bạn copy thủ công giúp nhé.');
      }
    };

    return (
      <Card className="p-3 flex items-start gap-3 bg-muted/40 border-dashed">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <EyeOff className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 text-xs text-muted-foreground leading-snug space-y-2">
          {isOwn ? (
            <>
              <p className="text-foreground font-medium">Linh thú Lumi của bạn đang ẩn.</p>
              <p>Bạn có thể bật lại bằng 1 trong 2 cách:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  Bấm vào <b>Lumi nổi ở góc dưới‑trái</b> màn hình → biểu tượng ⚙️ → bật{' '}
                  <b>Hiện Lumi</b>.
                </li>
                <li>
                  Hoặc vào{' '}
                  <Link to="/pet" className="underline text-foreground">Lumi của tôi</Link>{' '}
                  → <b>Cài đặt Lumi</b> → bật <b>Hiện</b>.
                </li>
              </ul>
            </>
          ) : (
            <>
              <p>Bạn ấy chưa bật hiện Linh thú Lumi nên hiện chưa thể vỗ tay được.</p>
              <p>Hãy nhắn bạn ấy bật theo 1 trong 2 cách:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  Bấm <b>Lumi nổi ở góc dưới‑trái</b> → ⚙️ → bật <b>Hiện Lumi</b>.
                </li>
                <li>
                  Hoặc vào <b>fun.rich → Lumi → Cài đặt Lumi → Hiện</b>.
                </li>
              </ul>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyGuide}
                className="h-7 px-2 text-xs mt-1"
              >
                Sao chép hướng dẫn
              </Button>
            </>
          )}
        </div>
      </Card>
    );
  }

  const sprite = resolvePetSprite(pet.evolution_stage, pet.equipped_skin_slug);
  const frame = resolveFrameSprite(pet.equipped_frame_slug);
  const hat = resolveHatSprite(pet.equipped_hat_slug);
  const aura = resolveAuraSprite(pet.equipped_aura_slug);
  const accessory = resolveAccessorySprite(pet.equipped_accessory_slug);

  const handleCheer = async () => {
    try {
      await cheerMutation.mutateAsync({ toUserId: userId, message: message.trim() || undefined });
      toast.success('Đã gửi lời cổ vũ tới Linh thú Lumi! 🎉');
      setMessage('');
      setShowInput(false);
    } catch (e) {
      toast.error(petErrorToMessage(e));
    }
  };

  return (
    <Card className="p-3 flex items-center gap-3 bg-gradient-to-br from-pink-50/60 to-purple-50/40 dark:from-pink-950/30 dark:to-purple-950/20 border-pink-200/60 dark:border-pink-900/40">
      <div className="relative shrink-0 w-14 h-14">
        {aura && (
          <img src={aura} alt="" className="absolute -inset-1 w-16 h-16 z-0 pointer-events-none opacity-90" aria-hidden />
        )}
        {frame && (
          <img src={frame} alt="" className="absolute inset-0 w-14 h-14 z-[1] pointer-events-none" aria-hidden />
        )}
        <img src={sprite} alt={pet.name} className="w-14 h-14 relative z-10 object-contain" />
        {hat && (
          <img src={hat} alt="" className="absolute -top-2 left-1/2 -translate-x-1/2 w-7 h-7 z-20 pointer-events-none object-contain" aria-hidden />
        )}
        {accessory && (() => {
          const p = getAccessoryPlacement(pet.equipped_accessory_slug);
          return (
            <img
              src={accessory}
              alt=""
              aria-hidden
              className={cn('absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none object-contain drop-shadow-sm', p.extraClass)}
              style={{ top: p.top, width: p.width, height: p.width, zIndex: p.zIndex }}
            />
          );
        })()}
      </div>


      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm truncate">{pet.name}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{STAGE_NAMES[pet.evolution_stage] || '—'}</Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Lv {pet.level}</Badge>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Sparkles className="w-3 h-3 text-pink-500" />
          <span>{pet.cheers_received_total} cổ vũ</span>
          <span className="capitalize">• {pet.mood}</span>
        </div>

        {!isOwn && showInput && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 120))}
              placeholder="Lời nhắn (tuỳ chọn, tối đa 120 ký tự)"
              className="h-8 text-xs"
              maxLength={120}
            />
            <Button size="sm" onClick={handleCheer} disabled={cheerMutation.isPending} className="h-8 px-2">
              {cheerMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Gửi'}
            </Button>
          </div>
        )}
      </div>

      {!isOwn && !compact && !showInput && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowInput(true)}
          className="shrink-0 border-pink-300 hover:bg-pink-100/60 dark:hover:bg-pink-900/30"
        >
          <Heart className="w-3 h-3 mr-1 text-pink-500 fill-pink-500" />
          Cổ vũ
        </Button>
      )}
    </Card>
  );
}
