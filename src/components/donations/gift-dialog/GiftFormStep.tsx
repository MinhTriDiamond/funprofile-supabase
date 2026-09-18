/**
 * SR-2: Gift Dialog — Form Step (Step 1)
 * Extracted from UnifiedGiftSendDialog.
 */

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TokenSelector } from '@/components/donations/TokenSelector';
import { NetworkSelector } from '@/components/donations/NetworkSelector';
import { QuickGiftPicker, MESSAGE_TEMPLATES } from '@/components/donations/QuickGiftPicker';
import { EmojiPicker } from '@/components/feed/EmojiPicker';
import {
  Loader2, Wallet, AlertCircle, Send, Copy, AlertTriangle,
  ArrowRight, Search, User, X, Shield, Users,
} from 'lucide-react';
import { getChainDisplayName, BTC_MAINNET } from '@/lib/chainTokenMapping';
import { MAX_RECIPIENTS_TOTAL } from '@/config/disperse';
import type { TokenOption } from '@/components/donations/TokenSelector';
import type { MessageTemplate } from '@/components/donations/QuickGiftPicker';
import type { ResolvedRecipient } from './types';
import { BulkRecipientInput } from './BulkRecipientInput';

interface SenderProfile {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  public_wallet_address: string | null;
  btc_address?: string | null;
}

export interface GiftFormStepProps {
  // Sender
  senderProfile: SenderProfile | null;
  effectiveAddress: string | undefined;

  // Token & balance
  selectedToken: TokenOption;
  onSelectToken: (t: TokenOption) => void;
  formattedBalance: number;
  disabledTokens: string[];
  extraTokens?: TokenOption[];

  // Network
  selectedChainId: number;
  onChainChange: (chainId: number) => void;
  walletChainId: number;

  // Amount
  amount: string;
  onAmountChange: (v: string) => void;
  onMaxAmount: () => void;
  onSelectQuickAmount: (n: number) => void;
  isMultiMode: boolean;
  parsedAmountNum: number;
  totalAmount: number;
  estimatedUsd: number;
  totalEstimatedUsd: number;
  minSendCheck: { valid: boolean; message?: string };
  hasEnoughBalance: boolean;
  isLargeAmount: boolean;

  // Recipients
  isPresetMode: boolean;
  effectiveRecipients: ResolvedRecipient[];
  recipientsWithWallet: ResolvedRecipient[];
  recipientsWithoutWallet: ResolvedRecipient[];
  hasRecipients: boolean;
  resolvedRecipients: ResolvedRecipient[];

  // Search
  searchTab: 'username' | 'address' | 'bulk';
  searchQuery: string;
  searchResults: ResolvedRecipient[];
  isSearching: boolean;
  searchError: string;
  onSearchTabChange: (tab: 'username' | 'address' | 'bulk') => void;
  onSearchQueryChange: (v: string) => void;
  onSelectRecipient: (r: ResolvedRecipient) => void;
  onRemoveRecipient: (id: string) => void;
  onClearAllRecipients: () => void;
  onBulkAddRecipients?: (recipients: ResolvedRecipient[], amounts: Record<string, string>) => void;
  senderUserId?: string | null;

  // Message
  customMessage: string;
  onMessageChange: (v: string) => void;
  selectedTemplate: MessageTemplate | null;
  onSelectTemplate: (t: MessageTemplate) => void;
  onEmojiSelect: (e: string) => void;

  // Wallet state
  isConnected: boolean;
  isConnectingWallet?: boolean;
  isWrongNetwork: boolean;
  needsGasWarning: boolean;
  bnbBalanceNum: number;
  estimatedGasPerTx: number;
  onConnectWallet: () => void;
  onSwitchChain: () => void;
  /** Địa chỉ ví đã liên kết với tài khoản (cross-browser fallback khi wagmi disconnected) */
  linkedWalletAddress?: string | null;

  // Actions
  canProceedToConfirm: boolean;
  isInProgress: boolean;
  onGoToConfirm: () => void;
  onClose: () => void;
  onSendReminder: () => void;
  isSendingReminder: boolean;
  onCopyAddress: (addr: string) => void;
}

export function GiftFormStep(props: GiftFormStepProps) {
  const {
    senderProfile, effectiveAddress,
    selectedToken, onSelectToken, formattedBalance, disabledTokens, extraTokens = [],
    selectedChainId, onChainChange, walletChainId,
    amount, onAmountChange, onSelectQuickAmount,
    isMultiMode, parsedAmountNum, totalAmount, estimatedUsd, totalEstimatedUsd,
    minSendCheck, hasEnoughBalance, isLargeAmount,
    isPresetMode, effectiveRecipients, recipientsWithWallet, recipientsWithoutWallet,
    hasRecipients, resolvedRecipients,
    searchTab, searchQuery, searchResults, isSearching, searchError,
    onSearchTabChange, onSearchQueryChange, onSelectRecipient, onRemoveRecipient, onClearAllRecipients,
    onBulkAddRecipients, senderUserId,
    customMessage, onMessageChange, selectedTemplate, onSelectTemplate, onEmojiSelect,
    isConnected, isConnectingWallet = false, isWrongNetwork, needsGasWarning, bnbBalanceNum, estimatedGasPerTx,
    onConnectWallet, onSwitchChain, linkedWalletAddress,
    canProceedToConfirm, isInProgress, onGoToConfirm, onClose,
    onSendReminder, isSendingReminder, onCopyAddress,
  } = props;

  return (
    <div className="space-y-3 sm:space-y-5 py-2">
      {/* 1. Sender info */}
      {senderProfile && (() => {
        const isBtcSender = selectedChainId === BTC_MAINNET;
        const senderDisplayAddr = isBtcSender ? senderProfile.btc_address : effectiveAddress;
        return (
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">Người gửi:</label>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
            <Avatar className="w-10 h-10 border-2 border-primary/30">
              <AvatarImage src={senderProfile.avatar_url || ''} />
              <AvatarFallback className="bg-primary/20 text-primary">
                {senderProfile.username?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{senderProfile.display_name || senderProfile.username}</p>
              <p className="text-xs text-muted-foreground truncate">@{senderProfile.username}</p>
              {senderDisplayAddr && (
                <div className={`${isBtcSender ? 'flex' : 'hidden sm:flex'} items-center gap-1`}>
                  <p className="text-xs text-muted-foreground font-mono truncate">{senderDisplayAddr.slice(0, 8)}...{senderDisplayAddr.slice(-6)}</p>
                  <button type="button" onClick={() => onCopyAddress(senderDisplayAddr)} className="p-0.5 hover:bg-muted rounded">
                    <Copy className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              )}
              {isBtcSender && !senderProfile.btc_address && (
                <p className="text-xs text-destructive mt-0.5">Bạn chưa cài đặt địa chỉ ví BTC trong hồ sơ</p>
              )}
            </div>
          </div>
          {!isBtcSender && effectiveAddress && senderProfile.wallet_address && senderProfile.public_wallet_address &&
            effectiveAddress.toLowerCase() !== senderProfile.wallet_address?.toLowerCase() &&
            effectiveAddress.toLowerCase() !== senderProfile.public_wallet_address?.toLowerCase() && (
            <div className="flex items-center gap-2 mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700">Ví đang kết nối khác với ví đã lưu trong hồ sơ. Giao dịch sẽ gửi từ ví hiện tại.</p>
            </div>
          )}
        </div>
        );
      })()}

      {/* 2. Recipient section */}
      {isPresetMode ? (
        <>
          <PresetRecipientDisplay recipient={effectiveRecipients[0]} onCopyAddress={onCopyAddress} selectedChainId={selectedChainId} />

          {/* Bulk add-on: cho phép tặng thêm nhiều người khác ngay trong chế độ preset */}
          <details className="rounded-lg border border-dashed border-primary/30 bg-primary/5 group">
            <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer select-none text-sm font-medium text-primary hover:bg-primary/10 rounded-lg">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Tặng thêm cho nhiều người khác
                {resolvedRecipients.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    +{resolvedRecipients.length}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-muted-foreground group-open:hidden">Mở ▾</span>
              <span className="text-[10px] text-muted-foreground hidden group-open:inline">Đóng ▴</span>
            </summary>
            <div className="p-3 pt-1 border-t border-primary/20">
              <RecipientSearchSection
                resolvedRecipients={resolvedRecipients}
                searchTab={searchTab}
                searchQuery={searchQuery}
                searchResults={searchResults}
                isSearching={isSearching}
                searchError={searchError}
                onSearchTabChange={onSearchTabChange}
                onSearchQueryChange={onSearchQueryChange}
                onSelectRecipient={onSelectRecipient}
                onRemoveRecipient={onRemoveRecipient}
                onClearAll={onClearAllRecipients}
                onBulkAdd={onBulkAddRecipients}
                senderUserId={senderUserId ?? null}
              />
            </div>
          </details>
        </>
      ) : (
        <RecipientSearchSection
          resolvedRecipients={resolvedRecipients}
          searchTab={searchTab}
          searchQuery={searchQuery}
          searchResults={searchResults}
          isSearching={isSearching}
          searchError={searchError}
          onSearchTabChange={onSearchTabChange}
          onSearchQueryChange={onSearchQueryChange}
          onSelectRecipient={onSelectRecipient}
          onRemoveRecipient={onRemoveRecipient}
          onClearAll={onClearAllRecipients}
          onBulkAdd={onBulkAddRecipients}
          senderUserId={senderUserId ?? null}
        />
      )}

      {/* No wallet warning */}
      {recipientsWithoutWallet.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">{recipientsWithoutWallet.length} người chưa có ví:</span>
          </div>
          <p className="text-xs text-muted-foreground ml-6">
            {recipientsWithoutWallet.map(r => `@${r.username}`).join(', ')} — sẽ bị bỏ qua khi gửi.
          </p>
        </div>
      )}

      {/* All recipients have no wallet */}
      {hasRecipients && recipientsWithWallet.length === 0 && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Không có người nhận nào có ví</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Tất cả người nhận cần kết nối ví Web3 trước khi có thể nhận quà.</p>
          </div>
          <Button onClick={onSendReminder} disabled={isSendingReminder} className="w-full bg-gradient-to-r from-primary to-primary/80">
            {isSendingReminder ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Đang gửi...</> : <><Send className="w-4 h-4 mr-2" />Hướng Dẫn Nhận Quà</>}
          </Button>
        </div>
      )}

      {/* Connect wallet — hide for BTC since it doesn't need EVM wallet */}
      {!isConnected && selectedChainId !== BTC_MAINNET && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-500">
              <Wallet className="w-5 h-5" />
              <span className="font-medium">Kết nối ví để gửi</span>
            </div>
            <Button
              onClick={onConnectWallet}
              size="sm"
              disabled={isConnectingWallet}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {isConnectingWallet ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Đang kết nối...
                </>
              ) : (
                'Kết nối'
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Nếu đang dùng điện thoại, hãy mở FUN Profile trong MetaMask, Trust Wallet hoặc Bitget để kết nối ví mượt hơn.
          </p>
          {linkedWalletAddress && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1.5">
              <span className="text-[11px] text-emerald-700">
                Ví đã liên kết:&nbsp;
                <span className="font-mono font-medium">
                  {linkedWalletAddress.slice(0, 6)}…{linkedWalletAddress.slice(-4)}
                </span>
                <span className="text-emerald-600/70"> — chỉ cần mở ví để xác nhận.</span>
              </span>
            </div>
          )}
        </div>
      )}
      {/* BTC info banner — show when BTC selected */}
      {selectedChainId === BTC_MAINNET && (() => {
        const isMobileUA = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        return (
          <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <div className="flex items-center gap-2 text-orange-600">
              <Shield className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Gửi BTC qua ví native</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              {isMobileUA
                ? 'Nhấn xác nhận → ví BTC trên điện thoại sẽ tự mở. Không cần kết nối ví EVM.'
                : 'Sau khi xác nhận, hệ thống hiện QR + địa chỉ để bạn quét bằng ví BTC trên điện thoại (Trust, Bitget, Xverse…). Không cần kết nối ví EVM.'}
            </p>
          </div>
        );
      })()}

      {/* 3. Network */}
      <NetworkSelector
        selectedChainId={selectedChainId}
        onChainChange={onChainChange}
        walletChainId={walletChainId}
      />

      {/* 4. Token */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">Chọn token:</label>
        <TokenSelector selectedToken={selectedToken} onSelect={onSelectToken} disabledTokens={disabledTokens} extraTokens={extraTokens} />
      </div>

      {/* 5. Amount */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
          Số lượng {isMultiMode ? `(mỗi người)` : ''}:
        </label>
        <div className="relative">
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            className="text-lg font-semibold pr-16 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="text-sm text-muted-foreground">{selectedToken.symbol}</span>
          </div>
        </div>
        {isConnected && <p className="text-xs text-muted-foreground mt-1">Số dư: {formattedBalance.toLocaleString(undefined, { minimumFractionDigits: selectedToken.symbol === 'BTC' ? 8 : 0, maximumFractionDigits: selectedToken.decimals })} {selectedToken.symbol}</p>}

        {/* Tổng dự kiến — hiện nổi bật cho cả 1 người và nhiều người */}
        {parsedAmountNum > 0 && recipientsWithWallet.length > 0 && (
          <div className="mt-2 p-3 rounded-lg border border-gold/40 bg-gradient-to-br from-gold/10 to-amber-500/10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-amber-700">Tổng dự kiến</span>
              <span className="text-base font-bold text-amber-900">
                {totalAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedToken.symbol}
              </span>
            </div>
            {isMultiMode && (
              <p className="text-[11px] text-amber-700/80 mt-0.5">
                {recipientsWithWallet.length} người × {parsedAmountNum.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedToken.symbol}
              </p>
            )}
            {totalEstimatedUsd > 0 && (
              <p className="text-[11px] text-amber-700/80 mt-0.5">
                ≈ ${totalEstimatedUsd.toFixed(totalEstimatedUsd < 1 ? 4 : 2)} USD
              </p>
            )}
          </div>
        )}

        {parsedAmountNum > 0 && !minSendCheck.valid && minSendCheck.message && <p className="text-xs text-destructive mt-1">{minSendCheck.message}</p>}
        {parsedAmountNum > 0 && !hasEnoughBalance && (
          <p className={`text-xs mt-1 ${selectedChainId === 0 ? 'text-amber-600' : 'text-destructive'}`}>
            {selectedChainId === 0
              ? `⚠️ Số dư on-chain không đủ. Nếu ví ngoài có đủ BTC, bạn vẫn có thể tiếp tục.`
              : `Không đủ số dư (cần ${totalAmount.toLocaleString()} ${selectedToken.symbol})`}
          </p>
        )}

        {/* Vượt giới hạn ví/lần */}
        {recipientsWithWallet.length > MAX_RECIPIENTS_TOTAL && (
          <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/40">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">
              Vượt giới hạn <strong>{MAX_RECIPIENTS_TOTAL}</strong> ví/lần (hiện tại: <strong>{recipientsWithWallet.length}</strong>).
              Vui lòng bớt <strong>{recipientsWithWallet.length - MAX_RECIPIENTS_TOTAL}</strong> ví trước khi tiếp tục.
            </p>
          </div>
        )}
      </div>

      {/* Wrong network - hide for BTC */}
      {isWrongNetwork && isConnected && selectedChainId !== 0 && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">Ví đang ở chain khác. Vui lòng chuyển sang {getChainDisplayName(selectedChainId)}</p>
          <Button size="sm" variant="outline" onClick={onSwitchChain}>Switch</Button>
        </div>
      )}

      {(recipientsWithWallet.length > 0 || !hasRecipients) && (
        <>
          {/* 6. Quick picks */}
          <div>
            <QuickGiftPicker selectedTemplate={selectedTemplate} onSelectTemplate={onSelectTemplate} onSelectAmount={onSelectQuickAmount} currentAmount={amount} tokenSymbol={selectedToken.symbol} />
          </div>

          {/* 7-8. Message */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Lời nhắn:</label>
            <div className="relative">
              <Textarea
                value={customMessage}
                onChange={(e) => {
                  onMessageChange(e.target.value);
                  if (selectedTemplate?.id !== 'custom') onSelectTemplate(MESSAGE_TEMPLATES.find(t => t.id === 'custom')!);
                }}
                placeholder="Nhập lời nhắn của bạn..."
                rows={2}
                className="pr-12"
              />
              <div className="absolute right-2 bottom-2"><EmojiPicker onEmojiSelect={onEmojiSelect} /></div>
            </div>
          </div>

          {/* Warnings */}
          {isLargeAmount && (
            <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">Bạn đang gửi hơn 80% số dư token.</p>
            </div>
          )}
          {needsGasWarning && selectedChainId !== 0 && (
            <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">BNB còn {bnbBalanceNum.toFixed(4)}. Cần khoảng {(estimatedGasPerTx * recipientsWithWallet.length).toFixed(4)} BNB phí gas cho {recipientsWithWallet.length} giao dịch.</p>
            </div>
          )}

          {/* Next button */}
          <div className="flex gap-3 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={isInProgress}>Hủy</Button>
            <Button
              onClick={onGoToConfirm}
              disabled={!canProceedToConfirm}
              className="flex-1 bg-gradient-to-r from-gold to-amber-500 hover:from-gold/90 hover:to-amber-500/90 text-primary-foreground gap-2"
            >
              Xem lại & Xác nhận <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function PresetRecipientDisplay({ recipient, onCopyAddress, selectedChainId }: { recipient?: ResolvedRecipient; onCopyAddress: (a: string) => void; selectedChainId: number }) {
  if (!recipient) return null;
  const isBtc = selectedChainId === BTC_MAINNET;
  const displayAddress = isBtc ? recipient.btcAddress : recipient.walletAddress;
  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-2 block">Người nhận:</label>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
        <Avatar className="w-10 h-10 border-2 border-gold/30">
          <AvatarImage src={recipient.avatarUrl || ''} />
          <AvatarFallback className="bg-primary/20 text-primary">{recipient.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{recipient.displayName || recipient.username}</p>
          <p className="text-xs text-muted-foreground truncate">@{recipient.username}</p>
          {displayAddress && (
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground font-mono truncate">{displayAddress.slice(0, 8)}...{displayAddress.slice(-6)}</p>
              <button type="button" onClick={() => onCopyAddress(displayAddress)} className="p-0.5 hover:bg-muted rounded">
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface RecipientSearchSectionProps {
  resolvedRecipients: ResolvedRecipient[];
  searchTab: 'username' | 'address' | 'bulk';
  searchQuery: string;
  searchResults: ResolvedRecipient[];
  isSearching: boolean;
  searchError: string;
  onSearchTabChange: (tab: 'username' | 'address' | 'bulk') => void;
  onSearchQueryChange: (v: string) => void;
  onSelectRecipient: (r: ResolvedRecipient) => void;
  onRemoveRecipient: (id: string) => void;
  onClearAll: () => void;
  onBulkAdd?: (recipients: ResolvedRecipient[], amounts: Record<string, string>) => void;
  senderUserId?: string | null;
}

function RecipientSearchSection(props: RecipientSearchSectionProps) {
  const {
    resolvedRecipients, searchTab, searchQuery, searchResults, isSearching, searchError,
    onSearchTabChange, onSearchQueryChange, onSelectRecipient, onRemoveRecipient, onClearAll,
    onBulkAdd, senderUserId = null,
  } = props;

  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-2 block">
        Người nhận {resolvedRecipients.length > 0 && <span className="text-primary">({resolvedRecipients.length} đã chọn)</span>}:
      </label>

      {/* Selected chips */}
      {resolvedRecipients.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {resolvedRecipients.map((r) => (
            <div key={r.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-sm">
              <Avatar className="w-5 h-5">
                <AvatarImage src={r.avatarUrl || ''} />
                <AvatarFallback className="bg-primary/20 text-primary text-[10px]">{r.username[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="font-medium truncate max-w-[100px]">{r.displayName || r.username}</span>
              {!r.walletAddress && <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
              <button type="button" onClick={() => onRemoveRecipient(r.id)} className="p-0.5 rounded-full hover:bg-destructive/10 transition-colors">
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          ))}
          {resolvedRecipients.length > 1 && (
            <button type="button" onClick={onClearAll} className="text-xs text-destructive hover:underline px-2 py-1">Xóa tất cả</button>
          )}
        </div>
      )}

      {/* Search */}
      <div className="space-y-2">
        <Tabs value={searchTab} onValueChange={(v) => onSearchTabChange(v as 'username' | 'address' | 'bulk')}>
          <TabsList className="w-full">
            <TabsTrigger value="username" className="flex-1 text-xs gap-1"><User className="w-3.5 h-3.5" />Username</TabsTrigger>
            <TabsTrigger value="address" className="flex-1 text-xs gap-1"><Wallet className="w-3.5 h-3.5" />Địa chỉ ví</TabsTrigger>
            {onBulkAdd && (
              <TabsTrigger value="bulk" className="flex-1 text-xs gap-1"><Users className="w-3.5 h-3.5" />Hàng loạt</TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {searchTab === 'bulk' && onBulkAdd ? (
          <BulkRecipientInput
            senderUserId={senderUserId}
            existingRecipients={resolvedRecipients}
            onAdd={onBulkAdd}
          />
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder={searchTab === 'username' ? '@username... (chọn nhiều người)' : '0x...'}
                className={`pl-9 text-sm ${searchTab === 'address' ? 'font-mono' : ''}`}
              />
              {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          </>
        )}
        {searchResults.length > 0 && (
          <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
            {searchResults
              .filter(result => !resolvedRecipients.some(r => r.id === result.id))
              .map((result) => (
              <button key={result.id} type="button" onClick={() => onSelectRecipient(result)} className="w-full flex items-center gap-3 p-2.5 hover:bg-accent transition-colors text-left">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={result.avatarUrl || ''} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">{result.username[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-medium text-sm truncate">{result.displayName || result.username}</p>
                    {result.hasVerifiedWallet && <Shield className="w-3 h-3 text-emerald-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">@{result.username}</p>
                  {result.walletAddress && (
                    <p className="text-[10px] text-muted-foreground/70 font-mono truncate">
                      {result.walletAddress.slice(0, 6)}...{result.walletAddress.slice(-4)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
        {searchError && !isSearching && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">{searchError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
