import { describe, expect, it, vi } from 'vitest';
import { resolveChatMediaUploads, sendChatMediaMessage } from './chatMedia';
import { isChatMediaKeyOwnedByUser, validateChatMediaUpload } from '../../../supabase/functions/_shared/mediaLimits';

describe('chat media upload boundary', () => {
  it('rejects another user key, unsafe paths, unsupported MIME and oversized files', () => {
    expect(isChatMediaKeyOwnedByUser('chat-media/me/file.png', 'me')).toBe(true);
    expect(isChatMediaKeyOwnedByUser('chat-media/other/file.png', 'me')).toBe(false);
    expect(validateChatMediaUpload({ key: 'chat-media/other/file.png', userId: 'me', contentType: 'image/png', fileSize: 10 }).code).toBe('INVALID_CHAT_MEDIA_KEY');
    expect(validateChatMediaUpload({ key: 'chat-media/me/../secret.png', userId: 'me', contentType: 'image/png', fileSize: 10 }).code).toBe('INVALID_CHAT_MEDIA_KEY');
    expect(validateChatMediaUpload({ key: 'chat-media/me/file.bin', userId: 'me', contentType: 'application/octet-stream', fileSize: 10 }).code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(validateChatMediaUpload({ key: 'chat-media/me/file.png', userId: 'me', contentType: 'image/png', fileSize: 21 * 1024 * 1024 }).code).toBe('CHAT_FILE_TOO_LARGE');
  });

  it('reuses successfully uploaded objects when message send must be retried', async () => {
    const file = new File(['content'], 'x.png', { type: 'image/png' });
    const cache = new Map<File, { url: string; key: string }>();
    const uploaded = { url: 'https://media.example/chat-media/me/x.png', key: 'chat-media/me/x.png' };
    const upload = vi.fn().mockResolvedValue(uploaded);
    await expect(resolveChatMediaUploads([file], cache, upload)).resolves.toEqual([uploaded]);
    await expect(resolveChatMediaUploads([file], cache, upload)).resolves.toEqual([uploaded]);
    expect(upload).toHaveBeenCalledOnce();
  });

  it('keeps the selected file and its successful upload cached when message send fails', async () => {
    const file = new File(['content'], 'x.png', { type: 'image/png' });
    const selectedFiles = [file];
    const cache = new Map<File, { url: string; key: string }>();
    const uploaded = { url: 'https://media.example/chat-media/me/x.png', key: 'chat-media/me/x.png' };
    const upload = vi.fn().mockResolvedValue(uploaded);
    const send = vi.fn().mockRejectedValueOnce(new Error('database temporarily unavailable')).mockResolvedValue(undefined);
    await expect(sendChatMediaMessage(selectedFiles, cache, upload, send)).rejects.toThrow('database temporarily unavailable');
    expect(selectedFiles).toEqual([file]);
    expect(cache.get(file)).toEqual(uploaded);
    await expect(sendChatMediaMessage(selectedFiles, cache, upload, send)).resolves.toBeUndefined();
    expect(upload).toHaveBeenCalledOnce();
  });
});
