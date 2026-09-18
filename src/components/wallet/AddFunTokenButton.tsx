import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wallet, Check, Loader2 } from 'lucide-react';
import { useWalletClient } from 'wagmi';
import { FUN_MONEY_CONTRACT } from '@/config/pplp';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import funLogo from '@/assets/tokens/fun-logo.png';

export const AddFunTokenButton = () => {
  const { data: walletClient } = useWalletClient();
  const [isAdding, setIsAdding] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const { t } = useLanguage();

  const handleAddToken = async () => {
    if (!walletClient) {
      toast.error(t('walletConnectToView'));
      return;
    }

    setIsAdding(true);
    try {
      const success = await walletClient.watchAsset({
        type: 'ERC20',
        options: {
          address: FUN_MONEY_CONTRACT.address,
          symbol: FUN_MONEY_CONTRACT.symbol,
          decimals: FUN_MONEY_CONTRACT.decimals,
          image: window.location.origin + funLogo,
        },
      });

      if (success) {
        setIsAdded(true);
        toast.success(t('addFunTokenSuccess'));
        setTimeout(() => setIsAdded(false), 3000);
      }
    } catch (error) {
      console.error('Failed to add token:', error);
      toast.error(t('addFunTokenError'));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleAddToken}
        disabled={isAdding}
        variant="outline"
        className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
      >
        {isAdding ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : isAdded ? (
          <Check className="w-4 h-4 mr-2 text-green-600" />
        ) : (
          <Wallet className="w-4 h-4 mr-2" />
        )}
        {isAdded ? t('addFunTokenDone') : t('addFunTokenButton')}
      </Button>
      <p className="text-xs text-center text-muted-foreground px-2">
        {t('addFunTokenNote')}
      </p>
    </div>
  );
};
