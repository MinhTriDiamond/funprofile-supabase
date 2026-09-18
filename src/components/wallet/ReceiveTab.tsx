import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from '@/i18n/LanguageContext';
import { copyToClipboard } from '@/utils/clipboard';

interface ReceiveTabProps {
  walletAddress?: string;
  btcAddress?: string | null;
  selectedNetwork?: 'evm' | 'bitcoin';
}

export const ReceiveTab = ({ walletAddress, btcAddress, selectedNetwork = 'evm' }: ReceiveTabProps) => {
  const { address: connectedAddress } = useAccount();
  const { t } = useLanguage();
  
  const address = selectedNetwork === 'bitcoin' ? (btcAddress || undefined) : (walletAddress || connectedAddress);

  const handleCopy = () => {
    if (address) {
      copyToClipboard(address).then((ok) => {
        if (ok) toast.success(t('walletAddressCopied'));
        else toast.error('Không thể sao chép');
      });
    }
  };

  const handleShare = async () => {
    if (address) {
      if (navigator.share) {
        try {
          await navigator.share({
            title: t('walletMyAddress'),
            text: `${t('walletSendTo')}: ${address}`,
          });
        } catch (err) {
          // Error sharing - fallback to copy
        }
      } else {
        handleCopy();
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('walletReceiveMoney')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center space-y-4">
          <div className="bg-muted p-6 rounded-lg">
            <div className="bg-white p-4 inline-block rounded-lg shadow-lg">
              {address && (
                <QRCodeSVG 
                  value={address} 
                  size={192}
                  level="H"
                  includeMargin={true}
                />
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('walletYourAddress')}</p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="flex-1 text-xs break-all">{address}</code>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCopy}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4 mr-2" />
              {t('walletCopyAddress')}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4 mr-2" />
              {t('walletShareAddress')}
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground">
            {t('walletScanQr')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
