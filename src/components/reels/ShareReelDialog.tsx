import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/i18n/LanguageContext';
import { useReels } from '@/hooks/useReels';
import { Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAbsoluteVideoUrl } from '@/lib/slug';
import { useState } from 'react';

interface ShareReelDialogProps {
  reelId: string;
  reelSlug?: string | null;
  reelUsername?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShareReelDialog = ({ reelId, reelSlug, reelUsername, open, onOpenChange }: ShareReelDialogProps) => {
  const { t } = useLanguage();
  const { shareReel } = useReels();
  const [copied, setCopied] = useState(false);

  const reelUrl = getAbsoluteVideoUrl({
    id: reelId,
    slug: reelSlug,
    profiles: reelUsername ? { username: reelUsername } : null,
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(reelUrl);
      setCopied(true);
      toast.success(t('linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Không thể sao chép');
    }
  };

  const handleShare = () => {
    shareReel.mutate({ reelId, sharedTo: 'feed' });
    onOpenChange(false);
    toast.success(t('shareReelText'));
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(reelUrl)}`, '_blank');
  };

  const shareToTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(reelUrl)}&text=Xem+video+tr%C3%AAn+FUN!`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" /> {t('shareReel')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input value={reelUrl} readOnly className="text-sm" />
            <Button size="icon" variant="outline" onClick={handleCopyLink}>
              <Copy className={`w-4 h-4 ${copied ? 'text-primary' : ''}`} />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={shareToFacebook}>
              Facebook
            </Button>
            <Button variant="outline" className="flex-1" onClick={shareToTelegram}>
              Telegram
            </Button>
          </div>
          <Button onClick={handleShare} className="w-full justify-start gap-2">
            <Share2 className="w-4 h-4" /> {t('shareToProfile')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
