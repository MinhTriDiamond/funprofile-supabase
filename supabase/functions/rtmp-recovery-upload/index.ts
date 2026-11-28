import { corsHeaders, json, createAdminClient } from '../_shared/httpAuth.ts';
import { validateRecoveryCapability } from '../_shared/rtmpRecoveryCapability.ts';
import { createMultipartUpload, uploadPart, completeMultipartUpload, type UploadedPart } from '../_shared/r2MultipartService.ts';
import { headR2Object } from '../_shared/r2StorageService.ts';

// Operator-only, time-limited upload capability scoped to one ended public replay.
// No API keys leave the server. No feed publication or Stream deletion is exposed.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const scope = await validateRecoveryCapability(Deno.env.get('RTMP_RECOVERY_UPLOAD_CAPABILITY'), req.headers.get('x-recovery-token') || '');
  if (!scope) return json({ error: 'Unauthorized' }, 401);
  try {
    const admin = createAdminClient();
    const { data: replay, error } = await admin.from('live_replays')
      .select('id,live_session_id,user_id,stream_uid,cloudflare_video_uid,r2_object_key,deleted_at')
      .eq('id', scope.replayId).maybeSingle();
    if (error) throw error;
    if (!replay || replay.deleted_at || (replay.stream_uid || replay.cloudflare_video_uid) !== scope.streamUid) return json({ error: 'Replay scope changed' }, 409);
    const { data: session, error: sessionError } = await admin.from('live_sessions')
      .select('id,ended_at,privacy,mode,deleted_at,owner_id,host_user_id,user_id')
      .eq('id', replay.live_session_id).maybeSingle();
    if (sessionError) throw sessionError;
    if (!session?.ended_at || session.deleted_at || session.privacy !== 'public'
      || !['rtmp_obs','rtmp'].includes(session.mode || '')
      || ![session.owner_id,session.host_user_id,session.user_id].includes(replay.user_id)) return json({ error: 'Replay is not an ended public RTMP recording' }, 409);
    const key = `live-replays/${replay.user_id}/${replay.live_session_id}/${scope.streamUid}-hls-recovered.mp4`;
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    if (action === 'head') return json({ key, ...await headR2Object(key) });
    // Do not overwrite a completed recovery object, even on a retried invocation.
    if ((await headR2Object(key)).exists) return json({ error: 'Recovery object already exists; verify and reuse it' }, 409);
    if (action === 'init') return json({ ...await createMultipartUpload(key) });
    const uploadId = url.searchParams.get('uploadId') || '';
    if (!uploadId || uploadId.length > 2048) return json({ error: 'Invalid uploadId' }, 400);
    if (action === 'part') {
      const partNumber = Number(url.searchParams.get('partNumber'));
      const length = Number(req.headers.get('content-length'));
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > Math.ceil(scope.maxBytes / (5 * 1024 ** 2))
        || !Number.isSafeInteger(length) || length < 1 || length > 16 * 1024 ** 2) return json({ error: 'Invalid part or body size' }, 400);
      const body = new Uint8Array(await req.arrayBuffer());
      if (body.byteLength !== length) return json({ error: 'Incomplete body' }, 400);
      return json({ ...await uploadPart({ key,uploadId,partNumber,body,contentLength:length }) });
    }
    if (action === 'complete') {
      const input = await req.json();
      const parts = input.parts as UploadedPart[];
      if (!Array.isArray(parts) || !parts.length || parts.length > 4096) return json({ error: 'Invalid parts' }, 400);
      let total = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.partNumber !== i + 1 || !/^[a-fA-F0-9]{32}$/.test(part.etag)
          || !Number.isSafeInteger(part.size) || part.size <= 0 || part.size > 16 * 1024 ** 2
          || (i < parts.length - 1 && part.size < 5 * 1024 ** 2)) return json({ error: 'Invalid part sequence' }, 400);
        total += part.size;
      }
      if (total !== input.size || total > scope.maxBytes) return json({ error: 'Invalid total size' }, 400);
      const completed = await completeMultipartUpload({ key,uploadId,parts });
      const head = await headR2Object(key);
      if (!head.exists || head.size !== total) throw new Error('Recovery object size mismatch');
      return json({ ...completed,size:head.size,requiresIndependentVerification:true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[RTMP_RECOVERY_UPLOAD_FAILED]', { replayId:scope.replayId,errorType:error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'Recovery upload failed; source preserved' }, 500);
  }
});
