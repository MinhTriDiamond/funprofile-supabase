import { it,expect,vi } from 'vitest';
import { runPostVideoCron } from '../../workers/post-video-media/src/cron';
const env={POST_VIDEO_PROCESS_URL:'https://tljfqavndndfsvtazibe.supabase.co/functions/v1/process-post-videos',POST_VIDEO_CRON_SECRET:'c'.repeat(32)};
it('continues a bounded background batch with no browser or service-role credential',async()=>{
 const fetcher=vi.fn().mockImplementation(async()=>Response.json({results:[{phase:'importing'}]}));
 await runPostVideoCron(env,fetcher,async()=>{});
 expect(fetcher).toHaveBeenCalledTimes(6);
 const init=fetcher.mock.calls[0][1];expect(new Headers(init.headers).get('x-post-video-cron-secret')).toBe(env.POST_VIDEO_CRON_SECRET);expect(new Headers(init.headers).has('authorization')).toBe(false);expect(init.redirect).toBe('manual');
});
it('stops an idle batch after one request and rejects untrusted endpoints',async()=>{
 const fetcher=vi.fn().mockImplementation(async()=>Response.json({results:[]}));
 await runPostVideoCron(env,fetcher,async()=>{});expect(fetcher).toHaveBeenCalledTimes(1);
 await expect(runPostVideoCron({...env,POST_VIDEO_PROCESS_URL:'https://evil.example/process'},fetcher,async()=>{})).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
});
