/**
 * i18n registry — auto-loads every locale file in `./locales/*.ts`.
 *
 * Adding a new language = drop a new file `./locales/<code>.ts`. No code changes here.
 * Each locale file must export:
 *   - default: a flat record of translation keys → strings
 *   - `meta`: `{ code, name, nativeName, flagUrl, direction, isActive }`
 */

export interface LocaleMeta {
  code: string;
  name: string;
  nativeName: string;
  flagUrl?: string;
  direction: 'ltr' | 'rtl';
  isActive: boolean;
}

type LocaleModule = {
  default: Record<string, string>;
  meta: LocaleMeta;
};

// Vite eager glob — bundled at build time, no runtime fetch.
const modules = import.meta.glob<LocaleModule>('./locales/*.ts', { eager: true });

const registry = (() => {
  const translations: Record<string, Record<string, string>> = {};
  const metaMap: Record<string, LocaleMeta> = {};

  for (const [path, mod] of Object.entries(modules)) {
    const match = path.match(/\/locales\/([a-z]{2,5})\.ts$/);
    if (!match) continue;
    const code = match[1];
    if (!mod.meta || !mod.default) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] Locale file ${path} is missing meta/default export — skipped`);
      continue;
    }
    translations[code] = mod.default;
    metaMap[code] = { ...mod.meta, code };
  }

  // Ensure EN exists as the canonical fallback.
  if (!translations.en) {
    throw new Error('[i18n] Missing src/i18n/locales/en.ts — required as fallback');
  }

  const all = Object.keys(translations).sort();
  const active = all.filter((c) => metaMap[c].isActive);

  return {
    translations,
    metaMap,
    SUPPORTED_LANGUAGES: all,
    ACTIVE_LANGUAGES: active,
  };
})();

export const translations = registry.translations;
export const LANGUAGE_META = registry.metaMap;
export const SUPPORTED_LANGUAGES: readonly string[] = registry.SUPPORTED_LANGUAGES;
export const ACTIVE_LANGUAGES: readonly string[] = registry.ACTIVE_LANGUAGES;

/** All meta entries sorted by sort_order (fallback to alphabetical). */
export const LANGUAGE_LIST: LocaleMeta[] = Object.values(registry.metaMap).sort((a, b) =>
  a.code.localeCompare(b.code),
);

export type Language = string;

/** TranslationKey is derived from the EN baseline so missing keys in other locales fall back gracefully. */
import enDict from './locales/en';
export type TranslationKey = keyof typeof enDict;
