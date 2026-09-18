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
import { Coins, Loader2, ExternalLink, PackageOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useSendToken } from '@/hooks/useSendToken';
import { findToken } from '@/lib/tokens';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import {
  useMysteryBoxCreateOrder,
  useMysteryBoxConfirm,
  mysteryBoxShopErrorToMessage,
} from '../hooks/useMysteryBoxShop';
import type { BoxDefinition } from '../types';
import { TIER_LABEL_VI } from '../types';

interface Props {
  def: BoxDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'review' | 'signing' | 'confirming' | 'done';

export function MysteryBoxPurchaseDialog({ def, open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>('review');
  const [txHash, setTxHash] = useState<string | null>(null);
  const createOrder = useMysteryBoxCreateOrder();
  const confirmOrder = useMysteryBoxConfirm();
  const { sendToken } = useSendToken();
  const camly = findToken('CAMLY')!;

  const handleBuy = async () => {
    try {
      setStep('signing');
      const order = await createOrder.mutateAsync(def.code);
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

      let lastErr: unknown = null;
      for (let i = 0; i < 20; i++) {
        try {
          await confirmOrder.mutateAsync({ order_id: order.order_id, tx_hash: hash });
          setStep('done');
          toast.success(`Đã mua thành công Hộp ${TIER_LABEL_VI[def.tier]}! Mở Kho hộp để mở ngay.`);
          return;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('NOT_ENOUGH_CONFIRMATIONS') || msg.includes('TX_NOT_FOUND')) {
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          throw e;
        }
      }
      throw lastErr ?? new Error('TIMEOUT');
    } catch (e) {
      toast.error(mysteryBoxShopErrorToMessage(e));
      setStep('review');
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setStep('review');
      setTxHash(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mua hộp bằng CAMLY</DialogTitle>
          <DialogDescription>
            Giao dịch on-chain trên BSC — CAMLY sẽ được gửi trực tiếp từ ví của bạn vào ví treasury,
            không thể hoàn lại sau khi xác nhận.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{def.name_vi}</span>
              <Badge variant="outline" className="capitalize text-[10px]">
                {TIER_LABEL_VI[def.tier]}
              </Badge>
            </div>
            <div className="flex items-center gap-1 pt-1 text-base font-bold">
              <Coins className="w-4 h-4 text-amber-500" />
              {def.cost_camly?.toLocaleString('vi-VN')}{' '}
              <span className="text-xs text-muted-foreground font-normal">CAMLY</span>
            </div>
          </div>

          {step === 'signing' && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Đang chờ bạn ký giao dịch trên ví…
            </p>
          )}
          {step === 'confirming' && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Đang xác minh thanh toán on-chain…
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
                Đã trừ CAMLY và cấp hộp vào Kho của bạn!
              </p>
              {txHash && (
                <a
                  href={getBscScanTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Xem giao dịch trên BscScan <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'done' ? (
            <Button onClick={() => handleClose(false)} className="w-full gap-1.5">
              <PackageOpen className="w-4 h-4" /> Mở Kho hộp
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={step !== 'review'}>
                Huỷ
              </Button>
              <Button onClick={handleBuy} disabled={step !== 'review'}>
                {step === 'review' ? 'Mua bằng CAMLY' : 'Đang xử lý…'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
