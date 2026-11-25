import { getStreamAccountId, getStreamToken } from './cloudflareStreamService.ts';
import { validateExportUrl } from './postVideoTransfer.ts';
export interface PostVideoStreamConfig { accountId: string; token: string }
export function postVideoStreamConfig(): PostVideoStreamConfig {
  const accountId = getStreamAccountId(), token = getStreamToken();
  if (!accountId || !/^[a-f0-9]{32}$/.test(accountId) || !token) throw new Error('Missing Stream config');
  return { accountId, token };
}
export async function postVideoStreamRequest(path: string, init: RequestInit = {}, config = postVideoStreamConfig()) {
  if (!/^\/[a-zA-Z0-9/_?=&.-]*$/.test(path)) throw new Error('Invalid Stream path');
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream${path}`, {
    ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${config.token}` },
    redirect: 'manual', signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`Stream request failed (${r.status})`); }
  return r;
}
export function parsePostVideoUsage(value: Record<string, unknown>) {
  const usedMinutes = value.totalStorageMinutes, limitMinutes = value.totalStorageMinutesLimit;
  if (typeof usedMinutes !== 'number' || !Number.isFinite(usedMinutes) || usedMinutes < 0 ||
      typeof limitMinutes !== 'number' || !Number.isFinite(limitMinutes) || limitMinutes <= 0) throw new Error('Unknown Stream storage usage');
  return { usedMinutes, limitMinutes };
}
export async function readPostVideoStorageUsage() {
  const data = await (await postVideoStreamRequest('/storage-usage')).json();
  if (!data.success || !data.result) throw new Error('Unknown Stream storage usage');
  return parsePostVideoUsage(data.result);
}
export function parsePostVideoExport(value: { default?: { status?: string; url?: string } }, uid: string) {
  if (value.default?.status === 'error') throw new Error('Stream export failed');
  if (value.default?.status !== 'ready') return { ready: false, url: null, size: null };
  const url = value.default.url;
  if (!url) throw new Error('Missing ready export URL');
  validateExportUrl(url, uid);
  return { ready: true, url, size: null };
}
export async function readPostVideoExport(uid: string) {
  assertStreamUid(uid);
  const data = await (await postVideoStreamRequest(`/${uid}/downloads`)).json();
  if (!data.success) throw new Error('Invalid export response');
  return parsePostVideoExport(data.result, uid);
}
export function assertStreamUid(uid: string) { if (!/^[a-f0-9]{32}$/.test(uid)) throw new Error('Invalid Stream UID'); }
export async function startPostVideoImport(job: { id: string; attachment_id: string; source_size: number }, config = postVideoStreamConfig()) {
  if (!Number.isSafeInteger(job.source_size) || job.source_size <= 0 || job.source_size > 10737418240) throw new Error('Invalid source size');
  // Duration bound must be sent on CREATE; response fields do not establish a hard cap.
  const r = await postVideoStreamRequest('?direct_user=true'.replace(/^/, '/'), { method: 'POST', headers: {
    'Tus-Resumable': '1.0.0', 'Upload-Length': String(job.source_size), 'Upload-Creator': `post-video:${job.id}`,
    'Upload-Metadata': `maxDurationSeconds ${btoa('14400')},name ${btoa(`post-video-${job.id}`)},requiresignedurls,expiry ${btoa(new Date(Date.now()+6*60*60*1000).toISOString())}`,
  } }, config);
  const location = r.headers.get('location');
  const uid = r.headers.get('stream-media-id');
  if (!location || !uid) throw new Error('TUS creation missing identity');
  assertStreamUid(uid);
  validateTusLocation(location, config.accountId, uid);
  return { uid, location, mode: 'tus' as const };
}
export function validateTusLocation(url: string, account: string, uid: string) {
  const u = new URL(url); assertStreamUid(uid);
  const api = u.hostname === 'api.cloudflare.com' && u.pathname === `/client/v4/accounts/${account}/stream/${uid}`;
  const upload = /^(upload\.videodelivery\.net|upload\.cloudflarestream\.com)$/.test(u.hostname) && u.pathname.length>1 && url.length<=2048 && !u.hash;
  if (u.protocol !== 'https:' || u.username || u.password || u.port || (!api && !upload)) throw new Error('Untrusted TUS endpoint');
  return u;
}
export async function readPostVideoTusOffset(location: string, uid: string, config = postVideoStreamConfig()) {
  const u = validateTusLocation(location, config.accountId, uid);
  const r = await fetch(u, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(20000), headers: {
    'Tus-Resumable': '1.0.0', ...(u.hostname === 'api.cloudflare.com' ? { Authorization: `Bearer ${config.token}` } : {}),
  } });
  const raw = r.headers.get('upload-offset'), offset = Number(raw);
  if (!r.ok || raw === null || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Unknown TUS offset');
  return offset;
}
export async function uploadPostVideoTusPart(location: string, uid: string, offset: number, bytes: Uint8Array, config = postVideoStreamConfig()) {
  const u = validateTusLocation(location, config.accountId, uid);
  const r = await fetch(u, { method: 'PATCH', redirect: 'manual', signal: AbortSignal.timeout(45000), headers: {
    'Tus-Resumable': '1.0.0', 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream',
    ...(u.hostname === 'api.cloudflare.com' ? { Authorization: `Bearer ${config.token}` } : {}),
  }, body: bytes as BodyInit });
  if (!r.ok || r.headers.get('upload-offset') !== String(offset + bytes.length)) throw new Error('TUS part not acknowledged');
  await r.body?.cancel();
  return offset + bytes.length;
}

/** Private MP4 token lives only for this backend operation, never in persisted runtime or UI. */
export async function authorizePostVideoExport(uid:string,baseUrl:string) {
 assertStreamUid(uid);const url=validateExportUrl(baseUrl,uid);
 const data=await(await postVideoStreamRequest(`/${uid}/token`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({exp:Math.floor(Date.now()/1000)+600,downloadable:true})})).json();
 const token=data.result?.token;
 if(!data.success||typeof token!=='string'||token.split('.').length!==3)throw new Error('Private export authorization failed');
 url.pathname=`/${token}/downloads/default.mp4`;validateExportUrl(url.href,uid);return url.href;
}

/** Cleanup audit distinguishes a missing VOD from denied access or an unknown request failure. */
export async function probePostVideoVodIdentity(uid:string,jobId:string,config=postVideoStreamConfig()) {
 assertStreamUid(uid);
 try{
  const response=await postVideoStreamRequest(`/${uid}`,{},config),data=await response.json();
  return {httpStatus:response.status,ownedVod:data.success===true&&data.result?.uid===uid&&data.result?.creator===`post-video:${jobId}`&&!data.result?.liveInput};
 }catch(error){
  const status=error instanceof Error?/^Stream request failed \((\d{3})\)$/.exec(error.message):null;
  if(status)return {httpStatus:Number(status[1]),ownedVod:false};
  throw error;
 }
}
