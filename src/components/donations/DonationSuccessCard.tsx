import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DonationCelebration } from './DonationCelebration';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import { getChainDisplayName, getExplorerTxUrl } from '@/lib/chainTokenMapping';
import { getGiftTokenBaseSymbol, getGiftTokenLabel } from '@/lib/giftTokenLabel';
import { format } from 'date-fns';
import { vi, enUS } from 'date-fns/locale';
import {
  ExternalLink,
  Camera,
  Clock,
  Link2,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import funPlayLogo from '@/assets/fun-profile-logo.png';
import camlyLogo from '@/assets/tokens/camly-coin-rainbow.png';
import { RichTextOverlay } from './RichTextOverlay';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { playCelebrationMusic } from '@/lib/celebrationSounds';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';

export interface DonationCardData {
  id: string;
  amount: string;
  tokenSymbol: string;
  chainId?: number | null;
  senderUsername: string;
  senderDisplayName?: string | null;
  senderAvatarUrl?: string | null;
  senderId?: string;
  recipientUsername: string;
  recipientDisplayName?: string | null;
  recipientAvatarUrl?: string | null;
  recipientId?: string;
  message?: string | null;
  txHash: string;
  lightScoreEarned: number;
  createdAt: string;
}

interface DonationSuccessCardProps {
  isOpen: boolean;
  onClose: () => void;
  data: DonationCardData;
}

export const DonationSuccessCard = ({
  isOpen,
  onClose,
  data,
}: DonationSuccessCardProps) => {
  const { t, language } = useLanguage();
  const [isCelebrationActive, setIsCelebrationActive] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const dateLocale = language === 'vi' ? vi : enUS;
  const numLocale = language === 'vi' ? 'vi-VN' : 'en-US';

  // ── Biên nhận cùng đợt: cùng sender+recipient trong cửa sổ ±15 phút ──
  const [siblings, setSiblings] = useState<Array<{ id: string; amount: string; token_symbol: string; chain_id?: number | null; tx_hash: string }>>([]);
  useEffect(() => {
    if (!isOpen || !data.senderId || !data.recipientId || !data.createdAt) return;
    const center = new Date(data.createdAt).getTime();
    const from = new Date(center - 15 * 60_000).toISOString();
    const to = new Date(center + 15 * 60_000).toISOString();
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from('donations')
        .select('id, amount, token_symbol, chain_id, tx_hash')
        .eq('sender_id', data.senderId)
        .eq('recipient_id', data.recipientId)
        .gte('created_at', from)
        .lte('created_at', to)
        .neq('id', data.id)
        .limit(10);
      if (!cancelled && rows) setSiblings(rows as any);
    })();
    return () => { cancelled = true; };
  }, [isOpen, data.senderId, data.recipientId, data.createdAt, data.id]);

  useEffect(() => {
    if (isOpen) {
      audioRef.current = playCelebrationMusic('rich-1');
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    try {
      setIsCelebrationActive(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    } catch (err) {
      console.error('[DonationSuccessCard] cleanup error:', err);
    }
    onClose();
  };

  const handleSaveImage = async () => {
    if (!cardRef.current) return;
    setIsSaving(true);
    try {
      const buttons = cardRef.current.querySelector('[data-action-buttons]');
      if (buttons) buttons.classList.add('opacity-0');
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      if (buttons) buttons.classList.remove('opacity-0');
      const link = document.createElement('a');
      link.download = `donation-${data.id.slice(0, 8)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success(t('imageSaveSuccess'));
    } catch (error) {
      console.error('Error saving image:', error);
      toast.error(t('imageSaveFail'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyTx = () => {
    const link = data.chainId != null ? getExplorerTxUrl(data.txHash, data.chainId) : getBscScanTxUrl(data.txHash, data.tokenSymbol);
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shortTxHash = data.txHash
    ? `${data.txHash.slice(0, 10)}...${data.txHash.slice(-8)}`
    : '';

  // Dynamic font size for amount - scale down for long numbers
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
          className="max-w-[400px] w-full p-0 border-0 shadow-2xl !z-[10002] overflow-hidden [&>button]:z-[10] [&>button]:top-2 [&>button]:right-2 [&>button]:rounded-full [&>button]:bg-white/80 [&>button]:backdrop-blur-sm [&>button]:shadow-md [&>button]:w-7 [&>button]:h-7 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:opacity-100 sm:w-[94vw] inset-x-0 mx-auto"
          overlayClassName="!z-[10002]"
          style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        >
          <div ref={cardRef} className="bg-white rounded-2xl overflow-y-auto flex-1" style={{ fontFamily: 'system-ui, sans-serif' }}>
            {/* Header */}
            <div className="px-4 pt-5 pb-2 text-center bg-white">
              <div className="flex justify-center mb-1.5">
                <img src={funPlayLogo} alt="FUN Profile" className="w-12 h-12 rounded-full object-cover shadow-md" style={{ boxShadow: '0 0 0 2px #d1fae5, 0 0 0 4px #6ee7b7' }} />
              </div>
              <div className="text-sm font-extrabold text-emerald-800 tracking-wide">{t('donationReceiptHeader')}</div>
              <div className="text-[11px] text-emerald-600 font-mono">#{data.id?.slice(0, 16)}</div>
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
              <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <Avatar className="w-12 h-12 shrink-0" style={{ boxShadow: '0 0 0 2px #fca5a5' }}>
                  <AvatarImage src={data.senderAvatarUrl || undefined} />
                  <AvatarFallback className="bg-rose-50 text-rose-500 font-bold text-sm">
                    {(data.senderDisplayName || data.senderUsername)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center w-full min-w-0">
                  <div className="text-xs font-extrabold text-emerald-800 leading-tight truncate">{data.senderDisplayName || data.senderUsername}</div>
                  {data.senderUsername && (
                    <div className="text-[10px] text-emerald-600 font-medium truncate">@{data.senderUsername}</div>
                  )}
                </div>
              </div>

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
                    {(data.recipientDisplayName || data.recipientUsername)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center w-full min-w-0">
                  <div className="text-xs font-extrabold text-emerald-800 leading-tight truncate">{data.recipientDisplayName || data.recipientUsername}</div>
                  {data.recipientUsername && (
                    <div className="text-[10px] text-emerald-600 font-medium truncate">@{data.recipientUsername}</div>
                  )}
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
                    background: 'linear-gradient(135deg, #064e3b 0%, #065f46 30%, #047857 60%, #059669 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 1px 3px rgba(4,78,59,0.3))',
                  }}
                >
                  {formattedAmount} {data.tokenSymbol}
                </span>
              </div>
              <div className="text-xs font-semibold text-emerald-700 mt-1">{t('pricelessLove')}</div>
              {data.message && (
                <div
                  className="mt-2 text-xs font-bold italic px-3 py-2 rounded-xl"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #fde68a',
                    color: '#d97706',
                    wordBreak: 'break-word',
                    textAlign: 'justify',
                  }}
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
                  <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1"><Clock className="w-3 h-3" />{t('timeLabel')}</span>
                  <span className="text-xs font-bold text-emerald-800">
                    {format(new Date(data.createdAt), 'HH:mm dd/MM/yyyy', { locale: dateLocale })}
                  </span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-white">
                  <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1"><Link2 className="w-3 h-3" />TX Hash</span>
                  <a
                    href={txUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                  >
                    {shortTxHash}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-white">
                  <span className="text-xs font-semibold text-emerald-700">{t('networkLabel')}</span>
                  <span className="text-xs font-bold text-emerald-800">
                    {networkLabel}
                  </span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 bg-white">
                  <span className="text-xs font-semibold text-emerald-700">{t('statusLabel')}</span>
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('statusSuccess')}
                  </span>
                </div>
              </div>
            </div>

            {data.lightScoreEarned > 0 && (
              <div className="mx-3 mt-2 rounded-xl px-3 py-2 text-center"
                style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', border: '1px solid #6ee7b7' }}>
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800">
                  <Sparkles className="w-3.5 h-3.5" />
                  +{data.lightScoreEarned} {t('lightScoreEarnedMsg')}
                </div>
              </div>
            )}

            {siblings.length > 0 && (
              <div className="mx-3 mt-2 rounded-xl px-3 py-2"
                style={{ background: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)', border: '1px solid #f0abfc' }}>
                <div className="text-[11px] font-extrabold text-fuchsia-800 mb-1.5 flex items-center gap-1">
                  🎁 {language === 'vi' ? 'Các biên nhận cùng đợt tặng' : 'Other receipts in this gift batch'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {siblings.map((s) => {
                    const amt = Number(s.amount).toLocaleString(numLocale, { maximumFractionDigits: 8 });
                    const tokenLabel = getGiftTokenLabel(s.token_symbol, s.chain_id);
                    const url = s.chain_id != null ? getExplorerTxUrl(s.tx_hash, s.chain_id) : getBscScanTxUrl(s.tx_hash, s.token_symbol);
                    return (
                      <a
                        key={s.id}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 bg-white border border-fuchsia-200 rounded-full px-2 py-1 text-[11px] font-bold text-fuchsia-700 hover:bg-fuchsia-50"
                      >
                        {getGiftTokenBaseSymbol(tokenLabel) === 'CAMLY' && <img src={camlyLogo} alt="" className="w-3.5 h-3.5" />}
                        <span>{amt} {tokenLabel}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer banner */}
            <div
              className="mx-3 mt-2 rounded-xl px-3 py-2 text-center"
              style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fde68a' }}
            >
              <div className="text-xs font-extrabold text-amber-800">{t('abundanceHappiness')}</div>
            </div>

            {/* Actions */}
            <div data-action-buttons className="mx-3 mt-3 mb-4 space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 border-gray-300 text-gray-600 font-semibold hover:bg-gray-50 text-[11px] rounded-full h-8"
                  onClick={handleCopyTx}
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? t('copiedTxLabel') : t('copyTxLabel')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 border-gray-300 text-gray-600 font-semibold hover:bg-gray-50 text-[11px] rounded-full h-8"
                  onClick={handleSaveImage}
                  disabled={isSaving}
                >
                  <Camera className="w-3.5 h-3.5" />
                  {isSaving ? t('savingImageBtn') : t('saveImageLabel')}
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 border-emerald-300 text-emerald-700 font-semibold hover:bg-emerald-50 text-xs rounded-full h-8"
                onClick={handleClose}
              >
                {t('closeBtnText')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
