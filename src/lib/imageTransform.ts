/**
 * Image Transformation Utility
 * 
 * Generates optimized image URLs with on-the-fly transformations
 * Uses Direct Cloudflare Image Resizing (No Proxy) for <50ms latency
 * 
 * Strategy:
 * - R2/External images: Use fun.rich/cdn-cgi/image/ (Direct Cloudflare)
 * - CF Images (imagedelivery.net): Use variant system
 */

// Cloudflare zone domain with Image Resizing enabled
// Use the same-zone R2 custom domain to avoid remote-origin allowlist 403s.
const CF_ZONE_DOMAIN = 'https://media.fun.rich';

// R2 public bucket URL (legacy dev URL)
const R2_PUBLIC_URL = 'https://pub-e83e74b0726742fbb6a60bc08f95624b.r2.dev';

// R2 production custom domain (recommended)
const R2_CUSTOM_DOMAIN = 'https://media.fun.rich';

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  gravity?: 'auto' | 'left' | 'right' | 'top' | 'bottom' | 'center';
  quality?: number;
  format?: 'auto' | 'webp' | 'avif';
  blur?: number;
  brightness?: number;
  contrast?: number;
  sharpen?: number;
  rotate?: 0 | 90 | 180 | 270;
  filter?: 'grayscale' | 'blur-light' | 'blur-heavy' | 'bright' | 'dark' | 'high-contrast' | 'sharp';
  preset?: 'avatar' | 'avatar-sm' | 'avatar-lg' | 'cover' | 'thumbnail' | 'post' | 'post-grid' | 'gallery';
}

// Preset configurations for common use cases
// DPR-aware sizes: base size × devicePixelRatio (capped at 2x for bandwidth)
const getDpr = () => typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

export const IMAGE_PRESETS: Record<string, ImageTransformOptions> = {
  'avatar': { width: 128, height: 128, fit: 'cover', gravity: 'auto', format: 'auto', quality: 85 },
  'avatar-sm': { width: 40, height: 40, fit: 'cover', gravity: 'auto', format: 'auto', quality: 80 },
  'avatar-lg': { width: 256, height: 256, fit: 'cover', gravity: 'auto', format: 'auto', quality: 90 },
  'cover': { width: 1200, height: 400, fit: 'cover', gravity: 'auto', format: 'auto', quality: 85 },
  'thumbnail': { width: 300, height: 300, fit: 'cover', gravity: 'auto', format: 'auto', quality: 75 },
  'post': { width: 800, fit: 'scale-down', format: 'auto', quality: 85 },
  'post-grid': { width: 400, height: 400, fit: 'cover', gravity: 'auto', format: 'auto', quality: 80 },
  'gallery': { width: 1200, fit: 'scale-down', format: 'auto', quality: 90 },
};

// DPR-aware presets for retina displays
export function getDprAwarePreset(preset: keyof typeof IMAGE_PRESETS): ImageTransformOptions {
  const base = IMAGE_PRESETS[preset];
  if (!base) return {};
  
  const dpr = getDpr();
  return {
    ...base,
    width: base.width ? Math.round(base.width * dpr) : undefined,
    height: base.height ? Math.round(base.height * dpr) : undefined,
  };
}

/**
 * Build Cloudflare Image Resizing options string
 * Format: width=200,height=200,fit=cover,format=auto
 */
function buildCfOptions(options: ImageTransformOptions): string {
  const parts: string[] = [];
  
  // Merge preset with custom options
  const presetConfig = options.preset ? IMAGE_PRESETS[options.preset] : {};
  const merged = { ...presetConfig, ...options };
  
  if (merged.width) parts.push(`width=${merged.width}`);
  if (merged.height) parts.push(`height=${merged.height}`);
  if (merged.fit) parts.push(`fit=${merged.fit}`);
  if (merged.gravity) parts.push(`gravity=${merged.gravity}`);
  if (merged.quality) parts.push(`quality=${merged.quality}`);
  if (merged.format) parts.push(`format=${merged.format}`);
  if (merged.blur) parts.push(`blur=${merged.blur}`);
  if (merged.brightness !== undefined) parts.push(`brightness=${merged.brightness}`);
  if (merged.contrast !== undefined) parts.push(`contrast=${merged.contrast}`);
  if (merged.sharpen) parts.push(`sharpen=${merged.sharpen}`);
  if (merged.rotate) parts.push(`rotate=${merged.rotate}`);
  
  // Handle filter presets
  if (merged.filter) {
    switch (merged.filter) {
      case 'grayscale':
        parts.push('saturation=0');
        break;
      case 'blur-light':
        parts.push('blur=5');
        break;
      case 'blur-heavy':
        parts.push('blur=20');
        break;
      case 'bright':
        parts.push('brightness=1.2');
        break;
      case 'dark':
        parts.push('brightness=0.8');
        break;
      case 'high-contrast':
        parts.push('contrast=1.3');
        break;
      case 'sharp':
        parts.push('sharpen=2');
        break;
    }
  }
  
  return parts.join(',');
}

/**
 * Generate a transformed image URL using Direct Cloudflare Image Resizing
 * 
 * NO PROXY - Direct to Cloudflare Edge for <50ms latency
 * 
 * @param originalUrl - The original image URL (must be publicly accessible)
 * @param options - Transformation options
 * @returns Transformed image URL via Cloudflare
 * 
 * @example
 * // Using preset
 * getTransformedImageUrl('https://r2.dev/image.jpg', { preset: 'avatar' })
 * // => https://fun.rich/cdn-cgi/image/width=128,height=128,fit=cover,format=auto/https://r2.dev/image.jpg
 */
export function getTransformedImageUrl(
  originalUrl: string | null | undefined,
  options: ImageTransformOptions = {}
): string {
  if (!originalUrl) return '/placeholder.svg';

  // Skip transformation for placeholder or data URLs
  if (originalUrl.startsWith('data:') || originalUrl === '/placeholder.svg') {
    return originalUrl;
  }

  // Skip local assets
  if (originalUrl.startsWith('/') && !originalUrl.startsWith('//')) {
    return originalUrl;
  }

  // Handle Cloudflare Images URLs (imagedelivery.net)
  // These already have variants, but we can modify the variant
  if (originalUrl.includes('imagedelivery.net')) {
    // Format: https://imagedelivery.net/{account_hash}/{image_id}/{variant}
    // We can change the variant based on preset
    const variantMap: Record<string, string> = {
      avatar: 'avatar',
      'avatar-sm': 'avatar-sm',
      'avatar-lg': 'avatar-lg',
      cover: 'cover',
      thumbnail: 'thumbnail',
      post: 'public',
      'post-grid': 'thumbnail',
      gallery: 'public',
    };

    if (options.preset && variantMap[options.preset]) {
      // Replace the variant in the URL
      const parts = originalUrl.split('/');
      if (parts.length >= 5) {
        parts[parts.length - 1] = variantMap[options.preset];
        return parts.join('/');
      }
    }
    return originalUrl;
  }

  // Build Cloudflare options string
  const cfOptions = buildCfOptions(options);

  // If no options, return original
  if (!cfOptions) return originalUrl;

  // Only transform images we fully control (R2 custom domain / R2 dev / same zone),
  // to avoid Cloudflare remote-origin 403s (e.g. Unsplash template covers).
  const canTransformRemotely = (() => {
    try {
      const u = new URL(originalUrl);
      const host = u.hostname;
      return (
        u.origin === R2_CUSTOM_DOMAIN ||
        u.origin === R2_PUBLIC_URL ||
        host.endsWith('r2.dev')
      );
    } catch {
      return false;
    }
  })();

  if (!canTransformRemotely) {
    return originalUrl;
  }

  // Normalize R2 dev URL -> R2 custom domain (same zone) to avoid 403 from origin allowlist
  let normalizedUrl = originalUrl;
  try {
    const u = new URL(originalUrl);
    if (u.origin === R2_PUBLIC_URL || u.hostname.endsWith('r2.dev')) {
      normalizedUrl = `${R2_CUSTOM_DOMAIN}${u.pathname}`;
    }
  } catch {
    // ignore parse errors
  }

  // Same-origin path mode:
  // https://media.fun.rich/cdn-cgi/image/{options}/posts/...
  if (normalizedUrl.startsWith(R2_CUSTOM_DOMAIN)) {
    const u = new URL(normalizedUrl);
    return `${CF_ZONE_DOMAIN}/cdn-cgi/image/${cfOptions}${u.pathname}`;
  }

  // Fallback (should be rare due to canTransformRemotely guard)
  return originalUrl;
}

/**
 * Quick helper for avatar images
 */
export function getAvatarUrl(url: string | null | undefined, size: 'sm' | 'md' | 'lg' = 'md'): string {
  const presetMap = { sm: 'avatar-sm', md: 'avatar', lg: 'avatar-lg' } as const;
  const presetKey = presetMap[size];
  // Use DPR-aware sizing for crisp avatars on retina displays
  const dprPreset = getDprAwarePreset(presetKey);
  return getTransformedImageUrl(url, dprPreset);
}

/**
 * Quick helper for cover photos
 */
export function getCoverUrl(url: string | null | undefined): string {
  return getTransformedImageUrl(url, { preset: 'cover' });
}

/**
 * Quick helper for post media in grid
 */
export function getPostGridUrl(url: string | null | undefined): string {
  return getTransformedImageUrl(url, { preset: 'post-grid' });
}

/**
 * Quick helper for full post images
 */
export function getPostUrl(url: string | null | undefined): string {
  return getTransformedImageUrl(url, { preset: 'post' });
}

/**
 * Quick helper for gallery/lightbox images
 */
export function getGalleryUrl(url: string | null | undefined): string {
  return getTransformedImageUrl(url, { preset: 'gallery' });
}

/**
 * Generate srcset for responsive images using Direct Cloudflare
 */
export function getResponsiveSrcSet(
  originalUrl: string | null | undefined,
  widths: number[] = [320, 640, 960, 1280, 1920]
): string {
  if (!originalUrl) return '';
  
  return widths
    .map(w => `${getTransformedImageUrl(originalUrl, { width: w, format: 'auto' })} ${w}w`)
    .join(', ');
}

/**
 * Check if URL is transformable (R2 or public URL)
 */
export function isTransformableUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  
  // Skip data URLs and placeholders
  if (url.startsWith('data:') || url === '/placeholder.svg') return false;
  
  // Skip local assets
  if (url.startsWith('/') && !url.startsWith('//')) return false;
  
  // Allow R2 URLs and any public HTTPS URL
  return url.startsWith('https://');
}

/**
 * Get raw R2 URL without transformation (for downloads, etc.)
 */
export function getRawUrl(url: string | null | undefined): string {
  if (!url) return '/placeholder.svg';
  return url;
}
