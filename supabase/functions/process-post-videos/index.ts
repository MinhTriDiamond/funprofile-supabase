import { corsHeaders, json, requireUser, createAdminClient, HttpError } from '../_shared/httpAuth.ts';
import { processPostVideoJob } from '../_shared/postVideoProcessor.ts';

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
  if(!['tick','retry','dry-run'].includes(body.action))return json({error:'Invalid action'},400);
  if(body.jobId!==undefined&&(typeof body.jobId!=='string'||!/^[a-f0-9-]{36}$/.test(body.jobId)))return json({error:'Invalid jobId'},400);
  // Retry only wakes an eligible state; ambiguous side effects require operator reconciliation.
  if(body.action==='retry') {
   if(cron)return json({error:'Admin JWT required for retry'},403);
   if(!body.jobId)return json({error:'jobId required'},400);
   const {data,error}=await admin.from('post_video_processing_jobs' as never).update({next_attempt_at:new Date().toISOString()} as never).eq('id',body.jobId).not('phase','in','(complete,cancelled,needs_review,failed)').select('id');
   if(error)throw error;
   return json({scheduled:!!data?.length});
  }
  let query=(admin as any).from('post_video_processing_jobs').select('id,phase,next_attempt_at').eq('cancelled',false).not('phase','in','(complete,cancelled,needs_review,failed)').lte('next_attempt_at',new Date().toISOString()).order('next_attempt_at').limit(1);
  if(body.jobId)query=query.eq('id',body.jobId);
  const {data:jobs,error}=await query;if(error)throw error;
  if(body.action==='dry-run')return json({jobs:jobs||[]});
  const results=[];
  for(const job of jobs||[])results.push({id:job.id,...await processPostVideoJob(admin,job.id)});
  return json({results});
 }catch(e){return json({error:e instanceof HttpError?e.message:'Background processing request failed'},e instanceof HttpError?e.status:500);}
});
