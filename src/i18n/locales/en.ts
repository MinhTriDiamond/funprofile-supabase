/**
 * Locale: en — English
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import en_main from './chunks/en-main';
import en_p3 from './chunks/en-p3';
import en_p4 from './chunks/en-p4';
import en_p5 from './chunks/en-p5';
import en_p6 from './chunks/en-p6';
import en_p7 from './chunks/en-p7';
import en_p8 from './chunks/en-p8';
import en_p9 from './chunks/en-p9';
import en_p10 from './chunks/en-p10';
import en_p11 from './chunks/en-p11';
import en_p12 from './chunks/en-p12';

export const meta = {
  code: 'en' as const,
  name: 'English',
  nativeName: "English",
  flagUrl: 'https://flagcdn.com/w40/us.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: true,
};
const dict = { ...en_main, ...en_p3, ...en_p4, ...en_p5, ...en_p6, ...en_p7, ...en_p8, ...en_p9, ...en_p10, ...en_p11, ...en_p12 } as const;

export default dict;
