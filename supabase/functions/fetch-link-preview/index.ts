import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { isSafePublicUrl } from '../_shared/urlGuard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&copy;': '©', '&reg;': '®', '&trade;': '™',
};

function decodeHtmlEntities(text: string | null): string | null {
  if (!text) return text;
  let result = text;
  // Named entities
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    result = result.replaceAll(entity, char);
  }
  // Hex numeric entities: &#xc0; &#x1af;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  // Decimal numeric entities: &#192;
  result = result.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  return result;
}

const UNAVATAR_MAP: Record<string, string> = {
  youtube: 'youtube',
  twitter: 'twitter',
  tiktok: 'tiktok',
  telegram: 'telegram',
  instagram: 'instagram',
  github: 'github',
  linkedin: 'linkedin',
};

function extractUsername(url: string, platform: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const pathname = u.pathname.replace(/\/$/, '');
    switch (platform) {
      case 'facebook': {
        const id = u.searchParams.get('id');
        if (id) return id;
        const seg = pathname.split('/').filter(Boolean)[0];
        if (!seg || ['pages', 'groups', 'events', 'photo'].includes(seg)) return null;
        return seg;
      }
      case 'youtube': {
        const parts = pathname.split('/').filter(Boolean);
        if (parts[0]?.startsWith('@')) return parts[0].slice(1);
        if (parts[0] === 'c' || parts[0] === 'user') return parts[1] || null;
        if (parts[0] === 'channel') return parts[1] || null;
        return parts[0] || null;
      }
      case 'twitter': {
        const seg = pathname.split('/').filter(Boolean)[0];
        if (!seg || ['i', 'home', 'explore', 'notifications'].includes(seg)) return null;
        return seg;
      }
      case 'tiktok': {
        const seg = pathname.split('/').filter(Boolean)[0];
        return seg?.startsWith('@') ? seg.slice(1) : seg || null;
      }
      case 'telegram': {
        const seg = pathname.split('/').filter(Boolean)[0];
        return seg || null;
      }
      case 'instagram': {
        const seg = pathname.split('/').filter(Boolean)[0];
        if (!seg || ['explore', 'accounts', 'direct'].includes(seg)) return null;
        return seg;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Resolve Facebook share short-links to their real destination */
async function resolveFacebookRedirect(url: string): Promise<string> {
  if (!/\/share\/[vpr]\//i.test(url)) return url;
  // Try multiple UAs to resolve redirect - some share types only redirect for specific crawlers
  const resolveUAs = [
    'facebookexternalhit/1.1',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  ];
  for (const ua of resolveUAs) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ua },
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
      const location = res.headers.get('location');
      if (location && location.startsWith('http') && !location.includes('/login')
          && !/m\.facebook\.com\/share\//i.test(location)) {
        console.log(`Resolved FB share redirect with UA ${ua.split('/')[0]}: ${url} → ${location}`);
        return location;
      }
      // Consume body
      try { await res.text(); } catch {}
    } catch (e) { console.log('FB redirect resolve error:', e); }
  }
  return url;
}

const CRAWL_USER_AGENTS = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Googlebot/2.1 (+http://www.google.com/bot.html)',
  'Twitterbot/1.0',
];

/** Fetch HTML with a specific User-Agent */
async function fetchHtml(url: string, ua: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Scrape HTML and extract OG/meta tags */
async function scrapePageMeta(url: string): Promise<{
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
  siteName: string | null;
  favicon: string | null;
}> {
  const result = { title: null as string | null, description: null as string | null, image: null as string | null, video: null as string | null, siteName: null as string | null, favicon: null as string | null, author: null as string | null };
  const isFacebook = /facebook\.com|fb\.watch|fb\.com/i.test(url);

  // Resolve Facebook share short-links first
  const resolvedUrl = isFacebook ? await resolveFacebookRedirect(url) : url;

  try {
    // For Facebook, try multiple UAs; for others, just one
    const uasToTry = isFacebook ? CRAWL_USER_AGENTS : [CRAWL_USER_AGENTS[0]];
    
    // For Facebook, also try m.facebook.com variant if www fails
    // Always include original URL (normalizedUrl) so we retry it with crawl UAs
    const urlsToTry = isFacebook 
      ? [resolvedUrl, url, resolvedUrl.replace('www.facebook.com', 'm.facebook.com')]
        .filter((v, i, a) => a.indexOf(v) === i) // dedupe
      : [resolvedUrl];

    let html: string | null = null;
    let rawHtml: string | null = null; // Keep the last non-null HTML even without OG

    for (const tryUrl of urlsToTry) {
      for (const ua of uasToTry) {
        const fetched = await fetchHtml(tryUrl, ua);
        if (!fetched) continue;
        if (!rawHtml) rawHtml = fetched; // save first successful response

        // Quick check: did we get useful OG data?
        const hasOg = /property=["']og:title["']|property=["']og:image["']/i.test(fetched);
        const isLoginWall = /log in or sign up|đăng nhập hoặc đăng ký/i.test(fetched);
        if (hasOg && !isLoginWall) {
          console.log(`Got OG data with UA: ${ua.split('/')[0]} on ${tryUrl}`);
          html = fetched;
          break;
        }
        console.log(`UA ${ua.split('/')[0]} on ${tryUrl} returned no useful OG data`);
        rawHtml = fetched; // keep updating with latest
      }
      if (html) break;
    }

    // If no OG data found, try extracting from Facebook inline JSON in rawHtml
    if (!html && rawHtml && isFacebook) {
      console.log('No OG data found, trying Facebook inline JSON extraction...');
      html = rawHtml; // use raw HTML for inline extraction below
      
      // Try to extract from Facebook's inline data
      const titlePatterns = [
        /"title"\s*:\s*"([^"]{5,200})"/,
        /"story_text"\s*:\s*"([^"]{5,200})"/,
        /"message"\s*:\s*"([^"]{5,200})"/,
      ];
      const imagePatterns = [
        /"playable_url(?:_quality_hd)?"\s*:\s*"([^"]+)"/,
        /"thumbnail_url"\s*:\s*"([^"]+)"/,
        /"preview_image_url"\s*:\s*"([^"]+)"/,
        /"image"\s*:\s*\{[^}]*"uri"\s*:\s*"([^"]+)"/,
      ];
      const authorPatterns = [
        /"ownerName"\s*:\s*"([^"]+)"/,
        /"actorName"\s*:\s*"([^"]+)"/,
      ];
      
      for (const p of authorPatterns) {
        const m = rawHtml.match(p);
        if (m?.[1] && m[1].length > 1 && m[1].length < 80) {
          result.author = m[1];
          break;
        }
      }
      for (const p of titlePatterns) {
        const m = rawHtml.match(p);
        if (m?.[1]) { result.title = m[1]; break; }
      }
      for (const p of imagePatterns) {
        const m = rawHtml.match(p);
        if (m?.[1]) {
          const decoded = m[1].replace(/\\u0025/g, '%').replace(/\\\//g, '/');
          if (decoded.includes('playable_url') || decoded.includes('.mp4')) {
            result.video = decoded;
          } else {
            result.image = decoded;
          }
          break;
        }
      }
      
      // Extract favicon
      try {
        const u = new URL(url);
        result.favicon = `${u.origin}/favicon.ico`;
      } catch {}
      result.siteName = 'Facebook';
      
      console.log(`FB inline extraction: title=${result.title}, author=${result.author}, hasImage=${!!result.image}, hasVideo=${!!result.video}`);
      // Always return for Facebook - at minimum we have siteName + favicon for a fallback card
      return result;
    }

    if (!html) return result;

    const extract = (property: string): string | null => {
      // property="..." content="..."
      const m1 = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'));
      if (m1?.[1]) return m1[1].trim();
      // content="..." property="..."
      const m2 = html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'));
      if (m2?.[1]) return m2[1].trim();
      return null;
    };

    const extractName = (name: string): string | null => {
      const m1 = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'));
      if (m1?.[1]) return m1[1].trim();
      const m2 = html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i'));
      if (m2?.[1]) return m2[1].trim();
      return null;
    };

    result.title = decodeHtmlEntities(extract('og:title') || extractName('twitter:title') || (() => {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return t?.[1]?.trim() || null;
    })());

    result.description = decodeHtmlEntities(extract('og:description') || extractName('twitter:description') || extractName('description'));
    result.image = extract('og:image') || extractName('twitter:image');
    result.video = extract('og:video') || extract('og:video:url');
    result.siteName = extract('og:site_name');
    result.author = decodeHtmlEntities(extract('article:author') || extractName('author'));

    // Fallback 1: JSON-LD author
    if (!result.author) {
      const ldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      if (ldBlocks) {
        for (const block of ldBlocks) {
          const jsonStr = block.replace(/<\/?script[^>]*>/gi, '');
          try {
            const ld = JSON.parse(jsonStr);
            const authorObj = ld.author || ld.creator;
            if (authorObj) {
              result.author = typeof authorObj === 'string' ? authorObj : authorObj.name || null;
              if (result.author) break;
            }
          } catch { /* ignore */ }
        }
      }
    }

    // Fallback 2: Facebook inline ownerName / actorName
    if (!result.author) {
      const ownerMatch = html.match(/"ownerName"\s*:\s*"([^"]+)"/);
      if (ownerMatch?.[1]) result.author = ownerMatch[1];
    }
    if (!result.author) {
      const actorMatch = html.match(/"actorName"\s*:\s*"([^"]+)"/);
      if (actorMatch?.[1]) result.author = actorMatch[1];
    }

    // Fallback 3: profile:first_name + profile:last_name
    if (!result.author) {
      const firstName = extract('profile:first_name');
      const lastName = extract('profile:last_name');
      if (firstName) result.author = [firstName, lastName].filter(Boolean).join(' ');
    }

    // Fallback 4: Facebook-specific patterns (mobile HTML)
    if (!result.author && isFacebook) {
      const fbPatterns = [
        /"user_name"\s*:\s*"([^"]+)"/,
        /"profileName"\s*:\s*"([^"]+)"/,
        /"short_name"\s*:\s*"([^"]+)"/,
        /"ownerName"\s*:\s*"([^"]+)"/,
        /"actorName"\s*:\s*"([^"]+)"/,
      ];
      for (const pattern of fbPatterns) {
        const m = html.match(pattern);
        if (m?.[1] && m[1].length > 1 && m[1].length < 100) {
          result.author = m[1];
          break;
        }
      }
    }

    // Clean up Facebook engagement prefix from title (handle multiple Unicode middle dot variants)
    if (result.title) {
      result.title = result.title.replace(/^\d+\s+(?:reactions?|cảm xúc)\s*[·•⋅\u00B7\u2027\u2022\u22C5]\s*\d+\s+(?:comments?|bình luận)\s*\|\s*/i, '');
    }

    // Remove author suffix from title: "Some title | Fath Uni" → "Some title"
    if (isFacebook && result.author && result.title) {
      const escapedAuthor = result.author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const suffixPattern = new RegExp(`\\s*\\|\\s*${escapedAuthor}\\s*$`, 'i');
      result.title = result.title.replace(suffixPattern, '').trim();
    }

    // Facebook: og:title is often the author name, not the post title
    if (isFacebook && result.title && result.author) {
      const t = result.title.toLowerCase().trim();
      const a = result.author.toLowerCase().trim();
      if (t === a) {
        // Title IS the author name → use description as title
        if (result.description) {
          const firstLine = result.description.split('\n')[0].trim();
          result.title = firstLine.length > 10 ? firstLine : null;
        } else {
          result.title = null;
        }
      } else if (t.includes(a)) {
        // Title contains author name
        if (result.title!.length < 60) {
          // Short title = page name (e.g. "Fath Uni") → use as author, clear title
          result.author = result.title!;
          if (result.description) {
            const firstLine = result.description.split('\n')[0].trim();
            result.title = firstLine.length > 10 ? firstLine : null;
          } else {
            result.title = null;
          }
        } else {
          // Long title = real content → strip author suffix
          const escapedA = result.author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          result.title = result.title.replace(new RegExp(`\\s*\\|?\\s*${escapedA}`, 'gi'), '').trim();
          result.title = result.title.replace(/\s+(?:[A-ZÀ-Ỹa-zà-ỹ]+\s+){2,}[A-ZÀ-Ỹa-zà-ỹ]+\s*$/u, '').trim();
          if (!result.title) result.title = null;
        }
      } else if (a.includes(t)) {
        // Author contains title → author is more complete, use description as title
        result.author = result.author;
        if (result.description) {
          const firstLine = result.description.split('\n')[0].trim();
          result.title = firstLine.length > 10 ? firstLine : null;
        } else {
          result.title = null;
        }
      }
    }

    // Deduplicate title ≈ description
    if (result.title && result.description) {
      const normT = result.title.substring(0, 80).toLowerCase().trim();
      const normD = result.description.substring(0, 80).toLowerCase().trim();
      if (normT === normD || normD.startsWith(normT) || normT.startsWith(normD)) {
        result.title = null;
      }
    }

    // Favicon
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
      || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    if (faviconMatch?.[1]) {
      const fav = faviconMatch[1].trim();
      if (fav.startsWith('http')) {
        result.favicon = fav;
      } else {
        const u = new URL(url);
        result.favicon = `${u.origin}${fav.startsWith('/') ? '' : '/'}${fav}`;
      }
    } else {
      try {
        const u = new URL(url);
        result.favicon = `${u.origin}/favicon.ico`;
      } catch { /* ignore */ }
    }

    // Filter out known bad images
    if (result.image) {
      const BAD = ['stc-zlogin.zdn.vn', 'static.xx.fbcdn.net/rsrc.php', '/og-image', 'default_', '/placeholder', 'favicon', 'funplay-og-image'];
      if (BAD.some(p => result.image!.includes(p))) result.image = null;
    }

    // Filter out Facebook login wall responses
    const BAD_TITLES = ['log in or sign up', 'đăng nhập hoặc đăng ký', 'facebook – log in or sign up'];
    if (result.title && BAD_TITLES.some(t => result.title!.toLowerCase().includes(t))) {
      result.title = null;
      result.description = null;
      result.image = null;
    }

    return result;
  } catch (e) {
    console.log('scrapePageMeta error:', e);
    return result;
  }
}

/** Legacy: scrape only og:image */
async function scrapeOgImage(url: string): Promise<string | null> {
  const meta = await scrapePageMeta(url);
  return meta.image;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Proxy endpoint (GET)
    const reqUrl = new URL(req.url);
    const proxyTarget = reqUrl.searchParams.get('proxy');
    if (proxyTarget && req.method === 'GET') {
      const targetUrl = decodeURIComponent(proxyTarget);
      // Chống SSRF: chỉ cho phép http/https tới host công khai
      if (!isSafePublicUrl(targetUrl)) {
        return new Response(JSON.stringify({ error: 'Invalid or disallowed URL' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`Proxying image: ${targetUrl}`);

      let host = '';
      try { host = new URL(targetUrl).hostname; } catch { /* ignore */ }
      const isFbDomain = host.includes('fbcdn.net') || host.includes('fbsbx.com') || host.includes('facebook.com') || host.includes('fb.com');

      const ua = isFbDomain
        ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
        : 'Mozilla/5.0 (compatible; FunProfile/1.0)';

      // Facebook graph URLs need redirect follow to get the actual image
      const isFbGraph = host.includes('graph.facebook.com');
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': ua },
        redirect: (isFbDomain && !isFbGraph) ? 'manual' : 'follow',
        signal: AbortSignal.timeout(8000),
      });

      // For Facebook CDN (not graph): if redirected (3xx) or got HTML instead of image, return 404
      if (isFbDomain && !isFbGraph && (res.status >= 300 && res.status < 400)) {
        console.log(`Facebook redirect detected for: ${targetUrl}`);
        return new Response(null, { status: 404, headers: corsHeaders });
      }

      if (!res.ok) return new Response(null, { status: res.status, headers: corsHeaders });

      const contentType = res.headers.get('content-type') || 'image/jpeg';
      // If we got HTML back instead of an image, it's a login wall
      if (contentType.includes('text/html')) {
        console.log(`Got HTML instead of image for: ${targetUrl}`);
        return new Response(null, { status: 404, headers: corsHeaders });
      }

      const blob = await res.arrayBuffer();
      return new Response(blob, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' },
      });
    }

    const body = await req.json();
    const { url, platform, mode } = body;

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

    // Chống SSRF: từ chối URL trỏ vào mạng nội bộ / metadata / scheme lạ
    if (!isSafePublicUrl(normalizedUrl)) {
      return new Response(JSON.stringify({ error: 'Invalid or disallowed URL' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== MODE: PREVIEW (full OG metadata) =====
    if (mode === 'preview') {
      console.log(`Preview mode for: ${normalizedUrl}`);

      // Check DB cache first (TTL 7 days)
      const CACHE_TTL_DAYS = 7;
      let cachedResult = null;
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const sb = createClient(
          Deno.env.get('SUPABASE_URL')!,
          (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
        );
        const { data: cached } = await sb
          .from('link_preview_cache')
          .select('data, fetched_at')
          .eq('url', normalizedUrl)
          .single();

        if (cached?.data) {
          const age = Date.now() - new Date(cached.fetched_at).getTime();
          if (age < CACHE_TTL_DAYS * 86400_000) {
            console.log(`DB cache hit for: ${normalizedUrl} (age: ${Math.round(age / 3600_000)}h)`);
            cachedResult = cached.data;
          }
        }

        if (cachedResult) {
          return new Response(JSON.stringify({ ...cachedResult, url: normalizedUrl }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Cache miss — scrape and store
        const meta = await scrapePageMeta(normalizedUrl);
        const result = {
          title: decodeHtmlEntities(meta.title),
          description: decodeHtmlEntities(meta.description),
          image: decodeHtmlEntities(meta.image),
          video: decodeHtmlEntities(meta.video),
          siteName: decodeHtmlEntities(meta.siteName),
          favicon: decodeHtmlEntities(meta.favicon),
          author: decodeHtmlEntities(meta.author),
        };

        // Only cache if we got something useful
        if (result.title || result.image || result.author || result.siteName) {
          const { error: upsertErr } = await sb
            .from('link_preview_cache')
            .upsert(
              { url: normalizedUrl, data: result, fetched_at: new Date().toISOString() },
              { onConflict: 'url' }
            );
          if (upsertErr) console.error('Cache upsert error:', upsertErr);
          else console.log(`Cached preview for: ${normalizedUrl}`);
        }

        return new Response(JSON.stringify({ ...result, url: normalizedUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (cacheErr) {
        console.error('DB cache error, falling back to direct scrape:', cacheErr);
        // Fallback: scrape without caching
        const meta = await scrapePageMeta(normalizedUrl);
        return new Response(JSON.stringify({
          title: decodeHtmlEntities(meta.title),
          description: decodeHtmlEntities(meta.description),
          image: decodeHtmlEntities(meta.image),
          video: decodeHtmlEntities(meta.video),
          siteName: decodeHtmlEntities(meta.siteName),
          favicon: decodeHtmlEntities(meta.favicon),
          author: decodeHtmlEntities(meta.author),
          url: normalizedUrl,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ===== MODE: AVATAR (legacy, default) =====
    let avatarUrl: string | null = null;

    // Internal Fun ecosystem domains — look up avatar from profiles table
    // ONLY exact hostnames: fun.rich, funprofile.lovable.app
    // Subdomains like play.fun.rich, farm.fun.rich are NOT internal
    const INTERNAL_HOSTNAMES = ['fun.rich', 'funprofile.lovable.app'];
    let isInternalLink = false;
    try {
      const parsedHost = new URL(normalizedUrl).hostname;
      isInternalLink = INTERNAL_HOSTNAMES.includes(parsedHost);
    } catch { isInternalLink = false; }

    if (isInternalLink) {
      // Extract username or user ID from URL path
      // Patterns: /username, /user/{uuid}, /{uuid}
      try {
        const u = new URL(normalizedUrl);
        const pathParts = u.pathname.split('/').filter(Boolean);
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
        const sb = createClient(supabaseUrl, supabaseKey);
        
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        // Try /user/{uuid} pattern first
        if (pathParts[0] === 'user' && pathParts[1] && UUID_RE.test(pathParts[1])) {
          const { data: profile } = await sb.from('profiles').select('avatar_url').eq('id', pathParts[1]).single();
          if (profile?.avatar_url) {
            avatarUrl = profile.avatar_url;
            console.log(`Internal link avatar by UUID: ${avatarUrl}`);
          }
        }
        // Try /{uuid} pattern
        else if (pathParts[0] && UUID_RE.test(pathParts[0])) {
          const { data: profile } = await sb.from('profiles').select('avatar_url').eq('id', pathParts[0]).single();
          if (profile?.avatar_url) {
            avatarUrl = profile.avatar_url;
            console.log(`Internal link avatar by UUID path: ${avatarUrl}`);
          }
        }
        // Try /username pattern
        else if (pathParts[0]) {
          const { data: profile } = await sb.from('profiles').select('avatar_url').eq('username', pathParts[0]).single();
          if (profile?.avatar_url) {
            avatarUrl = profile.avatar_url;
            console.log(`Internal link avatar for ${pathParts[0]}: ${avatarUrl}`);
          }
        }
      } catch (e) { console.log('Internal link avatar lookup error:', e); }
      // Fallback to OG image scraping
      if (!avatarUrl) {
        avatarUrl = await scrapeOgImage(normalizedUrl);
      }
    } else if (platform === 'zalo') {
      // Handled below in the main else-if chain — but keep backward compat
      console.log(`Zalo link (legacy path): ${normalizedUrl}`);
      try {
        const zaloHtml = await fetchHtml(normalizedUrl, 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
        if (zaloHtml) {
          const ogMatch = zaloHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
            || zaloHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
          if (ogMatch?.[1]) {
            avatarUrl = ogMatch[1].trim();
            console.log(`Zalo OG image found: ${avatarUrl}`);
          }
        }
      } catch (e) { console.log('Zalo scrape error:', e); }
    } else if (platform === 'facebook') {
      const username = extractUsername(normalizedUrl, 'facebook');
      console.log(`Facebook username: ${username}`);
      if (username) {
        try {
          const metaRes = await fetch(
            `https://graph.facebook.com/${encodeURIComponent(username)}/picture?type=large&redirect=false`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (metaRes.ok) {
            const meta = await metaRes.json();
            if (meta?.data?.url && !meta?.data?.is_silhouette) {
              avatarUrl = meta.data.url;
            }
          }
        } catch (e) { console.log('Facebook graph API error:', e); }

        if (!avatarUrl) {
          avatarUrl = await scrapeOgImage(normalizedUrl);
        }
        if (!avatarUrl) {
          avatarUrl = `https://graph.facebook.com/${encodeURIComponent(username)}/picture?type=large&redirect=true`;
        }
      }
    } else if (platform && UNAVATAR_MAP[platform]) {
      const username = extractUsername(normalizedUrl, platform);
      if (username) {
        const unavatarUrl = `https://unavatar.io/${UNAVATAR_MAP[platform]}/${encodeURIComponent(username)}`;
        // Validate that unavatar actually has a real image
        try {
          const headRes = await fetch(unavatarUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
            redirect: 'follow',
          });
          const ct = headRes.headers.get('content-type') || '';
          const cl = parseInt(headRes.headers.get('content-length') || '0', 10);
          // unavatar returns a tiny default image (~<1KB) or redirects to a fallback when no avatar found
          if (headRes.ok && ct.startsWith('image/') && cl > 1000) {
            avatarUrl = unavatarUrl;
            console.log(`Unavatar valid for ${platform}/${username}: ${cl} bytes`);
          } else {
            console.log(`Unavatar invalid for ${platform}/${username}: status=${headRes.status}, ct=${ct}, cl=${cl}`);
          }
        } catch (e) {
          console.log(`Unavatar HEAD failed for ${platform}/${username}:`, e);
        }
        // Fallback: scrape OG image from the actual profile page
        if (!avatarUrl) {
          console.log(`Falling back to OG scrape for ${platform}: ${normalizedUrl}`);
          avatarUrl = await scrapeOgImage(normalizedUrl);
        }
      }
    } else if (platform === 'zalo') {
      // Zalo: try scraping with mobile UA for better OG data
      console.log(`Zalo link: ${normalizedUrl}`);
      try {
        const zaloHtml = await fetchHtml(normalizedUrl, 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
        if (zaloHtml) {
          const ogMatch = zaloHtml.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
            || zaloHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
          if (ogMatch?.[1]) {
            avatarUrl = ogMatch[1].trim();
            console.log(`Zalo OG image found: ${avatarUrl}`);
          }
        }
      } catch (e) { console.log('Zalo scrape error:', e); }
    } else {
      avatarUrl = await scrapeOgImage(normalizedUrl);
    }

    // Decode HTML entities in avatar URL before returning
    if (avatarUrl) {
      avatarUrl = decodeHtmlEntities(avatarUrl);
    }

    return new Response(JSON.stringify({ avatarUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('fetch-link-preview error:', error);
    return new Response(JSON.stringify({ avatarUrl: null, error: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
