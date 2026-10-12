/**
 * Locale: th — ไทย
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import th_main from './chunks/th-main';
import th_p3 from './chunks/th-p3';
import th_p4 from './chunks/th-p4';
import th_p5 from './chunks/th-p5';
import th_p6 from './chunks/th-p6';
import th_p7 from './chunks/th-p7';
import th_p8 from './chunks/th-p8';
import th_p9 from './chunks/th-p9';
import th_p10 from './chunks/th-p10';
import th_p11 from './chunks/th-p11';
import th_p12 from './chunks/th-p12';

export const meta = {
  code: 'th' as const,
  name: 'Thai',
  nativeName: "ไทย",
  flagUrl: 'https://flagcdn.com/w40/th.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...th_main, ...th_p3, ...th_p4, ...th_p5, ...th_p6, ...th_p7, ...th_p8, ...th_p9, ...th_p10, ...th_p11, ...th_p12 } as const;

export default dict;
