import { corsHeaders, json, createAdminClient } from '../_shared/httpAuth.ts';
import { recordingArchiveScope, eligibleUnpublishedRecording, validateRecordingParts, RECORDING_ARCHIVE_PART_BYTES } from '../_shared/unpublishedRecordingPolicy.ts';
import { getStreamVideo, getStreamPlaybackUrls, requestMp4Download, deleteStreamVideo, isStreamVideoActivelyLive } from '../_shared/cloudflareStreamService.ts';
import { createMultipartUpload, uploadPart, completeMultipartUpload, abortMultipartUpload } from '../_shared/r2MultipartService.ts';
import { headR2Object, verifyR2PlayableUrl } from '../_shared/r2StorageService.ts';

// Operator capability, one existing Live Input config + one finished public VOD.
// This path never fabricates a session/replay and never creates a feed post.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null,{headers:corsHeaders});
  if (req.method !== 'POST') return json({error:'Method not allowed'},405);
  const scope = await recordingArchiveScope(Deno.env.get('UNPUBLISHED_RECORDING_ARCHIVE_CAPABILITY'),req.headers.get('x-recording-archive-token') || '');
  if (!scope) return json({error:'Unauthorized'},401);
  try {
    const admin = createAdminClient();
    const {data:config,error:configError} = await admin.from('rtmp_stream_configs').select('id,user_id,cloudflare_live_input_id,deleted_at').eq('id',scope.configId).maybeSingle();
    if (configError) throw configError;
    if (!config || config.deleted_at || !config.cloudflare_live_input_id) return json({error:'Config unavailable'},409);
    const key = `stream-recordings/${config.user_id}/${scope.streamUid}.mp4`;
    const body = await req.json().catch(()=>({}));
    const action = body.action;
    if (action === 'head') return json({key,...await headR2Object(key)});
    if (action === 'abort') {
      if (typeof body.uploadId !== 'string' || !body.uploadId || body.uploadId.length>2048) return json({error:'Invalid uploadId'},400);
      await abortMultipartUpload(key,body.uploadId);
      return json({aborted:true,key});
    }
    const video = await getStreamVideo(scope.streamUid);
    if (!video || isStreamVideoActivelyLive(video) || !eligibleUnpublishedRecording(video,scope.streamUid,config.cloudflare_live_input_id)) return json({error:'Source not a finished public recording of this input'},409);
    const {data:sessions,error:sessionError} = await admin.from('live_sessions').select('id').eq('cloudflare_video_uid',scope.streamUid).limit(1);
    const {data:replays,error:replayError} = await admin.from('live_replays').select('id').or(`stream_uid.eq.${scope.streamUid},cloudflare_video_uid.eq.${scope.streamUid}`).limit(1);
    if (sessionError || replayError) throw sessionError || replayError;
    if (sessions?.length || replays?.length) return json({error:'Source belongs to session/replay pipeline'},409);
    if (action === 'inspect') return json({key,ownerId:config.user_id,uid:scope.streamUid,inputId:config.cloudflare_live_input_id,duration:video.duration,name:(video.meta as {name?:string})?.name || null});
    if (action === 'export') {
      const download = await requestMp4Download(scope.streamUid);
      if (!download.ready) return json({ready:false,percent:download.percentComplete});
    }
    const source = getStreamPlaybackUrls(scope.streamUid).mp4;
    const sourceHead = await fetch(source,{method:'HEAD',signal:AbortSignal.timeout(15000)});
    const size = Number(sourceHead.headers.get('content-length'));
    const etag = sourceHead.headers.get('etag');
    if (!sourceHead.ok || !Number.isSafeInteger(size) || size < 1024 || size > scope.maxBytes || !etag) return json({error:'Invalid MP4 source HEAD'},409);
    if (action === 'export') return json({ready:true,size,etag,source});
    if (body.size !== size || body.etag !== etag) return json({error:'Source generation changed'},409);
    const existing = await headR2Object(key);
    if (action === 'cleanup') {
      const {data:library,error:libraryError} = await admin.from('creator_library').select('id,user_id,r2_bucket,r2_object_key,r2_video_url,post_id,live_session_id,live_replay_id,deleted_at').eq('user_id',config.user_id).eq('r2_object_key',key);
      const {data:posts,error:postError} = await admin.from('posts').select('id').or(`video_url.ilike.%${scope.streamUid}%,metadata->>cloudflare_video_uid.eq.${scope.streamUid},metadata->>stream_uid.eq.${scope.streamUid}`).limit(1);
      if (libraryError || postError) throw libraryError || postError;
      const item=library?.length===1 ? library[0] : null;
      if (!existing.exists || existing.size!==size || !item || item.deleted_at || item.post_id || item.live_session_id || item.live_replay_id || posts?.length || item.r2_bucket!==existing.bucket || !item.r2_video_url) return json({error:'Archive/library references not verified'},409);
      const expectedPublic = (Deno.env.get('R2_PUBLIC_DOMAIN') || Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').replace(/\/$/,'')+'/'+key;
      if (item.r2_video_url !== expectedPublic) return json({error:'Library URL mismatch'},409);
      const playable = await verifyR2PlayableUrl(expectedPublic,32);
      const range=await fetch(expectedPublic,{headers:{Range:'bytes=0-31'},signal:AbortSignal.timeout(15000)});
      const bytes=range.status===206 ? new Uint8Array(await range.arrayBuffer()) : new Uint8Array();
      if (!playable.ok || playable.contentLength!==size || new TextDecoder().decode(bytes.slice(4,8))!=='ftyp') return json({error:'Archive not playable MP4'},409);
      const result=await deleteStreamVideo(scope.streamUid);
      return json({deleted:result.deleted,status:result.status,uid:scope.streamUid,libraryId:item.id,deletedAt:new Date().toISOString()});
    }
    if (existing.exists) return json({error:'Archive object already exists; verify and reuse'},409);
    if (action === 'init') return json({...await createMultipartUpload(key),size,etag});
    const uploadId=body.uploadId;
    if (typeof uploadId !== 'string' || !uploadId || uploadId.length>2048) return json({error:'Invalid uploadId'},400);
    if (action === 'part') {
      const n=body.partNumber;
      if (!Number.isInteger(n) || n<1 || n>Math.ceil(size/RECORDING_ARCHIVE_PART_BYTES)) return json({error:'Invalid part'},400);
      const start=(n-1)*RECORDING_ARCHIVE_PART_BYTES,end=Math.min(size-1,start+RECORDING_ARCHIVE_PART_BYTES-1);
      const response=await fetch(source,{headers:{Range:`bytes=${start}-${end}`,'If-Match':etag},signal:AbortSignal.timeout(35000)});
      if (response.status!==206 || response.headers.get('content-range')!==`bytes ${start}-${end}/${size}` || response.headers.get('etag')!==etag || !response.body) {await response.body?.cancel();return json({error:'Source range changed'},409);}
      return json({...await uploadPart({key,uploadId,partNumber:n,body:response.body,contentLength:end-start+1})});
    }
    if (action === 'complete') {
      if (!validateRecordingParts(body.parts,size)) return json({error:'Incomplete part sequence'},400);
      const complete=await completeMultipartUpload({key,uploadId,parts:body.parts});const head=await headR2Object(key);
      if (!head.exists || head.size!==size) throw Error('Completed object size mismatch');
      return json({...complete,size,requiresIndependentVerification:true});
    }
    return json({error:'Unknown action'},400);
  } catch(error) {
    console.error('[UNPUBLISHED_RECORDING_ARCHIVE_FAILED]',{uid:scope.streamUid,type:error instanceof Error ? error.name : 'unknown'});
    return json({error:'Archive operation failed; no feed post created'},500);
  }
});
