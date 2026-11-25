import { signedR2Request, uploadPart, type UploadedPart } from './r2MultipartService.ts';
import { readExactRangeResponse, readExactVideoRange, videoPartRange } from './postVideoTransfer.ts';
import { isOwnedPostVideoKey } from './postVideoSourceKey.ts';

export const POST_VIDEO_PRIVATE_BUCKET = 'fun-rich-video-optimized';
export function assertPrivateVideoDestination(bucket: string, key: string) {
  if (bucket !== POST_VIDEO_PRIVATE_BUCKET || !/^optimized\/[a-f0-9-]+\/[a-f0-9-]+\.mp4$/.test(key)) throw new Error('Invalid private video destination');
}
interface SourceIdentity {user_id:string;source_key:string;source_size:number;canary?:boolean;runtime?:{sourceEtag?:unknown;legacySourceKey?:unknown;legacySourceOwner?:unknown}}
function assertSourceIdentity(job:SourceIdentity) {
 if(isOwnedPostVideoKey(job.source_key,job.user_id))return;
 if(job.canary===true&&job.runtime?.legacySourceKey===job.source_key&&job.runtime.legacySourceOwner===job.user_id&&/^videos\/[A-Za-z0-9_.-]+\.(mov|mp4|webm|mkv)$/i.test(job.source_key)&&!job.source_key.includes('..'))return;
 throw new Error('Unowned source key');
}
export async function readPostVideoSource(job: SourceIdentity, start: number, end: number) {
  assertSourceIdentity(job);
  const etag=job.runtime?.sourceEtag;if(typeof etag!=='string'||!etag)throw new Error('Missing source version');
  const r = await signedR2Request({ method: 'GET', key: job.source_key, bucket: Deno.env.get('R2_BUCKET_NAME') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME'), headers: { Range: `bytes=${start}-${end}`, 'If-Match':etag } });
  return readExactRangeResponse(r, start, end, job.source_size);
}
export async function verifyPostVideoSource(job: SourceIdentity) {
  assertSourceIdentity(job);
  const r = await signedR2Request({ method: 'HEAD', key: job.source_key, bucket: Deno.env.get('R2_BUCKET_NAME') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') });
  if (r.status !== 200 || r.headers.get('content-length') !== String(job.source_size)) throw new Error('Source size mismatch');
  const etag=r.headers.get('etag');
  if(!etag||etag.length>256||(job.runtime?.sourceEtag&&job.runtime.sourceEtag!==etag))throw new Error('Source object version changed');
  return etag;
}
export async function transferPostVideoPart(job: { output_key: string; output_bucket: string; output_size: number; runtime: { exportUrl: string; uploadId: string; parts: UploadedPart[] } }) {
  assertPrivateVideoDestination(job.output_bucket, job.output_key);
  const partNumber = job.runtime.parts.length + 1;
  const { start, end, length } = videoPartRange(job.output_size, partNumber);
  const bytes = await readExactVideoRange(job.runtime.exportUrl, start, end, job.output_size);
  return uploadPart({ bucket: job.output_bucket, key: job.output_key, uploadId: job.runtime.uploadId, partNumber, body: bytes, contentLength: length });
}
export async function verifyPostVideoOutput(bucket: string, key: string, size: number) {
  assertPrivateVideoDestination(bucket, key);
  const r = await signedR2Request({ method: 'HEAD', bucket, key });
  if (r.status !== 200 || r.headers.get('content-length') !== String(size) || r.headers.get('content-type')?.split(';')[0] !== 'video/mp4') throw new Error('Private video verification failed');
  // Exact Range proves the object is readable through authenticated R2, not only a successful complete response.
  const end = Math.min(size - 1, 1023);
  const body = await readExactRangeResponse(await signedR2Request({ method: 'GET', bucket, key, headers: { Range: `bytes=0-${end}` } }), 0, end, size);
  if (body.length < 12 || new TextDecoder().decode(body.slice(4, 8)) !== 'ftyp') throw new Error('Export does not contain an MP4 ftyp header');
}

/** Sources are write-frozen by upload APIs; HEAD/ETag is checked again before DELETE. */
export async function deleteRetiredPostVideoSource(job:SourceIdentity) {
 assertSourceIdentity(job);await verifyPostVideoSource(job);
 const response=await signedR2Request({method:'DELETE',key:job.source_key,bucket:Deno.env.get('R2_BUCKET_NAME')||Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')});
 await response.body?.cancel();if(!response.ok&&response.status!==404)throw new Error('Source deletion failed');
}
export async function isPostVideoSourceMissing(job:SourceIdentity) {
 assertSourceIdentity(job);
 const r=await signedR2Request({method:'HEAD',key:job.source_key,bucket:Deno.env.get('R2_BUCKET_NAME')||Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')});await r.body?.cancel();
 if(r.status===404)return true;if(r.status===200)return false;throw new Error('Unknown source state');
}
