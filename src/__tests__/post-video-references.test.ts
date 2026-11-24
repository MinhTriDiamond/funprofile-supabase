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
