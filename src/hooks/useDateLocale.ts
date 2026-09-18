import { useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { vi, enUS, zhCN, ja, ko, th, id, fr, es, de, pt, ru, ar } from 'date-fns/locale';
import type { Locale } from 'date-fns';

const localeMap: Record<string, Locale> = {
  vi,
  en: enUS,
  zh: zhCN,
  ja,
  ko,
  th,
  id,
  fr,
  es,
  de,
  pt,
  ru,
  ar,
};

export function useDateLocale(): Locale {
  const { language } = useLanguage();
  return useMemo(() => localeMap[language] || enUS, [language]);
}
