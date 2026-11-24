import {it,expect,vi,afterEach} from 'vitest';
import { probePostVideoInfrastructure } from '../../supabase/functions/_shared/postVideoInfrastructure';
afterEach(()=>vi.unstubAllGlobals());
it('probes only a synthetic private object and removes it without creating a Stream VOD',async()=>{
 const env:Record<string,string>={R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test',R2_BUCKET_NAME:'public-originals',R2_PUBLIC_DOMAIN:'https://media.example',CLOUDFLARE_STREAM_ACCOUNT_ID:'b'.repeat(32),CLOUDFLARE_STREAM_TOKEN:'test'};
 vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]}});
 const bytes=new Uint8Array(1024);bytes.set([102,116,121,112],4);
 const fetcher=vi.fn().mockImplementation(async(url:string,init:RequestInit)=>{
  if(url.includes('api.cloudflare.com')){expect(init.method||'GET').toBe('GET');return Response.json({success:true,result:{totalStorageMinutes:5,totalStorageMinutesLimit:1000}});}
  expect(url).toContain('/fun-rich-video-optimized/optimized/');
  if(init.method==='POST'&&url.includes('uploads='))return new Response('<UploadId>probe</UploadId>');
  if(init.method==='PUT')return new Response(null,{headers:{etag:'"part"'}});
  if(init.method==='POST')return new Response('<CompleteMultipartUploadResult/>');
  if(init.method==='HEAD')return new Response(null,{headers:{'content-length':'1024','content-type':'video/mp4'}});
  if(init.method==='GET')return new Response(bytes,{status:206,headers:{'content-range':'bytes 0-1023/1024','content-length':'1024'}});
  if(init.method==='DELETE')return new Response(null,{status:url.includes('uploadId=')?404:204});
  throw new Error('Unexpected probe request');
 });vi.stubGlobal('fetch',fetcher);
 const result=await probePostVideoInfrastructure();expect(result).toMatchObject({privateR2Verified:true,fixtureDeleted:true,usage:{usedMinutes:5,limitMinutes:1000}});
 expect(fetcher.mock.calls.some(([u,init])=>u.includes('api.cloudflare.com')&&init.method==='POST')).toBe(false);
});
