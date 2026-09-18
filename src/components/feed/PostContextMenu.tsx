import { useCallback } from 'react';
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
  title = 'Tùy chọn bài viết',
}: PostContextMenuProps) => {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleCopyText = useCallback(async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      try { navigator.vibrate?.(20); } catch { /* noop */ }
      toast.success('Đã sao chép văn bản');
    } else {
      toast.error('Không sao chép được');
    }
    close();
  }, [content, close]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    const ok = await copyToClipboard(shareUrl);
    if (ok) toast.success('Đã sao chép liên kết');
    else toast.error('Không sao chép được liên kết');
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
    { icon: Copy, label: 'Sao chép văn bản', onClick: handleCopyText, show: !!content },
    { icon: TextSelect, label: 'Chọn văn bản', onClick: handleSelect, show: !!onSelectText },
    { icon: Link2, label: 'Sao chép liên kết', onClick: handleCopyLink, show: !!shareUrl },
    { icon: Share2, label: 'Chia sẻ', onClick: handleShare, show: !!onShare },
  ].filter((i) => i.show);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Chọn một hành động để sao chép hoặc chia sẻ nội dung
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
