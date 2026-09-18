/**
 * Curated sticker collection using Twemoji CDN (same as TwemojiImage component).
 * All URLs are guaranteed to work since they use the same CDN as the rest of the app.
 */

import { toCodePoint } from '@/lib/emojiUtils';

export interface CuratedSticker {
  url: string;
  alt: string;
}

export interface StickerCategory {
  name: string;
  icon: string;
  stickers: CuratedSticker[];
}

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg';

function twemojiUrl(emoji: string): string {
  return `${TWEMOJI_BASE}/${toCodePoint(emoji)}.svg`;
}

function s(emoji: string): CuratedSticker {
  return { url: twemojiUrl(emoji), alt: emoji };
}

export const STICKER_CATEGORIES: StickerCategory[] = [
  {
    name: 'Smileys',
    icon: '😊',
    stickers: [
      s('😀'), s('😃'), s('😄'), s('😁'), s('😂'), s('🤣'),
      s('😍'), s('🤩'), s('😉'), s('😊'), s('😘'), s('😋'), s('🤪'),
    ],
  },
  {
    name: 'Emotions',
    icon: '🥺',
    stickers: [
      s('🥺'), s('😢'), s('😭'), s('😠'), s('😡'), s('😤'),
      s('😨'), s('😰'), s('😞'), s('😔'), s('😕'), s('😮'),
    ],
  },
  {
    name: 'Gestures',
    icon: '👍',
    stickers: [
      s('👍'), s('👎'), s('👏'), s('🙌'), s('🙏'), s('🤝'),
      s('💪'), s('✌️'), s('👋'), s('👌'), s('🤞'), s('🤟'),
    ],
  },
  {
    name: 'Hearts',
    icon: '❤️',
    stickers: [
      s('❤️'), s('🧡'), s('💛'), s('💚'), s('💙'), s('💜'),
      s('💖'), s('💗'), s('💓'), s('💞'), s('💘'), s('💔'), s('🔥'),
    ],
  },
  {
    name: 'Animals',
    icon: '🐱',
    stickers: [
      s('🐱'), s('🐶'), s('🐻'), s('🐼'), s('🦄'), s('🦋'),
      s('🐵'), s('🦊'), s('🐰'), s('🐧'), s('🦉'), s('🐬'),
    ],
  },
  {
    name: 'Food',
    icon: '🍕',
    stickers: [
      s('🍕'), s('🍔'), s('🍟'), s('🌭'), s('🌮'), s('🍦'),
      s('🎂'), s('🍩'), s('🍪'), s('☕'), s('🍹'), s('🧋'),
    ],
  },
  {
    name: 'Celebrate',
    icon: '🎉',
    stickers: [
      s('🎉'), s('🎊'), s('🏆'), s('🥇'), s('👑'), s('⭐'),
      s('🌟'), s('✨'), s('🎈'), s('🎁'), s('🚀'), s('🌈'), s('💯'),
    ],
  },
];
