import {verifyPostVideoOutput,verifyPostVideoSource,deleteRetiredPostVideoSource,isPostVideoSourceMissing} from './postVideoR2.ts';
interface RetentionJob {id:string;published_at:string;source_delete_started_at:string|null;source_deleted_at:string|null;source_delete_receipt:any}
interface Ports {verifyOutput():Promise<unknown>;verifySource():Promise<string>;arm(etag:string):Promise<boolean>;deleteSource():Promise<unknown>;sourceMissing():Promise<boolean>;finish():Promise<unknown>;fail():Promise<unknown>}
export async function runOriginalRetentionStep(job:RetentionJob,p:Ports) {
 if(job.source_deleted_at||!job.published_at||!Number.isFinite(Date.parse(job.published_at))||Date.parse(job.published_at)>Date.now()-86400000)return;
 try{
  await p.verifyOutput();
  if(job.source_delete_started_at&&job.source_delete_receipt?.etag&&await p.sourceMissing()){
   if(!await p.arm(job.source_delete_receipt.etag))return p.fail();
   return p.finish();
  }
  const etag=await p.verifySource();
  if(!await p.arm(etag))return p.fail();
  await p.verifyOutput();await p.verifySource();
  await p.deleteSource();
  if(!await p.sourceMissing())throw new Error('Missing source deletion proof');
  await p.finish();
 }catch{await p.fail();}
}
async function checked(q:PromiseLike<{data:any;error:any}>){const r=await q;if(r.error)throw new Error('Source retention database proof failed');return r.data;}
export async function processOriginalRetention(admin:any,jobId:string){
 const lease=crypto.randomUUID();
 const job=await checked(admin.rpc('claim_post_video_source_cleanup',{p_job_id:jobId,p_lease:lease}));
 if(!job)return {phase:'source_cleanup_busy'};
 let finished=false;
 await runOriginalRetentionStep(job,{
  verifyOutput:()=>verifyPostVideoOutput(job.output_bucket,job.output_key,job.output_size),
  verifySource:()=>verifyPostVideoSource(job),
  arm:etag=>checked(admin.rpc('arm_post_video_source_cleanup',{p_job_id:jobId,p_lease:lease,p_etag:etag,p_bucket:Deno.env.get('R2_BUCKET_NAME')||Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')}).abortSignal(AbortSignal.timeout(65000))),
  deleteSource:()=>deleteRetiredPostVideoSource(job),sourceMissing:()=>isPostVideoSourceMissing(job),
  finish:async()=>{finished=await checked(admin.rpc('finish_post_video_source_cleanup',{p_job_id:jobId,p_lease:lease,p_deleted:true}));if(!finished)throw new Error('Source completion fenced');},
  fail:()=>checked(admin.rpc('finish_post_video_source_cleanup',{p_job_id:jobId,p_lease:lease,p_deleted:false})),
 });
 return {phase:finished?'source_deleted':'source_cleanup_held'};
}
export async function inspectOriginalRetention(admin:any,id:string){
 const j=await checked(admin.from('post_video_processing_jobs').select('*').eq('id',id).maybeSingle());if(!j)return {jobId:id,eligible:false,reason:'not_found'};
 const c=await checked(admin.from('post_video_processing_control').select('original_delete_enabled').eq('id',true).single());
 const referenced=await checked(admin.rpc('has_post_video_source_references',{p_job_id:id}).abortSignal(AbortSignal.timeout(65000)));
 let outputVerified=false,sourceVerified=false;try{await verifyPostVideoOutput(j.output_bucket,j.output_key,j.output_size);outputVerified=true;}catch{}
 try{await verifyPostVideoSource(j);sourceVerified=true;}catch{}
 const attachment=await checked(admin.from('post_attachments').select('post_id,file_url,storage_key,size_bytes').eq('id',j.attachment_id).maybeSingle());
 const post=await checked(admin.from('posts').select('user_id,deleted_at').eq('id',j.post_id).maybeSingle());
 const currentPublication=!!post&&!post.deleted_at&&post.user_id===j.user_id&&attachment?.post_id===j.post_id&&attachment?.file_url===j.gateway_url&&attachment?.storage_key===j.output_key&&attachment?.size_bytes===j.output_size;
 const dueAt=j.published_at?new Date(Date.parse(j.published_at)+86400000).toISOString():null;
 const due=!!dueAt&&Date.parse(dueAt)<=Date.now();
 const leaseActive=!!j.source_cleanup_until&&Date.parse(j.source_cleanup_until)>Date.now();
 const retryDue=Date.parse(j.source_cleanup_next_at)<=Date.now()&&j.source_cleanup_attempts<5;
 return {jobId:id,enabled:c.original_delete_enabled===true,dueAt,due,phase:j.phase,cancelled:j.cancelled,sourceDeleted:!!j.source_deleted_at,deleteStarted:!!j.source_delete_started_at,attempts:j.source_cleanup_attempts,nextAttemptAt:j.source_cleanup_next_at,leaseActive,currentPublication,referenced,outputVerified,sourceVerified,eligible:c.original_delete_enabled===true&&currentPublication&&retryDue&&!leaseActive&&due&&j.phase==='complete'&&j.outcome==='optimized'&&!j.cancelled&&!j.source_deleted_at&&!!j.stream_deleted_at&&!!j.output_verified_at&&outputVerified&&sourceVerified&&referenced===false};
}

/** Exercises delete permission on only a new synthetic source, never a user object. */
export async function probeOriginalRetentionR2(){
 const {signedR2Request}=await import('./r2MultipartService.ts');
 const owner='00000000-0000-0000-0000-000000000000',key=`videos/${owner}/source-retention-probe-${crypto.randomUUID()}.mov`;
 const bucket=Deno.env.get('R2_BUCKET_NAME')||Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME');
 let created=false;const job={user_id:owner,source_key:key,source_size:1024,runtime:{sourceEtag:''}};
 try{
  const put=await signedR2Request({method:'PUT',bucket,key,headers:{'If-None-Match':'*','content-type':'video/quicktime'},body:new Uint8Array(1024)});await put.body?.cancel();if(!put.ok)throw new Error('Source probe creation failed');created=true;
  job.runtime.sourceEtag=await verifyPostVideoSource(job);
  await deleteRetiredPostVideoSource(job);
  if(!await isPostVideoSourceMissing(job))throw new Error('Source probe deletion unconfirmed');
  return {fixtureDeleted:true,bytes:1024};
 }finally{
  if(created){const r=await signedR2Request({method:'DELETE',bucket,key});await r.body?.cancel();}
 }
}
