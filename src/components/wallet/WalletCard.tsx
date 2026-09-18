import { useMemo } from 'react';
import { Copy, Check, ArrowDown, ArrowUp, RefreshCw, ShoppingCart, Wallet, LogOut, UserRoundCog, PlusCircle, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TokenBalance } from '@/hooks/useTokenBalances';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

import metamaskLogo from '@/assets/metamask-logo.png';
import bitgetLogo from '@/assets/bitget-logo.png';
import trustWalletLogo from '@/assets/trust-wallet-logo.png';
import funWalletLogoAsset from '@/assets/fun-wallet-logo.gif.asset.json';
const funWalletLogo = funWalletLogoAsset.url;

interface WalletCardProps {
  walletAddress: string | null;
  walletName: string;
  walletLogo?: string;
  connectorType?: 'metamask' | 'bitget' | 'trust' | 'fun' | 'other' | null;
  isConnected?: boolean;
  isLoading?: boolean;
  accountCount?: number;
  tokens: TokenBalance[];
  totalUsdValue: number;
  pricesUnavailable?: boolean;
  isTokensLoading: boolean;
  copied: boolean;
  onCopy: () => void;
  onRefresh: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSwitchAccount?: () => void;
  onAddCustomToken?: () => void;
  onHideCustomToken?: (tokenId: string) => void;
  onReceive: () => void;
  onSend: () => void;
  onSwap: () => void;
  onBuy: () => void;
}

const formatNumber = (num: number, decimals: number = 0) => {
  const fixed = num.toFixed(decimals);
  const [integerPart, decimalPart] = fixed.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (decimals > 0 && decimalPart) {
    return `${formattedInteger},${decimalPart}`;
  }
  return formattedInteger;
};

const formatUsd = (num: number) => `$${formatNumber(num, 2)}`;

const formatTokenBalance = (num: number) => {
  if (num > 0 && num < 0.000001) return formatNumber(num, 8);
  if (num > 0 && num < 0.01) return formatNumber(num, 6);
  if (Number.isInteger(num) || Math.abs(num - Math.round(num)) < 0.0001) {
    return formatNumber(Math.round(num), 0);
  }
  return formatNumber(num, 4);
};

const getWalletLogo = (connectorType: string | null | undefined) => {
  switch (connectorType) {
    case 'metamask': return metamaskLogo;
    case 'bitget': return bitgetLogo;
    case 'trust': return trustWalletLogo;
    case 'fun': return funWalletLogo;
    default: return metamaskLogo;
  }
};

export const WalletCard = ({
  walletAddress,
  walletName,
  walletLogo,
  connectorType,
  isConnected = false,
  isLoading = false,
  accountCount = 0,
  tokens,
  totalUsdValue,
  pricesUnavailable = false,
  isTokensLoading,
  copied,
  onCopy,
  onRefresh,
  onConnect,
  onDisconnect,
  onSwitchAccount,
  onAddCustomToken,
  onHideCustomToken,
  onReceive,
  onSend,
  onSwap,
  onBuy,
}: WalletCardProps) => {
  const { t } = useLanguage();

  const handleSendClick = () => {
    if (!walletAddress) {
      onConnect?.();
      return;
    }
    onSend();
  };

  const displayLogo = useMemo(() => {
    return walletLogo || getWalletLogo(connectorType);
  }, [walletLogo, connectorType]);

  const shortenedAddress = useMemo(() => {
    if (isLoading) return t('walletLoading');
    if (walletAddress) {
      return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    }
    return t('walletNoWallet');
  }, [walletAddress, isLoading, t]);

  const headerGradient = 'from-orange-600 via-amber-500 to-yellow-400';
  const borderColor = 'border-orange-200';

  return (
    <div className={cn(
      'bg-white rounded-2xl shadow-lg overflow-hidden border-2 transition-all hover:shadow-xl',
      borderColor
    )}>
      {/* Header */}
      <div className={cn('bg-gradient-to-r p-4', headerGradient)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <img src={displayLogo} alt={walletName} className="w-5 h-5" />
            <span className="font-bold text-white text-sm">
              {walletName}
            </span>
          </div>
          
          <div className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium',
            isConnected
              ? 'bg-green-500/30 text-green-100'
              : 'bg-white/20 text-white/80'
          )}>
            {isConnected ? t('walletPageConnected') : t('walletNotConnected')}
          </div>
        </div>

        {/* Address */}
        <div className="flex items-center gap-2">
          <button 
            onClick={onCopy}
            disabled={!walletAddress}
            className="flex items-center gap-1 text-white/90 hover:text-white transition-colors bg-white/10 px-3 py-1.5 rounded-full"
          >
            <span className="text-sm font-mono">{shortenedAddress}</span>
            {copied ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Total Value */}
      <div className="px-4 py-4 border-b bg-gradient-to-b from-gray-50 to-white">
        <p className="text-xs text-muted-foreground mb-1">{t('walletTotalAssets')}</p>
        {isTokensLoading ? (
          <div className="animate-pulse bg-gray-200 rounded h-8 w-32" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">
            {pricesUnavailable ? (
              <span className="text-base font-semibold text-muted-foreground" title="Chưa có giá thị trường">
                Chưa có giá
              </span>
            ) : (
              formatUsd(totalUsdValue)
            )}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-4 border-b bg-gray-50/50">
        <div className="flex justify-between gap-2">
          <button 
            onClick={onReceive}
            disabled={!walletAddress}
            className="flex-1 flex flex-col items-center gap-1 p-3 bg-white rounded-xl border hover:bg-gray-50 hover:border-primary transition-all disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100">
              <ArrowDown className="w-5 h-5 text-orange-600" />
            </div>
            <span className="text-xs font-medium text-gray-600">{t('walletReceive')}</span>
          </button>

          <button
            onClick={handleSendClick}
            className="flex-1 flex flex-col items-center gap-1 p-3 bg-white rounded-xl border hover:bg-gray-50 hover:border-primary transition-all"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100">
              <ArrowUp className="w-5 h-5 text-orange-600" />
            </div>
            <span className="text-xs font-medium text-gray-600">{t('walletSend')}</span>
          </button>

          <button 
            onClick={onSwap}
            className="flex-1 flex flex-col items-center gap-1 p-3 bg-white rounded-xl border hover:bg-gray-50 hover:border-primary transition-all"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100">
              <RefreshCw className="w-5 h-5 text-orange-600" />
            </div>
            <span className="text-xs font-medium text-gray-600">{t('walletSwap')}</span>
          </button>

          <button 
            onClick={onBuy}
            className="flex-1 flex flex-col items-center gap-1 p-3 bg-white rounded-xl border hover:bg-gray-50 hover:border-primary transition-all"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100">
              <ShoppingCart className="w-5 h-5 text-orange-600" />
            </div>
            <span className="text-xs font-medium text-gray-600">{t('walletBuy')}</span>
          </button>
        </div>
      </div>

      {/* Wallet Actions */}
      <div className="px-4 py-2 bg-orange-50/50 border-b flex items-center gap-2 flex-wrap">
        {!isConnected ? (
          <div className="w-full space-y-2">
            <Button
              onClick={onConnect}
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Wallet className="w-4 h-4 mr-1" />
              {t('walletConnectWallet')}
            </Button>
            <div className="sm:hidden rounded-lg border border-orange-200 bg-white/70 px-3 py-2 text-xs text-orange-700">
              Đang dùng điện thoại? Hãy mở bằng MetaMask, Trust Wallet hoặc Bitget Wallet để kết nối ổn định hơn.
            </div>
          </div>
        ) : (
          <>
            <Button
              onClick={onSwitchAccount}
              size="sm"
              variant="ghost"
              className="text-blue-600 hover:bg-blue-100"
            >
              <UserRoundCog className="w-4 h-4 mr-1" />
              {accountCount > 1 ? `${t('walletAccount')} (${accountCount})` : t('walletSwitch')}
            </Button>

            <Button
              onClick={onDisconnect}
              size="sm"
              variant="ghost"
              className="text-red-500 hover:bg-red-100"
            >
              <LogOut className="w-4 h-4 mr-1" />
              {t('walletDisconnect')}
            </Button>
          </>
        )}
      </div>

      {/* Tokens List */}
      <div className="divide-y">
        <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-600">{t('walletTokens')}</span>
          <div className="flex items-center gap-1">
            {onAddCustomToken && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddCustomToken}
                className="text-xs text-muted-foreground hover:text-primary h-7 px-2"
              >
                <PlusCircle className="w-3 h-3 mr-1" />
                Thêm token
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isTokensLoading}
              className="text-xs text-muted-foreground hover:text-primary h-7 px-2"
            >
              <RefreshCw className={cn('w-3 h-3 mr-1', isTokensLoading && 'animate-spin')} />
              {t('walletRefresh')}
            </Button>
          </div>
        </div>

        {tokens.map((token) => (
          <div key={`${token.symbol}-${token.contractAddress || 'native'}`} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center">
                  <img 
                    src={token.icon} 
                    alt={token.symbol} 
                    className={cn(
                      "w-full h-full object-cover rounded-full",
                      token.symbol === 'BTC' ? "scale-[1.2] -translate-x-px" :
                      token.symbol === 'BTCB' ? "scale-[1.35]" : ""
                    )} 
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm">{token.symbol}</p>
                  {token.isCustomToken && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      Custom
                    </span>
                  )}
                </div>
                <div className={cn(
                  'flex items-center text-xs',
                  token.change24h >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  <span>{token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%</span>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              {token.isLoading ? (
                <>
                  <span className="animate-pulse bg-gray-200 rounded w-14 h-4 inline-block mb-1" />
                  <span className="animate-pulse bg-gray-200 rounded w-16 h-3 inline-block" />
                </>
              ) : (
                <>
                  <p className="font-bold text-sm">
                    {token.usdValue > 0 ? (
                      formatUsd(token.usdValue)
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground" title="Chưa có giá thị trường">—</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(token.symbol === 'BTC' || token.symbol === 'BTCB')
                      ? formatNumber(token.balance, 8)
                      : formatTokenBalance(token.balance)} {token.symbol}
                  </p>
                </>
              )}
            </div>
            {token.isCustomToken && token.customTokenId && onHideCustomToken && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-2 rounded-full p-1.5 text-muted-foreground hover:bg-gray-100 hover:text-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white">
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => onHideCustomToken(token.customTokenId!)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Xóa token
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default WalletCard;
