import { useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';

interface SEOProps {
  /** Translation key for <title>. Receives same params for interpolation. */
  titleKey?: TranslationKey | string;
  /** Raw title (overrides titleKey). */
  title?: string;
  /** Translation key for meta description. */
  descriptionKey?: TranslationKey | string;
  /** Raw description. */
  description?: string;
  /** Optional canonical URL. */
  canonical?: string;
}

/**
 * Lightweight SEO helper: updates document.title and <meta name="description">
 * reactively when language changes. No external dependency.
 */
export function SEO({ titleKey, title, descriptionKey, description, canonical }: SEOProps) {
  const { t, language } = useLanguage();

  useEffect(() => {
    const finalTitle = title ?? (titleKey ? t(titleKey) : undefined);
    if (finalTitle) document.title = finalTitle;

    const finalDescription = description ?? (descriptionKey ? t(descriptionKey) : undefined);
    if (finalDescription) {
      let tag = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.name = 'description';
        document.head.appendChild(tag);
      }
      tag.content = finalDescription;
    }

    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = canonical;
    }
  }, [t, language, title, titleKey, description, descriptionKey, canonical]);

  return null;
}

export default SEO;
