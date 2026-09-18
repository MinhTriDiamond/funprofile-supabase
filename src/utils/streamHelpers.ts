/**
 * Cloudflare Stream Video Helpers
 * Centralized utilities for video deletion and management
 */

import { supabase } from '@/integrations/supabase/client';
import { extractStreamUid, isStreamUrl } from './streamUpload';
import { deleteFromR2 } from './r2Upload';
import logger from '@/lib/logger';

/**
 * Check if URL is a Supabase Storage URL
 */
export function isSupabaseStorageUrl(url: string): boolean {
  return url.includes('supabase.co/storage/v1') || url.includes('supabase.in/storage/v1');
}

/**
 * Extract bucket and path from a Supabase Storage public URL
 * e.g. "https://xxx.supabase.co/storage/v1/object/public/live-recordings/some/path.webm"
 * â†’ { bucket: "live-recordings", path: "some/path.webm" }
 */
export function extractStoragePath(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (match) {
      return { bucket: match[1], path: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteStorageFile(url: string): Promise<boolean> {
  const info = extractStoragePath(url);
  if (!info) return false;
  try {
    const { error } = await supabase.storage.from(info.bucket).remove([info.path]);
    if (error) {
      logger.error('[streamHelpers] Storage delete error:', error);
      return false;
    }
    logger.debug('[streamHelpers] Storage file deleted:', info.bucket, info.path);
    return true;
  } catch (err) {
    logger.error('[streamHelpers] Storage delete failed:', err);
    return false;
  }
}

/**
 * Check if URL is an R2 media URL
 */
export function isR2Url(url: string): boolean {
  return url.includes('media.fun.rich') || (url.includes('.r2.dev') && !url.includes('videodelivery.net'));
}

/**
 * Extract R2 key from URL (e.g. "videos/1234-abc.mp4" from "https://media.fun.rich/videos/1234-abc.mp4")
 */
export function extractR2Key(url: string): string | null {
  try {
    const u = new URL(url);
    // Remove leading slash
    return u.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

/**
 * Delete a video by URL â€” auto-detects R2 vs Stream
 */
export async function deleteVideoByUrl(videoUrl: string): Promise<boolean> {
  // Supabase Storage (live recordings)
  if (isSupabaseStorageUrl(videoUrl)) {
    return deleteStorageFile(videoUrl);
  }
  // R2
  if (isR2Url(videoUrl)) {
    const key = extractR2Key(videoUrl);
    if (!key) return false;
    try {
      await deleteFromR2(key);
      logger.debug('[streamHelpers] R2 video deleted:', key);
      return true;
    } catch (err) {
      logger.error('[streamHelpers] R2 delete error:', err);
      return false;
    }
  }
  // Fallback to Stream deletion
  return deleteStreamVideoByUrl(videoUrl);
}

/**
 * Delete a video from Cloudflare Stream by URL
 * Extracts UID and calls the stream-video edge function
 * 
 * @param videoUrl - Cloudflare Stream video URL
 * @returns true if deletion was successful, false otherwise
 */
export async function deleteStreamVideoByUrl(videoUrl: string): Promise<boolean> {
  const uid = extractStreamUid(videoUrl);
  if (!uid) {
    logger.warn('[streamHelpers] Could not extract UID from URL:', videoUrl);
    return false;
  }
  
  return deleteStreamVideoByUid(uid);
}

/**
 * Delete a video from Cloudflare Stream by UID
 * 
 * @param uid - Cloudflare Stream video UID
 * @returns true if deletion was successful, false otherwise
 */
export async function deleteStreamVideoByUid(uid: string): Promise<boolean> {
  try {
    logger.debug('[streamHelpers] Deleting Stream video:', uid);
    const { data, error } = await supabase.functions.invoke('stream-video', {
      body: { action: 'delete', uid },
    });
    
    if (error) {
      logger.error('[streamHelpers] Stream video delete error:', error);
      return false;
    }
    
    logger.debug('[streamHelpers] Stream video deleted successfully:', uid, data);
    return true;
  } catch (error) {
    logger.error('[streamHelpers] Failed to delete Stream video:', error);
    return false;
  }
}

/**
 * Delete multiple Stream videos in parallel
 * 
 * @param videoUrls - Array of Cloudflare Stream video URLs
 * @returns Object with success count and total count
 */
export async function deleteStreamVideos(videoUrls: string[]): Promise<{ 
  successCount: number; 
  totalCount: number 
}> {
  if (videoUrls.length === 0) {
    return { successCount: 0, totalCount: 0 };
  }
  
  logger.debug('[streamHelpers] Deleting', videoUrls.length, 'videos');
  const results = await Promise.all(videoUrls.map(deleteStreamVideoByUrl));
  const successCount = results.filter(Boolean).length;
  logger.debug('[streamHelpers] Deleted', successCount, 'of', videoUrls.length, 'videos');
  
  return { successCount, totalCount: videoUrls.length };
}

/**
 * Extract all Stream video URLs from a post's media
 * 
 * @param post - Post object with video_url and media_urls
 * @returns Array of Stream video URLs
 */
export function extractPostStreamVideos(post: {
  video_url?: string | null;
  media_urls?: Array<{ url: string; type: 'image' | 'video' }> | null;
}): string[] {
  const videoUrls: string[] = [];
  
  // Check legacy video_url
  if (post.video_url && isStreamUrl(post.video_url)) {
    videoUrls.push(post.video_url);
  }
  
  // Check media_urls array for videos
  if (post.media_urls && Array.isArray(post.media_urls)) {
    post.media_urls.forEach((media) => {
      if (media.type === 'video' && isStreamUrl(media.url)) {
        videoUrls.push(media.url);
      }
    });
  }
  
  return videoUrls;
}

// Re-export commonly used functions for convenience
export { extractStreamUid, isStreamUrl } from './streamUpload';
