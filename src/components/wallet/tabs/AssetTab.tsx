import { useState } from 'react';
import { WalletCard } from '../WalletCard';
import { AlertTriangle, Copy, Check, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { copyToClipboard } from '@/utils/clipboard';
import { toast } from 'sonner';
import { useBtcBalance } from '@/hooks/useBtcBalance';
import { cn } from '@/lib/utils';
import btcLogo from '@/assets/tokens/btc-logo.png';

interface AssetTabProps {
  walletAddress: string | null;
  walletName: string;
  connectorType: 'metamask' | 'bitget' | 'trust' | 'fun' | 'other' | null;
  isConnected: boolean;
  accountCount: number;
  tokens: any[];
  totalUsdValue: number;
  pricesUnavailable?: boolean;
  isTokensLoading: boolean;
  copied: boolean;
  chainId: number | undefined;
  btcAddress?: string | null;
  selectedNetwork?: 'evm' | 'bitcoin';
  prices?: Record<string, { usd: number; usd_24h_change: number }>;
  onCopy: () => void;
  onRefresh: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchAccount: () => void;
  onAddCustomToken?: () => void;
  onHideCustomToken?: (tokenId: string) => void;
  onReceive: () => void;
  onSend: () => void;
  onSwap: () => void;
  onBuy: () => void;
}

export function AssetTab({
  walletAddress,
  walletName,
  connectorType,
  isConnected,
  accountCount,
  tokens,
  totalUsdValue,
  pricesUnavailable = false,
  isTokensLoading,
  copied,
  chainId,
  btcAddress,
  selectedNetwork = 'evm',
  prices = {},
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
}: AssetTabProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const bscTestnetId = 97;
  const [btcCopied, setBtcCopied] = useState(false);
  const { balance: btcBalance, totalReceived: btcTotalReceived, totalSent: btcTotalSent, txCount: btcTxCount, isLoading: isBtcBalanceLoading, error: btcError, refetch: refetchBtc } = useBtcBalance(btcAddress);

  // Chỉ dùng giá thật — không có giá thị trường thì để 0 và báo "Chưa có giá"
  const btcPrice = typeof prices?.BTC?.usd === 'number' ? prices.BTC.usd : 0;
  const btcChange = prices?.BTC?.usd_24h_change ?? 0;
  const btcPriceUnavailable = btcPrice === 0;
  const btcUsdValue = btcBalance * btcPrice;
  const combinedTotalUsdValue = totalUsdValue + btcUsdValue;

  // BTC token object to merge into token list
  const btcTokenObj = btcAddress ? {
    symbol: 'BTC',
    icon: btcLogo,
    balance: btcBalance,
    usdValue: btcUsdValue,
    change24h: btcChange,
    isLoading: isBtcBalanceLoading,
  } : null;

  // BTC is shown in a separate card below, not merged into token list

  const shortenBtc = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  const formatUsd = (value: number) => {
    if (value >= 1000) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(6)}`;
  };

  const handleCopyBtc = async () => {
    if (!btcAddress) return;
    const ok = await copyToClipboard(btcAddress);
    if (ok) {
      setBtcCopied(true);
      toast.success(t('walletAddressCopied'));
      setTimeout(() => setBtcCopied(false), 2000);
    }
  };

  if (selectedNetwork === 'bitcoin') {
    return (
      <div className="space-y-4">
        {/* Tổng tài sản (bao gồm EVM + BTC) */}
        <div className="bg-card rounded-2xl shadow-lg overflow-hidden border-2 border-orange-200">
          <div className="px-4 py-4 border-b bg-gradient-to-b from-muted/50 to-card">
            <p className="text-xs text-muted-foreground mb-1">{t('walletTotalAssets')}</p>
            <p className="text-2xl font-bold text-foreground">
              {formatUsd(combinedTotalUsdValue)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">EVM + BTC on-chain</p>
          </div>
        </div>

        {/* Giải thích khi BTC = 0 nhưng đã từng nhận */}
        {btcAddress && btcBalance === 0 && btcTotalReceived > 0 && !isBtcBalanceLoading && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Số dư BTC hiện tại: 0
            </p>
            <p>Địa chỉ này đã nhận tổng cộng {btcTotalReceived.toFixed(8)} BTC nhưng toàn bộ UTXO đã được chi.</p>
            <p className="text-muted-foreground">Hệ thống theo dõi đúng 1 địa chỉ BTC đã lưu. Ví di động (HD wallet) có thể hiển thị khác do cộng dồn nhiều địa chỉ.</p>
          </div>
        )}

        {/* Bitcoin Network Address Section */}
        {/* Bitcoin Network Address Section */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-orange-200">
          <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400 px-4 py-3 flex items-center gap-2">
            <img src={btcLogo} alt="BTC" className="w-16 h-16 rounded-full" />
            <span className="font-bold text-white text-sm">BTC</span>
          </div>

          <div className="px-4 py-3">
            {btcAddress ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground">Địa chỉ:</span>
                  <span className="text-sm font-mono truncate">{shortenBtc(btcAddress)}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={handleCopyBtc}
                    className="p-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                    title="Copy"
                  >
                    {btcCopied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <a
                    href={`https://mempool.space/address/${btcAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                    title="Xem trên Mempool"
                  >
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Chưa liên kết địa chỉ BTC</span>
                <button
                  onClick={() => navigate('/edit-profile')}
                  className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors"
                >
                  + Thêm địa chỉ
                </button>
              </div>
            )}
          </div>

          {/* BTC Balance Row */}
          {btcAddress && (
            <div className="border-t border-orange-100 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={btcLogo} alt="BTC" className="w-14 h-14 rounded-full" />
                  <div>
                    <p className="font-semibold text-sm">BTC</p>
                    <div className={cn(
                      'flex items-center text-xs',
                      btcChange >= 0 ? 'text-green-600' : 'text-red-600'
                    )}>
                      <span>{btcChange >= 0 ? '+' : ''}{btcChange.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {isBtcBalanceLoading ? (
                    <>
                      <span className="animate-pulse bg-gray-200 rounded w-14 h-4 inline-block mb-1" />
                      <span className="animate-pulse bg-gray-200 rounded w-16 h-3 inline-block" />
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-sm">{formatUsd(btcUsdValue)}</p>
                      <p className="text-xs text-muted-foreground">
                        {btcBalance.toFixed(8)} BTC
                      </p>
                      {btcError && (
                        <button onClick={refetchBtc} className="text-xs text-orange-500 hover:text-orange-600 mt-0.5">
                          ⚠️ Thử lại
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {/* Chi tiết thống kê */}
              {!isBtcBalanceLoading && (
              <div className="mt-2 pt-2 border-t border-orange-50 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">📥 Tổng nhận <span className="text-orange-400">(on-chain)</span></p>
                    <p className="text-xs font-medium">{btcTotalReceived.toFixed(8)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">📤 Tổng gửi <span className="text-orange-400">(on-chain)</span></p>
                    <p className="text-xs font-medium">{btcTotalSent.toFixed(8)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">🔄 Giao dịch <span className="text-orange-400">(on-chain)</span></p>
                    <p className="text-xs font-medium">{btcTxCount}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {chainId === bscTestnetId && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
          <span className="text-sm text-orange-700">
            {t('walletTestnetWarning')}
          </span>
        </div>
      )}

      <WalletCard
        walletAddress={walletAddress}
        walletName={walletName}
        connectorType={connectorType}
        isConnected={isConnected}
        accountCount={accountCount}
        tokens={tokens}
        totalUsdValue={combinedTotalUsdValue}
        pricesUnavailable={pricesUnavailable || btcPriceUnavailable}
        isTokensLoading={isTokensLoading}
        copied={copied}
        onCopy={onCopy}
        onRefresh={onRefresh}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onSwitchAccount={onSwitchAccount}
        onAddCustomToken={chainId === 56 ? onAddCustomToken : undefined}
        onHideCustomToken={onHideCustomToken}
        onReceive={onReceive}
        onSend={onSend}
        onSwap={onSwap}
        onBuy={onBuy}
      />

      {/* Khung BTC riêng */}
      <div className="bg-card rounded-2xl shadow-lg overflow-hidden border-2 border-orange-200">
        <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400 px-4 py-3 flex items-center gap-2">
          <img src={btcLogo} alt="BTC" className="w-16 h-16 rounded-full" />
          <span className="font-bold text-white text-sm">BTC</span>
        </div>

        <div className="px-4 py-3">
          {btcAddress ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground">Địa chỉ:</span>
                <span className="text-sm font-mono truncate">{shortenBtc(btcAddress)}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleCopyBtc}
                  className="p-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                  title="Copy"
                >
                  {btcCopied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <a
                  href={`https://mempool.space/address/${btcAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                  title="Xem trên Mempool"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Chưa liên kết địa chỉ BTC</span>
              <button
                onClick={() => navigate('/edit-profile')}
                className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors"
              >
                + Thêm địa chỉ
              </button>
            </div>
          )}
        </div>

        {btcAddress && (
          <div className="border-t border-orange-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={btcLogo} alt="BTC" className="w-14 h-14 rounded-full" />
                <div>
                  <p className="font-semibold text-sm">BTC</p>
                  <div className={cn(
                    'flex items-center text-xs',
                    btcChange >= 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    <span>{btcChange >= 0 ? '+' : ''}{btcChange.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                {isBtcBalanceLoading ? (
                  <>
                    <span className="animate-pulse bg-muted rounded w-14 h-4 inline-block mb-1" />
                    <span className="animate-pulse bg-muted rounded w-16 h-3 inline-block" />
                  </>
                ) : (
                  <>
                    <p className="font-bold text-sm">{formatUsd(btcUsdValue)}</p>
                    <p className="text-xs text-muted-foreground">
                      {btcBalance.toFixed(8)} BTC
                    </p>
                    {btcError && (
                      <button onClick={refetchBtc} className="text-xs text-orange-500 hover:text-orange-600 mt-0.5">
                        ⚠️ Thử lại
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* Chi tiết thống kê */}
            {!isBtcBalanceLoading && (
              <div className="mt-2 pt-2 border-t border-orange-50 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">📥 Tổng nhận <span className="text-orange-400">(on-chain)</span></p>
                  <p className="text-xs font-medium">{btcTotalReceived.toFixed(8)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">📤 Tổng gửi <span className="text-orange-400">(on-chain)</span></p>
                  <p className="text-xs font-medium">{btcTotalSent.toFixed(8)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">🔄 Giao dịch <span className="text-orange-400">(on-chain)</span></p>
                  <p className="text-xs font-medium">{btcTxCount}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
