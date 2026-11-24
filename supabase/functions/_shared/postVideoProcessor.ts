import type { PostVideoPhase } from './postVideoPolicy.ts';
import { postVideoStreamConfig, postVideoStreamRequest, startPostVideoImport, readPostVideoStorageUsage, readPostVideoExport, readPostVideoTusOffset, uploadPostVideoTusPart } from './postVideoStream.ts';
import { readExportSize, videoPartRange } from './postVideoTransfer.ts';
import { readPostVideoSource, verifyPostVideoSource, verifyPostVideoOutput, transferPostVideoPart, POST_VIDEO_PRIVATE_BUCKET } from './postVideoR2.ts';
import { createMultipartUpload, completeMultipartUpload, type UploadedPart } from './r2MultipartService.ts';

export interface DurablePostVideoJob {
 id:string; user_id:string; post_id:string; attachment_id:string; source_generation:string;
 source_key:string; source_url:string; source_size:number; phase:PostVideoPhase; attempts:number; canary:boolean;
 stream_uid:string|null; stream_account_id:string|null; output_bucket:string; output_key:string; output_size:number;
 published_at:string|null; cancelled:boolean; runtime: { createStarted?:boolean; tusLocation?:string; tusOffset?:number; exportUrl?:string; uploadId?:string; parts?:UploadedPart[]; [key:string]:unknown };
}
export interface PostVideoControl { enabled:boolean; import_enabled:boolean; publish_enabled:boolean; delete_enabled:boolean; output_bucket:string }
type Patch = Record<string,unknown>;
export interface PostVideoPorts {
 current():Promise<{exists:boolean;unchanged:boolean;public:boolean}>;
 save(patch:Patch):Promise<unknown>; verifySource():Promise<void>; reserve():Promise<boolean>;
 createImport():Promise<{uid:string;location:string}>; tusOffset():Promise<number>; tusPart(offset:number):Promise<number>;
 video():Promise<Record<string,any>|null>; requestExport():Promise<unknown>; readExport():Promise<{ready:boolean;url:string|null}>;
 exportSize(url:string):Promise<number>; createR2():Promise<{uploadId:string}>; transfer():Promise<UploadedPart>; completeR2():Promise<unknown>;
 verifyOutput():Promise<void>; publish():Promise<unknown>; unreferenced():Promise<boolean>; deleteStream():Promise<number>;
}
const later = (seconds=30) => new Date(Date.now()+seconds*1000).toISOString();
export async function runPostVideoStep(j:DurablePostVideoJob, c:PostVideoControl, p:PostVideoPorts) {
 const wait=()=>p.save({next_attempt_at:later(),release_lease:true});
 const advance=(patch:Patch)=>p.save({attempts:0,last_error:null,next_attempt_at:later(1),release_lease:true,...patch});
 const current=await p.current();
 if(!current.exists || !current.unchanged) return advance({phase:'needs_review',outcome:'source_changed'});
 if(!current.public && !j.published_at) return advance({phase:'needs_review',outcome:'privacy_changed'});
 if(!c.enabled && !j.canary) return wait();
 switch(j.phase) {
  case 'queued': case 'waiting_capacity': {
   if(!c.import_enabled && !j.canary) return wait();
   await p.verifySource();
   if(!await p.reserve()) return advance({phase:'waiting_capacity',next_attempt_at:later(120)});
   return advance({phase:'importing',runtime:{...j.runtime,createStarted:false}});
  }
  case 'importing': {
   if(!j.stream_uid) {
    if(!c.import_enabled && !j.canary) return wait();
    if(j.runtime.createStarted) return advance({phase:'needs_review',outcome:'ambiguous_import'});
    // Persist intent before CREATE: a lost response must not create another billable VOD.
    await p.save({runtime:{...j.runtime,createStarted:true}});
    try {
     const result=await p.createImport();
     return advance({stream_uid:result.uid,runtime:{...j.runtime,createStarted:true,tusLocation:result.location,tusOffset:0}});
    } catch { return advance({phase:'needs_review',outcome:'ambiguous_import',last_error:'Import creation needs reconciliation'}); }
   }
   const offset=await p.tusOffset();
   if(offset>j.source_size || (offset!==j.source_size && offset%16777216!==0)) throw new Error('Unexpected durable TUS offset');
   if(offset===j.source_size) return advance({phase:'encoding',runtime:{...j.runtime,tusOffset:offset}});
   const next=await p.tusPart(offset);
   return advance({phase:next===j.source_size?'encoding':'importing',runtime:{...j.runtime,tusOffset:next}});
  }
  case 'encoding': {
   const video=await p.video();
   if(!video || video.liveInput || video.creator!==`post-video:${j.id}`) return advance({phase:'needs_review',outcome:'invalid_stream_identity'});
   if(video.status?.state==='error') return advance({phase:'needs_review',outcome:'encoding_failed'});
   if(video.status?.state!=='ready' || video.status?.pctComplete!==100) return wait();
   await p.requestExport();
   return advance({phase:'mp4_wait'});
  }
  case 'mp4_wait': {
   const exported=await p.readExport();
   if(!exported.ready || !exported.url) return wait();
   const size=await p.exportSize(exported.url);
   if(size>=j.source_size) {await p.verifySource();return advance({phase:'not_beneficial',outcome:'original_retained'});}
   return advance({phase:'r2_init',output_size:size,output_bucket:c.output_bucket,output_key:`optimized/${j.attachment_id}/${j.source_generation}.mp4`,runtime:{...j.runtime,exportUrl:exported.url,parts:[]}});
  }
  case 'r2_init': {
   if(j.runtime.r2CreateStarted && !j.runtime.uploadId) return advance({phase:'needs_review',outcome:'ambiguous_multipart'});
   await p.save({runtime:{...j.runtime,r2CreateStarted:true}});
   const upload=await p.createR2();
   return advance({phase:'r2_upload',runtime:{...j.runtime,r2CreateStarted:true,uploadId:upload.uploadId,parts:[]}});
  }
  case 'r2_upload': {
   const parts=j.runtime.parts||[];
   const done=parts.reduce((sum,part)=>sum+part.size,0);
   if(done>j.output_size) throw new Error('Invalid multipart progress');
   if(done===j.output_size) {
    // Lost completion response is recovered by exact authenticated HEAD/Range verification.
    try {await p.verifyOutput();} catch {await p.completeR2();}
    return advance({phase:'r2_verify'});
   }
   const part=await p.transfer();
   if(part.partNumber!==parts.length+1) throw new Error('Unexpected multipart part');
   return advance({runtime:{...j.runtime,parts:[...parts,part]}});
  }
  case 'r2_verify': await p.verifyOutput(); return advance({phase:'publishing',output_verified_at:new Date().toISOString()});
  case 'publishing': {
   if(!c.publish_enabled && !j.canary) return wait();
   await p.verifyOutput();
   if(j.output_size>=j.source_size) return advance({phase:'needs_review',outcome:'output_not_smaller'});
   await p.publish();return;
  }
  case 'not_beneficial': case 'stream_delete_pending': {
   if(!c.delete_enabled && !j.canary) return wait();
   if(!j.stream_uid || !j.stream_account_id) return advance({phase:'needs_review',outcome:'missing_stream_identity'});
   if(j.phase==='stream_delete_pending') {
    if(!j.published_at) return advance({phase:'needs_review',outcome:'not_published'});
    await p.verifyOutput();
   } else await p.verifySource();
   const video=await p.video();
   if(video && (video.liveInput || video.creator!==`post-video:${j.id}`)) return advance({phase:'needs_review',outcome:'invalid_stream_identity'});
   if(!await p.unreferenced()) return wait();
   const status=await p.deleteStream();
   if(status!==404 && (status<200 || status>=300)) throw new Error(`Stream delete failed (${status})`);
   return advance({phase:'complete',stream_deleted_at:new Date().toISOString(),outcome:j.phase==='not_beneficial'?'original_retained':'optimized'});
  }
  default:return;
 }
}

// Structural client type avoids editing generated Supabase types for a reviewed, new migration.
type Admin = any;
async function checked(result:PromiseLike<{data:any;error:any}>) {const r=await result;if(r.error)throw new Error('Post video database operation failed');return r.data;}
export async function hasPostVideoStreamReferences(admin:Admin, uid:string, jobId:string):Promise<boolean> {
 const sources:[string,string][]=[['live_replays','stream_uid,cloudflare_video_uid'],['live_sessions','cloudflare_video_uid'],['posts','video_url,media_urls,metadata'],['post_attachments','file_url'],['comments','video_url'],['profiles','cover_url'],['post_video_processing_jobs','id,stream_uid']];
 for(const [table,columns] of sources) {
  for(let offset=0;;offset+=500) {
   const rows=await checked(admin.from(table).select(columns).range(offset,offset+499));
   if(!Array.isArray(rows)) throw new Error('Missing reference scan');
   if(rows.some(row=>(table!=='post_video_processing_jobs'||row.id!==jobId)&&JSON.stringify(row).includes(uid)))return true;
   if(rows.length<500)break;
  }
 }
 return false;
}
export async function processPostVideoJob(admin:Admin,jobId:string) {
 const lease=crypto.randomUUID();
 let j=await checked(admin.rpc('claim_post_video_job',{p_job_id:jobId,p_lease_token:lease,p_lease_seconds:180})) as DurablePostVideoJob|null;
 if(!j)return {phase:'busy' as const};
 const c=await checked(admin.from('post_video_processing_control').select('*').eq('id',true).single()) as PostVideoControl;
 const config=postVideoStreamConfig();
 const save=async(patch:Patch)=>{
  const next=await checked(admin.rpc('advance_post_video_job',{p_job_id:jobId,p_lease_token:lease,p_expected_phase:j!.phase,p_patch:patch}));
  if(!next)throw new Error('Lost job lease');
  j=next;return next;
 };
 const identity=()=>{if(!j!.stream_uid || j!.stream_account_id!==config.accountId)throw new Error('Stream account mismatch');return j!.stream_uid;};
 const ports:PostVideoPorts={
  save,
  current:async()=>{
   const post=await checked(admin.from('posts').select('id,user_id,visibility,deleted_at').eq('id',j!.post_id).maybeSingle());
   const attachment=await checked(admin.from('post_attachments').select('file_url,storage_key,size_bytes').eq('id',j!.attachment_id).eq('post_id',j!.post_id).maybeSingle());
   return {exists:!!post&&!post.deleted_at&&!!attachment,public:post?.visibility==='public',unchanged:post?.user_id===j!.user_id&&!!attachment&&(j!.published_at?attachment.file_url===(j as any).gateway_url:attachment.file_url===j!.source_url&&attachment.storage_key===j!.source_key&&attachment.size_bytes===j!.source_size)};
  },
  verifySource:()=>verifyPostVideoSource(j!),
  reserve:async()=>{const usage=await readPostVideoStorageUsage();return !!await checked(admin.rpc('reserve_post_video_capacity',{p_job_id:jobId,p_lease_token:lease,p_account_id:config.accountId,p_used_minutes:usage.usedMinutes,p_limit_minutes:usage.limitMinutes}));},
  createImport:()=>startPostVideoImport(j!),
  tusOffset:()=>readPostVideoTusOffset(j!.runtime.tusLocation!,identity()),
  tusPart:async offset=>{const r=videoPartRange(j!.source_size,offset/16777216+1);const bytes=await readPostVideoSource(j!,r.start,r.end);return uploadPostVideoTusPart(j!.runtime.tusLocation!,identity(),offset,bytes);},
  video:async()=>{const uid=identity();try{const r=await postVideoStreamRequest(`/${uid}`);const data=await r.json();if(!data.success)throw new Error('Invalid video response');return data.result;}catch(e){if(e instanceof Error&&e.message==='Stream request failed (404)')return null;throw e;}},
  requestExport:()=>postVideoStreamRequest(`/${identity()}/downloads`,{method:'POST'}),
  readExport:()=>readPostVideoExport(identity()),exportSize:readExportSize,
  createR2:()=>{if(j!.output_bucket!==POST_VIDEO_PRIVATE_BUCKET)throw new Error('Private bucket mismatch');return createMultipartUpload(j!.output_key,'video/mp4',j!.output_bucket);},
  transfer:()=>transferPostVideoPart(j as Parameters<typeof transferPostVideoPart>[0]),
  completeR2:()=>completeMultipartUpload({bucket:j!.output_bucket,key:j!.output_key,uploadId:j!.runtime.uploadId!,parts:j!.runtime.parts!}),
  verifyOutput:()=>verifyPostVideoOutput(j!.output_bucket,j!.output_key,j!.output_size),
  publish:async()=>{const next=await checked(admin.rpc('publish_post_video_output',{p_job_id:jobId,p_lease_token:lease}));if(!next)throw new Error('Publication fenced out');j=next;await save({release_lease:true,next_attempt_at:later(1)});return next;},
  unreferenced:()=>hasPostVideoStreamReferences(admin,identity(),j!.id).then(found=>!found),
  deleteStream:async()=>{try{const r=await postVideoStreamRequest(`/${identity()}`,{method:'DELETE'});await r.body?.cancel();return r.status;}catch(e){if(e instanceof Error&&e.message==='Stream request failed (404)')return 404;throw e;}},
 };
 try {await runPostVideoStep(j,c,ports);} catch {
  const attempts=j.attempts+1;
  await save({attempts,phase:attempts>=5?'needs_review':j.phase,last_error:'Background operation failed; retry scheduled',next_attempt_at:later(Math.min(480,30*2**(attempts-1))),release_lease:true});
 }
 return {phase:j!.phase};
}
export async function handlePostVideoWebhook(admin:Admin,video:{uid?:string}|null,_event:unknown,accountId=postVideoStreamConfig().accountId):Promise<boolean> {
 if(!video?.uid)return false;
 const job=await checked(admin.from('post_video_processing_jobs').select('id,stream_account_id').eq('stream_uid',video.uid).eq('stream_account_id',accountId).maybeSingle());
 if(!job)return false;
 await checked(admin.from('post_video_processing_jobs').update({next_attempt_at:new Date().toISOString()}).eq('id',job.id));
 return true;
}
