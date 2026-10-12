/**
 * Locale: vi — Tiếng Việt
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import vi_main from './chunks/vi-main';
import vi_p3 from './chunks/vi-p3';
import vi_p4 from './chunks/vi-p4';
import vi_p5 from './chunks/vi-p5';
import vi_p6 from './chunks/vi-p6';
import vi_p7 from './chunks/vi-p7';
import vi_p8 from './chunks/vi-p8';
import vi_p9 from './chunks/vi-p9';
import vi_p10 from './chunks/vi-p10';
import vi_p11 from './chunks/vi-p11';
import vi_p12 from './chunks/vi-p12';

export const meta = {
  code: 'vi' as const,
  name: 'Vietnamese',
  nativeName: "Tiếng Việt",
  flagUrl: 'https://flagcdn.com/w40/vn.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: true,
};
const dict = { ...vi_main, ...vi_p3, ...vi_p4, ...vi_p5, ...vi_p6, ...vi_p7, ...vi_p8, ...vi_p9, ...vi_p10, ...vi_p11, ...vi_p12 } as const;

export default dict;
