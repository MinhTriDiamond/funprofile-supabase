import { describe, it, expect, vi } from 'vitest';
import { runPostVideoStep, handlePostVideoWebhook } from '../../supabase/functions/_shared/postVideoProcessor';
const uid='a'.repeat(32), account='b'.repeat(32);
const base:any={id:'job',user_id:'owner',post_id:'post',attachment_id:'attachment',source_size:1000,source_key:'videos/owner/a.mov',source_url:'source',source_generation:'generation',phase:'queued',runtime:{},attempts:0,stream_uid:uid,stream_account_id:account};
function setup(phase:string) {
 const job={...base,phase,runtime:{}};
 const ports:any={current:vi.fn().mockResolvedValue({public:true,unchanged:true,exists:true}),
 save:vi.fn().mockImplementation(async(p:any)=>Object.assign(job,p)), verifySource:vi.fn().mockResolvedValue(undefined), reserve:vi.fn().mockResolvedValue(true),
 createImport:vi.fn().mockResolvedValue({uid,location:'location'}), tusOffset:vi.fn().mockResolvedValue(1000), tusPart:vi.fn(),
 video:vi.fn().mockResolvedValue({uid,creator:'post-video:job',requireSignedURLs:true,liveInput:null,status:{state:'ready',pctComplete:100}}), requestExport:vi.fn(),
 readExport:vi.fn().mockResolvedValue({ready:false}), exportSize:vi.fn().mockResolvedValue(500), createR2:vi.fn(), transfer:vi.fn(), completeR2:vi.fn(),
 verifyOutput:vi.fn(),publish:vi.fn().mockResolvedValue({...job,phase:'stream_delete_pending'}), unreferenced:vi.fn().mockResolvedValue(true), deleteStream:vi.fn().mockResolvedValue(204)};
 return {job,ports,control:{enabled:true,import_enabled:true,publish_enabled:true,delete_enabled:true,output_bucket:'fun-rich-video-optimized'}};
}
describe('durable post video processor',()=>{
 it('advances with no browser session or tab',async()=>{const s=setup('importing');await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.save).toHaveBeenCalledWith(expect.objectContaining({phase:'encoding'}));});
 it('does not transfer until the MP4 export explicitly becomes ready',async()=>{const s=setup('mp4_wait');await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.transfer).not.toHaveBeenCalled();expect(s.ports.createR2).not.toHaveBeenCalled();});
 it('stops an ambiguous creation instead of issuing another import',async()=>{const s=setup('importing');s.job.stream_uid=null;s.job.runtime={createStarted:true};await runPostVideoStep(s.job,s.control,s.ports);expect(s.job.phase).toBe('needs_review');expect(s.ports.createImport).not.toHaveBeenCalled();});
 it('does not publish or delete when R2 verification fails',async()=>{const s=setup('r2_verify');s.ports.verifyOutput.mockRejectedValue(new Error('size'));await expect(runPostVideoStep(s.job,s.control,s.ports)).rejects.toThrow();expect(s.ports.publish).not.toHaveBeenCalled();expect(s.ports.deleteStream).not.toHaveBeenCalled();});
 it('keeps pending deletion when the provider fails',async()=>{const s=setup('stream_delete_pending');s.job.published_at='now';s.ports.deleteStream.mockResolvedValue(500);await expect(runPostVideoStep(s.job,s.control,s.ports)).rejects.toThrow();expect(s.job.phase).toBe('stream_delete_pending');});
 it('accepts a missing owned VOD as idempotent deletion',async()=>{const s=setup('stream_delete_pending');s.job.published_at='now';s.ports.video.mockResolvedValue(null);s.ports.deleteStream.mockResolvedValue(404);await runPostVideoStep(s.job,s.control,s.ports);expect(s.job.phase).toBe('complete');});
 it.each(['live','foreign','referenced'])('never deletes %s VOD',async cause=>{const s=setup('stream_delete_pending');s.job.published_at='now';if(cause==='live')s.ports.video.mockResolvedValue({creator:'post-video:job',liveInput:'live'});if(cause==='foreign')s.ports.video.mockResolvedValue({creator:'other'});if(cause==='referenced')s.ports.unreferenced.mockResolvedValue(false);await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.deleteStream).not.toHaveBeenCalled();});
 it('does not publish when the post becomes private',async()=>{const s=setup('publishing');s.ports.current.mockResolvedValue({exists:true,unchanged:true,public:false});await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.publish).not.toHaveBeenCalled();});
 it('repeated webhooks only schedule the matched job, never import',async()=>{
  const query:any={select:vi.fn(()=>query),eq:vi.fn(()=>query),maybeSingle:vi.fn().mockResolvedValue({data:{id:'job',stream_account_id:account}}),update:vi.fn(()=>query)};
  query.then=(resolve:any)=>Promise.resolve({error:null}).then(resolve);
  const admin:any={from:vi.fn(()=>query)};
  expect(await handlePostVideoWebhook(admin,{uid},{} ,account)).toBe(true);
  expect(await handlePostVideoWebhook(admin,{uid},{} ,account)).toBe(true);
  expect(query.update).toHaveBeenCalledTimes(2);
 });
});

import { runCancelledPostVideoStep } from '../../supabase/functions/_shared/postVideoProcessor';
describe('cancelled post cleanup',()=>{
 it('never republishes a deleted post and aborts only its known multipart',async()=>{
  const s=setup('cancelled');s.job.cancelled=true;s.job.runtime={uploadId:'known'};
  const abort=vi.fn();await runCancelledPostVideoStep(s.job,{...s.ports,abortMultipart:abort});
  expect(s.ports.publish).not.toHaveBeenCalled();expect(abort).toHaveBeenCalledTimes(1);expect(s.ports.deleteStream).toHaveBeenCalled();expect(s.job.runtime.cleanupDone).toBe(true);
 });
 it('does not mark cleanup complete if abort fails',async()=>{
  const s=setup('cancelled');s.job.cancelled=true;s.job.runtime={uploadId:'known'};
  await expect(runCancelledPostVideoStep(s.job,{...s.ports,abortMultipart:vi.fn().mockRejectedValue(new Error('R2 unavailable'))})).rejects.toThrow();expect(s.job.runtime.cleanupDone).not.toBe(true);
 });
 it('retains an ambiguous unregistered import for operator reconciliation',async()=>{
  const s=setup('cancelled');s.job.cancelled=true;s.job.stream_uid=null;s.job.runtime={createStarted:true};
  await runCancelledPostVideoStep(s.job,{...s.ports,abortMultipart:vi.fn()});expect(s.ports.deleteStream).not.toHaveBeenCalled();expect(s.job.runtime.cleanupDone).not.toBe(true);
 });
});

describe('review regressions',()=>{
 it('exports only when readyToStream and string completion both confirm full encoding',async()=>{
  const s=setup('encoding');s.ports.video.mockResolvedValue({creator:'post-video:job',readyToStream:true,status:{state:'ready',pctComplete:'100.000000'}});
  await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.requestExport).toHaveBeenCalledTimes(1);
 });
 it('waits if ready state lacks readyToStream confirmation',async()=>{
  const s=setup('encoding');s.ports.video.mockResolvedValue({creator:'post-video:job',readyToStream:false,status:{state:'ready',pctComplete:100}});
  await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.requestExport).not.toHaveBeenCalled();
 });
 it('never bypasses the delete switch for a canary',async()=>{
  const s=setup('stream_delete_pending');s.job.canary=true;s.job.published_at='now';s.control.delete_enabled=false;
  await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.deleteStream).not.toHaveBeenCalled();
 });
});
it('rechecks admission immediately before creating a Stream upload',async()=>{
 const s=setup('importing');s.job.stream_uid=null;s.job.runtime={createStarted:false};s.ports.reserve.mockResolvedValue(false);
 await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.reserve).toHaveBeenCalled();expect(s.ports.createImport).not.toHaveBeenCalled();
});
it('requires per-job approval before canary DELETE even when cleanup is globally enabled',async()=>{
 const s=setup('stream_delete_pending');s.job.canary=true;s.job.published_at='now';s.job.delete_approved=false;
 await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.deleteStream).not.toHaveBeenCalled();
});
it('never uploads source bytes to a provisioned Stream video unless private mode is confirmed',async()=>{
 const s=setup('importing');s.ports.tusOffset.mockResolvedValue(0);s.ports.video.mockResolvedValue({creator:'post-video:job',requireSignedURLs:false});
 await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.tusPart).not.toHaveBeenCalled();expect(s.job.phase).toBe('needs_review');
});
it('resumes from a partially accepted TUS PATCH without restarting the upload',async()=>{
 const s=setup('importing');s.job.source_size=40*1024*1024;s.job.runtime={privateVerified:true};s.ports.tusOffset.mockResolvedValue(1024*1024);s.ports.tusPart.mockResolvedValue(17*1024*1024);
 await runPostVideoStep(s.job,s.control,s.ports);expect(s.ports.tusPart).toHaveBeenCalledWith(1024*1024);expect(s.job.runtime.tusOffset).toBe(17*1024*1024);
});
