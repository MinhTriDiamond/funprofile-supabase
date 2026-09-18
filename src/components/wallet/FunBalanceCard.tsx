import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Lock, Zap, Coins, RefreshCw, ArrowRight, ExternalLink, Loader2 } from 'lucide-react';
import { useFunBalance } from '@/hooks/useFunBalance';
import { formatFUN, getAddressUrl, FUN_MONEY_CONTRACT } from '@/config/pplp';
import funLogo from '@/assets/tokens/fun-logo.png';
import { useLanguage } from '@/i18n/LanguageContext';
import { AddFunTokenButton } from './AddFunTokenButton';

interface FunBalanceCardProps {
  walletAddress?: `0x${string}`;
  onActivate?: () => void;
  onClaim?: () => void;
}

export const FunBalanceCard = ({ walletAddress, onActivate, onClaim }: FunBalanceCardProps) => {
  const { total, locked, activated, isLoading, refetch } = useFunBalance(walletAddress);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { t } = useLanguage();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const activatedPercent = total > 0 ? (activated / total) * 100 : 0;

  if (!walletAddress) {
    return (
      <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
        <CardContent className="py-8 text-center">
          <Coins className="w-12 h-12 mx-auto text-amber-400 mb-4" />
          <p className="text-muted-foreground">{t('walletConnectToView')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 text-white pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <img src={funLogo} alt="FUN" className="w-6 h-6 rounded-full" />
            {t('walletFunBalance')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20" onClick={handleRefresh} disabled={isLoading || isRefreshing}>
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <a href={getAddressUrl(walletAddress)} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-amber-50 rounded-xl p-4 text-center border border-amber-100">
                <div className="flex items-center justify-center gap-1 mb-2">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">{t('walletLocked')}</span>
                </div>
                <p className="text-xl font-bold text-amber-700">{formatFUN(locked)}</p>
                <p className="text-xs text-muted-foreground">FUN</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
                <div className="flex items-center justify-center gap-1 mb-2">
                  <Zap className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-medium text-green-700">{t('walletActivated')}</span>
                </div>
                <p className="text-xl font-bold text-green-700">{formatFUN(activated)}</p>
                <p className="text-xs text-muted-foreground">FUN</p>
              </div>
              <div className="bg-gradient-to-br from-amber-100 to-orange-100 rounded-xl p-4 text-center border border-amber-200">
                <div className="flex items-center justify-center gap-1 mb-2">
                  <Coins className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-medium text-amber-800">{t('walletTotal')}</span>
                </div>
                <p className="text-xl font-bold text-amber-800">{formatFUN(total)}</p>
                <p className="text-xs text-muted-foreground">FUN</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('walletActivateProgress')}</span>
                <span className="font-medium text-green-600">{activatedPercent.toFixed(1)}%</span>
              </div>
              <Progress value={activatedPercent} className="h-3 bg-amber-100" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>🔒 {formatFUN(locked)} locked</span>
                <span>⚡ {formatFUN(activated)} activated</span>
              </div>
            </div>

            <div className="flex gap-3">
              {locked > 0 && onActivate && (
                <Button onClick={onActivate} className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                  <Lock className="w-4 h-4 mr-2" />
                  {t('walletActivateFun')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
              {activated > 0 && onClaim && (
                <Button onClick={onClaim} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
                  <Zap className="w-4 h-4 mr-2" />
                  {t('walletClaimFun')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">Contract: {FUN_MONEY_CONTRACT.address.slice(0, 8)}...</Badge>
              <Badge variant="outline" className="text-xs">BSC Testnet</Badge>
            </div>

            <AddFunTokenButton />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
