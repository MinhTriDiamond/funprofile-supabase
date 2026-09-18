import { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getAbsoluteLiveUrl } from '@/lib/slug';

interface LiveSharePanelProps {
  sessionId: string;
  slug?: string | null;
  username?: string | null;
}

export function LiveSharePanel({ sessionId, slug, username }: LiveSharePanelProps) {
  const [copied, setCopied] = useState(false);

  const liveUrl = getAbsoluteLiveUrl({
    id: sessionId,
    slug,
    profiles: username ? { username } : null,
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      toast.success('Đã sao chép link!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Không thể sao chép');
    }
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(liveUrl)}`, '_blank');
  };

  const shareToTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(liveUrl)}&text=Xem+LIVE+ngay!`, '_blank');
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Share2 className="h-4 w-4" />
          Chia sẻ
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chia sẻ LIVE</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input value={liveUrl} readOnly className="text-sm" />
            <Button size="icon" variant="outline" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
