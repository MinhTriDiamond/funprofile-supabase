import { describe, it, expect, vi, afterEach } from 'vitest';
import { parsePostVideoUsage, parsePostVideoExport, startPostVideoImport } from '../../supabase/functions/_shared/postVideoStream';
const uid='a'.repeat(32), account='b'.repeat(32);
afterEach(()=>vi.unstubAllGlobals());
describe('temporary Stream adapter',()=>{
 it.each([{}, {totalStorageMinutes:-1,totalStorageMinutesLimit:1000}, {totalStorageMinutes:0,totalStorageMinutesLimit:null}])('rejects unknown usage %j',x=>expect(()=>parsePostVideoUsage(x)).toThrow());
 it('uses explicit export ready state, never null percentage heuristics',()=>{
   const url=`https://customer-test.cloudflarestream.com/${uid}/downloads/default.mp4`;
   expect(parsePostVideoExport({default:{status:'inprogress',percentComplete:null,url}},uid).ready).toBe(false);
   expect(parsePostVideoExport({default:{status:'ready',url}},uid)).toMatchObject({ready:true,url});
   expect(()=>parsePostVideoExport({default:{status:'ready',url:'https://evil.example/a.mp4'}},uid)).toThrow();
 });
 it('creates bounded TUS imports rather than unbounded copy',async()=>{
   const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:201,headers:{location:`https://api.cloudflare.com/client/v4/accounts/${account}/stream/${uid}`,'stream-media-id':uid}}));
   vi.stubGlobal('fetch',fetcher);
   const result=await startPostVideoImport({id:'job',source_size:123,attachment_id:'attachment'}, {accountId:account,token:'test'});
   expect(result.mode).toBe('tus');
   const headers=new Headers(fetcher.mock.calls[0][1].headers);
   expect(headers.get('upload-length')).toBe('123');
   expect(headers.get('upload-metadata')).toContain('maxDurationSeconds '+btoa('14400'));
   expect(headers.get('upload-metadata')).toContain('requiresignedurls');
 });
});

it('accepts opaque provider TUS paths using the official UID header',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:201,headers:{location:'https://upload.videodelivery.net/tus/opaque/upload?key=a','stream-media-id':uid}})));
 expect((await startPostVideoImport({id:'job',attachment_id:'attachment',source_size:123},{accountId:account,token:'test'})).uid).toBe(uid);
});
it('treats terminal export errors as bounded failures instead of endless progress',()=>{
 expect(()=>parsePostVideoExport({default:{status:'error'}},uid)).toThrow();
});
it.each([404,403])('reports actual Stream HTTP%i without treating it as owned',async status=>{
 const {probePostVideoVodIdentity}=await import('../../supabase/functions/_shared/postVideoStream');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status})));
 expect(await probePostVideoVodIdentity(uid,'10000000-0000-0000-0000-000000000001',{accountId:account,token:'test'})).toEqual({httpStatus:status,ownedVod:false});
});
it('binds a successful identity probe to both UID and managed creator',async()=>{
 const {probePostVideoVodIdentity}=await import('../../supabase/functions/_shared/postVideoStream');const id='10000000-0000-0000-0000-000000000001';vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({success:true,result:{uid,creator:'post-video:'+id}})));
 expect(await probePostVideoVodIdentity(uid,id,{accountId:account,token:'test'})).toEqual({httpStatus:200,ownedVod:true});
});
