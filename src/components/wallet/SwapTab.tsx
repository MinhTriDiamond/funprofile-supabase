import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount, useSwitchChain, useConfig } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownUp, RefreshCw, AlertTriangle, ChevronDown, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { WALLET_TOKENS } from '@/lib/tokens';
import { SWAP_CONFIG, SWAPPABLE_SYMBOLS, DISABLED_SWAP_SYMBOLS, type SwappableSymbol } from '@/config/swap';
import {
  getSwapQuote,
  executeSwap,
  requiresApproval,
  approveToken,
  quoteExpired,
  getSpender,
  mapSwapError,
  type SwapQuote,
} from '@/modules/wallet/services/swapAsset';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/i18n/LanguageContext';

/* ─── Token lists ─── */
const swappableTokens = WALLET_TOKENS.filter(t =>
  (SWAPPABLE_SYMBOLS as readonly string[]).includes(t.symbol),
);
const disabledTokens = WALLET_TOKENS.filter(t =>
  (DISABLED_SWAP_SYMBOLS as readonly string[]).includes(t.symbol),
);

/* ─── TokenSelector — OUTSIDE SwapTab to prevent remounting ─── */
interface TokenSelectorProps {
  value: SwappableSymbol;
  onChange: (s: SwappableSymbol) => void;
  excludeSymbol: SwappableSymbol;
}

function TokenSelector({ value, onChange, excludeSymbol }: TokenSelectorProps) {
  const { t } = useLanguage();
  const selected = swappableTokens.find(t => t.symbol === value)!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors min-w-[120px] pointer-events-auto cursor-pointer"
        >
          <img src={selected.logo} alt={selected.symbol} className="w-6 h-6 rounded-full" />
          <span className="font-semibold text-foreground">{selected.symbol}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 bg-background border border-border shadow-xl z-[200]" sideOffset={4}>
        {swappableTokens
          .filter(t => t.symbol !== excludeSymbol)
          .map(t => (
            <DropdownMenuItem
              key={t.symbol}
              onClick={() => onChange(t.symbol as SwappableSymbol)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <img src={t.logo} alt={t.symbol} className="w-5 h-5 rounded-full" />
              <span className="font-medium">{t.symbol}</span>
              <span className="text-xs text-muted-foreground ml-auto">{t.name}</span>
            </DropdownMenuItem>
          ))}
        {disabledTokens.map(tk => (
          <DropdownMenuItem
            key={tk.symbol}
            disabled
            className="flex items-center gap-2 opacity-40 cursor-not-allowed"
          >
            <img src={tk.logo} alt={tk.symbol} className="w-5 h-5 rounded-full" />
            <span className="font-medium">{tk.symbol}</span>
            <span className="text-xs text-muted-foreground ml-auto">{t('swapComingSoon')}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─── SwapTab ─── */

interface SwapTabProps {
  walletAddress: `0x${string}` | undefined;
  onSuccess?: () => void;
}

export function SwapTab({ walletAddress, onSuccess }: SwapTabProps) {
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const wagmiConfig = useConfig();
  const { t } = useLanguage();

  const [fromSymbol, setFromSymbol] = useState<SwappableSymbol>('BNB');
  const [toSymbol, setToSymbol] = useState<SwappableSymbol>('USDT');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [error, setError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { tokens, refetch: refetchBalances } = useTokenBalances({ customAddress: walletAddress });

  const fromBalance = useMemo(() => {
    const tk = tokens.find(tk => tk.symbol === fromSymbol);
    return tk ? Number(tk.balance) : 0;
  }, [tokens, fromSymbol]);

  const isWrongChain = chainId !== SWAP_CONFIG.CHAIN_ID;

  const fetchQuote = useCallback(async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0 || fromSymbol === toSymbol) {
      setQuote(null);
      return;
    }
    setIsQuoting(true);
    setError('');
    try {
      const q = await getSwapQuote(fromSymbol, toSymbol, amount, wagmiConfig);
      setQuote(q);
      if (walletAddress) {
        const spender = getSpender(q);
        const needs = await requiresApproval(fromSymbol, amount, walletAddress, spender, wagmiConfig);
        setNeedsApproval(needs);
      }
    } catch (err: any) {
      setError(mapSwapError(err));
      setQuote(null);
    } finally {
      setIsQuoting(false);
    }
  }, [amount, fromSymbol, toSymbol, walletAddress, wagmiConfig]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }
    debounceRef.current = setTimeout(fetchQuote, SWAP_CONFIG.QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [amount, fromSymbol, toSymbol, fetchQuote]);

  const handleFlip = useCallback(() => {
    setFromSymbol(toSymbol);
    setToSymbol(fromSymbol);
    setAmount('');
    setQuote(null);
    setNeedsApproval(false);
  }, [fromSymbol, toSymbol]);

  const handleApprove = useCallback(async () => {
    if (!quote || !walletAddress) return;
    setIsApproving(true);
    try {
      const spender = getSpender(quote);
      await approveToken(fromSymbol, spender, wagmiConfig);
      setNeedsApproval(false);
      toast.success(`${t('swapApproved')} ${fromSymbol}`);
    } catch (err: any) {
      toast.error(mapSwapError(err));
    } finally {
      setIsApproving(false);
    }
  }, [quote, walletAddress, fromSymbol, wagmiConfig, t]);

  const handleSwap = useCallback(async () => {
    if (!quote || !walletAddress) return;
    if (quoteExpired(quote)) {
      toast.error(t('swapQuoteExpired'));
      fetchQuote();
      return;
    }
    setIsSwapping(true);
    try {
      const hash = await executeSwap(quote, walletAddress, wagmiConfig);
      const routeLabel = quote.routeSymbols.join(' → ');

      // Gọi edge record-swap (idempotent + verify on-chain).
      // Nếu fail vì lý do tạm (mạng/edge), lưu tx_hash vào localStorage để retry sau;
      // reconciliation-cron 30' sẽ là safety net cuối cùng.
      try {
        const { data: swapData, error: swapErr } = await supabase.functions.invoke('record-swap', {
          body: {
            tx_hash: hash,
            chain_id: SWAP_CONFIG.CHAIN_ID,
            from_symbol: quote.fromSymbol,
            to_symbol: quote.toSymbol,
            from_amount: quote.amountIn,
            to_amount: quote.amountOut,
            dex_provider: (quote as any).source ?? 'pancakeswap-v2',
            quote_id: (quote as any).id ?? null,
          },
        });
        if (swapErr || (swapData as any)?.error) {
          throw swapErr ?? new Error((swapData as any)?.error);
        }
      } catch (recordErr) {
        console.warn('[SwapTab] record-swap thất bại, đã ghi log bền:', recordErr);
        // Ghi log BỀN vào swap_failures (thay hàng đợi localStorage vốn không có consumer).
        try {
          await supabase.functions.invoke('log-swap-failure', {
            body: {
              stage: 'client_record_failed',
              tx_hash: hash,
              chain_id: SWAP_CONFIG.CHAIN_ID,
              reason: 'record_swap_invoke_failed',
              error_message: (recordErr as Error)?.message ?? String(recordErr),
              from_symbol: quote.fromSymbol,
              to_symbol: quote.toSymbol,
              from_amount: quote.amountIn,
              to_amount: quote.amountOut,
            },
          });
        } catch { /* log là best-effort, không chặn luồng */ }
        toast.warning(t('swtSyncPending'));
      }


      toast.success(
        `${t('swapSuccess')} ${quote.amountIn} ${quote.fromSymbol} → ${Number(quote.amountOut).toFixed(6)} ${quote.toSymbol}`,
        {
          description: (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Route: {routeLabel}</p>
              <a
                href={`https://bscscan.com/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary underline text-xs"
              >
                {t('swapViewOnBscScan')} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) as any,
          duration: 8000,
        },
      );
      setAmount('');
      setQuote(null);
      refetchBalances();
      onSuccess?.();
    } catch (err: any) {
      toast.error(mapSwapError(err));
    } finally {
      setIsSwapping(false);
    }
  }, [quote, walletAddress, wagmiConfig, fetchQuote, refetchBalances, onSuccess, t]);

  const handleMax = useCallback(() => {
    if (fromSymbol === 'BNB') {
      setAmount(Math.max(0, fromBalance - 0.005).toFixed(6));
    } else {
      setAmount(fromBalance.toString());
    }
  }, [fromBalance, fromSymbol]);

  const handleFromChange = useCallback((s: SwappableSymbol) => {
    setFromSymbol(s);
    setQuote(null);
    setAmount('');
  }, []);

  const handleToChange = useCallback((s: SwappableSymbol) => {
    setToSymbol(s);
    setQuote(null);
  }, []);

  if (!isConnected) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t('swapConnectWallet')}
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="text-center py-12 space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <p className="text-foreground font-medium">{t('swapSwitchToBsc')}</p>
        <Button
          onClick={() => switchChain({ chainId: bsc.id })}
          className="bg-primary hover:bg-primary/90"
        >
          {t('swapSwitchNetwork')}
        </Button>
      </div>
    );
  }

  const rateDisplay = quote && !isQuoting
    ? `1 ${fromSymbol} ≈ ${(Number(quote.amountOut) / Number(quote.amountIn)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${toSymbol}`
    : null;

  const routeDisplay = quote?.routeSymbols?.join(' → ') ?? null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {/* From */}
        <div className="bg-muted/50 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-medium">{t('swapSell')}</span>
            <button
              type="button"
              onClick={handleMax}
              className="text-xs text-primary font-semibold hover:underline truncate max-w-[60%] text-right"
            >
              {t('swapBalance')} {fromBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} — MAX
            </button>
          </div>
          <div className="flex items-center gap-3">
            <TokenSelector
              value={fromSymbol}
              onChange={handleFromChange}
              excludeSymbol={toSymbol}
            />
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              className="flex-1 min-w-0 bg-transparent text-right text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>

        {/* Flip button */}
        <div className="flex justify-center -my-1 relative z-[2]">
          <button
            type="button"
            onClick={handleFlip}
            className="bg-background border-4 border-muted rounded-xl p-2 hover:bg-muted transition-colors shadow-sm"
          >
            <ArrowDownUp className="w-5 h-5 text-primary" />
          </button>
        </div>

        {/* To */}
        <div className="bg-muted/50 rounded-2xl p-4 space-y-2">
          <span className="text-sm text-muted-foreground font-medium">{t('swapBuy')}</span>
          <div className="flex items-center gap-3">
            <TokenSelector
              value={toSymbol}
              onChange={handleToChange}
              excludeSymbol={fromSymbol}
            />
            <div className="flex-1 min-w-0 text-right text-2xl font-bold text-foreground truncate">
              {isQuoting ? (
                <Skeleton className="h-8 w-32 ml-auto" />
              ) : quote ? (
                Number(quote.amountOut).toLocaleString(undefined, { maximumFractionDigits: 8 })
              ) : (
                <span className="text-muted-foreground/50">0.00</span>
              )}
            </div>
          </div>
        </div>

        {/* Quote details */}
        {quote && !isQuoting && (
          <div className="bg-muted/30 rounded-xl p-3 text-sm space-y-1.5">
            {rateDisplay && (
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{t('swapRate')}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">{rateDisplay}</span>
                  <button type="button" onClick={fetchQuote} className="p-0.5 hover:text-primary transition-colors" title={t('swapRefreshQuote')}>
                    <RefreshCw className={`w-3.5 h-3.5 ${isQuoting ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>{t('swapMinReceived')}</span>
              <span className="font-medium text-foreground">
                {Number(quote.amountOutMin).toLocaleString(undefined, { maximumFractionDigits: 8 })} {toSymbol}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Slippage</span>
              <span>{SWAP_CONFIG.DEFAULT_SLIPPAGE / 100}%</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Route</span>
              <span className="font-medium text-foreground">{routeDisplay ?? 'PancakeSwap V2'}</span>
            </div>
            {quote.useFeeOnTransfer && (
              <div className="flex justify-between text-muted-foreground">
                <span>{t('swapMethod')}</span>
                <span className="text-xs text-amber-500">Fee-on-transfer safe</span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 text-destructive rounded-xl p-3 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Sticky footer — always visible */}
      <div className="sticky bottom-0 bg-background pt-3 pb-[env(safe-area-inset-bottom)]">
        {needsApproval && quote ? (
          <Button
            onClick={handleApprove}
            disabled={isApproving}
            className="w-full h-14 text-lg font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isApproving ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {t('swapApproving')}</>
            ) : (
              `Approve ${fromSymbol}`
            )}
          </Button>
        ) : (
          <Button
            onClick={handleSwap}
            disabled={!quote || isSwapping || isQuoting || !!error}
            className="w-full h-14 text-lg font-bold rounded-xl bg-primary hover:bg-primary/90"
          >
            {isSwapping ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {t('swapSwapping')}</>
            ) : isQuoting ? (
              <><RefreshCw className="w-5 h-5 mr-2 animate-spin" /> {t('swapGettingPrice')}</>
            ) : (
              'Swap'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
