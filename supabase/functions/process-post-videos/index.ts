import {processOriginalRetention,inspectOriginalRetention,probeOriginalRetentionR2} from '../_shared/postVideoOriginalRetention.ts';
import { inspectPostVideoExport } from '../_shared/postVideoExportDiagnostics.ts';
import { probePostVideoInfrastructure } from '../_shared/postVideoInfrastructure.ts';
import { corsHeaders, json, requireUser, createAdminClient, HttpError } from '../_shared/httpAuth.ts';
import { processPostVideoJob, inspectPostVideoCleanup } from '../_shared/postVideoProcessor.ts';

function matchesSecret(actual:string|null,expected:string|undefined) {
 if(!actual||!expected||actual.length!==expected.length)return false;
 let difference=0;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return difference===0;
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:corsHeaders});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try {
  const admin=createAdminClient();
  const cron=matchesSecret(req.headers.get('x-post-video-cron-secret'),Deno.env.get('POST_VIDEO_CRON_SECRET'));
  if(!cron) {
   const user=await requireUser(req);
   const {data,error}=await admin.rpc('has_role',{_user_id:user.id,_role:'admin'});
   if(error||data!==true)return json({error:'Admin required'},403);
  }
  const body=await req.json();
  if(!['tick','retry','dry-run','probe-infra','source-dry-run','source-probe'].includes(body.action))return json({error:'Invalid action'},400);
  if(body.jobId!==undefined&&(typeof body.jobId!=='string'||!/^[a-f0-9-]{36}$/.test(body.jobId)))return json({error:'Invalid jobId'},400);
  if(body.action==='probe-infra'){
   if(body.jobId){
    const {data:job,error} = await (admin as any).from('post_video_processing_jobs').select('id,canary,cancelled,phase,stream_uid,stream_account_id').eq('id',body.jobId).maybeSingle();
    if(error||!job)return json({error:'Canary unavailable'},404);
    return json({inspection:await inspectPostVideoExport(job)});
   }
   return json({probe:await probePostVideoInfrastructure()});
  }
  if(body.action==='source-probe')return json({probe:await probeOriginalRetentionR2()});
  if(body.action==='source-dry-run'){if(!body.jobId)return json({error:'jobId required'},400);return json({inspection:await inspectOriginalRetention(admin,body.jobId)});}
  if(body.action==='dry-run'&&body.jobId)return json({inspection:await inspectPostVideoCleanup(admin,body.jobId)});
  // Retry only wakes an eligible state; ambiguous side effects require operator reconciliation.
  if(body.action==='retry') {
   if(cron)return json({error:'Admin JWT required for retry'},403);
   if(!body.jobId)return json({error:'jobId required'},400);
   const {data,error}=await admin.from('post_video_processing_jobs' as never).update({next_attempt_at:new Date().toISOString()} as never).eq('id',body.jobId).not('phase','in','(complete,cancelled,needs_review,failed)').select('id');
   if(error)throw error;
   return json({scheduled:!!data?.length});
  }
  const retentionResults=[];
  if(body.action==='tick'){
   const {data:control,error:controlError}=await (admin as any).from('post_video_processing_control').select('original_delete_enabled').eq('id',true).single();
   if(controlError)throw controlError;
   if(control.original_delete_enabled){
    let sources=(admin as any).from('post_video_processing_jobs').select('id').eq('phase','complete').eq('outcome','optimized').eq('cancelled',false).is('source_deleted_at',null).lt('source_cleanup_attempts',5).lte('published_at',new Date(Date.now()-86400000).toISOString()).lte('source_cleanup_next_at',new Date().toISOString()).order('source_cleanup_next_at').limit(1);
    if(body.jobId)sources=sources.eq('id',body.jobId);
    const {data,error}=await sources;if(error)throw error;
    for(const source of data||[])retentionResults.push({id:source.id,...await processOriginalRetention(admin,source.id)});
   }
  }
  let query=(admin as any).from('post_video_processing_jobs').select('id,phase,next_attempt_at').eq('cancelled',false).not('phase','in','(complete,cancelled,needs_review,failed)').lte('next_attempt_at',new Date().toISOString()).order('next_attempt_at').limit(1);
  if(body.jobId)query=query.eq('id',body.jobId);
  let {data:jobs,error}=await query;if(error)throw error;
  let cleanup=false;
  if(!jobs?.length){
   let cleanupQuery=(admin as any).from('post_video_processing_jobs').select('id,phase,next_attempt_at').eq('cancelled',true).eq('phase','cancelled').not('runtime','cs','{"cleanupDone":true}').lte('next_attempt_at',new Date().toISOString()).order('next_attempt_at').limit(1);
   if(body.jobId)cleanupQuery=cleanupQuery.eq('id',body.jobId);
   const result=await cleanupQuery;
   if(result.error)throw result.error;jobs=result.data;cleanup=true;
  }
  if(body.action==='dry-run')return json({jobs:jobs||[]});
  const results=[...retentionResults];
  for(const job of jobs||[])results.push({id:job.id,...await processPostVideoJob(admin,job.id,cleanup)});
  return json({results});
 }catch(e){return json({error:e instanceof HttpError?e.message:'Background processing request failed'},e instanceof HttpError?e.status:500);}
});
