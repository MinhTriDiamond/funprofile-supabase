/**
 * Premium Reaction System — single source of truth
 *
 * Sử dụng Microsoft Fluent Emoji 3D (CDN jsDelivr) làm asset chính,
 * fallback về Twemoji SVG (đã sẵn ở getTwemojiUrl) rồi cuối cùng unicode.
 *
 * Giữ nguyên 6 reaction type trong DB: gratitude/care/like/love/haha/wow.
 */

export type ReactionType = 'gratitude' | 'care' | 'like' | 'love' | 'haha' | 'wow';

export interface ReactionAsset {
  type: ReactionType;
  emoji: string;
  /** Slug của Fluent Emoji folder */
  fluentSlug: string;
  /** Tên file PNG bên trong /3D */
  fluentFile: string;
  /** Có skin tone → cần đi qua /Default/3D/ thay vì /3D/ */
  hasSkinTone?: boolean;
  labelKey:
    | 'reactionGratitude'
    | 'reactionCare'
    | 'like'
    | 'reactionLove'
    | 'haha'
    | 'reactionWow';
  /** HSL màu chủ đạo (cho text/border) */
  color: string;
  /** Màu glow nền (rgb 0-255) — dùng cho radial gradient */
  glowRGB: string;
  /** Tailwind text class màu */
  textClass: string;
  /** Twemoji vẫn dùng cho stack/summary nhỏ */
  twemoji: string;
}

const FLUENT_BASE =
  'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets';

export const fluentEmojiUrl = (asset: ReactionAsset): string => {
  const sub = asset.hasSkinTone ? '/Default/3D/' : '/3D/';
  return `${FLUENT_BASE}/${encodeURIComponent(asset.fluentSlug)}${sub}${asset.fluentFile}`;
};

export const REACTION_ASSETS: Record<ReactionType, ReactionAsset> = {
  gratitude: {
    type: 'gratitude',
    emoji: '🙏',
    fluentSlug: 'Folded hands',
    fluentFile: 'folded_hands_3d_default.png',
    hasSkinTone: true,
    labelKey: 'reactionGratitude',
    color: '#a855f7',
    glowRGB: '168, 85, 247',
    textClass: 'text-purple-500',
    twemoji: '🙏',
  },
  care: {
    type: 'care',
    emoji: '🥰',
    fluentSlug: 'Smiling face with hearts',
    fluentFile: 'smiling_face_with_hearts_3d.png',
    labelKey: 'reactionCare',
    color: '#f97316',
    glowRGB: '249, 115, 22',
    textClass: 'text-orange-500',
    twemoji: '🥰',
  },
  like: {
    type: 'like',
    emoji: '👍',
    fluentSlug: 'Thumbs up',
    fluentFile: 'thumbs_up_3d_default.png',
    hasSkinTone: true,
    labelKey: 'like',
    color: '#3b82f6',
    glowRGB: '59, 130, 246',
    textClass: 'text-blue-500',
    twemoji: '👍',
  },
  love: {
    type: 'love',
    emoji: '❤️',
    fluentSlug: 'Red heart',
    fluentFile: 'red_heart_3d.png',
    labelKey: 'reactionLove',
    color: '#ef4444',
    glowRGB: '239, 68, 68',
    textClass: 'text-red-500',
    twemoji: '❤️',
  },
  haha: {
    type: 'haha',
    emoji: '😂',
    fluentSlug: 'Face with tears of joy',
    fluentFile: 'face_with_tears_of_joy_3d.png',
    labelKey: 'haha',
    color: '#eab308',
    glowRGB: '234, 179, 8',
    textClass: 'text-yellow-500',
    twemoji: '😂',
  },
  wow: {
    type: 'wow',
    emoji: '😮',
    fluentSlug: 'Face with open mouth',
    fluentFile: 'face_with_open_mouth_3d.png',
    labelKey: 'reactionWow',
    color: '#eab308',
    glowRGB: '234, 179, 8',
    textClass: 'text-yellow-600',
    twemoji: '😮',
  },
};

export const REACTION_ORDER: ReactionType[] = [
  'gratitude',
  'care',
  'like',
  'love',
  'haha',
  'wow',
];

export const REACTION_LIST: ReactionAsset[] = REACTION_ORDER.map(
  (t) => REACTION_ASSETS[t]
);

export const getReactionAsset = (
  type: string | null | undefined
): ReactionAsset | undefined =>
  type ? REACTION_ASSETS[type as ReactionType] : undefined;
