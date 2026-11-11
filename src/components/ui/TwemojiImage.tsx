import { useState } from 'react';
import { getTwemojiUrl } from '@/lib/emojiUtils';

interface TwemojiImageProps {
  emoji: string;
  size?: number;
  className?: string;
}

/**
 * Renders a single emoji as a Twemoji SVG image, falling back to the native
 * unicode emoji when the asset cannot load (emoji newer than the Twemoji set,
 * mobile network hiccup, CDN bị chặn…).
 *
 * QUAN TRỌNG — fallback PHẢI đi qua React state, KHÔNG được thay DOM bằng tay.
 * Bản cũ (trước 2026-11-09) gọi `e.currentTarget.replaceWith(span)`: nó gỡ một
 * node do React quản lý khỏi cây DOM. Lần render/unmount kế tiếp React gọi
 * `removeChild` trên chính node đó ⇒
 * `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be
 * removed is not a child of this node` ⇒ sập toàn app qua ErrorBoundary.
 * Sự cố thực tế: người dùng nước ngoài trên Android đăng bài bị văng trang lỗi
 * (2026-11-09) — composer đóng lại đúng lúc React gỡ cây DOM đã bị sửa tay.
 */
export const TwemojiImage = ({ emoji, size = 20, className = '' }: TwemojiImageProps) => {
  // Lưu chính emoji đã lỗi (thay vì boolean) để instance được tái dùng cho emoji
  // khác vẫn thử tải ảnh mới mà không cần effect.
  const [failedEmoji, setFailedEmoji] = useState<string | null>(null);

  if (failedEmoji === emoji) {
    return (
      <span
        role="img"
        aria-label={emoji}
        className={`inline-block align-text-bottom leading-none ${className}`}
        style={{ fontSize: size, lineHeight: `${size}px` }}
      >
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={getTwemojiUrl(emoji)}
      alt={emoji}
      draggable={false}
      loading="lazy"
      width={size}
      height={size}
      className={`inline-block align-text-bottom ${className}`}
      style={{ width: size, height: size }}
      onError={() => setFailedEmoji(emoji)}
    />
  );
};

TwemojiImage.displayName = 'TwemojiImage';
