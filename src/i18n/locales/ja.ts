/**
 * Locale: ja — 日本語
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import ja_main from './chunks/ja-main';
import ja_p3 from './chunks/ja-p3';
import ja_p4 from './chunks/ja-p4';
import ja_p5 from './chunks/ja-p5';
import ja_p6 from './chunks/ja-p6';
import ja_p7 from './chunks/ja-p7';
import ja_p8 from './chunks/ja-p8';
import ja_p9 from './chunks/ja-p9';
import ja_p10 from './chunks/ja-p10';
import ja_p11 from './chunks/ja-p11';
import ja_p12 from './chunks/ja-p12';

export const meta = {
  code: 'ja' as const,
  name: 'Japanese',
  nativeName: "日本語",
  flagUrl: 'https://flagcdn.com/w40/jp.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...ja_main, ...ja_p3, ...ja_p4, ...ja_p5, ...ja_p6, ...ja_p7, ...ja_p8, ...ja_p9, ...ja_p10, ...ja_p11, ...ja_p12 } as const;

export default dict;
