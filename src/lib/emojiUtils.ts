/**
 * Twemoji utility functions
 * Converts unicode emoji to Twemoji CDN SVG URLs
 */

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg';

/**
 * Convert a unicode character to its hex codepoint string.
 * Handles surrogate pairs and compound emoji (ZWJ sequences, skin tones, etc.)
 */
export function toCodePoint(emoji: string): string {
  const codePoints: string[] = [];
  for (let i = 0; i < emoji.length; i++) {
    const code = emoji.codePointAt(i);
    if (code === undefined) continue;
    // Skip variation selectors (FE0E/FE0F)
    if (code === 0xfe0e || code === 0xfe0f) continue;
    codePoints.push(code.toString(16));
    // Skip low surrogate
    if (code > 0xffff) i++;
  }
  return codePoints.join('-');
}

/**
 * Get Twemoji CDN URL for an emoji character
 */
export function getTwemojiUrl(emoji: string): string {
  return `${TWEMOJI_BASE}/${toCodePoint(emoji)}.svg`;
}

// Regex to match most emoji (including ZWJ sequences, keycaps, flags)
const EMOJI_REGEX = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu;

export interface EmojiSegment {
  type: 'text' | 'emoji';
  value: string;
}

/**
 * Parse text into segments of plain text and emoji.
 * Used by TwemojiText to replace unicode emoji with SVG images.
 */
export function parseEmojiInText(text: string): EmojiSegment[] {
  const segments: EmojiSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(EMOJI_REGEX)) {
    const emoji = match[0];
    const index = match.index!;

    if (index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, index) });
    }
    segments.push({ type: 'emoji', value: emoji });
    lastIndex = index + emoji.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}
