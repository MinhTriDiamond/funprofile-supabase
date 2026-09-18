import { useEffect } from 'react';

const PRODUCTION_DOMAIN = 'https://fun.rich';

interface SEOHeadProps {
  /** Page title (will append " | FUN Profile") */
  title?: string;
  /** Meta description (max 160 chars) */
  description?: string;
  /** Canonical path, e.g. "/alice/post/hello_world" */
  canonicalPath?: string;
  /** OG image URL */
  image?: string;
  /** Content type for twitter card */
  twitterCard?: 'summary' | 'summary_large_image' | 'player';
  /** JSON-LD structured data object */
  jsonLd?: Record<string, any>;
  /** OG type */
  ogType?: string;
}

/**
 * SEOHead — Sets canonical, OG, Twitter, and JSON-LD tags.
 * For SPA: manipulates document.head directly.
 * For crawlers: pair with prerender/SSR for full effect.
 */
export function SEOHead({
  title,
  description,
  canonicalPath,
  image,
  twitterCard = 'summary_large_image',
  jsonLd,
  ogType = 'website',
}: SEOHeadProps) {
  useEffect(() => {
    const fullTitle = title ? `${title} | FUN Profile` : 'FUN.RICH - Connect, Share, Earn';
    const canonicalUrl = canonicalPath ? `${PRODUCTION_DOMAIN}${canonicalPath}` : PRODUCTION_DOMAIN;
    const desc = description || 'FUN Profile - Mạng xã hội Web3 kết hợp AI. Kết nối bạn bè, chia sẻ nội dung, kiếm phần thưởng.';
    const ogImage = image || `${PRODUCTION_DOMAIN}/pwa-512.png`;

    // Title
    document.title = fullTitle;

    // Helper to set/create meta tags
    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    // Canonical
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    // Basic meta
    setMeta('name', 'description', desc);

    // Open Graph
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('property', 'og:image', ogImage);
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:site_name', 'FUN Profile');

    // Image dimensions for large preview
    setMeta('property', 'og:image:width', '1200');
    setMeta('property', 'og:image:height', '630');

    // Twitter Card
    setMeta('name', 'twitter:card', twitterCard);
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', ogImage);

    // JSON-LD
    const jsonLdId = 'seo-jsonld';
    let script = document.getElementById(jsonLdId) as HTMLScriptElement | null;
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script');
        script.id = jsonLdId;
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) {
      script.remove();
    }

    // Cleanup on unmount
    return () => {
      const el = document.getElementById(jsonLdId);
      if (el) el.remove();
    };
  }, [title, description, canonicalPath, image, twitterCard, jsonLd, ogType]);

  return null;
}

// ─── JSON-LD builders ───

export function buildArticleJsonLd(opts: {
  title: string;
  description: string;
  url: string;
  image?: string;
  authorName: string;
  datePublished: string;
  dateModified?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    url: opts.url,
    image: opts.image,
    author: { '@type': 'Person', name: opts.authorName },
    publisher: {
      '@type': 'Organization',
      name: 'FUN Profile',
      logo: { '@type': 'ImageObject', url: 'https://fun.rich/pwa-512.png' },
    },
    datePublished: opts.datePublished,
    dateModified: opts.dateModified || opts.datePublished,
  };
}

export function buildVideoJsonLd(opts: {
  title: string;
  description: string;
  url: string;
  thumbnailUrl?: string;
  uploadDate: string;
  duration?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: opts.title,
    description: opts.description,
    url: opts.url,
    thumbnailUrl: opts.thumbnailUrl,
    uploadDate: opts.uploadDate,
    duration: opts.duration,
    publisher: {
      '@type': 'Organization',
      name: 'FUN Profile',
    },
  };
}

export function buildPersonJsonLd(opts: {
  name: string;
  url: string;
  image?: string;
  description?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: opts.name,
    url: opts.url,
    image: opts.image,
    description: opts.description,
  };
}
