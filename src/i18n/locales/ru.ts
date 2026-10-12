/**
 * Locale: ru — Русский
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change `meta`, translate the entries.
 * No code changes needed elsewhere.
 */
import ru_main from './chunks/ru-main';
import ru_p3 from './chunks/ru-p3';
import ru_p4 from './chunks/ru-p4';
import ru_p5 from './chunks/ru-p5';
import ru_p6 from './chunks/ru-p6';
import ru_p7 from './chunks/ru-p7';
import ru_p8 from './chunks/ru-p8';
import ru_p9 from './chunks/ru-p9';
import ru_p10 from './chunks/ru-p10';
import ru_p11 from './chunks/ru-p11';
import ru_p12 from './chunks/ru-p12';

export const meta = {
  code: 'ru' as const,
  name: 'Russian',
  nativeName: "Русский",
  flagUrl: 'https://flagcdn.com/w40/ru.png',
  direction: 'ltr' as 'ltr' | 'rtl',
  isActive: false,
};
const dict = { ...ru_main, ...ru_p3, ...ru_p4, ...ru_p5, ...ru_p6, ...ru_p7, ...ru_p8, ...ru_p9, ...ru_p10, ...ru_p11, ...ru_p12 } as const;

export default dict;
