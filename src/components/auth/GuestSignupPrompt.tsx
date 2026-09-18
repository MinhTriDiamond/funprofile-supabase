import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLanguage } from '@/i18n/LanguageContext';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

/**
 * GuestSignupPrompt
 * 
 * Popup gợi ý đăng ký khi Khách muốn tương tác (comment, like, post).
 * Hiển thị giữa trang – không chặn trải nghiệm đọc/xem cơ bản.
 */

interface GuestSignupPromptProps {
  open: boolean;
  onClose: () => void;
}

export const GuestSignupPrompt = ({ open, onClose }: GuestSignupPromptProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleRegister = () => {
    onClose();
    navigate('/auth');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md border-2 border-primary/30 bg-background/95 backdrop-blur-sm">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center py-4">
          <div className="flex justify-center mb-4">
            <img
              src="/fun-profile-logo-128.webp"
              alt="FUN Profile"
              className="w-20 h-20 rounded-full"
              style={{
                border: '3px solid transparent',
                background: 'linear-gradient(white, white) padding-box, linear-gradient(135deg, #166534, #22c55e, #15803d) border-box',
              }}
            />
          </div>

          <h2
            className="text-2xl font-bold mb-6"
            style={{
              background: 'linear-gradient(135deg, #166534 0%, #22c55e 30%, #15803d 50%, #22c55e 70%, #166534 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {t('guestPromptTitle')}
          </h2>

          <div className="space-y-3 mb-8">
            <BenefitItem emoji="🌼" text={t('guestPromptBenefit1')} />
            <BenefitItem emoji="📚" text={t('guestPromptBenefit2')} />
            <BenefitItem emoji="📲" text={t('guestPromptBenefit3')} />
            <BenefitItem emoji="🧧" text={t('guestPromptBenefit4')} />
          </div>

          <div
            className="relative p-[3px] rounded-full"
            style={{
              background: 'linear-gradient(90deg, #FF0000, #FF7F00, #FFFF00, #00FF00, #0000FF, #4B0082, #9400D3, #FF0000)',
              boxShadow: '0 0 15px rgba(255, 0, 0, 0.15), 0 0 15px rgba(0, 255, 0, 0.15), 0 0 15px rgba(0, 0, 255, 0.15)',
            }}
          >
            <Button
              onClick={handleRegister}
              className="w-full h-12 text-lg font-bold rounded-full bg-white hover:bg-slate-50 border-0"
            >
              <span
                style={{
                  background: 'linear-gradient(135deg, #166534 0%, #22c55e 30%, #15803d 50%, #22c55e 70%, #166534 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {t('guestPromptCta')}
              </span>
            </Button>
          </div>

          <button
            onClick={onClose}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('guestPromptLater')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const BenefitItem = ({ emoji, text }: { emoji: string; text: string }) => (
  <div className="flex items-center justify-center gap-3">
    <span className="text-2xl">{emoji}</span>
    <span className="text-lg font-semibold text-foreground">{text}</span>
  </div>
);

/**
 * Hook for components to trigger the guest signup prompt.
 * Uses useCurrentUser instead of creating its own auth subscription.
 */
export function useGuestPrompt() {
  const { isAuthenticated } = useCurrentUser();
  const [showPrompt, setShowPrompt] = useState(false);

  const isGuest = !isAuthenticated;

  const promptGuest = () => {
    if (isGuest) {
      setShowPrompt(true);
      return true;
    }
    return false;
  };

  const GuestPrompt = () => (
    <GuestSignupPrompt open={showPrompt} onClose={() => setShowPrompt(false)} />
  );

  return { isGuest, promptGuest, GuestPrompt };
}
