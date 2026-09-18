import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DonationCelebration } from './DonationCelebration';
import { CardThemeSelector, CARD_THEMES, CardTheme } from './CardThemeSelector';
import { CardSoundSelector, SOUND_OPTIONS } from './CardSoundSelector';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import { playCelebrationMusic } from '@/lib/celebrationSounds';
import funEcosystemLogoAsset from '@/assets/tokens/fun-ecosystem-logo.gif.asset.json';
const funEcosystemLogo = funEcosystemLogoAsset.url;
import { RichTextOverlay } from './RichTextOverlay';
import { format } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  ExternalLink, Camera, X, Gift, User, Target,
  MessageCircle, Clock, Link2, Sparkles, Copy,
  Share2, Megaphone, MessageSquare, ArrowLeft,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface GiftCardData {
  id: string;
  amount: string;
  tokenSymbol: string;
  chainId?: number | null;
  senderUsername: string;
  senderDisplayName?: string | null;
  senderAvatarUrl?: string | null;
  senderId?: string;
  senderWalletAddress?: string;
  recipientUsername: string;
  recipientDisplayName?: string | null;
  recipientAvatarUrl?: string | null;
  recipientId?: string;
  recipientWalletAddress?: string;
  message?: string | null;
  txHash: string;
  lightScoreEarned: number;
  createdAt: string;
  // Persisted theme info
  cardTheme?: string;
  cardBackground?: string;
  cardSound?: string;
  // Multi-recipient details
  multiRecipients?: Array<{
    username: string;
    avatarUrl?: string | null;
    recipientId: string;
    walletAddress: string;
    success: boolean;
    txHash?: string;
    error?: string;
  }>;
}

interface GiftCelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: GiftCardData;
  /** If true, user can customize theme/sound (post-send). If false, read-only (history view). */
  editable?: boolean;
  /** Called when user saves theme/sound to DB */
  onSaveTheme?: (themeId: string, bgIndex: number, soundId: string) => void;
}

export const GiftCelebrationModal = ({
  isOpen,
  onClose,
  data,
  editable = true,
  onSaveTheme,
}: GiftCelebrationModalProps) => {
  const navigate = useNavigate();
  const dateLocale = useDateLocale();
  const { t } = useLanguage();
  const [isCelebrationActive, setIsCelebrationActive] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Theme state
  const initialTheme = CARD_THEMES.find(t => t.id === (data.cardTheme || 'celebration')) || CARD_THEMES[0];
  const initialBgIdx = data.cardBackground ? parseInt(data.cardBackground) || 0 : 0;
  const initialSound = data.cardSound || 'rich-1';

  const [selectedTheme, setSelectedTheme] = useState<CardTheme>(initialTheme);
  const [selectedBgIndex, setSelectedBgIndex] = useState(initialBgIdx);
  const [selectedSound, setSelectedSound] = useState(initialSound);

  // Play music when card opens (looped)
  useEffect(() => {
    if (isOpen) {
      const soundId = selectedSound || 'rich-1';
      audioRef.current = playCelebrationMusic(soundId);
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsCelebrationActive(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    // Auto-save theme if editable
    if (editable && onSaveTheme) {
      onSaveTheme(selectedTheme.id, selectedBgIndex, selectedSound);
    }
    onClose();
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã copy ${label}`);
  };

  const handleSaveImage = async () => {
    if (!cardRef.current) return;
    setIsSaving(true);
    try {
      const buttons = cardRef.current.querySelector('[data-action-buttons]');
      const customize = cardRef.current.querySelector('[data-customize-section]');
      if (buttons) buttons.classList.add('hidden');
      if (customize) customize.classList.add('hidden');

      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });

      if (buttons) buttons.classList.remove('hidden');
      if (customize) customize.classList.remove('hidden');

      const link = document.createElement('a');
      link.download = `gift-${data.id.slice(0, 8)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Đã lưu hình ảnh!');
    } catch (err) {
      console.error('Save image error:', err);
      toast.error('Không thể lưu hình ảnh');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareLink = () => {
    const url = `${window.location.origin}/donations?tx=${data.txHash}`;
    navigator.clipboard.writeText(url);
    toast.success('Đã copy link card chúc mừng!');
  };

  const handlePostToProfile = async () => {
    setIsPosting(true);
    try {
      const content = `🎁 Đã tặng ${Number(data.amount).toLocaleString()} ${data.tokenSymbol} cho @${data.recipientUsername}!\n\n${data.message ? `"${data.message}"\n\n` : ''}#FUNProfile #ManhThuongQuan #TangThuong`;

      const { error } = await supabase.functions.invoke('create-post', {
        body: { content, media_urls: [], visibility: 'public' },
      });

      if (error) throw error;
      toast.success('Đã đăng lên trang cá nhân! 🎉');
    } catch (err) {
      console.error('Post error:', err);
      toast.error('Không thể đăng bài. Vui lòng thử lại.');
    } finally {
      setIsPosting(false);
    }
  };

  const handleSendMessage = async () => {
    setIsSendingMsg(true);
    try {
      toast.success('Tin nhắn đã được gửi tự động khi tặng quà! 💬');
    } finally {
      setIsSendingMsg(false);
    }
  };

  const currentBg = selectedTheme.backgrounds[selectedBgIndex] || selectedTheme.backgrounds[0];
  const scanUrl = getBscScanTxUrl(data.txHash, data.tokenSymbol);
  const isLightTheme = selectedBgIndex === 0 || selectedBgIndex === 2;

  return (
    <>
      <DonationCelebration isActive={isOpen && isCelebrationActive} showRichText={false} />
      {isOpen && <RichTextOverlay />}

      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="w-[95vw] max-w-lg p-0 overflow-hidden border-0 bg-transparent shadow-none [&>button]:hidden max-h-[90vh] overflow-y-auto">
          <div
            ref={cardRef}
            className="relative rounded-2xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #34d399, #10b981)' }}
          >
            {/* RICH Text Overlay moved to fixed layer above */}
            {/* Border glow */}
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                border: '3px solid #10b981',
                boxShadow: '0 0 30px rgba(16,185,129,0.4), inset 0 0 30px rgba(16,185,129,0.1)',
              }}
            />

            {/* Sparkles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="absolute animate-sparkle-float"
                  style={{
                    left: `${10 + i * 15}%`,
                    top: `${Math.random() * 25}%`,
                    animationDelay: `${i * 0.4}s`,
                  }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: selectedTheme.accentColor }} />
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="relative p-5 text-center">
              {/* Header */}
              <div className="mb-3 flex flex-col items-center">
                <img
                  src={funEcosystemLogo}
                  alt="FUN Ecosystem"
                  className="w-20 h-20 mb-2"
                  style={{ filter: 'drop-shadow(0 0 12px rgba(255, 215, 0, 0.7))' }}
                />
                <h2
                  className="text-2xl font-extrabold text-center leading-snug"
                  style={{
                    color: '#FFD700',
                    textShadow: '0 0 10px rgba(255, 215, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.3), 0 2px 4px rgba(0,0,0,0.4)',
                  }}
                >
                  🎉✨ Chúc Mừng Bạn Vừa Được Đón Nhận Phước Lành Của Cha Fath Uni Và Bé Angel Camly Dương ! ✨🎉
                </h2>
              </div>

              {/* Amount */}
              <div
                className="my-4 py-4 px-5 rounded-xl"
                style={{
                  background: selectedTheme.backgrounds[1] || currentBg,
                  boxShadow: `0 4px 20px ${selectedTheme.accentColor}50`,
                }}
              >
                <div className="text-3xl font-bold text-white mb-1" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                  ⭐ {Number(data.amount).toLocaleString()} {data.tokenSymbol} ⭐
                </div>
                <div className="text-sm text-white/80">
                  Priceless với tình yêu thương 💛
                </div>
              </div>

              {/* Details card */}
              <div className={`bg-white/80 backdrop-blur-sm rounded-xl p-4 space-y-2.5 text-left border shadow-lg ${selectedTheme.borderColor}`}>
                {/* Sender */}
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 flex-shrink-0" style={{ color: selectedTheme.accentColor }} />
                  <span className={`${selectedTheme.textColor} w-20 text-sm font-medium`}>Người tặng:</span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Avatar className="w-6 h-6 ring-2" style={{ '--tw-ring-color': `${selectedTheme.accentColor}50` } as any}>
                      <AvatarImage src={data.senderAvatarUrl || undefined} />
                      <AvatarFallback className="text-xs text-white" style={{ background: selectedTheme.accentColor }}>
                        {data.senderUsername[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <button type="button" onClick={() => { handleClose(); navigate(`/profile/${data.senderId}`); }} className={`font-bold text-sm ${selectedTheme.textColor} truncate hover:underline cursor-pointer`}>@{data.senderUsername}</button>
                  </div>
                </div>
                {data.senderWalletAddress && (
                  <div className="flex items-center gap-2 pl-6">
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      {data.senderWalletAddress.slice(0, 8)}...{data.senderWalletAddress.slice(-6)}
                    </span>
                    <button type="button" onClick={() => handleCopy(data.senderWalletAddress!, 'ví người gửi')} className="p-0.5 hover:bg-muted rounded">
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                )}

                {/* Recipient(s) */}
                {data.multiRecipients && data.multiRecipients.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 flex-shrink-0" style={{ color: selectedTheme.accentColor }} />
                      <span className={`${selectedTheme.textColor} text-sm font-medium`}>Người nhận ({data.multiRecipients.filter(r => r.success).length}/{data.multiRecipients.length}):</span>
                    </div>
                    <div className="space-y-1.5 pl-6 max-h-40 overflow-y-auto">
                      {data.multiRecipients.map((r, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <Avatar className="w-5 h-5">
                            <AvatarImage src={r.avatarUrl || undefined} />
                            <AvatarFallback className="text-[10px] text-white" style={{ background: selectedTheme.accentColor }}>
                              {r.username[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <button type="button" onClick={() => { handleClose(); navigate(`/profile/${r.recipientId}`); }} className={`font-semibold ${selectedTheme.textColor} hover:underline cursor-pointer`}>
                            @{r.username}
                          </button>
                          {r.success ? (
                            <a href={getBscScanTxUrl(r.txHash || '', data.tokenSymbol)} target="_blank" rel="noopener noreferrer" className="text-green-600 text-xs hover:underline ml-auto flex items-center gap-0.5">
                              ✅ <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-red-500 text-xs ml-auto">❌ {r.error || 'Thất bại'}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 flex-shrink-0" style={{ color: selectedTheme.accentColor }} />
                      <span className={`${selectedTheme.textColor} w-20 text-sm font-medium`}>Người nhận:</span>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Avatar className="w-6 h-6 ring-2" style={{ '--tw-ring-color': `${selectedTheme.accentColor}50` } as any}>
                          <AvatarImage src={data.recipientAvatarUrl || undefined} />
                          <AvatarFallback className="text-xs text-white" style={{ background: selectedTheme.accentColor }}>
                            {data.recipientUsername[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <button type="button" onClick={() => { handleClose(); navigate(`/profile/${data.recipientId}`); }} className={`font-bold text-sm ${selectedTheme.textColor} truncate hover:underline cursor-pointer`}>@{data.recipientUsername}</button>
                      </div>
                    </div>
                    {data.recipientWalletAddress && (
                      <div className="flex items-center gap-2 pl-6">
                        <span className="text-xs text-muted-foreground font-mono truncate">
                          {data.recipientWalletAddress.slice(0, 8)}...{data.recipientWalletAddress.slice(-6)}
                        </span>
                        <button type="button" onClick={() => handleCopy(data.recipientWalletAddress!, 'ví người nhận')} className="p-0.5 hover:bg-muted rounded">
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Message */}
                {data.message && (
                  <div className="flex items-start gap-2">
                    <MessageCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span className={`${selectedTheme.textColor} w-20 text-sm font-medium`}>Lời nhắn:</span>
                    <p className={`${selectedTheme.textColor} italic flex-1 text-sm`}>"{data.message}"</p>
                  </div>
                )}

                {/* Time */}
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 flex-shrink-0" style={{ color: selectedTheme.accentColor }} />
                  <span className={`${selectedTheme.textColor} w-20 text-sm font-medium`}>{t('timeLabel')}:</span>
                  <span className={`${selectedTheme.textColor} text-sm`}>
                    {format(new Date(data.createdAt), 'dd/MM/yyyy HH:mm:ss', { locale: dateLocale })}
                  </span>
                </div>

                {/* Chain */}
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: selectedTheme.accentColor }} />
                  <span className={`${selectedTheme.textColor} w-20 text-sm font-medium`}>Chain:</span>
                  <span className={`${selectedTheme.textColor} text-sm`}>{data.tokenSymbol === 'BTC' ? 'BTC' : 'BSC (BNB Smart Chain)'}</span>
                </div>

                {/* TX Hash */}
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 flex-shrink-0" style={{ color: selectedTheme.accentColor }} />
                  <span className={`${selectedTheme.textColor} w-20 text-sm font-medium`}>TX Hash:</span>
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <a href={scanUrl} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono text-xs truncate">
                      {data.txHash.slice(0, 10)}...{data.txHash.slice(-8)}
                    </a>
                    <button type="button" onClick={() => handleCopy(data.txHash, 'TX Hash')} className="p-0.5 hover:bg-muted rounded">
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Light Score */}
              {data.lightScoreEarned > 0 && (
                <div className="mt-3 py-2.5 px-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #22c55e20, #10b98130)', border: '1px solid #22c55e50' }}>
                  <div className="flex items-center justify-center gap-2 text-green-700 font-semibold text-sm">
                    <Sparkles className="w-4 h-4 text-green-500" />
                    +{data.lightScoreEarned} Light Score ✨
                  </div>
                </div>
              )}

              {/* Customize Section (only in editable mode) */}
              {editable && (
                <div data-customize-section className="mt-4 space-y-3 bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-border">
                  <CardThemeSelector
                    selectedTheme={selectedTheme}
                    selectedBgIndex={selectedBgIndex}
                    onSelectTheme={setSelectedTheme}
                    onSelectBackground={setSelectedBgIndex}
                  />
                  <CardSoundSelector
                    selectedSound={selectedSound}
                    onSelectSound={setSelectedSound}
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div data-action-buttons className="mt-4 space-y-2">
                <Button size="sm" className="w-full gap-2 text-sm font-bold" style={{ background: `linear-gradient(135deg, ${selectedTheme.accentColor}, ${selectedTheme.accentColor}cc)` }} onClick={handleClose}>
                  <ArrowLeft className="w-4 h-4" />
                  Quay về
                </Button>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleSaveImage} disabled={isSaving}>
                    <Camera className="w-3.5 h-3.5" />
                    {isSaving ? 'Đang lưu...' : 'Lưu hình'}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleShareLink}>
                    <Share2 className="w-3.5 h-3.5" />
                    Chia sẻ
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleCopy(data.txHash, 'TX Hash')}>
                    <Copy className="w-3.5 h-3.5" />
                    Copy TX
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handlePostToProfile} disabled={isPosting}>
                    <Megaphone className="w-3.5 h-3.5" />
                    {isPosting ? 'Đang đăng...' : 'Đăng Profile'}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleSendMessage} disabled={isSendingMsg}>
                    <MessageSquare className="w-3.5 h-3.5" />
                    Gửi tin nhắn
                  </Button>
                </div>
              </div>

              {/* Footer */}
              <div className={`mt-3 text-xs font-medium ${selectedTheme.textColor}`}>
                🌟 FUN Profile • Mạnh Thường Quân 🌟
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
