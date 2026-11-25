import {postVideoStreamConfig,postVideoStreamRequest,type PostVideoStreamConfig,assertStreamUid} from './postVideoStream.ts';
import {validateExportUrl,fetchPostVideoExportResponse,describePostVideoRedirect,postVideoExportFailureCode,readExactRangeResponse} from './postVideoTransfer.ts';
/** Operator-only canary probe. No provider URL, JWT, body, or error message is returned. */
export async function inspectPostVideoExport(job:{id:string;canary:boolean;cancelled:boolean;phase:string;stream_uid:string|null;stream_account_id:string|null},config:PostVideoStreamConfig=postVideoStreamConfig()) {
 if(!job.canary||job.cancelled||!['mp4_wait','needs_review'].includes(job.phase)||job.stream_account_id!==config.accountId||!job.stream_uid)throw new Error('Canary export diagnostic unavailable');
 const uid=job.stream_uid;assertStreamUid(uid);
 let stage='video';
 const report:Record<string,unknown>={};
 try {
  const video=await(await postVideoStreamRequest(`/${uid}`,{},config)).json();
  if(!video.success||video.result?.uid!==uid||video.result?.creator!==`post-video:${job.id}`||video.result?.requireSignedURLs!==true||video.result?.liveInput)throw new Error('Private owned VOD required');
  report.privateOwnedVod=true;
  stage='downloads';const downloads=await(await postVideoStreamRequest(`/${uid}/downloads`,{},config)).json();
  const download=downloads.result?.default;report.downloadStatus=['ready','inprogress','error'].includes(download?.status)?download.status:'unknown';
  if(!downloads.success||download?.status!=='ready'||typeof download.url!=='string')return {...report,stage};
  stage='download-url-validation';const base=validateExportUrl(download.url,uid);report.baseUrlTrusted=true;
  stage='token';const data=await(await postVideoStreamRequest(`/${uid}/token`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({exp:Math.floor(Date.now()/1000)+600,downloadable:true})},config)).json();
  if(!data.success||typeof data.result?.token!=='string')return {...report,stage,error:'invalid-token-response'};
  const token=data.result.token;let claims;
  try{claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}catch{return {...report,stage,error:'invalid-token-claims'};}
  report.token={subjectMatches:claims.sub===uid,downloadable:claims.downloadable===true,expirationType:typeof claims.exp,expirationNumericFuture:Number.isFinite(Number(claims.exp))&&Number(claims.exp)>Date.now()/1000};
  stage='signed-url-validation';base.pathname=`/${token}/downloads/default.mp4`;
  try{validateExportUrl(base.href,uid);report.signedUrlValid=true;}catch{return {...report,stage,signedUrlValid:false};}
  stage='head';const response=await fetch(base,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(20000)});
  const length=Number(response.headers.get('content-length'));await response.body?.cancel();
  let redirect;
  if(response.headers.has('location')){
   try{
    const target=new URL(response.headers.get('location')!,base);
    redirect=describePostVideoRedirect(target,uid,base.origin);
   }catch{redirect={invalid:true};}
  }
  const result={...report,stage,headStatus:response.status,headLength:Number.isSafeInteger(length)&&length>0?length:null,hasLocation:response.headers.has('location'),...(redirect?{redirect}:{})};
  const resolution:Record<string,unknown>={};
  if([301,302,303,307,308].includes(response.status)){
   const trace:Record<string,unknown>[]=[];
   try{const resolved=await fetchPostVideoExportResponse(base.href,{method:'HEAD',onRedirect:metadata=>trace.push(metadata)});const size=Number(resolved.headers.get('content-length'));await resolved.body?.cancel();Object.assign(resolution,{redirectResolution:'resolved',redirectTrace:trace,resolvedHeadStatus:resolved.status,resolvedHeadLength:Number.isSafeInteger(size)&&size>0?size:null});}
   catch(error){Object.assign(resolution,{redirectResolution:'rejected',redirectTrace:trace,redirectError:postVideoExportFailureCode(error)});}
  }
  const trace:Record<string,unknown>[]=[];let rangeProbe;
  try{
   const range=await fetchPostVideoExportResponse(base.href,{range:'bytes=0-0',onRedirect:metadata=>trace.push(metadata)});
   const match=/^bytes 0-0\/(\d+)$/.exec(range.headers.get('content-range')||''),total=match?Number(match[1]):null;
   if(range.status!==206||!Number.isSafeInteger(total)||total!<=0||total!>30*1024**3){await range.body?.cancel();rangeProbe={status:range.status,verified:false,trace};}
   else{await readExactRangeResponse(range,0,0,total!);rangeProbe={status:range.status,total,verified:true,trace};}
  }catch(error){rangeProbe={verified:false,error:postVideoExportFailureCode(error),trace};}
  return {...result,...resolution,rangeProbe};
 }catch(error){
  if(stage==='video'&&report.privateOwnedVod!==true&&error instanceof Error&&error.message==='Private owned VOD required')throw error;
  const status=error instanceof Error?/^Stream request failed \((\d{3})\)$/.exec(error.message):null;
  return {...report,stage,error:'probe-failed',...(status?{httpStatus:Number(status[1])}:{})};
 }
}
