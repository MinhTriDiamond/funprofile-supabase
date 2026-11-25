import {validateExportUrl} from '../../supabase/functions/_shared/postVideoTransfer';
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

import { readPostVideoSource, verifyPostVideoSource } from '../../supabase/functions/_shared/postVideoR2';
describe('source version fencing',()=>{
 const job={user_id:'20000000-0000-0000-0000-000000000001',source_key:'videos/20000000-0000-0000-0000-000000000001/a.mov',source_size:2,runtime:{sourceEtag:'"original"'}};
 const env:Record<string,string>={R2_ACCOUNT_ID:'b'.repeat(32),R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test',R2_BUCKET_NAME:'public-originals',R2_PUBLIC_DOMAIN:'https://media.example'};
 it('rejects a same-size object replaced since admission',async()=>{
  vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]}});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{headers:{'content-length':'2',etag:'"replacement"'}})));
  await expect(verifyPostVideoSource(job)).rejects.toThrow();
 });
 it('sends If-Match on every source range',async()=>{
  vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]}});
  const fetcher=vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2]),{status:206,headers:{'content-range':'bytes 0-1/2','content-length':'2',etag:'"original"'}}));vi.stubGlobal('fetch',fetcher);
  await readPostVideoSource(job,0,1);
  expect(new Headers(fetcher.mock.calls[0][1].headers).get('if-match')).toBe('"original"');
 });
});
it('allows only a server-attested legacy canary source',async()=>{
 const env:Record<string,string>={R2_ACCOUNT_ID:'b'.repeat(32),R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test',R2_BUCKET_NAME:'public-originals',R2_PUBLIC_DOMAIN:'https://media.example'};
 vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]}});
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response(null,{headers:{'content-length':'2',etag:'"original"'}})));
 const job={user_id:'20000000-0000-0000-0000-000000000001',source_key:'videos/123-existing.mov',source_size:2,canary:true,runtime:{legacySourceKey:'videos/123-existing.mov',legacySourceOwner:'20000000-0000-0000-0000-000000000001'}};
 expect(await verifyPostVideoSource(job)).toBe('"original"');
 await expect(verifyPostVideoSource({...job,canary:false})).rejects.toThrow();
 await expect(verifyPostVideoSource({...job,user_id:'20000000-0000-0000-0000-000000000002'})).rejects.toThrow();
});

describe('Cloudflare private export NumericDate compatibility',()=>{
 const id='a'.repeat(32),encode=(s:string)=>btoa(s).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
 const signed=(exp:unknown)=>`https://customer-test.cloudflarestream.com/${encode('{}')}.${encode(JSON.stringify({sub:id,downloadable:true,exp}))}.test-signature/downloads/default.mp4`;
 it('accepts the decimal-string expiration observed on the real canary token',()=>{
  expect(()=>validateExportUrl(signed(String(Math.floor(Date.now()/1000)+600)),id)).not.toThrow();
 });
 it.each(['', 'Infinity', '1e30', '0xFFFFFFFF', ' 9999999999', '9999999999 ', '999999999999999999999', String(Math.floor(Date.now()/1000)-1),null,true,[]])('rejects invalid or expired claim %j',exp=>{
  expect(()=>validateExportUrl(signed(exp),id)).toThrow();
 });
});

describe('bounded same-origin MP4 redirects observed on canary',()=>{
 const id='a'.repeat(32),base=`https://customer-test.cloudflarestream.com/${id}/downloads/default.mp4`;
 it('resolves a same-origin same-video HEAD redirect',async()=>{
  const {readExportSize}=await import('../../supabase/functions/_shared/postVideoTransfer');
  const f=vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:base+'?opaque=local-test-only'}})).mockResolvedValueOnce(new Response(null,{status:200,headers:{'content-length':'123'}}));vi.stubGlobal('fetch',f);
  expect(await readExportSize(base)).toBe(123);expect(f).toHaveBeenCalledTimes(2);
  expect(f.mock.calls[0][1].signal).toBe(f.mock.calls[1][1].signal);expect(f.mock.calls[1][1]).toMatchObject({method:'HEAD',redirect:'manual',referrerPolicy:'no-referrer'});
 });
 it('preserves bounded Range over a same-video redirect',async()=>{
  const f=vi.fn().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:base+'?opaque=local-test-only'}})).mockResolvedValueOnce(new Response(new Uint8Array([7,8]),{status:206,headers:{'content-range':'bytes 0-1/10','content-length':'2'}}));vi.stubGlobal('fetch',f);
  expect(await readExactVideoRange(base,0,1,10)).toEqual(new Uint8Array([7,8]));expect(new Headers(f.mock.calls[1][1].headers).get('range')).toBe('bytes=0-1');
 });
 it.each(['https://evil.invalid/a.mp4',`https://customer-other.cloudflarestream.com/${id}/downloads/default.mp4`,`https://customer-test.cloudflarestream.com/${'b'.repeat(32)}/downloads/default.mp4`])('rejects redirect before fetching an unbound target %s',async target=>{
  const {readExportSize}=await import('../../supabase/functions/_shared/postVideoTransfer');const f=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:target}}));vi.stubGlobal('fetch',f);
  await expect(readExportSize(base)).rejects.toThrow();expect(f).toHaveBeenCalledTimes(1);
 });
 it('stops redirect loops after at most three hops',async()=>{
  const {readExportSize}=await import('../../supabase/functions/_shared/postVideoTransfer');const f=vi.fn().mockImplementation(()=>Promise.resolve(new Response(null,{status:302,headers:{location:base}})));vi.stubGlobal('fetch',f);
  await expect(readExportSize(base)).rejects.toThrow();expect(f).toHaveBeenCalledTimes(4);
 });
});
