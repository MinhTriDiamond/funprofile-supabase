import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Globe,
  Users,
  Lock,
  Link2,
  Share2,
  Copy,
  Check,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { getAbsolutePostUrl, getAbsolutePostShareUrl } from '@/lib/slug';
import { usePplpEvaluate } from '@/hooks/usePplpEvaluate';

const PRODUCTION_DOMAIN = 'https://fun.rich';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: {
    id: string;
    slug?: string | null;
    public_id?: string | null;
    share_code?: string | null;
    user_id: string;
    profiles: {
      username: string;
      public_wallet_address?: string | null;
    };
  };
  currentUserId: string;
  onShareComplete?: () => void;
}

type Privacy = 'public' | 'friends' | 'private';

const PRIVACY_OPTIONS: { value: Privacy; icon: typeof Globe; labelKey: string }[] = [
  { value: 'public', icon: Globe, labelKey: 'public' },
  { value: 'friends', icon: Users, labelKey: 'friendsOnly' },
  { value: 'private', icon: Lock, labelKey: 'private' },
];

const SOCIAL_PLATFORMS = [
  {
    name: 'Facebook',
    color: '#1877F2',
    getUrl: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: 'X',
    color: '#000000',
    getUrl: (url: string, text?: string) =>
      `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text || '')}`,
  },
  {
    name: 'WhatsApp',
    color: '#25D366',
    getUrl: (url: string, text?: string) =>
      `https://wa.me/?text=${encodeURIComponent((text ? text + ' ' : '') + url)}`,
  },
  {
    name: 'Telegram',
    color: '#0088CC',
    getUrl: (url: string, text?: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text || '')}`,
  },
  {
    name: 'Email',
    color: '#EA4335',
    getUrl: (url: string, text?: string) =>
      `mailto:?subject=${encodeURIComponent(text || 'Check this out')}&body=${encodeURIComponent(url)}`,
  },
];

export const ShareDialog = ({
  open,
  onOpenChange,
  post,
  currentUserId,
  onShareComplete,
}: ShareDialogProps) => {
  const { t } = useLanguage();
  const { evaluateAsync } = usePplpEvaluate();
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Canonical URL → social shares + OG (stable, content-independent)
  const postUrl = getAbsolutePostUrl(post);
  // Short share URL → Copy Link (username-independent, survives renames)
  const shortShareUrl = getAbsolutePostShareUrl(post);

  const handleShareToProfile = async () => {
    if (!currentUserId) return;
    setIsSharing(true);
    try {
      const captionText = caption.trim();
      const { data: latestShare } = await supabase
        .from('shared_posts')
        .select('id, caption, visibility, created_at')
        .eq('user_id', currentUserId)
        .eq('original_post_id', post.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const isRecentDuplicate = latestShare
        && (latestShare.caption || '') === captionText
        && (latestShare.visibility || 'public') === privacy
        && Date.now() - new Date(latestShare.created_at).getTime() < 5 * 60 * 1000;

      if (isRecentDuplicate) {
        toast.info(t('sharedPost'));
        onOpenChange(false);
        return;
      }

      const { error } = await supabase.from('shared_posts').insert({
        user_id: currentUserId,
        original_post_id: post.id,
        caption: captionText || null,
        visibility: privacy,
      });
      if (error) throw error;
      // PPLP: Evaluate share action for Light Score
      evaluateAsync({ action_type: 'share', reference_id: post.id, content: caption || undefined });
      toast.success(t('sharedPost'));
      onShareComplete?.();
      window.dispatchEvent(new Event('invalidate-feed'));
      onOpenChange(false);
      setCaption('');
      setPrivacy('public');
    } catch {
      toast.error(t('cannotShare'));
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(t('linkCopied'));
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Cannot copy to clipboard');
    }
  };

  const getWeb3ProfileLink = () => {
    const wallet = post.profiles?.public_wallet_address;
    if (wallet) {
      return `${PRODUCTION_DOMAIN}/profile/${wallet}`;
    }
    return `${PRODUCTION_DOMAIN}/profile/${post.user_id}`;
  };

  const handleSocialShare = (platform: typeof SOCIAL_PLATFORMS[0]) => {
    const url = platform.getUrl(postUrl, caption);
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            {t('share')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          {/* Caption */}
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Say something about this..."
            className="resize-none"
            rows={2}
          />

          {/* Privacy selector */}
          <div className="flex gap-2">
            {PRIVACY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setPrivacy(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                    privacy === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t(opt.labelKey as never /* dynamic i18n key */) || opt.value}
                </button>
              );
            })}
          </div>

          {/* Share to profile button */}
          <Button
            onClick={handleShareToProfile}
            disabled={isSharing || !currentUserId}
            className="w-full"
          >
            {isSharing ? '...' : t('shareToProfile')}
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                or
              </span>
            </div>
          </div>

          {/* Social platforms */}
          <div className="grid grid-cols-5 gap-2">
            {SOCIAL_PLATFORMS.map((platform) => (
              <button
                key={platform.name}
                onClick={() => handleSocialShare(platform)}
                className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-secondary transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground text-xs font-bold"
                  style={{ backgroundColor: platform.color }}
                >
                  {platform.name[0]}
                </div>
                <span className="text-[10px] text-muted-foreground">{platform.name}</span>
              </button>
            ))}
          </div>

          {/* Copy links */}
          <div className="space-y-2">
            <button
              onClick={() => handleCopy(shortShareUrl, 'link')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-sm"
            >
              {copied === 'link' ? <Check className="w-4 h-4 text-primary" /> : <Link2 className="w-4 h-4" />}
              <span className="flex-1 text-left">{t('copyLink')}</span>
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            <button
              onClick={() => handleCopy(getWeb3ProfileLink(), 'web3')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-sm"
            >
              {copied === 'web3' ? <Check className="w-4 h-4 text-primary" /> : <Wallet className="w-4 h-4" />}
              <span className="flex-1 text-left">Copy Web3 Profile Link</span>
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
