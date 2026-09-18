import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Lock, Zap, ArrowRight, Loader2, ExternalLink } from 'lucide-react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';
import { toast } from 'sonner';
import { FUN_MONEY_CONTRACT, FUN_MONEY_ABI, toWei, formatFUN, getTxUrl } from '@/config/pplp';
import funLogo from '@/assets/tokens/fun-logo.png';

interface ActivateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockedBalance: number;
  onSuccess?: () => void;
}

export const ActivateDialog = ({
  open,
  onOpenChange,
  lockedBalance,
  onSuccess,
}: ActivateDialogProps) => {
  const { address } = useAccount();
  const [amount, setAmount] = useState<number>(0);
  const [sliderValue, setSliderValue] = useState<number[]>([0]);
  const lastToastedHash = useRef<string | null>(null);

  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Reset khi dialog mở lại
  useEffect(() => {
    if (open) {
      setAmount(0);
      setSliderValue([0]);
    }
  }, [open]);

  // Sync slider with amount
  useEffect(() => {
    if (lockedBalance > 0) {
      const percent = (amount / lockedBalance) * 100;
      setSliderValue([Math.min(100, Math.max(0, percent))]);
    }
  }, [amount, lockedBalance]);

  // Handle success — chỉ toast 1 lần cho mỗi txHash
  useEffect(() => {
    if (isSuccess && txHash && txHash !== lastToastedHash.current) {
      lastToastedHash.current = txHash;
      toast.success('Activate thành công!', {
        description: 'FUN của bạn đã được kích hoạt.',
        action: {
          label: 'Xem TX',
          onClick: () => window.open(getTxUrl(txHash), '_blank'),
        },
      });
      onOpenChange(false);
      onSuccess?.();
    }
  }, [isSuccess, txHash, onOpenChange, onSuccess]);

  const handleSliderChange = (value: number[]) => {
    setSliderValue(value);
    const newAmount = (value[0] / 100) * lockedBalance;
    setAmount(Math.floor(newAmount));
  };

  const handleMaxClick = () => {
    setAmount(Math.floor(lockedBalance));
    setSliderValue([100]);
  };

  const handleActivate = async () => {
    if (!address || amount <= 0) return;

    // Ẩn dialog tạm để không chặn popup ví (MetaMask)
    onOpenChange(false);

    try {
      const amountWei = toWei(amount);

      await writeContractAsync({
        address: FUN_MONEY_CONTRACT.address,
        abi: FUN_MONEY_ABI,
        functionName: 'activate',
        args: [amountWei],
        chainId: FUN_MONEY_CONTRACT.chainId,
        // Override gas cứng — tránh MetaMask Mobile estimate quá cao
        // (vượt cap 16.78M của BSC). activate() thực tế chỉ ~150–250k gas.
        gas: 300_000n,
      } as any);

      // Toast is handled by the success effect
    } catch (error: unknown) {
      console.error('[ActivateDialog] Error:', error);
      // Mở lại dialog nếu lỗi/reject
      onOpenChange(true);
      const msg = error instanceof Error ? error.message : '';
      const shortMsg = (error as { shortMessage?: string })?.shortMessage;
      const combined = `${msg} ${shortMsg ?? ''}`.toLowerCase();
      if (msg.includes('User rejected')) {
        toast.error('Đã hủy giao dịch');
      } else if (msg.includes('insufficient funds')) {
        toast.error('Không đủ BNB để trả gas');
      } else if (combined.includes('gas limit too high') || combined.includes('gas limit')) {
        toast.error('Ví estimate gas quá cao', {
          description: 'Mở MetaMask → Advanced → Edit gas → đặt Gas Limit = 300000 rồi gửi lại ạ.',
          duration: 8000,
        });
      } else {
        toast.error(shortMsg || 'Không thể activate FUN');
      }
    }
  };

  const isProcessing = isPending || isConfirming;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-2 rounded-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            Activate FUN Money
          </DialogTitle>
          <DialogDescription>
            Chuyển FUN từ trạng thái LOCKED sang ACTIVATED để sử dụng trong hệ sinh thái
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Balance */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-600" />
                <span className="text-sm text-amber-700">Số dư LOCKED</span>
              </div>
              <div className="flex items-center gap-2">
                <img src={funLogo} alt="FUN" className="w-5 h-5 rounded-full" />
                <span className="font-bold text-amber-700">{formatFUN(lockedBalance)} FUN</span>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Số lượng Activate</Label>
              <Button variant="ghost" size="sm" onClick={handleMaxClick}>
                Max
              </Button>
            </div>
            
            <div className="relative">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.min(lockedBalance, Number(e.target.value) || 0))}
                max={lockedBalance}
                min={0}
                className="pr-16 text-lg"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                FUN
              </span>
            </div>

            {/* Slider */}
            <Slider
              value={sliderValue}
              onValueChange={handleSliderChange}
              max={100}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gradient-to-r from-amber-50 to-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <Lock className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">LOCKED</p>
                <p className="font-semibold text-amber-600">-{formatFUN(amount)}</p>
              </div>
              <ArrowRight className="w-6 h-6 text-muted-foreground" />
              <div className="text-center">
                <Zap className="w-6 h-6 text-green-500 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">ACTIVATED</p>
                <p className="font-semibold text-green-600">+{formatFUN(amount)}</p>
              </div>
            </div>
          </div>

          {/* Gas Warning */}
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <Badge variant="outline" className="text-xs shrink-0">Gas Fee</Badge>
            <p>Giao dịch này yêu cầu một lượng nhỏ BNB để trả phí gas trên BSC Testnet</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Hủy
          </Button>
          <Button
            onClick={handleActivate}
            disabled={amount <= 0 || isProcessing}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isConfirming ? 'Đang xác nhận...' : 'Đang gửi...'}
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Activate {formatFUN(amount)} FUN
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
