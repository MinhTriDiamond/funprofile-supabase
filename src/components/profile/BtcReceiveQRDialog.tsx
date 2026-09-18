/**
 * BtcReceiveQRDialog — Dialog hiện QR code để nhận BTC
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Share2 } from 'lucide-react';
import { copyToClipboard } from '@/utils/clipboard';
import { toast } from 'sonner';
import btcLogo from '@/assets/tokens/btc-logo.png';

interface BtcReceiveQRDialogProps {
  isOpen: boolean;
  onClose: () => void;
  btcAddress: string;
  username?: string;
}

export function BtcReceiveQRDialog({ isOpen, onClose, btcAddress, username }: BtcReceiveQRDialogProps) {
  const bip21Url = `bitcoin:${btcAddress}`;

  const handleCopy = () => {
    copyToClipboard(btcAddress);
    toast.success('Đã sao chép địa chỉ BTC');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Gửi BTC cho ${username || 'tôi'}`,
          text: `Địa chỉ BTC: ${btcAddress}`,
          url: bip21Url,
        });
      } catch {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <img src={btcLogo} alt="BTC" className="w-6 h-6 rounded-full" />
            Nhận Bitcoin
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* QR Code */}
          <div className="flex justify-center">
            <div className="p-3 bg-white rounded-xl border-2 border-orange-200 shadow-sm">
              <QRCodeSVG value={bip21Url} size={200} level="H" includeMargin={true} />
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Quét QR code hoặc sao chép địa chỉ bên dưới để nhận BTC
          </p>

          {/* Address */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground mb-0.5">Địa chỉ BTC</p>
              <p className="text-xs font-mono break-all">{btcAddress}</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleCopy}>
              <Copy className="w-4 h-4" />
              Sao chép
            </Button>
            <Button size="sm" className="flex-1 gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600" onClick={handleShare}>
              <Share2 className="w-4 h-4" />
              Chia sẻ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
