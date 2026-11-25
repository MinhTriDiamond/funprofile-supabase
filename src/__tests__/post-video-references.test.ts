import { describe,it,expect,vi } from 'vitest';
import { collectPostVideoReferences,isPostVideoManagedStream } from '../../supabase/functions/_shared/postVideoReferences';
function adminFor(data:Record<string,any[]>,errorTable?:string){return {from:(table:string)=>({select:()=>({range:async(start:number,end:number)=>({data:(data[table]||[]).slice(start,end+1),error:table===errorTable?{message:'db unavailable'}:null})})})};}
describe('processing asset references',()=>{
 it.each(['importing','encoding','mp4_wait','r2_upload','complete','cancelled'])('protects assets of %s jobs, including durable outputs',async phase=>{
  const refs=await collectPostVideoReferences(adminFor({post_video_processing_jobs:[{phase,stream_uid:'a'.repeat(32),source_key:'videos/owner/source.mov',output_key:'optimized/output.mp4'}]}));
  expect(refs.protectedStreamUids.has('a'.repeat(32))).toBe(true);expect(refs.protectedR2Keys.has('optimized/output.mp4')).toBe(true);expect(refs.protectedR2Keys.has('videos/owner/source.mov')).toBe(true);
 });
 it.each(['post_video_processing_jobs','post_attachments'])('fails closed when %s lookup fails',async table=>{
  await expect(collectPostVideoReferences(adminFor({},table))).rejects.toThrow();
 });
 it('scans beyond the first database page and protects attachment-only media',async()=>{
  const attachments=Array.from({length:501},(_,i)=>({storage_key:`videos/${i}.mp4`,file_url:i===500?'https://videodelivery.net/'+ 'b'.repeat(32)+'/manifest/video.m3u8':'image.jpg'}));
  const refs=await collectPostVideoReferences(adminFor({post_attachments:attachments}));expect(refs.protectedR2Keys.has('videos/500.mp4')).toBe(true);expect(refs.protectedStreamUids.has('b'.repeat(32))).toBe(true);
 });
 it('protects provisioned imports even if the CREATE response was lost before UID persistence',()=>{
  expect(isPostVideoManagedStream({creator:'post-video:10000000-0000-0000-0000-000000000001'})).toBe(true);
  expect(isPostVideoManagedStream({liveInput:'rtmp'})).toBe(false);
 });
});

import { hasPostVideoStreamReferences } from '../../supabase/functions/_shared/postVideoProcessor';
it.each([true,false])('uses one bounded boolean database reference probe (%s)',async referenced=>{
 const abortSignal=vi.fn().mockResolvedValue({data:referenced,error:null}),rpc=vi.fn().mockReturnValue({abortSignal});
 const admin={rpc,from:()=>{throw new Error('Full row export forbidden');}};
 expect(await hasPostVideoStreamReferences(admin,'c'.repeat(32),'10000000-0000-0000-0000-000000000001')).toBe(referenced);
 expect(rpc).toHaveBeenCalledWith('has_post_video_stream_references',{p_stream_uid:'c'.repeat(32),p_excluded_job_id:'10000000-0000-0000-0000-000000000001'});expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
});
it.each([{data:null,error:null},{data:false,error:{message:'database unavailable'}},{data:[],error:null}])('fails closed on an invalid reference probe %j',async result=>{
 const admin={rpc:()=>({abortSignal:async()=>result}),from:()=>{throw new Error('Full row export forbidden');}};
 await expect(hasPostVideoStreamReferences(admin,'c'.repeat(32),'10000000-0000-0000-0000-000000000001')).rejects.toThrow();
});
it('does not change ordinary image deletion through the video retention guard',async()=>{
 const refs=await collectPostVideoReferences(adminFor({post_attachments:[{storage_key:'posts/photo.jpg',file_url:'https://media.fun.rich/posts/photo.jpg',file_type:'image'}]}));
 expect(refs.protectedR2Keys.has('posts/photo.jpg')).toBe(false);
});
