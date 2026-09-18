import { memo, useState, useRef, useEffect, ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { 
  getTransformedImageUrl, 
  getResponsiveSrcSet,
  ImageTransformOptions 
} from '@/lib/imageTransform';

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined;
  alt: string;
  transformOptions?: ImageTransformOptions;
  fallback?: string;
  placeholderColor?: string;
  priority?: boolean;
  responsive?: boolean;
  responsiveWidths?: number[];
  onLoadError?: () => void;
  hideOnError?: boolean;
}

/**
 * Optimized Image Component with Cloudflare Images transformation
 * 
 * Features:
 * - Automatic format conversion (WebP/AVIF)
 * - On-the-fly resize and crop
 * - Lazy loading with intersection observer
 * - Blur-up placeholder
 * - Responsive srcset support
 * - Error handling with fallback
 * 
 * @example
 * // Basic usage with preset
 * <OptimizedImage 
 *   src={user.avatar_url} 
 *   alt="Avatar" 
 *   transformOptions={{ preset: 'avatar' }} 
 * />
 * 
 * // Custom transformation
 * <OptimizedImage 
 *   src={post.image_url} 
 *   alt="Post image" 
 *   transformOptions={{ width: 600, format: 'webp', filter: 'bright' }} 
 * />
 * 
 * // Responsive with srcset
 * <OptimizedImage 
 *   src={heroImage} 
 *   alt="Hero" 
 *   responsive 
 *   responsiveWidths={[640, 1280, 1920]} 
 * />
 */
export const OptimizedImage = memo(({
  src,
  alt,
  className,
  transformOptions,
  fallback = '/placeholder.svg',
  placeholderColor = 'bg-muted',
  priority = false,
  responsive = false,
  responsiveWidths = [320, 640, 960, 1280],
  onLoadError,
  hideOnError = false,
  ...props
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate optimized URL
  const optimizedSrc = src ? getTransformedImageUrl(src, transformOptions) : fallback;
  
  // Generate srcset for responsive images
  const srcSet = responsive && src ? getResponsiveSrcSet(src, responsiveWidths) : undefined;

  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0.01 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
    onLoadError?.();
  };

  // Hide completely if error and hideOnError
  if (hasError && hideOnError) {
    return null;
  }

  const imageSrc = hasError ? fallback : optimizedSrc;

  return (
    <div 
      ref={containerRef}
      className={cn('relative overflow-hidden', className)}
    >
      {/* Placeholder skeleton */}
      {!isLoaded && (
        <div 
          className={cn(
            'absolute inset-0 animate-pulse',
            placeholderColor
          )}
          aria-hidden="true"
        />
      )}
      
      {/* Actual image */}
      {isInView && (
        <img
          src={imageSrc}
          srcSet={!hasError && srcSet ? srcSet : undefined}
          sizes={srcSet ? '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw' : undefined}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
          {...props}
        />
      )}
    </div>
  );
});

OptimizedImage.displayName = 'OptimizedImage';

export default OptimizedImage;
