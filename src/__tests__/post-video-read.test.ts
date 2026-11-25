import { describe,it,expect,vi } from 'vitest';
import { authorizePostVideoRead, signPostVideoPermit, verifyPostVideoPermit } from '../../supabase/functions/_shared/postVideoRead';
import worker from '../../workers/post-video-media/src/index';
const owner='20000000-0000-0000-0000-000000000001', viewer='20000000-0000-0000-0000-000000000002',attachment='30000000-0000-0000-0000-000000000001',generation='40000000-0000-0000-0000-000000000001',post='10000000-0000-0000-0000-000000000001';
function setup(){
 const state:any={visibility:'public',deleted_at:null,user_id:owner,id:post};
 const asset:any={post_id:post,attachment_id:attachment,source_generation:generation,output_key:`optimized/${attachment}/${generation}.mp4`,output_size:10,output_bucket:'fun-rich-video-optimized',published_at:'now',cancelled:false};
 const repo:any={asset:vi.fn().mockImplementation(async()=>asset),post:vi.fn().mockImplementation(async()=>state),friends:vi.fn().mockResolvedValue(true),blocked:vi.fn().mockResolvedValue(false)};
 const read=(viewerId:string|null)=>authorizePostVideoRead({attachmentId:attachment,viewerId,sourceGeneration:generation},repo);
 return {state,asset,repo,read};
}
describe('current media permissions',()=>{
 it('publicToPrivateRevokesGuestOnNextRange',async()=>{const s=setup();expect((await s.read(null)).allowed).toBe(true);s.state.visibility='private';expect((await s.read(null)).allowed).toBe(false);});
 it('friendRemovedCannotContinueNewRequests',async()=>{const s=setup();s.state.visibility='friends';expect((await s.read(viewer)).allowed).toBe(true);s.repo.friends.mockResolvedValue(false);expect((await s.read(viewer)).allowed).toBe(false);});
 it('privateNonOwnerDenied and ownerCanReadAfterPrivacyChange',async()=>{const s=setup();s.state.visibility='private';expect((await s.read(viewer)).allowed).toBe(false);expect((await s.read(owner)).allowed).toBe(true);});
 it('deletedPostAndStaleGenerationDenied',async()=>{const s=setup();s.state.deleted_at='now';expect((await s.read(owner)).allowed).toBe(false);s.state.deleted_at=null;s.asset.source_generation='other';expect((await s.read(owner)).allowed).toBe(false);});
 it('blocks in either direction deny delivery',async()=>{const s=setup();s.repo.blocked.mockResolvedValue(true);expect((await s.read(viewer)).allowed).toBe(false);});
 it('rejects expired and tampered permits',async()=>{
  const payload={viewerId:viewer,postId:post,attachmentId:attachment,sourceGeneration:generation,expiresAt:Date.now()+300000};
  const token=await signPostVideoPermit(payload,'test-secret');
  expect(await verifyPostVideoPermit(token,'test-secret')).toEqual(payload);
  await expect(verifyPostVideoPermit(token,'different')).rejects.toThrow();
  await expect(verifyPostVideoPermit(token,'test-secret',Date.now()+301000)).rejects.toThrow();
 });
});
describe('private Worker streaming',()=>{
 const path=`https://fun.rich/media-optimized/${attachment}/${generation}.mp4`;
 function env(){
  const authorize=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({allowed:true,key:`optimized/${attachment}/${generation}.mp4`,size:10,mime:'video/mp4'}),{headers:{'content-type':'application/json'}}));
  const get=vi.fn().mockImplementation(async(_key,options)=>{const r=options?.range;const offset=r?.offset||0,length=r?.length||10;return {body:new Blob([new Uint8Array(Array.from({length},(_,i)=>offset+i))]).stream(),size:10,httpEtag:'"etag"'};});
  return {POST_VIDEO_OUTPUT_BUCKET:{get},POST_VIDEO_GATEWAY_SECRET:'test',POST_VIDEO_AUTH_URL:'https://supabase.example/functions/v1/post-video-read',fetch:authorize};
 }
 const request=(range?:string,method='GET')=>new Request(path,{method,headers:{cookie:'post_video_permit=permit',...(range?{range}:{})}});
 it('rangeHeadersAndDownloadBodyComplete',async()=>{
  const e=env();const full=await worker.fetch(request(),e);expect(full.status).toBe(200);expect((await full.arrayBuffer()).byteLength).toBe(10);
  const range=await worker.fetch(request('bytes=2-5'),e);expect(range.status).toBe(206);expect(range.headers.get('content-range')).toBe('bytes 2-5/10');expect(new Uint8Array(await range.arrayBuffer())).toEqual(new Uint8Array([2,3,4,5]));
  const head=await worker.fetch(request(undefined,'HEAD'),e);expect(head.status).toBe(200);expect(await head.text()).toBe('');
  const bad=await worker.fetch(request('bytes=10-'),e);expect(bad.status).toBe(416);
  expect(e.fetch).toHaveBeenCalledTimes(4);
 });
 it('does not touch R2 after access is revoked on the next request',async()=>{const e=env();await worker.fetch(request(),e);e.fetch.mockResolvedValue(new Response(JSON.stringify({allowed:false})));expect((await worker.fetch(request('bytes=0-2'),e)).status).toBe(403);expect(e.POST_VIDEO_OUTPUT_BUCKET.get).toHaveBeenCalledTimes(1);});
 it('sets a path-scoped HttpOnly cookie without putting the permit in the URL',async()=>{const e=env();const result=await worker.fetch(new Request(path,{method:'POST',headers:{origin:'https://fun.rich','content-type':'application/json'},body:JSON.stringify({permit:'permit'})}),e);expect(result.status).toBe(204);expect(result.headers.get('set-cookie')).toContain('HttpOnly');expect(result.headers.get('set-cookie')).toContain(`Path=/media-optimized/${attachment}/${generation}.mp4`);});
});

import { readPostVideoJson } from '../../supabase/functions/_shared/postVideoRead';
it('limits chunked authorization bodies before buffering the full request',async()=>{
 let chunks=0;
 const body=new ReadableStream({pull(controller){chunks++;controller.enqueue(new Uint8Array(2048));if(chunks===1000)controller.close();}});
 await expect(readPostVideoJson(new Request('https://example.test',{method:'POST',body,duplex:'half'} as RequestInit))).rejects.toThrow('too large');
 expect(chunks).toBeLessThan(10);
});
it('clears a previous viewer permit without exposing it when the client loses access',async()=>{
 const result=await worker.fetch(new Request('https://fun.rich/media-optimized/30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001.mp4',{method:'DELETE',headers:{origin:'https://fun.rich'}}),{} as any);
 expect(result.status).toBe(204);expect(result.headers.get('set-cookie')).toContain('Max-Age=0');
});
