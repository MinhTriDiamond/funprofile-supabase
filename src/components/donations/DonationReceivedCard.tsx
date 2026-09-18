import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DonationCelebration } from './DonationCelebration';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import { getChainDisplayName, getExplorerTxUrl } from '@/lib/chainTokenMapping';
import { getGiftTokenBaseSymbol } from '@/lib/giftTokenLabel';
import { format } from 'date-fns';
import { vi, enUS } from 'date-fns/locale';
import {
  ExternalLink,
  Heart,
  Copy,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import funPlayLogo from '@/assets/fun-profile-logo.png';
import camlyLogo from '@/assets/tokens/camly-coin-rainbow.png';
import { RichTextOverlay } from './RichTextOverlay';
import { playCelebrationMusic, stopCelebrationMusic } from '@/lib/celebrationSounds';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';

export interface DonationReceivedData {
  id: string;
  amount: string;
  tokenSymbol: string;
  chainId?: number | null;
  senderUsername: string;
  senderDisplayName?: string | null;
  senderAvatarUrl?: string | null;
  senderId: string;
  recipientUsername?: string;
  recipientDisplayName?: string | null;
  recipientAvatarUrl?: string | null;
  message?: string | null;
  txHash: string;
  createdAt: string;
  status?: string;
}

interface DonationReceivedCardProps {
  isOpen: boolean;
  onClose: () => void;
  data: DonationReceivedData;
}

export const DonationReceivedCard = ({
  isOpen,
  onClose,
  data,
}: DonationReceivedCardProps) => {
  const { t, language } = useLanguage();
  const [isCelebrationActive, setIsCelebrationActive] = useState(true);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedForRef = useRef<string | null>(null);
  const dateLocale = language === 'vi' ? vi : enUS;
  const numLocale = language === 'vi' ? 'vi-VN' : 'en-US';

  // Single source of truth for celebration audio.
  // - Play rich-1 khi mở card cho MỘT giao dịch (guard theo data.id).
  // - Re-render / detail RPC arrive không replay (playedForRef).
  // - Đóng modal → fade 500ms rồi stop (stopCelebrationMusic mặc định 500ms).
  useEffect(() => {
    if (isOpen) {
      if (playedForRef.current !== data.id) {
        playedForRef.current = data.id;
        audioRef.current = playCelebrationMusic('rich-1');
      }
    } else {
      stopCelebrationMusic(500);
      audioRef.current = null;
      playedForRef.current = null;
    }
  }, [isOpen, data.id]);

  // Cleanup on unmount (bảo hiểm nếu component bị tháo mà không kịp isOpen=false).
  useEffect(() => {
    return () => {
      stopCelebrationMusic(500);
      audioRef.current = null;
      playedForRef.current = null;
    };
  }, []);

  const handleClose = () => {
    setIsCelebrationActive(false);
    // Audio fade được xử lý bởi effect [isOpen] khi parent set isOpen=false.
    onClose();
  };

  const handleSendThanks = () => {
    handleClose();
    navigate(`/chat?userId=${data.senderId}`);
  };

  const handleCopyLink = () => {
    const link = data.chainId != null ? getExplorerTxUrl(data.txHash, data.chainId) : getBscScanTxUrl(data.txHash, data.tokenSymbol);
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shortTxHash = data.txHash
    ? `${data.txHash.slice(0, 10)}...${data.txHash.slice(-8)}`
    : '';

  const statusLabel = data.status === 'completed' || data.status === 'confirmed' || !data.status
    ? t('statusSuccess')
    : data.status === 'pending'
    ? t('statusProcessing')
    : data.status;

  const isSuccess = !data.status || data.status === 'completed' || data.status === 'confirmed';

  // Dynamic font size for amount
  const formattedAmount = Number(data.amount).toLocaleString(numLocale, { minimumFractionDigits: 0, maximumFractionDigits: 8 });
  const amountText = `${formattedAmount} ${data.tokenSymbol}`;
  const amountFontSize = amountText.length > 20 ? 'text-xl' : amountText.length > 14 ? 'text-2xl' : 'text-3xl';
  const baseTokenSymbol = getGiftTokenBaseSymbol(data.tokenSymbol);
  const txUrl = data.chainId != null ? getExplorerTxUrl(data.txHash, data.chainId) : getBscScanTxUrl(data.txHash, data.tokenSymbol);
  const networkLabel = data.chainId != null
    ? getChainDisplayName(data.chainId)
    : baseTokenSymbol === 'BTC'
      ? 'BTC'
      : 'BSC';

  return (
    <>
      <DonationCelebration isActive={isOpen && isCelebrationActive} showRichText={false} />
      {isOpen && <RichTextOverlay />}

      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          className="max-w-[400px] w-full p-0 border-0 shadow-2xl [&>button]:hidden !z-[10002] overflow-hidden sm:w-[94vw] inset-x-0 mx-auto"
          overlayClassName="!z-[10002]"
          style={{
            maxHeight: 'min(90vh, 100dvh)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="bg-white rounded-2xl overflow-y-auto flex-1"
            style={{
              fontFamily: 'system-ui, sans-serif',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {/* Header */}
            <div className="px-4 pt-5 pb-2 text-center relative bg-white">
              <div className="flex justify-center mb-1.5">
                <img src={funPlayLogo} alt="FUN Profile" className="w-12 h-12 rounded-full object-cover shadow-md" style={{ boxShadow: '0 0 0 2px #d1fae5, 0 0 0 4px #6ee7b7' }} />
              </div>
              <div className="text-sm font-extrabold tracking-wide" style={{ color: '#047857' }}>{t('donationReceiptHeader')}</div>
              <div className="text-[11px] font-mono" style={{ color: '#059669' }}>#{data.id?.slice(0, 16)}</div>
            </div>

            <div className="mx-3 border-t border-dashed border-gray-200 my-1" />

            {/* Gift banner */}
            <div
              className="mx-3 mt-2 rounded-xl px-3 py-2 text-center"
              style={{ background: 'linear-gradient(135deg, #fff5f7 0%, #ffe8ef 100%)', border: '1px solid #ffc9d9' }}
            >
              <div className="text-sm font-extrabold text-pink-700 uppercase tracking-wide">{t('giftBannerTitle')}</div>
              <div className="text-xs font-semibold text-pink-500">{t('giftBannerSubtitle')}</div>
            </div>

            {/* Avatars */}
            <div className="mx-3 mt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => { handleClose(); navigate(`/profile/${data.senderId}`); }}
                className="flex flex-col items-center gap-1 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
                <Avatar className="w-12 h-12 shrink-0" style={{ boxShadow: '0 0 0 2px #fca5a5' }}>
                  <AvatarImage src={data.senderAvatarUrl || undefined} />
                  <AvatarFallback className="bg-rose-50 text-rose-500 font-bold text-sm">
                    {(data.senderDisplayName || data.senderUsername)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center w-full min-w-0">
                  <div className="text-xs font-extrabold leading-tight truncate" style={{ color: '#047857' }}>{data.senderDisplayName || data.senderUsername}</div>
                  <div className="text-[10px] font-medium truncate" style={{ color: '#059669' }}>@{data.senderUsername}</div>
                </div>
              </button>

              <div className="shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #059669, #10b981)', boxShadow: '0 2px 6px rgba(16,185,129,0.3)' }}>
                  <ArrowRight className="w-4 h-4 text-white" />
                </div>
              </div>

              <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <Avatar className="w-12 h-12 shrink-0" style={{ boxShadow: '0 0 0 2px #6ee7b7' }}>
                  <AvatarImage src={data.recipientAvatarUrl || undefined} />
                  <AvatarFallback className="bg-emerald-50 text-emerald-600 font-bold text-sm">
                    {(data.recipientDisplayName || data.recipientUsername || 'Me')?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center w-full min-w-0">
                  <div className="text-xs font-extrabold leading-tight truncate" style={{ color: '#047857' }}>{data.recipientDisplayName || data.recipientUsername || t('youLabel')}</div>
                  <div className="text-[10px] font-medium truncate" style={{ color: '#059669' }}>@{data.recipientUsername || 'you'}</div>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div className="mx-3 mt-3 text-center py-3">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {baseTokenSymbol === 'CAMLY' ? (
                  <img src={camlyLogo} alt="CAMLY" className="w-8 h-8 object-contain shrink-0" />
                ) : (
                  <span className="text-2xl">💰</span>
                )}
                <span
                  className={`${amountFontSize} font-black tracking-tight break-all`}
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 40%, #34d399 80%, #6ee7b7 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 1px 4px rgba(16,185,129,0.4))',
                  }}
                >
                  {formattedAmount} {data.tokenSymbol}
                </span>
              </div>
              {data.message && (
                <div
                  className="mt-2 text-xs font-semibold italic px-3"
                  style={{ color: '#047857', wordBreak: 'break-word', textAlign: 'justify' }}
                >
                  "{data.message}"
                </div>
              )}
            </div>

            <div className="mx-3 border-t border-dashed border-gray-200 my-1" />

            {/* Details */}
            <div className="mx-3 mt-2 rounded-xl overflow-hidden border border-gray-100">
              <div className="divide-y divide-gray-100">
                <div className="flex justify-between items-center px-3 py-2 bg-white">
                  <span className="text-xs font-semibold" style={{ color: '#047857' }}>{t('timeLabel')}</span>
                  <span className="text-xs font-bold" style={{ color: '#064e3b' }}>
                    {format(new Date(data.createdAt), 'HH:mm dd/MM/yyyy', { locale: dateLocale })}
                  </span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-white">
                  <span className="text-xs font-semibold" style={{ color: '#047857' }}>{t('networkLabel')}</span>
                  <span className="text-xs font-bold" style={{ color: '#064e3b' }}>{networkLabel}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-white">
                  <span className="text-xs font-semibold" style={{ color: '#047857' }}>TX Hash</span>
                  <a
                    href={txUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-bold flex items-center gap-1"
                    style={{ color: '#059669' }}
                  >
                    {shortTxHash}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-white">
                  <span className="text-xs font-semibold" style={{ color: '#047857' }}>{t('statusLabel')}</span>
                  <span className={`text-xs font-bold flex items-center gap-1 ${isSuccess ? 'text-emerald-600' : 'text-orange-600'}`}>
                    {isSuccess
                      ? <CheckCircle2 className="w-3.5 h-3.5" />
                      : <Clock className="w-3.5 h-3.5" />}
                    {statusLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer banner */}
            <div
              className="mx-3 mt-2 rounded-xl px-3 py-2 text-center"
              style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fde68a' }}
            >
              <div className="text-xs font-extrabold text-amber-800">
                {t('abundanceHappiness')}
              </div>
            </div>

            {/* Actions */}
            <div className="mx-3 mt-3 mb-4 space-y-2">
              <Button
                size="sm"
                className="w-full gap-2 rounded-full text-white font-bold text-xs h-8"
                style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 40%, #047857 100%)', boxShadow: '0 3px 10px rgba(4,78,59,0.45)' }}
                onClick={handleClose}
              >
                <ArrowLeft className="w-4 h-4" />
                {t('goBackBtn')}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 border-gray-300 text-gray-600 font-semibold hover:bg-gray-50 text-[11px] rounded-full h-8"
                  onClick={handleCopyLink}
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? t('copiedLinkLabel') : t('copyLinkLabel')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 text-[11px] font-bold border-gray-300 text-gray-600 hover:bg-gray-50 rounded-full h-8"
                  onClick={handleSendThanks}
                >
                  <Heart className="w-3.5 h-3.5" />
                  {t('sendThanksBtn')}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
