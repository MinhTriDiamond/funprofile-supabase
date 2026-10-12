/**
 * Locale: pt — Português
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import pt_main from './chunks/pt-main';
import pt_p3 from './chunks/pt-p3';
import pt_p4 from './chunks/pt-p4';
import pt_p5 from './chunks/pt-p5';
import pt_p6 from './chunks/pt-p6';
import pt_p7 from './chunks/pt-p7';
import pt_p8 from './chunks/pt-p8';
import pt_p9 from './chunks/pt-p9';
import pt_p10 from './chunks/pt-p10';
import pt_p11 from './chunks/pt-p11';
import pt_p12 from './chunks/pt-p12';

export const meta = {
  code: 'pt' as const,
  name: 'Portuguese',
  nativeName: "Português",
  flagUrl: 'https://flagcdn.com/w40/br.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...pt_main, ...pt_p3, ...pt_p4, ...pt_p5, ...pt_p6, ...pt_p7, ...pt_p8, ...pt_p9, ...pt_p10, ...pt_p11, ...pt_p12 } as const;

export default dict;
