/**
 * Backwards-compat shim. The real source is now `./registry.ts` which
 * auto-loads every `./locales/<code>.ts` file.
 *
 * Existing code that does `import { translations, SUPPORTED_LANGUAGES, Language, TranslationKey } from '@/i18n/translations'`
 * keeps working — but new code should import from `@/i18n/registry`.
 */
export {
  translations,
  SUPPORTED_LANGUAGES,
  ACTIVE_LANGUAGES,
  LANGUAGE_META,
  LANGUAGE_LIST,
} from './registry';

export type { Language, TranslationKey, LocaleMeta } from './registry';
