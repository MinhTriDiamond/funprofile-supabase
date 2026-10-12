/**
 * Locale: id — Bahasa Indonesia
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import id_main from './chunks/id-main';
import id_p3 from './chunks/id-p3';
import id_p4 from './chunks/id-p4';
import id_p5 from './chunks/id-p5';
import id_p6 from './chunks/id-p6';
import id_p7 from './chunks/id-p7';
import id_p8 from './chunks/id-p8';
import id_p9 from './chunks/id-p9';
import id_p10 from './chunks/id-p10';
import id_p11 from './chunks/id-p11';
import id_p12 from './chunks/id-p12';

export const meta = {
  code: 'id' as const,
  name: 'Indonesian',
  nativeName: "Bahasa Indonesia",
  flagUrl: 'https://flagcdn.com/w40/id.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...id_main, ...id_p3, ...id_p4, ...id_p5, ...id_p6, ...id_p7, ...id_p8, ...id_p9, ...id_p10, ...id_p11, ...id_p12 } as const;

export default dict;
