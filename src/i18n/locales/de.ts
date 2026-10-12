/**
 * Locale: de — Deutsch
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import de_main from './chunks/de-main';
import de_p3 from './chunks/de-p3';
import de_p4 from './chunks/de-p4';
import de_p5 from './chunks/de-p5';
import de_p6 from './chunks/de-p6';
import de_p7 from './chunks/de-p7';
import de_p8 from './chunks/de-p8';
import de_p9 from './chunks/de-p9';
import de_p10 from './chunks/de-p10';
import de_p11 from './chunks/de-p11';
import de_p12 from './chunks/de-p12';

export const meta = {
  code: 'de' as const,
  name: 'German',
  nativeName: "Deutsch",
  flagUrl: 'https://flagcdn.com/w40/de.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...de_main, ...de_p3, ...de_p4, ...de_p5, ...de_p6, ...de_p7, ...de_p8, ...de_p9, ...de_p10, ...de_p11, ...de_p12 } as const;

export default dict;
