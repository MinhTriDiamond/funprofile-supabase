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
it('classifies provider redirect host and UID binding without exposing location or query values',async()=>{
 const token=encode('{}')+'.'+encode(JSON.stringify({sub:uid,downloadable:true,exp:Math.floor(Date.now()/1000)+600}))+'.private-signature';
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({success:true,result:{uid,creator:`post-video:${jobId}`,requireSignedURLs:true}})).mockResolvedValueOnce(Response.json({success:true,result:{default:{status:'ready',url:`https://customer-test.cloudflarestream.com/${uid}/downloads/default.mp4`}}})).mockResolvedValueOnce(Response.json({success:true,result:{token}})).mockResolvedValueOnce(new Response(null,{status:302,headers:{location:`https://videodelivery.net/${uid}/downloads/default.mp4?token=private-query`}})));
 const report=await inspectPostVideoExport(job,{accountId:job.stream_account_id,token:'test'});
 expect(report).toMatchObject({headStatus:302,redirect:{hostname:'videodelivery.net',sameOrigin:false,pathContainsUid:true,hasSignedQuery:true}});
 const out=JSON.stringify(report);expect(out).not.toContain(token);expect(out).not.toContain('private-query');expect(out).not.toContain('https://');expect(out).not.toContain('/'+uid+'/downloads/');
});
it('proves resolved HEAD with the same bounded redirect reader used by transfer',async()=>{
 const base=`https://customer-test.cloudflarestream.com/${uid}/downloads/default.mp4`,token=encode('{}')+'.'+encode(JSON.stringify({sub:uid,downloadable:true,exp:Math.floor(Date.now()/1000)+600}))+'.private-signature';
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({success:true,result:{uid,creator:`post-video:${jobId}`,requireSignedURLs:true}})).mockResolvedValueOnce(Response.json({success:true,result:{default:{status:'ready',url:base}}})).mockResolvedValueOnce(Response.json({success:true,result:{token}})).mockResolvedValueOnce(new Response(null,{status:302,headers:{location:base+'?opaque=secret'}})).mockResolvedValueOnce(new Response(null,{status:302,headers:{location:base+'?opaque=secret'}})).mockResolvedValueOnce(new Response(null,{status:200,headers:{'content-length':'123'}})));
 const report=await inspectPostVideoExport(job,{accountId:job.stream_account_id,token:'test'});
 expect(report).toMatchObject({headStatus:302,redirectResolution:'resolved',resolvedHeadStatus:200,resolvedHeadLength:123});expect(JSON.stringify(report)).not.toContain('opaque');expect(JSON.stringify(report)).not.toContain(token);
});
it('returns a redacted failing-hop trace without fetching an invalid MP4 path',async()=>{
 const base=`https://customer-test.cloudflarestream.com/${uid}/downloads/default.mp4`,target=`https://customer-test.cloudflarestream.com/${uid}/downloads/private-name.mp4?private=secret-value`,token=encode('{}')+'.'+encode(JSON.stringify({sub:uid,downloadable:true,exp:Math.floor(Date.now()/1000)+600}))+'.private-signature';
 const f=vi.fn().mockResolvedValueOnce(Response.json({success:true,result:{uid,creator:`post-video:${jobId}`,requireSignedURLs:true}})).mockResolvedValueOnce(Response.json({success:true,result:{default:{status:'ready',url:base}}})).mockResolvedValueOnce(Response.json({success:true,result:{token}})).mockResolvedValueOnce(new Response(null,{status:302,headers:{location:target}})).mockResolvedValueOnce(new Response(null,{status:302,headers:{location:target}}));vi.stubGlobal('fetch',f);
 const report=await inspectPostVideoExport(job,{accountId:job.stream_account_id,token:'test'});
 expect(report).toMatchObject({redirectResolution:'rejected',redirectTrace:[{status:302,validation:'path',pathnameShape:'/<video>/downloads/<opaque>.mp4',sameOrigin:true}],redirectError:'path'});expect(f.mock.calls.some(call=>String(call[0])===target)).toBe(false);
 const out=JSON.stringify(report);for(const secret of [target,token,'secret-value','private-name'])expect(out).not.toContain(secret);
});
it('checks a one-byte GET range even when the HEAD redirect is rejected',async()=>{
 const base=`https://customer-test.cloudflarestream.com/${uid}/downloads/default.mp4`,bad=`https://customer-test.cloudflarestream.com/${uid}/downloads/private-name.mp4?private=secret-value`,token=encode('{}')+'.'+encode(JSON.stringify({sub:uid,downloadable:true,exp:Math.floor(Date.now()/1000)+600}))+'.private-signature';
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({success:true,result:{uid,creator:`post-video:${jobId}`,requireSignedURLs:true}})).mockResolvedValueOnce(Response.json({success:true,result:{default:{status:'ready',url:base}}})).mockResolvedValueOnce(Response.json({success:true,result:{token}})).mockResolvedValueOnce(new Response(null,{status:302,headers:{location:bad}})).mockResolvedValueOnce(new Response(null,{status:302,headers:{location:bad}})).mockResolvedValueOnce(new Response(new Uint8Array([0]),{status:206,headers:{'content-range':'bytes 0-0/123','content-length':'1'}})));
 const report=await inspectPostVideoExport(job,{accountId:job.stream_account_id,token:'test'});expect(report).toMatchObject({redirectResolution:'rejected',rangeProbe:{status:206,total:123,verified:true}});expect(JSON.stringify(report)).not.toContain('secret-value');
});
