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
 });
});
