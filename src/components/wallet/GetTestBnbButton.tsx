import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { Droplet, ExternalLink } from 'lucide-react';

interface Faucet {
  name?: string;
  nameKey?: string;
  url: string;
}

const FAUCETS: Faucet[] = [
  {
    nameKey: 'gtbOfficialFaucetName',
    url: 'https://www.bnbchain.org/en/testnet-faucet',
  },
  {
    name: 'QuickNode tBNB Faucet',
    url: 'https://faucet.quicknode.com/binance-smart-chain/bnb-testnet',
  },
];

export const GetTestBnbButton = () => {
  const { t } = useLanguage();
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
            <span className="truncate">{faucet.nameKey ? t(faucet.nameKey as any) : faucet.name}</span>
            <ExternalLink className="w-3 h-3 ml-2 opacity-70" />
          </Button>
        ))}
      </div>
      <p className="text-xs text-center text-muted-foreground px-2">
        {t('gtbDesc')}
      </p>
    </div>
  );
};
