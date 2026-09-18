import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { BTC_NEW_TX_DISABLED, BTC_MAINTENANCE_MESSAGE } from '@/config/btcFeature';

// Token logos
import funLogo from '@/assets/tokens/fun-logo.png';
import camlyLogo from '@/assets/tokens/camly-logo.webp';
import bnbLogo from '@/assets/tokens/bnb-logo.webp';
import usdtLogo from '@/assets/tokens/usdt-logo.webp';
import btcbLogo from '@/assets/tokens/btcb-logo.png';
import btcLogo from '@/assets/tokens/btc-logo.png';

export interface TokenOption {
  symbol: string;
  name: string;
  address: string | null; // null for native BNB
  decimals: number;
  logo: string;
  color: string;
}

export const SUPPORTED_TOKENS: TokenOption[] = [
  {
    symbol: 'FUN',
    name: 'FUN Money',
    address: '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6',
    decimals: 18,
    logo: funLogo,
    color: 'from-primary to-green-400',
  },
  {
    symbol: 'CAMLY',
    name: 'Camly Coin',
    address: '0x0910320181889feFDE0BB1Ca63962b0A8882e413',
    decimals: 3,
    logo: camlyLogo,
    color: 'from-purple-500 to-pink-400',
  },
  {
    symbol: 'BNB',
    name: 'BNB',
    address: null,
    decimals: 18,
    logo: bnbLogo,
    color: 'from-amber-400 to-yellow-300',
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    address: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
    logo: usdtLogo,
    color: 'from-emerald-500 to-green-400',
  },
  {
    symbol: 'BTCB',
    name: 'Bitcoin BEP20',
    address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    decimals: 18,
    logo: btcbLogo,
    color: 'from-orange-500 to-amber-400',
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    address: null,
    decimals: 8,
    logo: btcLogo,
    color: 'from-orange-500 to-amber-400',
  },
];

interface TokenSelectorProps {
  selectedToken: TokenOption;
  onSelect: (token: TokenOption) => void;
  disabledTokens?: string[];
  extraTokens?: TokenOption[];
}

export const TokenSelector = ({ selectedToken, onSelect, disabledTokens = [], extraTokens = [] }: TokenSelectorProps) => {
  const tokens = [...SUPPORTED_TOKENS, ...extraTokens];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {tokens.map((token) => {
        const isBtcFrozen = BTC_NEW_TX_DISABLED && token.symbol === 'BTC';
        const isDisabled = isBtcFrozen || disabledTokens.includes(token.symbol);
        return (
          <button
            key={`${token.symbol}-${token.address || 'native'}`}
            type="button"
            onClick={() => !isDisabled && onSelect(token)}
            disabled={isDisabled}
            title={isBtcFrozen ? BTC_MAINTENANCE_MESSAGE : isDisabled ? 'Chưa deploy trên Testnet' : token.name}
            className={cn(
              'flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200',
              isDisabled
                ? 'border-border opacity-40 cursor-not-allowed'
                : selectedToken.symbol === token.symbol && selectedToken.address === token.address
                  ? 'border-gold bg-gradient-to-br from-gold/20 to-amber-500/10 shadow-md'
                  : 'border-border hover:border-gold/50 hover:bg-muted/50'
            )}
          >
            <div className={cn(
              "rounded-full flex items-center justify-center mb-1 overflow-hidden",
              token.symbol === 'BTC' ? "w-[4.2rem] h-[4.2rem]" : token.symbol === 'BTCB' ? "w-12 h-12" : "w-10 h-10"
            )}>
              <img 
                src={token.logo} 
                alt={token.symbol} 
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-semibold text-sm">{token.symbol}</span>
            {isDisabled && <span className="text-[9px] text-muted-foreground leading-tight">{isBtcFrozen ? 'Bảo trì' : 'Chưa có'}</span>}
          </button>
        );
      })}
      <button
        type="button"
        disabled
        className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-dashed border-muted-foreground/30 opacity-50 cursor-not-allowed"
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1 bg-muted">
          <Plus className="w-5 h-5 text-muted-foreground" />
        </div>
        <span className="font-semibold text-sm text-muted-foreground">Khác</span>
      </button>
    </div>
  );
};
