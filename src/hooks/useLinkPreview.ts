import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LinkPreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
  siteName: string | null;
  favicon: string | null;
  author: string | null;
  url: string;
}

const cache = new Map<string, LinkPreviewData>();
const pending = new Map<string, Promise<LinkPreviewData | null>>();

const INTERNAL_DOMAINS = ['funprofile.lovable.app', 'fun.rich', 'localhost'];

const PROXY_DOMAINS = ['fbcdn.net', 'fbsbx.com', 'facebook.com', 'fb.com', 'cdninstagram.com'];

function getProxiedImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  try {
    const host = new URL(imageUrl).hostname;
    if (PROXY_DOMAINS.some(d => host.includes(d))) {
      const base = import.meta.env.VITE_SUPABASE_URL;
      return `${base}/functions/v1/fetch-link-preview?proxy=${encodeURIComponent(imageUrl)}`;
    }
  } catch { /* ignore */ }
  return imageUrl;
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/(https?:\/\/[^\s<>"']+)/);
  if (!match) return null;
  const url = match[1];
  try {
    const host = new URL(url).hostname;
    if (INTERNAL_DOMAINS.some(d => host.includes(d))) return null;
  } catch { return null; }
  return url;
}

async function fetchPreview(url: string): Promise<LinkPreviewData | null> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-link-preview', {
      body: { url, mode: 'preview' },
    });
    if (error || !data) return null;
    const result: LinkPreviewData = {
      title: data.title || null,
      description: data.description || null,
      image: getProxiedImageUrl(data.image || null),
      video: data.video || null,
      siteName: data.siteName || null,
      favicon: data.favicon || null,
      author: data.author || null,
      url: data.url || url,
    };
    // Cache if we got something useful
    if (result.title || result.image || result.author || result.siteName) {
      cache.set(url, result);
    }
    return result;
  } catch {
    return null;
  }
}

export function useLinkPreview(url: string | null) {
  const [data, setData] = useState<LinkPreviewData | null>(url ? cache.get(url) ?? null : null);
  const [isLoading, setIsLoading] = useState(!!(url && !cache.has(url)));

  useEffect(() => {
    if (!url) { setData(null); setIsLoading(false); return; }

    const cached = cache.get(url);
    if (cached) { setData(cached); setIsLoading(false); return; }

    setIsLoading(true);

    let active = true;
    // Deduplicate concurrent requests for same URL
    let p = pending.get(url);
    if (!p) {
      p = fetchPreview(url);
      pending.set(url, p);
      p.finally(() => pending.delete(url));
    }

    p.then(result => {
      if (active) { setData(result); setIsLoading(false); }
    });

    return () => { active = false; };
  }, [url]);

  return { data, isLoading };
}
