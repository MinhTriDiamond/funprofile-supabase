/**
 * Locale: es — Español
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import es_main from './chunks/es-main';
import es_p3 from './chunks/es-p3';
import es_p4 from './chunks/es-p4';
import es_p5 from './chunks/es-p5';
import es_p6 from './chunks/es-p6';
import es_p7 from './chunks/es-p7';
import es_p8 from './chunks/es-p8';
import es_p9 from './chunks/es-p9';
import es_p10 from './chunks/es-p10';
import es_p11 from './chunks/es-p11';
import es_p12 from './chunks/es-p12';

export const meta = {
  code: 'es' as const,
  name: 'Spanish',
  nativeName: "Español",
  flagUrl: 'https://flagcdn.com/w40/es.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...es_main, ...es_p3, ...es_p4, ...es_p5, ...es_p6, ...es_p7, ...es_p8, ...es_p9, ...es_p10, ...es_p11, ...es_p12 } as const;

export default dict;
