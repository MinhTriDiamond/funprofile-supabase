/**
 * Locale: zh — 中文
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import zh_main from './chunks/zh-main';
import zh_p3 from './chunks/zh-p3';
import zh_p4 from './chunks/zh-p4';
import zh_p5 from './chunks/zh-p5';
import zh_p6 from './chunks/zh-p6';
import zh_p7 from './chunks/zh-p7';
import zh_p8 from './chunks/zh-p8';
import zh_p9 from './chunks/zh-p9';
import zh_p10 from './chunks/zh-p10';
import zh_p11 from './chunks/zh-p11';
import zh_p12 from './chunks/zh-p12';

export const meta = {
  code: 'zh' as const,
  name: 'Chinese (Simplified)',
  nativeName: "中文",
  flagUrl: 'https://flagcdn.com/w40/cn.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...zh_main, ...zh_p3, ...zh_p4, ...zh_p5, ...zh_p6, ...zh_p7, ...zh_p8, ...zh_p9, ...zh_p10, ...zh_p11, ...zh_p12 } as const;

export default dict;
