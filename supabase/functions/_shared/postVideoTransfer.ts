import { POST_VIDEO_PART_BYTES } from './postVideoPolicy.ts';

export function videoPartRange(total: number, partNumber: number) {
  const start = (partNumber - 1) * POST_VIDEO_PART_BYTES;
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isInteger(partNumber) || partNumber < 1 || start >= total) throw new Error('Invalid video range');
  const end = Math.min(total - 1, start + POST_VIDEO_PART_BYTES - 1);
  return { start, end, length: end - start + 1 };
}

export function videoOffsetRange(total:number,offset:number) {
 if(!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(offset)||offset<0||offset>=total)throw new Error('Invalid TUS source offset');
 const end=Math.min(total-1,offset+POST_VIDEO_PART_BYTES-1);return {start:offset,end,length:end-offset+1};
}

export function validateExportUrl(url: string, uid?: string): URL {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || u.port ||
    !/^(customer-[a-z0-9-]+\.cloudflarestream\.com|videodelivery\.net)$/.test(u.hostname)) throw new Error('Untrusted export URL');
  const match=/^\/([A-Za-z0-9_.-]+)\/downloads\/default\.mp4$/.exec(u.pathname);
  if(!match)throw new Error('Untrusted export path');
  const identity=match[1];
  if(/^[a-f0-9]{32}$/.test(identity)) {
    if(uid&&identity!==uid)throw new Error('Export UID mismatch');
  }else {
    const parts=identity.split('.');if(parts.length!==3)throw new Error('Invalid signed export');
    let claims;try{claims=JSON.parse(atob(parts[1].replaceAll('-','+').replaceAll('_','/')));}catch{throw new Error('Invalid export claims');}
    if(!/^[a-f0-9]{32}$/.test(claims.sub)||(uid&&claims.sub!==uid)||claims.downloadable!==true||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000)throw new Error('Invalid export claims');
  }
  return u;
}

/** Strict bounded reader: never buffer a server's fallback full-file response. */
export async function readExactRangeResponse(response: Response, start: number, end: number, total: number): Promise<Uint8Array> {
  const length = end - start + 1;
  if (length <= 0 || length > POST_VIDEO_PART_BYTES || response.status !== 206 ||
    response.headers.get('content-range') !== `bytes ${start}-${end}/${total}` ||
    (response.headers.has('content-length') && response.headers.get('content-length') !== String(length)) || !response.body) {
    await response.body?.cancel();
    throw new Error('Invalid partial video response');
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(length);
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > length) throw new Error('Video range exceeds expected length');
      bytes.set(value, offset); offset += value.length;
    }
    if (offset !== length) throw new Error('Truncated video range');
    return bytes;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function readExactVideoRange(url: string, start: number, end: number, total: number, signal?: AbortSignal) {
  validateExportUrl(url);
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, redirect: 'manual',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
  return readExactRangeResponse(response, start, end, total);
}

export async function readExportSize(url: string): Promise<number> {
  validateExportUrl(url);
  const r = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const n = Number(r.headers.get('content-length'));
  if (!r.ok || r.status !== 200 || !Number.isSafeInteger(n) || n <= 0 || n > 30 * 1024 ** 3) throw new Error('Unknown export size');
  return n;
}
