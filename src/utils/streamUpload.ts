import * as tus from 'tus-js-client';
import { supabase } from '@/integrations/supabase/client';
import { FILE_LIMITS } from './imageCompression';
import logger from '@/lib/logger';

export interface StreamUploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  percentage: number;
  uploadSpeed?: number;
  eta?: number;
  processingState?: string;
  processingProgress?: number;
}

export interface StreamUploadResult {
  uid: string;
  playbackUrl?: string;
  thumbnailUrl?: string;
}

export interface StreamVideoStatus {
  uid: string;
  status: {
    state: string;
    pctComplete?: string;
    errorReasonCode?: string;
    errorReasonText?: string;
  };
  readyToStream: boolean;
  duration?: number;
  thumbnail?: string;
  playback?: {
    hls?: string;
    dash?: string;
  };
  preview?: string;
}

// 150MB chunk size - t�‘i ưu cho video l�›n, giảm overhead HTTP
const CHUNK_SIZE = 150 * 1024 * 1024;

// S�‘ kết n�‘i song song t�‘i �‘a
const PARALLEL_UPLOADS = 6;

/**
 * Call backend stream-video function
 */
async function callStreamVideo<T extends Record<string, any>, R = any>(
  action: string,
  payload?: T
): Promise<R> {
  const { data, error } = await supabase.functions.invoke('stream-video', {
    body: { action, ...(payload || {}) },
  });

  if (error) {
    logger.error('[streamUpload] stream-video invoke error:', error);
    throw new Error(error.message || 'Failed to call stream-video');
  }

  return data as R;
}

/**
 * Get a direct upload URL from Cloudflare Stream (for files < 200MB)
 */
async function getDirectUploadUrl(): Promise<{ uploadUrl: string; uid: string }> {
  logger.debug('[streamUpload] Getting direct upload URL...');
  const result = await callStreamVideo<{ maxDurationSeconds: number }, { uploadUrl: string; uid: string }>(
    'direct-upload',
    { maxDurationSeconds: 7200 }
  );

  if (!result?.uploadUrl || !result?.uid) {
    throw new Error('Invalid direct upload response');
  }

  logger.debug('[streamUpload] Got direct upload URL, uid:', result.uid);
  return result;
}

/**
 * Get TUS upload URL for resumable uploads using Direct Creator Upload
 */
async function getTusUploadUrl(
  fileSize: number,
  fileName: string,
  fileType: string
): Promise<{ uploadUrl: string; uid: string }> {
  logger.debug('[streamUpload] Getting TUS upload URL for file size:', formatBytes(fileSize));

  const result = await callStreamVideo<
    { fileSize: number; fileName: string; fileType: string },
    { uploadUrl: string; uid: string }
  >('get-tus-upload-url', {
    fileSize,
    fileName,
    fileType,
  });

  if (!result?.uploadUrl || !result?.uid) {
    throw new Error('Invalid TUS upload response');
  }

  logger.debug('[streamUpload] Got TUS upload URL, uid:', result.uid);
  return { uploadUrl: result.uploadUrl, uid: result.uid };
}

/**
 * Upload a video to Cloudflare Stream
 */
export async function uploadToStream(
  file: File,
  onProgress?: (progress: StreamUploadProgress) => void,
  onError?: (error: Error) => void
): Promise<StreamUploadResult> {
  const fileSize = file.size;
  const useTus = fileSize > (FILE_LIMITS.TUS_THRESHOLD || 100 * 1024 * 1024);
  
  logger.debug('[streamUpload] Starting upload:', {
    fileName: file.name,
    fileSize: formatBytes(fileSize),
    useTus,
  });

  if (useTus) {
    return uploadToStreamTus(file, onProgress, onError);
  }

  return uploadDirect(file, onProgress, onError);
}

/**
 * Direct upload using XHR (for files < 200MB)
 */
async function uploadDirect(
  file: File,
  onProgress?: (progress: StreamUploadProgress) => void,
  onError?: (error: Error) => void
): Promise<StreamUploadResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const { uploadUrl, uid } = await getDirectUploadUrl();

      logger.debug('[streamUpload] Starting direct upload, uid:', uid);

      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      let lastLoaded = 0;
      let lastTime = Date.now();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const now = Date.now();
          const timeDelta = (now - lastTime) / 1000;
          const bytesDelta = event.loaded - lastLoaded;
          const speed = timeDelta > 0 ? bytesDelta / timeDelta : 0;
          const remaining = event.total - event.loaded;
          const eta = speed > 0 ? remaining / speed : 0;
          
          lastLoaded = event.loaded;
          lastTime = now;
          
          onProgress({
            bytesUploaded: event.loaded,
            bytesTotal: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
            uploadSpeed: speed,
            eta: Math.round(eta),
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          logger.debug('[streamUpload] Direct upload complete, uid:', uid);
          
          // Update video settings
          supabase.functions.invoke('stream-video', {
            body: { 
              action: 'update-video-settings',
              uid,
              requireSignedURLs: false,
              allowedOrigins: ['*'],
            }
          }).catch((err) => {
            logger.warn('[streamUpload] Failed to update video settings:', err);
          });
          
          resolve({
            uid,
            playbackUrl: `https://iframe.videodelivery.net/${uid}`,
            thumbnailUrl: `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=1s`,
          });
        } else {
          const error = new Error(`Upload failed: ${xhr.status}`);
          onError?.(error);
          reject(error);
        }
      });

      xhr.addEventListener('error', () => {
        const error = new Error('Upload failed - network error');
        onError?.(error);
        reject(error);
      });

      xhr.open('POST', uploadUrl);
      xhr.send(formData);

    } catch (error) {
      logger.error('[streamUpload] Direct upload error:', error);
      onError?.(error as Error);
      reject(error);
    }
  });
}

/**
 * Upload using TUS protocol with Direct Creator Upload
 * The client uploads DIRECTLY to Cloudflare - no proxy needed
 */
export async function uploadToStreamTus(
  file: File,
  onProgress?: (progress: StreamUploadProgress) => void,
  onError?: (error: Error) => void
): Promise<StreamUploadResult> {
  return new Promise(async (resolve, reject) => {
    try {
      // Step 1: Get Direct Upload URL from our backend
      const { uploadUrl, uid } = await getTusUploadUrl(file.size, file.name, file.type);

      logger.debug('[streamUpload] Starting TUS upload:', { 
        uploadUrl: uploadUrl.substring(0, 80), 
        uid, 
        size: formatBytes(file.size) 
      });

      let lastLoaded = 0;
      let lastTime = Date.now();

      // Step 2: Upload directly to Cloudflare using tus-js-client
      const upload = new tus.Upload(file, {
        uploadUrl,
        chunkSize: CHUNK_SIZE,
        retryDelays: [0, 500, 1000, 2000, 4000],
        removeFingerprintOnSuccess: true,
        headers: {},
        metadata: {
          filename: file.name,
          filetype: file.type,
          maxDuration: '36000',
        },
        onError: (error) => {
          logger.error('[streamUpload] TUS upload error:', error);
          onError?.(error);
          reject(error);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const now = Date.now();
          const timeDelta = (now - lastTime) / 1000;
          const bytesDelta = bytesUploaded - lastLoaded;
          const speed = timeDelta > 0 ? bytesDelta / timeDelta : 0;
          const remaining = bytesTotal - bytesUploaded;
          const eta = speed > 0 ? remaining / speed : 0;
          
          lastLoaded = bytesUploaded;
          lastTime = now;
          
          logger.debug('[streamUpload] TUS progress:', Math.round((bytesUploaded / bytesTotal) * 100) + '%');
          
          onProgress?.({
            bytesUploaded,
            bytesTotal,
            percentage: Math.round((bytesUploaded / bytesTotal) * 100),
            uploadSpeed: speed,
            eta: Math.round(eta),
          });
        },
        onSuccess: () => {
          logger.debug('[streamUpload] TUS upload complete, uid:', uid);
          
          // Update video settings
          supabase.functions.invoke('stream-video', {
            body: { 
              action: 'update-video-settings',
              uid,
              requireSignedURLs: false,
              allowedOrigins: ['*'],
            }
          }).catch((err) => {
            logger.warn('[streamUpload] Failed to update video settings:', err);
          });
          
          resolve({
            uid,
            playbackUrl: `https://iframe.videodelivery.net/${uid}`,
            thumbnailUrl: `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=1s`,
          });
        },
      });

      // Start upload
      logger.debug('[streamUpload] Starting TUS upload to Cloudflare...');
      upload.start();

    } catch (error) {
      logger.error('[streamUpload] TUS setup error:', error);
      onError?.(error as Error);
      reject(error);
    }
  });
}

/**
 * Check video processing status
 */
export async function checkVideoStatus(uid: string): Promise<StreamVideoStatus> {
  return callStreamVideo<{ uid: string }, StreamVideoStatus>('check-status', { uid });
}

/**
 * Get playback URL for a video
 */
export async function getPlaybackUrl(uid: string): Promise<{
  hls?: string;
  dash?: string;
  thumbnail?: string;
}> {
  const result = await callStreamVideo<{ uid: string }, {
    playback?: { hls?: string; dash?: string };
    thumbnail?: string;
  }>('get-playback-url', { uid });

  return {
    hls: result.playback?.hls,
    dash: result.playback?.dash,
    thumbnail: result.thumbnail,
  };
}

/**
 * Wait for video to be ready for streaming
 */
export async function waitForVideoReady(
  uid: string,
  maxAttempts = 120,
  intervalMs = 3000
): Promise<StreamVideoStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkVideoStatus(uid);
    
    if (status.readyToStream) {
      return status;
    }
    
    if (status.status?.state === 'error') {
      throw new Error(status.status.errorReasonText || 'Video processing failed');
    }
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error('Video processing timeout');
}

/**
 * Check if URL is a Cloudflare Stream URL
 */
export function isStreamUrl(url: string): boolean {
  return url.includes('videodelivery.net') || url.includes('cloudflarestream.com');
}

/**
 * Extract video UID from Cloudflare Stream URL
 */
export function extractStreamUid(url: string): string | null {
  const patterns = [
    /videodelivery\.net\/([a-f0-9]{32})/i,
    /cloudflarestream\.com\/([a-f0-9]{32})/i,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format duration in seconds to human readable string
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
