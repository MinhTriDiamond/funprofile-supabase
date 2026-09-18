/**
 * Image compression utility for optimizing uploads
 * Resizes and compresses images to reduce storage and improve loading times
 * Uses WebP format for better compression (30-50% smaller than JPEG)
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0 to 1
  outputFormat?: 'image/jpeg' | 'image/webp' | 'image/png';
  targetSizeKB?: number; // Target file size in KB
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.80, // Reduced for better compression
  outputFormat: 'image/webp', // WebP for better compression
  targetSizeKB: 150, // Target <150KB
};

/**
 * Check if browser supports WebP
 */
const supportsWebP = (): boolean => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
};

/**
 * Compress and resize an image file with WebP support
 */
export const compressImage = async (
  file: File,
  options: CompressionOptions = {}
): Promise<File> => {
  // Check WebP support, fallback to JPEG if not supported
  const webpSupported = supportsWebP();
  const opts = { 
    ...DEFAULT_OPTIONS, 
    ...options,
    outputFormat: webpSupported ? (options.outputFormat || 'image/webp') : 'image/jpeg'
  };

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = async () => {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;
        
        if (width > opts.maxWidth! || height > opts.maxHeight!) {
          const ratio = Math.min(opts.maxWidth! / width, opts.maxHeight! / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Use better image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Iterative compression to reach target size
        let quality = opts.quality!;
        let blob: Blob | null = null;
        const targetBytes = (opts.targetSizeKB || 150) * 1024;
        
        // Try up to 5 iterations to reach target size
        for (let i = 0; i < 5; i++) {
          blob = await new Promise<Blob | null>((res) => {
            canvas.toBlob(res, opts.outputFormat, quality);
          });
          
          if (!blob) break;
          
          // If under target size, we're done
          if (blob.size <= targetBytes) break;
          
          // Reduce quality for next iteration
          quality = Math.max(0.3, quality - 0.15);
        }

        if (!blob) {
          reject(new Error('Failed to compress image'));
          return;
        }

        // Determine file extension based on format
        const ext = opts.outputFormat === 'image/webp' ? 'webp' : 
                    opts.outputFormat === 'image/png' ? 'png' : 'jpg';

        // Create new file from blob
        const compressedFile = new File(
          [blob],
          file.name.replace(/\.[^/.]+$/, '') + '.' + ext,
          { type: opts.outputFormat }
        );

        resolve(compressedFile);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Compress image for avatar (smaller size, more aggressive compression)
 */
export const compressAvatar = async (file: File): Promise<File> => {
  return compressImage(file, {
    maxWidth: 256,
    maxHeight: 256,
    quality: 0.75,
    targetSizeKB: 50, // Avatars should be very small
  });
};

/**
 * Compress image for post (balanced quality and size)
 */
export const compressPostImage = async (file: File): Promise<File> => {
  return compressImage(file, {
    maxWidth: 1200, // Reduced from 1920 for faster loading
    maxHeight: 1200,
    quality: 0.80,
    targetSizeKB: 150,
  });
};

/**
 * Get video duration
 */
export const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = () => reject(new Error('Failed to load video'));
    video.src = URL.createObjectURL(file);
  });
};

/**
 * Validate and get optimized file size limits
 */
import { VIDEO_LIMITS, IMAGE_LIMITS } from '@/config/uploadLimits';

export const FILE_LIMITS = {
  IMAGE_MAX_SIZE: IMAGE_LIMITS.MAX_BYTES,
  VIDEO_MAX_SIZE: VIDEO_LIMITS.MAX_BYTES_USER,
  VIDEO_MAX_SIZE_PREMIUM: VIDEO_LIMITS.MAX_BYTES_PREMIUM,
  VIDEO_MAX_DURATION: VIDEO_LIMITS.MAX_DURATION_SECONDS,  // 240 phút
  AVATAR_MAX_WIDTH: 256,
  AVATAR_MAX_HEIGHT: 256,
  COVER_MAX_WIDTH: 1200,
  COVER_MAX_HEIGHT: 400,
  POST_IMAGE_MAX_WIDTH: 1200,
  POST_IMAGE_MAX_HEIGHT: 1200,
  TUS_THRESHOLD: 100 * 1024 * 1024,
  MAX_FILES_PER_POST: 30,
};
