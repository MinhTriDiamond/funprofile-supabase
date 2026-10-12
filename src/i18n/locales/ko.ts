/**
 * Locale: ko — 한국어
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import ko_main from './chunks/ko-main';
import ko_p3 from './chunks/ko-p3';
import ko_p4 from './chunks/ko-p4';
import ko_p5 from './chunks/ko-p5';
import ko_p6 from './chunks/ko-p6';
import ko_p7 from './chunks/ko-p7';
import ko_p8 from './chunks/ko-p8';
import ko_p9 from './chunks/ko-p9';
import ko_p10 from './chunks/ko-p10';
import ko_p11 from './chunks/ko-p11';
import ko_p12 from './chunks/ko-p12';

export const meta = {
  code: 'ko' as const,
  name: 'Korean',
  nativeName: "한국어",
  flagUrl: 'https://flagcdn.com/w40/kr.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...ko_main, ...ko_p3, ...ko_p4, ...ko_p5, ...ko_p6, ...ko_p7, ...ko_p8, ...ko_p9, ...ko_p10, ...ko_p11, ...ko_p12 } as const;

export default dict;
