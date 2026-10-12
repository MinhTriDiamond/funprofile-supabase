import { useCallback } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Copy, TextSelect, Link2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { copyToClipboard } from '@/utils/clipboard';

interface PostContextMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  shareUrl?: string;
  onShare?: () => void;
  onSelectText?: () => void;
  title?: string;
}

/**
 * Facebook-style long-press context menu cho bài viết.
 * Bottom sheet trên mọi kích thước (đơn giản, đồng nhất iOS + Android + Desktop).
 */
export const PostContextMenu = ({
  open,
  onOpenChange,
  content,
  shareUrl,
  onShare,
  onSelectText,
  title,
}: PostContextMenuProps) => {
  const { t } = useLanguage();
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleCopyText = useCallback(async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      try { navigator.vibrate?.(20); } catch { /* noop */ }
      toast.success(t('pcmTextCopied'));
    } else {
      toast.error(t('pcmCopyFailed'));
    }
    close();
  }, [content, close]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    const ok = await copyToClipboard(shareUrl);
    if (ok) toast.success(t('pcmLinkCopied'));
    else toast.error(t('pcmLinkCopyFailed'));
    close();
  }, [shareUrl, close]);

  const handleSelect = useCallback(() => {
    close();
    if (onSelectText) setTimeout(onSelectText, 120);
  }, [onSelectText, close]);

  const handleShare = useCallback(() => {
    close();
    if (onShare) setTimeout(onShare, 120);
  }, [onShare, close]);

  const items = [
    { icon: Copy, label: t('pcmCopyText'), onClick: handleCopyText, show: !!content },
    { icon: TextSelect, label: t('pcmSelectText'), onClick: handleSelect, show: !!onSelectText },
    { icon: Link2, label: t('copyLink'), onClick: handleCopyLink, show: !!shareUrl },
    { icon: Share2, label: t('share'), onClick: handleShare, show: !!onShare },
  ].filter((i) => i.show);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base">{title ?? t('pcmTitle')}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {t('pcmDescription')}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-2 pb-6">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={it.onClick}
              className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-accent focus:bg-accent focus:outline-none active:bg-accent"
            >
              <it.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium">{it.label}</span>
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
