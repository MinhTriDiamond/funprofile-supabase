/**
 * Generate a URL-friendly slug from Vietnamese text.
 * Uses Unicode NFD normalization for robust diacritics removal.
 * Follows the FUN.RICH URL design specification.
 */

/**
 * Remove Vietnamese accents using Unicode NFD normalization.
 * Handles all Vietnamese diacritics + đ/Đ.
 */
export function removeVietnameseAccents(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Slugify a title for URL usage.
 * @param title - Original title (may contain Vietnamese)
 * @param maxLen - Maximum slug length (default 60)
 * @param fallback - Fallback if title is empty
 */
export function generateSlug(title: string, maxLen = 60, fallback = 'post'): string {
  if (!title || !title.trim()) return fallback;

  const noAccent = removeVietnameseAccents(title);
  let s = noAccent
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')  // keep alnum + space + _ + -
    .replace(/[\s-]+/g, '_')         // space/hyphen -> _
    .replace(/_+/g, '_')             // collapse __
    .replace(/^_+|_+$/g, '');        // trim _

  if (!s) s = fallback;

  if (s.length > maxLen) {
    s = s.slice(0, maxLen);
    s = s.replace(/_+$/g, '');
  }

  return s || `${fallback}_auto`;
}

// ─── Content URL builders ───

interface ContentWithSlug {
  id: string;
  slug?: string | null;
  profiles?: { username?: string } | null;
}

interface PostUrlInput extends ContentWithSlug {
  /** Short, stable public id, e.g. "post_16". Preferred canonical segment. */
  public_id?: string | null;
  /** Short share code, e.g. "1HN6sBkzDD". Preferred share URL segment. */
  share_code?: string | null;
}

/**
 * Canonical post URL.
 * Priority:
 *   1. /:username/posts/:public_id   (new canonical, stable, content-independent)
 *   2. /:username/post/:slug          (legacy slug-based — kept for old data missing public_id)
 *   3. /post/:id                      (UUID fallback)
 */
export function getPostUrl(post: PostUrlInput): string {
  const username = post.profiles?.username;
  if (username && post.public_id) return `/${username}/posts/${post.public_id}`;
  if (username && post.slug) return `/${username}/post/${post.slug}`;
  return `/post/${post.id}`;
}

/**
 * Short share URL — independent of username so it survives username changes.
 * Falls back to canonical URL if share_code missing.
 */
export function getPostShareUrl(post: PostUrlInput): string {
  if (post.share_code) return `/p/${post.share_code}`;
  return getPostUrl(post);
}

/** Build video/reel URL: /{username}/video/{slug} or /reels/{id} */
export function getVideoUrl(reel: ContentWithSlug): string {
  const username = reel.profiles?.username;
  if (username && reel.slug) return `/${username}/video/${reel.slug}`;
  return `/reels/${reel.id}`;
}

/** Build live URL: /{username}/live/{slug} or /live/{id} */
export function getLiveUrl(session: ContentWithSlug): string {
  const username = session.profiles?.username;
  if (username && session.slug) return `/${username}/live/${session.slug}`;
  return `/live/${session.id}`;
}

// ─── Absolute URLs (for sharing) ───

const PRODUCTION_DOMAIN = 'https://fun.rich';

/** Absolute canonical URL — use for SEO canonical + og:url. */
export function getAbsolutePostUrl(post: PostUrlInput): string {
  return `${PRODUCTION_DOMAIN}${getPostUrl(post)}`;
}

/** Absolute short share URL — use for Copy Link / Share buttons. */
export function getAbsolutePostShareUrl(post: PostUrlInput): string {
  return `${PRODUCTION_DOMAIN}${getPostShareUrl(post)}`;
}

export function getAbsoluteVideoUrl(reel: ContentWithSlug): string {
  return `${PRODUCTION_DOMAIN}${getVideoUrl(reel)}`;
}

export function getAbsoluteLiveUrl(session: ContentWithSlug): string {
  return `${PRODUCTION_DOMAIN}${getLiveUrl(session)}`;
}
