import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), multipart: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.session } } }));
vi.mock('../utils/multipartUpload', () => ({ multipartUploadToR2: mocks.multipart }));
import { uploadToR2 } from '../utils/r2Upload';
const owner = '20000000-0000-0000-0000-000000000001';
const file = { name: 'video.mov', type: 'video/quicktime', size: 4096 } as File;
beforeEach(() => {
 mocks.session.mockResolvedValue({ data: { session: { user: { id: owner }, access_token: 'fresh' } } });
 mocks.multipart.mockImplementation(async (_file, opts) => ({ publicUrl: 'https://media.example/video', key: opts.key }));
});
describe('post video upload identity', () => {
 it('scopes automatic post video keys even when a token was supplied', async () => {
   await uploadToR2(file, 'videos', undefined, 'provided');
   expect(mocks.multipart.mock.calls.at(-1)?.[1].key).toMatch(new RegExp(`^videos/${owner}/[^/]+\\.mov$`));
 });
 it('preserves explicit live replay keys', async () => {
   await uploadToR2(file, 'videos', 'live/session/replay.mov', 'provided');
   expect(mocks.multipart.mock.calls.at(-1)?.[1].key).toBe('videos/live/session/replay.mov');
 });
});
