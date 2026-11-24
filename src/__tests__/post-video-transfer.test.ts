import { describe,it,expect,vi,afterEach } from 'vitest';
import { readExactVideoRange, videoPartRange } from '../../supabase/functions/_shared/postVideoTransfer';
afterEach(()=>vi.unstubAllGlobals());
const url='https://customer-test.cloudflarestream.com/'+ 'a'.repeat(32)+'/downloads/default.mp4';
describe('bounded transfer',()=>{
 it('uses 16MiB parts and exact final range',()=>{
  expect(videoPartRange(40*1024*1024,1)).toEqual({start:0,end:16777215,length:16777216});
  expect(videoPartRange(16777217,2)).toEqual({start:16777216,end:16777216,length:1});
 });
 it.each([200,302])('rejects status %i without reading a whole response',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('oversize',{status})));
  await expect(readExactVideoRange(url,0,1,10)).rejects.toThrow();
 });
 it('rejects incorrect Content-Range or body lengths',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array(3),{status:206,headers:{'content-range':'bytes 0-1/10','content-length':'2'}})));
  await expect(readExactVideoRange(url,0,1,10)).rejects.toThrow();
 });
 it('returns exact bytes with manual redirects and cancellation',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2]),{status:206,headers:{'content-range':'bytes 0-1/10','content-length':'2'}}));
  vi.stubGlobal('fetch',fetcher);
  expect(await readExactVideoRange(url,0,1,10)).toEqual(new Uint8Array([1,2]));
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'manual'});
  expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
 });
 it('rejects arbitrary hosts before network access',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await expect(readExactVideoRange('https://evil.example/a',0,1,10)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
 });
});

import { transferPostVideoPart, verifyPostVideoOutput } from '../../supabase/functions/_shared/postVideoR2';
import { signedR2Request } from '../../supabase/functions/_shared/r2MultipartService';
describe('private R2 destination',()=>{
 const env:Record<string,string>={R2_ACCOUNT_ID:'b'.repeat(32),R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test',R2_BUCKET_NAME:'public-originals',R2_PUBLIC_DOMAIN:'https://media.example'};
 it('signs and uploads the exact private destination part',async()=>{
  vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]}});
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([1,2]),{status:206,headers:{'content-range':'bytes 0-1/2','content-length':'2'}})).mockResolvedValueOnce(new Response(null,{headers:{etag:'"abc"'}}));
  vi.stubGlobal('fetch',fetcher);
  expect(await transferPostVideoPart({output_key:'optimized/aaaa/bbbb.mp4',output_bucket:'fun-rich-video-optimized',output_size:2,runtime:{exportUrl:url,uploadId:'upload',parts:[]}})).toEqual({partNumber:1,etag:'abc',size:2});
  expect(fetcher.mock.calls[1][0]).toContain('/fun-rich-video-optimized/optimized/aaaa/bbbb.mp4?');
 });
 it('refuses verification when private object length differs',async()=>{
  vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]}});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{headers:{'content-length':'3','content-type':'video/mp4'}})));
  await expect(verifyPostVideoOutput('fun-rich-video-optimized','optimized/aaaa/bbbb.mp4',2)).rejects.toThrow();
 });
 it('uses manual redirects and request timeouts for private signed reads',async()=>{
  vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]}});
  const fetcher=vi.fn().mockResolvedValue(new Response(null));vi.stubGlobal('fetch',fetcher);
  await signedR2Request({method:'HEAD',key:'x',bucket:'fun-rich-video-optimized'});
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'manual'});
  expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
 });
});
