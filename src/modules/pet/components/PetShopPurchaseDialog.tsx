import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, Loader2, ExternalLink, Backpack, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useSendToken } from '@/hooks/useSendToken';
import { findToken } from '@/lib/tokens';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import { resolveItemSprite } from '@/modules/pet/lib/petAssets';
import { cn } from '@/lib/utils';
import {
  usePetShopCreateOrder,
  usePetShopConfirm,
  petShopErrorToMessage,
  type ShopItem,
} from '@/modules/pet/hooks/usePetShop';


interface Props {
  item: ShopItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenInventory?: () => void;
}

type Step = 'review' | 'signing' | 'confirming' | 'done';

export function PetShopPurchaseDialog({ item, open, onOpenChange, onOpenInventory }: Props) {
  const [step, setStep] = useState<Step>('review');
  const [txHash, setTxHash] = useState<string | null>(null);
  const createOrder = usePetShopCreateOrder();
  const confirmOrder = usePetShopConfirm();
  const { sendToken } = useSendToken();

  const camly = findToken('CAMLY')!;

  const handleBuy = async () => {
    try {
      setStep('signing');
      const order = await createOrder.mutateAsync(item.id);
      const hash = await sendToken({
        token: camly,
        recipient: order.treasury_address,
        amount: String(order.price_camly),
        targetChainId: order.chain_id,
        skipBackground: true,
      });
      if (!hash) {
        setStep('review');
        return;
      }
      setTxHash(hash);
      setStep('confirming');

      // Poll confirm tới ~3 phút (60 lần × 3s). Nếu user đóng dialog giữa chừng,
      // realtime listener (useShopOrdersRealtime) ở PetShopPage vẫn sẽ cập nhật
      // kho + bắn toast khi backend xác nhận xong.
      let lastErr: unknown = null;
      for (let i = 0; i < 60; i++) {
        try {
          await confirmOrder.mutateAsync({ order_id: order.order_id, tx_hash: hash });
          setStep('done');
          toast.success(`Đã mua thành công ${item.name_vi}!`);
          return;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          if (
            msg.includes('NOT_ENOUGH_CONFIRMATIONS') ||
            msg.includes('TX_NOT_FOUND') ||
            msg.includes('ORDER_NOT_PENDING')
          ) {
            // ORDER_NOT_PENDING = backend đã finalize từ trước (race) → coi như thành công
            if (msg.includes('ORDER_NOT_PENDING')) {
              setStep('done');
              toast.success(`Đã nhận ${item.name_vi}!`);
              return;
            }
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          throw e;
        }
      }
      // Hết thời gian poll nhưng giao dịch có thể vẫn đang chờ xác nhận →
      // không báo lỗi, chỉ thông báo nhẹ và để realtime listener xử lý tiếp.
      toast.message('Giao dịch đang chờ mạng BSC xác nhận. Bạn có thể đóng cửa sổ — chúng tôi sẽ báo ngay khi nhận được trang phục.');
      setStep('review');
      void lastErr;
    } catch (e) {
      toast.error(petShopErrorToMessage(e));
      setStep('review');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mua trang phục cho Lumi</DialogTitle>
          <DialogDescription>
            Giao dịch on-chain trên BSC — không thể hoàn lại sau khi xác nhận.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex gap-3">
              <div
                className={cn(
                  'shrink-0 w-20 h-20 rounded-lg flex items-center justify-center overflow-hidden',
                  item.slot === 'aura'
                    ? 'bg-gradient-to-br from-amber-50 to-rose-50'
                    : 'bg-gradient-to-br from-sky-50 to-violet-50',
                )}
              >
                {(() => {
                  const sprite = resolveItemSprite(item.slot, item.slug, 3);
                  return sprite ? (
                    <img src={sprite} alt={item.name_vi} className="w-full h-full object-contain" />
                  ) : (
                    <Sparkles className="w-8 h-8 text-muted-foreground/50" />
                  );
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{item.name_vi}</span>
                  <Badge variant="outline" className="capitalize text-[10px] shrink-0">
                    {item.rarity}
                  </Badge>
                </div>
                {item.description_vi && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description_vi}</p>
                )}
                <div className="flex items-center gap-1 pt-1 text-base font-bold">
                  <Coins className="w-4 h-4 text-amber-500" />
                  {item.price_camly.toLocaleString('vi-VN')}{' '}
                  <span className="text-xs text-muted-foreground font-normal">CAMLY</span>
                </div>
              </div>
            </div>
          </div>


          {step === 'signing' && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Đang chờ bạn xác nhận giao dịch trên ví…
            </p>
          )}
          {step === 'confirming' && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Đang chờ xác nhận on-chain…
              </p>
              {txHash && (
                <a
                  href={getBscScanTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Xem trên BscScan <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
          {step === 'done' && (
            <div className="space-y-2">
              <p className="text-sm text-emerald-600 font-semibold">
                Đã cấp trang phục cho Lumi của bạn!
              </p>
              <p className="text-xs text-muted-foreground">
                Mở <span className="font-medium text-foreground">Tủ đồ của tôi</span> rồi bấm{' '}
                <span className="font-medium text-foreground">Trang bị</span> để Lumi mặc món vừa mua.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'done' ? (
            <div className="flex w-full gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
                Đóng
              </Button>
              {onOpenInventory && (
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    onOpenInventory();
                  }}
                  className="flex-1 sm:flex-none gap-1.5"
                >
                  <Backpack className="w-4 h-4" />
                  Mở tủ đồ
                </Button>
              )}
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={step !== 'review'}
              >
                Huỷ
              </Button>
              <Button onClick={handleBuy} disabled={step !== 'review'}>
                {step === 'review' ? `Mua bằng CAMLY` : 'Đang xử lý…'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
