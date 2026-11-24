import { afterEach, describe, expect, it, vi } from 'vitest';
import { multipartUploadToR2 } from './multipartUpload';
const state = vi.hoisted(() => ({ row: null as unknown, inserted: null as any, token: 'initial-token' }));
vi.mock('./mediaUpload', () => ({ calculateFileHash: vi.fn(async () => 'full-content-hash') }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { access_token: state.token } } }), getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
  from: () => {
    const q: any = {
      select: () => q, eq: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: state.row }),
      insert: (row: any) => { state.inserted = row; return q; },
      single: async () => ({ data: { id: 'test-session' }, error: null }),
      update: () => q,
    };
    return q;
  },
  rpc: async () => ({ error: null }),
} }));
afterEach(() => { vi.unstubAllGlobals(); state.row = null; state.token = 'initial-token'; });

describe('multipart orchestration for a 10GiB video', () => {
  it('sends all 205 bounded parts and completes with the exact total byte count', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const size = 10 * 1024 ** 3;
    const slices: Array<[number, number]> = [];
    const file = {
      size,
      slice: (start: number, end: number) => { slices.push([start, end]); return { size: end - start }; },
    } as File;
    let completedParts: any[] = [];
    let initiatingSize = 0;
    let putBytes = 0;
    const tokens: string[] = [];
    let active = 0; let maxActive = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'PUT') {
        active++; maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        putBytes += (options.body as Blob).size; active--;
        return new Response('', { headers: { ETag: 'test-etag' } });
      }
      tokens.push((options.headers as Record<string, string>).Authorization);
      const body = JSON.parse(options.body as string);
      if (body.action === 'get-part-urls') state.token = 'refreshed-token';
      if (body.action === 'initiate') { initiatingSize = body.fileSize; return Response.json({ uploadId: 'test-upload', key: body.key }); }
      if (body.action === 'get-part-urls') return Response.json({ urls: { [body.partNumbers[0]]: 'https://upload.test/part' } });
      if (body.action === 'complete') { completedParts = body.parts; return Response.json({ url: 'https://media.test/video.mp4', key: body.key }); }
      throw new Error(`Unexpected action ${body.action}`);
    }));
    const progress = vi.fn();
    const result = await multipartUploadToR2(file, { key: 'videos/test.mp4', contentType: 'video/mp4', accessToken: 'test-token', onProgress: progress });
    expect(tokens[0]).toBe('Bearer initial-token');
    expect(tokens.at(-1)).toBe('Bearer refreshed-token');
    expect(result.url).toBe('https://media.test/video.mp4');
    expect(initiatingSize).toBe(size);
    expect(state.inserted.file_size).toBe(size);
    expect(completedParts).toHaveLength(205);
    expect(new Set(completedParts.map(p => p.partNumber)).size).toBe(205);
    expect(putBytes).toBe(size);
    expect(slices[0]).toEqual([0, 50 * 1024 ** 2]);
    expect(slices.at(-1)![1]).toBe(size);
    expect(Math.max(...slices.map(([start,end]) => end-start))).toBe(50 * 1024 ** 2);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(progress).toHaveBeenLastCalledWith(100, size, size, 0, 0);
  });
});
