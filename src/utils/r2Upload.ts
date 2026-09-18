import { supabase } from '@/integrations/supabase/client';
import { multipartUploadToR2 } from './multipartUpload';
import { VIDEO_LIMITS } from '@/config/uploadLimits';

export interface R2UploadResult {
  url: string;
  key: string;
}

/**
 * Get presigned URL from edge function with timeout
 */
async function getPresignedUrl(
  key: string,
  contentType: string,
  fileSize: number,
  durationSeconds?: number,
  accessToken?: string,
  timeoutMs: number = 30000
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Use provided token or get fresh one
    let token = accessToken;
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Chưa đăng nhập');
      }
      token = session.access_token;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/get-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({ key, contentType, fileSize, durationSeconds: normalizeDurationSeconds(durationSeconds) }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.uploadUrl || !data.publicUrl) {
      throw new Error('Invalid response from server');
    }

    return { uploadUrl: data.uploadUrl, publicUrl: data.publicUrl };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Upload file directly to R2 using presigned URL
 */
async function uploadWithPresignedUrl(
  file: File,
  uploadUrl: string,
  onProgress?: (percent: number) => void,
  timeoutMs: number = 120000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timeoutId = setTimeout(() => {
      xhr.abort();
      reject(new Error('Upload timed out'));
    }, timeoutMs);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      clearTimeout(timeoutId);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Upload network error'));
    };

    xhr.onabort = () => {
      clearTimeout(timeoutId);
      reject(new Error('Upload aborted'));
    };

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('Cache-Control', 'public, max-age=31536000, immutable');
    xhr.send(file);
  });
}

/**
 * Upload file directly to Cloudflare R2 via presigned URL
 * Much more efficient than base64 - supports large files
 * @param accessToken Optional access token to avoid multiple getSession calls
 */
const MULTIPART_THRESHOLD = VIDEO_LIMITS.MULTIPART_THRESHOLD; // 25MB

function normalizeDurationSeconds(duration?: number | null): number | undefined {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return undefined;
  return Math.ceil(duration);
}

export async function uploadToR2(
  file: File,
  bucket: 'posts' | 'avatars' | 'videos' | 'comment-media',
  customPath?: string,
  accessToken?: string,
  onProgress?: (percent: number) => void,
  extra?: { durationSeconds?: number; signal?: AbortSignal }
): Promise<R2UploadResult> {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = file.name.split('.').pop();
  const filename = customPath || `${timestamp}-${randomString}.${extension}`;
  const key = `${bucket}/${filename}`;

  let token = accessToken;
  if (!token) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Chưa đăng nhập');
    token = session.access_token;
  }

  // Multipart cho file lớn HOẶC mọi video (an toàn cho 10GB)
  if (file.size >= MULTIPART_THRESHOLD || file.type.startsWith('video/')) {
    const r = await multipartUploadToR2(file, {
      key,
      contentType: file.type,
      accessToken: token,
      onProgress: (percent) => onProgress?.(percent),
      durationSeconds: normalizeDurationSeconds(extra?.durationSeconds),
      signal: extra?.signal,
    });
    return { url: r.url, key: r.key };
  }

  // Single presigned URL upload for smaller files
  const { uploadUrl, publicUrl } = await getPresignedUrl(
    key,
    file.type,
    file.size,
    normalizeDurationSeconds(extra?.durationSeconds),
    token,
    45000
  );

  await uploadWithPresignedUrl(
    file,
    uploadUrl,
    onProgress,
    180000
  );

  return {
    url: publicUrl,
    key: key,
  };
}

/**
 * Delete file from Cloudflare R2 via edge function
 */
export async function deleteFromR2(key: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('delete-from-r2', {
      body: { key },
    });

    if (error) throw error;
  } catch (error) {
    throw error;
  }
}
