import { getTwemojiUrl } from '@/lib/emojiUtils';

interface TwemojiImageProps {
  emoji: string;
  size?: number;
  className?: string;
}

/**
 * Renders a single emoji as a Twemoji SVG image.
 * Falls back to unicode text if image fails to load.
 */
export const TwemojiImage = ({ emoji, size = 20, className = '' }: TwemojiImageProps) => {
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
      onError={(e) => {
        // Fallback: replace img with text node
        const span = document.createElement('span');
        span.textContent = emoji;
        e.currentTarget.replaceWith(span);
      }}
    />
  );
};
