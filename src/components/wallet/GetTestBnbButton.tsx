import { Button } from '@/components/ui/button';
import { Droplet, ExternalLink } from 'lucide-react';

const FAUCETS = [
  {
    name: 'BNB Chain Faucet (chính thức)',
    url: 'https://www.bnbchain.org/en/testnet-faucet',
  },
  {
    name: 'QuickNode tBNB Faucet',
    url: 'https://faucet.quicknode.com/binance-smart-chain/bnb-testnet',
  },
];

export const GetTestBnbButton = () => {
  const handleOpen = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FAUCETS.map((faucet) => (
          <Button
            key={faucet.url}
            onClick={() => handleOpen(faucet.url)}
            variant="outline"
            className="w-full"
          >
            <Droplet className="w-4 h-4 mr-2" />
            <span className="truncate">{faucet.name}</span>
            <ExternalLink className="w-3 h-3 ml-2 opacity-70" />
          </Button>
        ))}
      </div>
      <p className="text-xs text-center text-muted-foreground px-2">
        Nhận tBNB miễn phí để trả phí gas khi ký giao dịch trên BSC Testnet. Dán địa chỉ ví của bạn vào faucet.
      </p>
    </div>
  );
};
