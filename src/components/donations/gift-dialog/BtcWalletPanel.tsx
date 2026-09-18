/**
 * BtcWalletPanel — Panel hướng dẫn gửi BTC native
 * Desktop: ưu tiên QR + copy (KHÔNG auto deep-link để tránh MetaMask cướp protocol).
 * Mobile: có nút "Mở ví BTC" deep-link `bitcoin:` cho ví native (Trust/Bitget/Xverse).
 */

import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { copyToClipboard } from '@/utils/clipboard';
import { toast } from 'sonner';
import { detectBtcAddressType } from "@/lib/btc/addressNormalize";

interface BtcWalletPanelProps {
  bip21Url: string;
  recipientAddress: string;
  amount: string;
  pollingStatus: 'idle' | 'polling' | 'found' | 'timeout';
  txid: string | null;
  onMarkManualSend: () => void;
  /** BTC_MANUAL_CONFIRM_LOCK: cho phép user tự bấm "Tôi đã gửi xong" hay không */
  manualConfirmEnabled?: boolean;
  onCancel: () => void;
}

const MANUAL_LOCK_TOOLTIP =
  'Đang chờ xác nhận tự động từ blockchain, vui lòng đợi (thường vài phút tới ~1 giờ).';

function detectAddressKind(addr: string): { label: string; isNative: boolean } {
  // Không lowercase địa chỉ: legacy Base58 case-SENSITIVE. Chỉ so prefix case-insensitive.
  switch (detectBtcAddressType(addr)) {
    case 'p2tr': return { label: 'Taproot (bc1p…)', isNative: true };
    case 'p2wpkh': return { label: 'SegWit (bc1q…)', isNative: true };
    case 'segwit': return { label: 'SegWit (bc1…)', isNative: true };
    case 'p2sh': return { label: 'P2SH (3…)', isNative: true };
    case 'p2pkh': return { label: 'Legacy (1…)', isNative: true };
    default: return { label: 'BTC', isNative: false };
  }
}

export function BtcWalletPanel({
  bip21Url,
  recipientAddress,
  amount,
  pollingStatus,
  txid,
  onMarkManualSend,
  onCancel,
  manualConfirmEnabled = false,
}: BtcWalletPanelProps) {
  const isMobile = useMemo(
    () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    [],
  );
  const kind = useMemo(() => detectAddressKind(recipientAddress), [recipientAddress]);

  const handleCopy = (text: string, label: string) => {
    copyToClipboard(text);
    toast.success(`Đã sao chép ${label}`);
  };

  const handleTryOpenWallet = () => {
    const before = Date.now();
    try { window.location.href = bip21Url; } catch { /* ignore */ }
    // Nếu sau 900ms vẫn ở trang → không có app ví BTC → gợi ý cài
    setTimeout(() => {
      if (document.visibilityState === 'visible' && Date.now() - before < 1500) {
        toast.info('Chưa thấy ví BTC native. Hãy cài Trust Wallet, Bitget hoặc Xverse rồi thử lại.');
      }
    }, 900);
  };

  if (pollingStatus === 'found') {
    return (
      <div className="text-center space-y-3 py-4">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
        <p className="text-sm font-semibold text-emerald-700">Đã phát hiện giao dịch BTC!</p>
        {txid && !txid.startsWith('btc-manual') && (
          <a
            href={`https://mempool.space/tx/${txid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-primary hover:underline flex items-center justify-center gap-1"
          >
            {txid.slice(0, 16)}... <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 py-2">
      {/* Cảnh báo MetaMask không hỗ trợ BTC native */}
      {kind.isNative && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-snug">
            Địa chỉ <span className="font-mono">{kind.label}</span> là BTC native.
            <b> MetaMask không gửi được</b> — hãy dùng ví Bitcoin native
            (Trust, Bitget, Xverse, Muun…) hoặc gửi <b>BTCB</b> trên mạng BSC.
          </p>
        </div>
      )}

      {/* QR Code — desktop to hơn cho dễ quét bằng điện thoại */}
      <div className="flex justify-center">
        <div className="p-2 sm:p-3 bg-white rounded-xl border-2 border-amber-200 shadow-sm">
          <QRCodeSVG
            value={bip21Url}
            size={isMobile ? 160 : 200}
            level="H"
            includeMargin={true}
            className="w-[160px] h-[160px] sm:w-[200px] sm:h-[200px]"
          />
        </div>
      </div>

      <p className="text-xs text-center text-amber-700 font-medium">
        {isMobile
          ? 'Quét QR hoặc nhấn "Mở ví BTC" bên dưới'
          : 'Quét QR bằng ví BTC trên điện thoại (Trust, Bitget, Xverse, Muun…)'}
      </p>

      {/* Address + Amount copy */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground mb-0.5">Địa chỉ nhận</p>
            <p className="text-xs font-mono break-all">{recipientAddress}</p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleCopy(recipientAddress, 'địa chỉ')}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground mb-0.5">Số lượng</p>
            <p className="text-xs font-mono">{amount} BTC</p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => handleCopy(amount, 'số lượng')}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Action buttons — "Mở ví BTC" chỉ trên mobile để tránh MetaMask cướp protocol */}
      <div className="flex gap-2">
        {isMobile && (
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleTryOpenWallet}>
            <ExternalLink className="w-3.5 h-3.5" />
            Mở ví BTC
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className={isMobile ? 'flex-1 gap-1.5' : 'flex-1 gap-1.5'}
          onClick={() => handleCopy(bip21Url, 'BIP21 URL')}
        >
          <Copy className="w-3.5 h-3.5" />
          Copy link
        </Button>
        {!isMobile && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => handleCopy(recipientAddress, 'địa chỉ')}
          >
            <Copy className="w-3.5 h-3.5" />
            Copy địa chỉ
          </Button>
        )}
      </div>

      {/* Wallet compatibility note - mobile only */}
      <div className="sm:hidden space-y-1 p-2 rounded-lg bg-muted/50 border text-[10px]">
        <p className="text-emerald-700">✅ Trust Wallet, Bitget Wallet, Xverse: Hỗ trợ BTC native</p>
        <p className="text-amber-700">⚠️ MetaMask mobile: Dùng BTCB (mạng BSC) để giao dịch</p>
      </div>

      {/* Polling status */}
      <div className="space-y-2 py-1">
        {pollingStatus === 'polling' && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 w-full justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
            <span className="text-xs text-amber-700 font-medium">Đang chờ giao dịch trên blockchain...</span>
          </div>
        )}
        {pollingStatus === 'timeout' && (
          <div className="text-center space-y-2 w-full">
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-amber-700">Chưa phát hiện giao dịch sau 20 phút</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
                Hủy
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white"
                onClick={onMarkManualSend}
                disabled={!manualConfirmEnabled}
                title={manualConfirmEnabled ? undefined : MANUAL_LOCK_TOOLTIP}
              >
                Tôi đã gửi
              </Button>
            </div>
          </div>
        )}

        {/* Hành động luôn khả dụng */}
        {pollingStatus !== 'timeout' && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
              Huỷ
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={onMarkManualSend}
              disabled={!manualConfirmEnabled}
              title={manualConfirmEnabled ? undefined : MANUAL_LOCK_TOOLTIP}
            >
              Tôi đã gửi xong
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
