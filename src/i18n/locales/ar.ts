/**
 * Locale: ar — العربية
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import ar_main from './chunks/ar-main';
import ar_p3 from './chunks/ar-p3';
import ar_p4 from './chunks/ar-p4';
import ar_p5 from './chunks/ar-p5';
import ar_p6 from './chunks/ar-p6';
import ar_p7 from './chunks/ar-p7';
import ar_p8 from './chunks/ar-p8';
import ar_p9 from './chunks/ar-p9';
import ar_p10 from './chunks/ar-p10';
import ar_p11 from './chunks/ar-p11';
import ar_p12 from './chunks/ar-p12';

export const meta = {
  code: 'ar' as const,
  name: 'Arabic',
  nativeName: "العربية",
  flagUrl: 'https://flagcdn.com/w40/sa.png',
  direction: 'rtl' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...ar_main, ...ar_p3, ...ar_p4, ...ar_p5, ...ar_p6, ...ar_p7, ...ar_p8, ...ar_p9, ...ar_p10, ...ar_p11, ...ar_p12 } as const;

export default dict;
