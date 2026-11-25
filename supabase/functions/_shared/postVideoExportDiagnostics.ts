import {postVideoStreamConfig,postVideoStreamRequest,type PostVideoStreamConfig,assertStreamUid} from './postVideoStream.ts';
import {validateExportUrl,fetchPostVideoExportResponse} from './postVideoTransfer.ts';
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
    const knownProvider=/^(?:[a-z0-9-]+\.)*(?:videodelivery\.net|cloudflarestream\.com|cloudflarestorage\.com|r2\.dev|googleapis\.com|amazonaws\.com)$/.test(target.hostname);
    redirect={hostname:knownProvider?target.hostname:'other',sameOrigin:target.origin===base.origin,pathContainsUid:target.pathname.includes(uid),hasSignedQuery:['token','Signature','X-Amz-Signature','X-Goog-Signature'].some(key=>target.searchParams.has(key))};
   }catch{redirect={invalid:true};}
  }
  const result={...report,stage,headStatus:response.status,headLength:Number.isSafeInteger(length)&&length>0?length:null,hasLocation:response.headers.has('location'),...(redirect?{redirect}:{})};
  if([301,302,303,307,308].includes(response.status)){
   try{const resolved=await fetchPostVideoExportResponse(base.href,{method:'HEAD'});const size=Number(resolved.headers.get('content-length'));await resolved.body?.cancel();return {...result,redirectResolution:'resolved',resolvedHeadStatus:resolved.status,resolvedHeadLength:Number.isSafeInteger(size)&&size>0?size:null};}
   catch{return {...result,redirectResolution:'rejected'};}
  }
  return result;
 }catch(error){
  if(stage==='video'&&report.privateOwnedVod!==true&&error instanceof Error&&error.message==='Private owned VOD required')throw error;
  const status=error instanceof Error?/^Stream request failed \((\d{3})\)$/.exec(error.message):null;
  return {...report,stage,error:'probe-failed',...(status?{httpStatus:Number(status[1])}:{})};
 }
}
