import { memo } from 'react';
import { getReactionAsset, type ReactionType } from '@/lib/reactionAssets';

interface PremiumEmojiProps {
  /** Reaction type — sẽ map sang emoji unicode tương ứng */
  type?: ReactionType | string;
  /** Hoặc emoji unicode trực tiếp */
  emoji?: string;
  size?: number;
  className?: string;
  /** giữ prop cho tương thích — không còn ý nghĩa với native emoji */
  priority?: boolean;
  /** Thêm soft glow theo màu reaction (cho trigger active / picker hover) */
  glow?: boolean;
}

/**
 * Hệ icon native: dùng emoji unicode + font emoji của OS
 * (Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji).
 * Đồng nhất với emoji Cha thấy trong chat, không phụ thuộc CDN.
 */
const EMOJI_FONT_STACK =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color","Android Emoji",sans-serif';

export const PremiumEmoji = memo(function PremiumEmoji({
  type,
  emoji,
  size = 24,
  className = '',
  glow = false,
}: PremiumEmojiProps) {
  const asset = getReactionAsset(type);
  const char = asset?.emoji ?? emoji ?? '';
  if (!char) return null;

  const filter = glow && asset
    ? `drop-shadow(0 1px 2px rgba(0,0,0,0.18)) drop-shadow(0 0 6px rgba(${asset.glowRGB}, 0.45))`
    : 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.12))';

  return (
    <span
      aria-label={char}
      role="img"
      style={{
        fontSize: size,
        lineHeight: 1,
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: EMOJI_FONT_STACK,
        fontVariantEmoji: 'emoji' as never,
        filter,
        userSelect: 'none',
      }}
      className={`select-none pointer-events-none align-middle ${className}`}
    >
      {char}
    </span>
  );
});
