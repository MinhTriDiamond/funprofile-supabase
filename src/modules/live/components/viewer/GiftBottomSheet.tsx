import { Gift, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useHaptics } from '@/hooks/useHaptics';

interface GiftBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESETS = [50, 100, 500];

export function GiftBottomSheet({ open, onOpenChange }: GiftBottomSheetProps) {
  const haptic = useHaptics();

  const sendPreviewGift = (amount: number) => {
    haptic('success');
    toast.success(`Bạn đã gửi ${amount} Happy Camly Coin 🎁`);
    onOpenChange(false);
    // TODO: Connect to the real donation/gift transaction flow when live gifts are enabled.
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="border-white/10 bg-zinc-950 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-white">
        <DrawerHeader className="px-0 text-left">
          <DrawerTitle className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/15 text-amber-200">
              <Gift className="h-5 w-5" />
            </span>
            Gửi Happy Camly Coin
          </DrawerTitle>
        </DrawerHeader>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-amber-100">
            <Sparkles className="h-4 w-4" />
            Lan tỏa yêu thương đến host live
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((amount) => (
              <Button
                key={amount}
                type="button"
                variant="secondary"
                className="h-16 flex-col rounded-2xl border border-amber-300/20 bg-black/30 text-amber-100 hover:bg-amber-300/20"
                onClick={() => sendPreviewGift(amount)}
              >
                <span className="text-lg font-black">{amount}</span>
                <span className="text-[11px]">Camly Coin</span>
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-amber-100/70">
            Tính năng giao dịch thật sẽ được nối với ví quà tặng ở bước sau.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
