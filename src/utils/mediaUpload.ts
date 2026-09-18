/**
 * Media Upload Utility
 * 
 * Triển khai theo hướng dẫn của Cha:
 * 1. Cache Busting: Đổi tên file với hash/timestamp
 * 2. Nén ảnh client-side trước khi upload
 * 3. Upload trực tiếp lên R2 qua presigned URL
 * 4. URL hiển thị qua Cloudflare Resizing
 */

import { supabase } from '@/integrations/supabase/client';
import { compressImage, FILE_LIMITS } from './imageCompression';

// R2 custom domain (dùng cho Cloudflare Image Resizing)
const R2_CUSTOM_DOMAIN = 'https://media.fun.rich';

// Mapping extension -> MIME type chuẩn (normalize cho browser gán sai)
const EXT_TO_MIME: Record<string, string> = {
  rar: 'application/x-rar-compressed',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  apk: 'application/vnd.android.package-archive',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

export interface MediaUploadResult {
  url: string;
  key: string;
  transformedUrl?: string;
}

export interface UploadOptions {
  bucket: 'posts' | 'avatars' | 'videos' | 'comment-media' | 'covers';
  compress?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  /** If true, preserve the original filename in the R2 key (for documents) */
  preserveFilename?: boolean;
}

/**
 * Generate unique filename with hash for cache busting
 * Format: [userId]_[timestamp]_[randomHash].[ext]
 */
export function generateCacheBustFilename(
  originalName: string,
  userId?: string
): string {
  const timestamp = Date.now();
  const randomHash = Math.random().toString(36).substring(2, 10);
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  
  // Clean extension
  const cleanExt = ext.replace(/[^a-z0-9]/g, '');
  
  if (userId) {
    return `${userId}_${timestamp}_${randomHash}.${cleanExt}`;
  }
  return `${timestamp}_${randomHash}.${cleanExt}`;
}

/**
 * Generate document path that preserves the original filename.
 * Format: [userId]_[timestamp]_[randomHash]/[sanitizedOriginalName]
 * 
 * This allows getFileName(url) to extract the original name from the URL.
 */
export function generateDocumentPath(
  originalName: string,
  userId?: string
): string {
  const timestamp = Date.now();
  const randomHash = Math.random().toString(36).substring(2, 10);
  
  // Sanitize original filename: keep alphanumeric, dots, hyphens, underscores, and common unicode chars
  const sanitized = originalName
    .replace(/[^\w.\-\u00C0-\u024F\u1E00-\u1EFF]/g, '_') // replace special chars with underscore
    .replace(/_+/g, '_') // collapse multiple underscores
    .replace(/^_|_$/g, ''); // trim leading/trailing underscores
  
  const safeName = sanitized || 'file';
  const folder = userId
    ? `${userId}_${timestamp}_${randomHash}`
    : `${timestamp}_${randomHash}`;
  
  return `${folder}/${safeName}`;
}

/**
 * Calculate file hash (SHA-256) for deduplication
 */
export async function calculateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Upload media to R2 with presigned URL (Direct upload - không qua base64)
 * 
 * Flow:
 * 1. Nén ảnh nếu cần (client-side)
 * 2. Gọi API lấy presigned URL
 * 3. Upload trực tiếp lên R2
 * 4. Return URL đã transform qua Cloudflare
 */
export async function uploadMedia(
  file: File,
  options: UploadOptions
): Promise<MediaUploadResult> {
  const { bucket, compress = true, maxWidth, maxHeight, quality, preserveFilename = false } = options;

  // Get current user from session (cached, no network call)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Chưa đăng nhập');
  const user = session.user;

  let processedFile = file;

  // Normalize MIME type dựa theo extension
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mappedMime = EXT_TO_MIME[ext];
  let fileType = file.type || '';

  if (!fileType || (!fileType.startsWith('image/') && !fileType.startsWith('video/') && !fileType.startsWith('audio/') && mappedMime)) {
    fileType = mappedMime || 'application/octet-stream';
  }
  if (!fileType) {
    fileType = 'application/octet-stream';
  }

  if (fileType !== file.type) {
    processedFile = new File([file], file.name, { type: fileType });
  }

  // Nén ảnh client-side nếu là ảnh
  if (compress && fileType.startsWith('image/')) {
    processedFile = await compressImage(file, {
      maxWidth: maxWidth || FILE_LIMITS.POST_IMAGE_MAX_WIDTH,
      maxHeight: maxHeight || FILE_LIMITS.POST_IMAGE_MAX_HEIGHT,
      quality: quality || 0.85,
    });
  }

  // Generate key: preserve original filename for documents, hash for media
  const pathSegment = preserveFilename
    ? generateDocumentPath(file.name, user.id)
    : generateCacheBustFilename(processedFile.name, user.id);
  const key = `${bucket}/${pathSegment}`;

  // Get presigned URL từ edge function
  const { data: presignedData, error: presignedError } = await supabase.functions.invoke(
    'get-upload-url',
    {
      body: {
        key,
        contentType: processedFile.type,
        fileSize: processedFile.size,
      },
    }
  );

  if (presignedError || !presignedData?.uploadUrl) {
    throw new Error(presignedError?.message || 'Không thể lấy URL upload');
  }

  // Upload trực tiếp lên R2 (không qua base64)
  const uploadResponse = await fetch(presignedData.uploadUrl, {
    method: 'PUT',
    body: processedFile,
    headers: {
      'Content-Type': processedFile.type,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload thất bại: ${uploadResponse.status}`);
  }

  // Build URLs
  const rawUrl = `${R2_CUSTOM_DOMAIN}/${key}`;
  
  return {
    url: rawUrl,
    key,
    transformedUrl: rawUrl, // Caller can use imageTransform.ts for transforms
  };
}

/**
 * Upload avatar với compression tối ưu
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<MediaUploadResult> {
  // Avatar luôn nén về max 512x512 với quality cao
  return uploadMedia(file, {
    bucket: 'avatars',
    compress: true,
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.9,
  });
}

/**
 * Upload cover photo
 */
export async function uploadCover(
  file: File,
  userId: string
): Promise<MediaUploadResult> {
  return uploadMedia(file, {
    bucket: 'covers',
    compress: true,
    maxWidth: 1920,
    maxHeight: 640,
    quality: 0.85,
  });
}

/**
 * Upload post image với compression hợp lý
 */
export async function uploadPostImage(file: File): Promise<MediaUploadResult> {
  return uploadMedia(file, {
    bucket: 'posts',
    compress: true,
    maxWidth: FILE_LIMITS.POST_IMAGE_MAX_WIDTH,
    maxHeight: FILE_LIMITS.POST_IMAGE_MAX_HEIGHT,
    quality: 0.85,
  });
}

/**
 * Upload video (không nén, chỉ validate size)
 */
export async function uploadVideo(file: File): Promise<MediaUploadResult> {
  if (file.size > FILE_LIMITS.VIDEO_MAX_SIZE) {
    const gb = Math.round(FILE_LIMITS.VIDEO_MAX_SIZE / (1024 * 1024 * 1024));
    throw new Error(`Video phải nhỏ hơn ${gb}GB`);
  }
  // Ép qua R2 multipart resumable (uploadToR2 tự rẽ multipart cho mọi video)
  const { uploadToR2 } = await import('./r2Upload');
  const r = await uploadToR2(file, 'videos');
  return { url: r.url, key: r.key, transformedUrl: r.url };
}

/**
 * Upload comment media
 * For documents (non-image, non-video): preserves original filename in R2 key
 */
export async function uploadCommentMedia(file: File): Promise<MediaUploadResult> {
  if (file.type.startsWith('image/')) {
    return uploadMedia(file, {
      bucket: 'comment-media',
      compress: true,
      maxWidth: 800,
      maxHeight: 800,
      quality: 0.8,
    });
  }

  if (file.type.startsWith('video/')) {
    return uploadMedia(file, {
      bucket: 'comment-media',
      compress: false,
    });
  }

  // Document files: use generateDocumentPath to preserve original filename
  return uploadMedia(file, {
    bucket: 'comment-media',
    compress: false,
    preserveFilename: true,
  });
}
