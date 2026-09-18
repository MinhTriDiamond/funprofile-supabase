import { useState, useRef, useEffect, useMemo, ImgHTMLAttributes, memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { isSlowConnection } from '@/utils/performanceOptimizer';
import { getTransformedImageUrl, ImageTransformOptions } from '@/lib/imageTransform';

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallback?: string;
  placeholderColor?: string;
  priority?: boolean;
  onLoadError?: () => void;
  hideOnError?: boolean;
  /** Unload image when scrolled out of viewport to free RAM (for long lists) */
  unloadOnExit?: boolean;
  /** Image transformation preset (avatar, cover, post, thumbnail, etc.) */
  transformPreset?: ImageTransformOptions['preset'];
  /** Custom transformation options (overrides preset) */
  transformOptions?: ImageTransformOptions;
  /** Skip transformation and use raw URL */
  skipTransform?: boolean;
}

/**
 * High-performance lazy image component with RAM optimization
 * - Native lazy loading + Intersection Observer
 * - Blur-up placeholder effect
 * - WebP/AVIF support detection  
 * - Slow connection handling
 * - Memory efficient with unloadOnExit option
 * - Option to hide completely on error
 */
export const LazyImage = memo(({ 
  src, 
  alt, 
  className, 
  fallback = '/placeholder.svg',
  placeholderColor = 'bg-muted',
  priority = false,
  onLoadError,
  hideOnError = false,
  unloadOnExit = false,
  transformPreset,
  transformOptions,
  skipTransform = false,
  ...props 
}: LazyImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [shouldRender, setShouldRender] = useState(priority);
  const imgRef = useRef<HTMLDivElement>(null);
  const hasLoadedOnce = useRef(false);

  // Generate optimized URL via Cloudflare Image Resizing
  const optimizedSrc = useMemo(() => {
    if (skipTransform || !src) return src;
    
    // Build transform options from preset and custom options
    const options: ImageTransformOptions = {
      ...(transformPreset ? { preset: transformPreset } : {}),
      ...transformOptions,
    };
    
    // If no preset or options specified, use a default optimization
    if (!transformPreset && !transformOptions) {
      // Default: auto format + quality 85 for bandwidth saving
      options.format = 'auto';
      options.quality = 85;
    }
    
    return getTransformedImageUrl(src, options);
  }, [src, transformPreset, transformOptions, skipTransform]);

  // Memoize handlers
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    hasLoadedOnce.current = true;
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoaded(true);
    onLoadError?.();
  }, [onLoadError]);

  useEffect(() => {
    if (priority) {
      setShouldRender(true);
      return;
    }

    const element = imgRef.current;
    if (!element) return;

    // Calculate rootMargin based on connection speed
    const loadMargin = isSlowConnection() ? '100px' : '300px';
    // Unload margin is larger to prevent flickering during fast scroll
    const unloadMargin = '500px';

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          setShouldRender(true);
          
          // If not using unloadOnExit, disconnect after first load
          if (!unloadOnExit) {
            observer.disconnect();
          }
        } else if (unloadOnExit && hasLoadedOnce.current) {
          // Only unload if we've loaded at least once and unloadOnExit is enabled
          setShouldRender(false);
          setIsLoaded(false);
        }
      },
      { 
        rootMargin: unloadOnExit ? unloadMargin : loadMargin,
        threshold: 0.01 
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [priority, unloadOnExit]);

  // Reset states when src changes
  useEffect(() => {
    if (!priority) {
      setIsLoaded(false);
      setHasError(false);
      hasLoadedOnce.current = false;
    }
  }, [src, priority]);

  // Hide completely if error and hideOnError is true
  if (hasError && hideOnError) {
    return null;
  }

  const imageSrc = hasError ? fallback : optimizedSrc;
  const showPlaceholder = !isLoaded || !shouldRender;

  return (
    <div 
      ref={imgRef} 
      className={cn('relative overflow-hidden', className)}
    >
      {/* Placeholder skeleton - shows when loading OR when unloaded */}
      {showPlaceholder && (
        <div 
          className={cn(
            'absolute inset-0',
            // Only animate pulse on initial load, not on re-entry
            hasLoadedOnce.current ? '' : 'animate-pulse',
            placeholderColor
          )} 
          aria-hidden="true"
        />
      )}
      
      {/* Actual image - only render when in view and shouldRender */}
      {shouldRender && (
        <img
          src={imageSrc}
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

LazyImage.displayName = 'LazyImage';

export default LazyImage;
