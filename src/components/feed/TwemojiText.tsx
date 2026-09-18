import React, { useMemo } from 'react';
import { parseEmojiInText } from '@/lib/emojiUtils';
import { TwemojiImage } from '@/components/ui/TwemojiImage';

interface TwemojiTextProps {
  text: string;
  emojiSize?: number;
  className?: string;
}

/**
 * Renders text with unicode emoji replaced by Twemoji SVG images.
 * Memoized to avoid re-parsing on parent re-renders.
 */
export const TwemojiText = React.memo(({ text, emojiSize = 20, className }: TwemojiTextProps) => {
  const segments = useMemo(() => parseEmojiInText(text), [text]);

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'emoji' ? (
          <TwemojiImage key={i} emoji={seg.value} size={emojiSize} />
        ) : (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        )
      )}
    </span>
  );
});

TwemojiText.displayName = 'TwemojiText';
