/**
 * Locale: fr — Français
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import fr_main from './chunks/fr-main';
import fr_p3 from './chunks/fr-p3';
import fr_p4 from './chunks/fr-p4';
import fr_p5 from './chunks/fr-p5';
import fr_p6 from './chunks/fr-p6';
import fr_p7 from './chunks/fr-p7';
import fr_p8 from './chunks/fr-p8';
import fr_p9 from './chunks/fr-p9';
import fr_p10 from './chunks/fr-p10';
import fr_p11 from './chunks/fr-p11';
import fr_p12 from './chunks/fr-p12';

export const meta = {
  code: 'fr' as const,
  name: 'French',
  nativeName: "Français",
  flagUrl: 'https://flagcdn.com/w40/fr.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...fr_main, ...fr_p3, ...fr_p4, ...fr_p5, ...fr_p6, ...fr_p7, ...fr_p8, ...fr_p9, ...fr_p10, ...fr_p11, ...fr_p12 } as const;

export default dict;
