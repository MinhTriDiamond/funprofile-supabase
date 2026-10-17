import type { MediaUploadResult } from '@/utils/mediaUpload';

export async function resolveChatMediaUploads(
  files: File[],
  cache: Map<File, MediaUploadResult>,
  upload: (file: File) => Promise<MediaUploadResult>,
): Promise<MediaUploadResult[]> {
  return Promise.all(files.map(async (file) => {
    const cached = cache.get(file);
    if (cached) return cached;
    const result = await upload(file);
    cache.set(file, result);
    return result;
  }));
}

export async function sendChatMediaMessage(
  files: File[],
  cache: Map<File, MediaUploadResult>,
  upload: (file: File) => Promise<MediaUploadResult>,
  send: (mediaUrls: string[]) => Promise<void>,
): Promise<void> {
  const uploads = await resolveChatMediaUploads(files, cache, upload);
  await send(uploads.map((item) => item.url));
}
