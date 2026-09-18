import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  translations,
  SUPPORTED_LANGUAGES,
  ACTIVE_LANGUAGES as REGISTRY_ACTIVE,
  LANGUAGE_META,
  type Language,
  type TranslationKey,
} from './registry';
import { supabase } from '@/integrations/supabase/client';

/**
 * Re-export ACTIVE_LANGUAGES from the registry. To activate/deactivate a language,
 * flip `meta.isActive` inside `src/i18n/locales/<code>.ts` (or in DB
 * `i18n_languages.is_active` for runtime control surfaced via admin UI).
 */
export const ACTIVE_LANGUAGES: readonly Language[] = REGISTRY_ACTIVE;

export type TParams = Record<string, string | number>;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** Translate a key. Supports `{var}` interpolation via `params`. */
  t: (key: TranslationKey | string, params?: TParams) => string;
  /** Translate a dynamic record like `{ vi: '...', en: '...' }`. */
  tDynamic: (record: Partial<Record<Language, string>> | string | null | undefined, fallback?: string) => string;
  /** True if a key exists for the active language (without falling back to EN). */
  hasKey: (key: string) => boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'fun_profile_language';

const detectBrowserLanguage = (): Language => {
  if (typeof navigator === 'undefined') return 'vi';
  const browserLang = navigator.language.toLowerCase();
  for (const lang of SUPPORTED_LANGUAGES) {
    if (browserLang.startsWith(lang)) return lang;
  }
  return 'vi';
};

const getInitialLanguage = (): Language => {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
      return saved;
    }
  }
  return detectBrowserLanguage();
};

const interpolate = (template: string, params?: TParams): string => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v === undefined || v === null ? `{${k}}` : String(v);
  });
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const userIdRef = useRef<string | null>(null);

  const persistRemote = useCallback(async (lang: Language) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await (supabase as any)
        .from('profiles')
        .update({ preferred_language: lang })
        .eq('id', user.id);
    } catch {
      // Network/auth failure is non-fatal; localStorage still holds the value.
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return;
    setLanguageState(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    document.documentElement.lang = lang;
    void persistRemote(lang);
  }, [persistRemote]);

  // Keep <html lang> + <html dir> in sync (RTL support: ar, he, fa, ur, …)
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = LANGUAGE_META[language]?.direction ?? 'ltr';
  }, [language]);

  // On auth state change: load `preferred_language` from profile and apply (only if user
  // never explicitly chose a different language on this device).
  useEffect(() => {
    let cancelled = false;

    const loadFromProfile = async (userId: string) => {
      try {
        const { data } = await (supabase as any)
          .from('profiles')
          .select('preferred_language')
          .eq('id', userId)
          .maybeSingle();
        if (cancelled) return;
        const remote = (data as { preferred_language?: string } | null)?.preferred_language as Language | undefined;
        if (remote && SUPPORTED_LANGUAGES.includes(remote) && remote !== language) {
          setLanguageState(remote);
          try { localStorage.setItem(STORAGE_KEY, remote); } catch {}
          document.documentElement.lang = remote;
        }
      } catch {
        // ignore
      }
    };

    // onAuthStateChange sẽ tự fire INITIAL_SESSION lần đầu subscribe, kèm session hiện tại.
    // → KHÔNG cần gọi supabase.auth.getUser() riêng (gây tranh chấp lock "lock:sb-…-auth-token"
    //   với signInWithPassword / useCurrentUser khi user vào trang /auth).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      userIdRef.current = uid;
      if (uid) void loadFromProfile(uid);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime sync when profile.preferred_language changes from another device
  useEffect(() => {
    const uid = userIdRef.current;
    if (!uid) return;
    const channel = supabase
      .channel(`lang-sync-${uid}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${uid}`,
      }, (payload) => {
        const next = (payload.new as { preferred_language?: string })?.preferred_language as Language | undefined;
        if (next && SUPPORTED_LANGUAGES.includes(next) && next !== language) {
          setLanguageState(next);
          try { localStorage.setItem(STORAGE_KEY, next); } catch {}
          document.documentElement.lang = next;
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [language]);

  const t = useCallback((key: TranslationKey | string, params?: TParams): string => {
    const langTable = translations[language] as Record<string, string>;
    const enTable = translations.en as Record<string, string>;
    const raw = langTable?.[key as string] ?? enTable?.[key as string] ?? key;
    return interpolate(raw, params);
  }, [language]);

  const tDynamic = useCallback((
    record: Partial<Record<Language, string>> | string | null | undefined,
    fallback?: string,
  ): string => {
    if (!record) return fallback ?? '';
    if (typeof record === 'string') return record;
    return record[language] ?? record.en ?? record.vi ?? fallback ?? '';
  }, [language]);

  const hasKey = useCallback((key: string): boolean => {
    return Object.prototype.hasOwnProperty.call(translations[language], key);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    tDynamic,
    hasKey,
  }), [language, setLanguage, t, tDynamic, hasKey]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

/**
 * Fallback context used only when `useLanguage()` is called outside the
 * Provider tree (e.g. during HMR snapshots or in isolated previews). It keeps
 * the app from crashing while still returning sensible English-first values.
 */
const fallbackLang: Language = 'en';
const fallbackContext: LanguageContextType = {
  language: fallbackLang,
  setLanguage: () => {},
  t: (key, params) => {
    const dict = (translations as any)[fallbackLang] ?? {};
    const raw = dict[key as string] ?? (key as string);
    return interpolate(String(raw), params);
  },
  tDynamic: (record, fallback) => {
    if (!record) return fallback ?? '';
    if (typeof record === 'string') return record;
    return record[fallbackLang] ?? record.en ?? fallback ?? '';
  },
  hasKey: (key) => {
    const dict = (translations as any)[fallbackLang] ?? {};
    return key in dict;
  },
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    if (typeof console !== 'undefined') {
      console.warn('[i18n] useLanguage called outside LanguageProvider — using fallback.');
    }
    return fallbackContext;
  }
  return context;
};

export { translations };
