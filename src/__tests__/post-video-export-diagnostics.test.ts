import {afterEach,expect,it,vi} from 'vitest';
import {inspectPostVideoExport} from '../../supabase/functions/_shared/postVideoExportDiagnostics';
const encode=(s:string)=>btoa(s).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
const uid='a'.repeat(32),jobId='11111111-1111-4111-8111-111111111111';
const job={id:jobId,canary:true,stream_uid:uid,stream_account_id:'b'.repeat(32),phase:'mp4_wait',cancelled:false};
afterEach(()=>vi.unstubAllGlobals());
it('rejects non-canary diagnostic reads before calling providers',async()=>{
 const f=vi.fn();vi.stubGlobal('fetch',f);
 await expect(inspectPostVideoExport({...job,canary:false}, {accountId:job.stream_account_id,token:'test'})).rejects.toThrow();expect(f).not.toHaveBeenCalled();
});
it('reports safe provider claim types without serializing any capability',async()=>{
 const claims={sub:uid,downloadable:true,exp:String(Math.floor(Date.now()/1000)+600)};
 const token=encode('{}')+'.'+encode(JSON.stringify(claims))+'.signature';
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({success:true,result:{uid,creator:`post-video:${jobId}`,requireSignedURLs:true}})).mockResolvedValueOnce(Response.json({success:true,result:{default:{status:'ready',url:`https://customer-test.cloudflarestream.com/${uid}/downloads/default.mp4`}}})).mockResolvedValueOnce(Response.json({success:true,result:{token}})).mockResolvedValueOnce(new Response(null,{status:200,headers:{'content-length':'123'}})));
 const result=await inspectPostVideoExport(job,{accountId:job.stream_account_id,token:'test'});const serialized=JSON.stringify(result);
 expect(result).toMatchObject({downloadStatus:'ready',token:{subjectMatches:true,downloadable:true,expirationType:'string'},signedUrlValid:true,headStatus:200,headLength:123});
 expect(serialized).not.toContain(token);expect(serialized).not.toContain('signature');expect(serialized).not.toContain('https://');
});
it('does not acquire a token for a VOD that is not private and owned',async()=>{
 const f=vi.fn().mockResolvedValueOnce(Response.json({success:true,result:{uid,creator:'unrelated',requireSignedURLs:false}}));vi.stubGlobal('fetch',f);
 await expect(inspectPostVideoExport(job,{accountId:job.stream_account_id,token:'test'})).rejects.toThrow();expect(f).toHaveBeenCalledTimes(1);
});
it('probes valid signed exports but exposes only HEAD status and size',async()=>{
 const token=encode('{}')+'.'+encode(JSON.stringify({sub:uid,downloadable:true,exp:Math.floor(Date.now()/1000)+600}))+'.secret-signature';
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({success:true,result:{uid,creator:`post-video:${jobId}`,requireSignedURLs:true}})).mockResolvedValueOnce(Response.json({success:true,result:{default:{status:'ready',url:`https://customer-test.cloudflarestream.com/${uid}/downloads/default.mp4`}}})).mockResolvedValueOnce(Response.json({success:true,result:{token}})).mockResolvedValueOnce(new Response(null,{status:302,headers:{location:`https://example.invalid/${token}`}})));
 const report=await inspectPostVideoExport(job,{accountId:job.stream_account_id,token:'test'});
 expect(report).toMatchObject({signedUrlValid:true,headStatus:302,headLength:null,hasLocation:true});expect(JSON.stringify(report)).not.toContain(token);expect(JSON.stringify(report)).not.toContain('example.invalid');
});
it('normalizes unknown provider statuses instead of echoing response values',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({success:true,result:{uid,creator:`post-video:${jobId}`,requireSignedURLs:true}})).mockResolvedValueOnce(Response.json({success:true,result:{default:{status:'https://capability.invalid/private'}}})));
 const report=await inspectPostVideoExport(job,{accountId:job.stream_account_id,token:'test'});expect(report.downloadStatus).toBe('unknown');expect(JSON.stringify(report)).not.toContain('capability.invalid');
});
