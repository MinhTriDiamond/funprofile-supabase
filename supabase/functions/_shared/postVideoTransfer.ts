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
    const expiration=typeof claims.exp==='string'&&/^\d+$/.test(claims.exp)?Number(claims.exp):claims.exp;
    if(!/^[a-f0-9]{32}$/.test(claims.sub)||(uid&&claims.sub!==uid)||claims.downloadable!==true||!Number.isSafeInteger(expiration)||expiration<=Date.now()/1000)throw new Error('Invalid export claims');
  }
  return u;
}

/** Provider download redirects stay within the initial origin and the same video. */
export async function fetchPostVideoExportResponse(url:string,options:{method?:'GET'|'HEAD';range?:string;signal?:AbortSignal}={}) {
  const initial=validateExportUrl(url),identity=initial.pathname.split('/')[1];
  const uid=/^[a-f0-9]{32}$/.test(identity)?identity:JSON.parse(atob(identity.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).sub;
  const method=options.method||'GET',deadline=AbortSignal.timeout(method==='HEAD'?20000:45000);
  const signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
  let current=initial;
  for(let redirects=0;redirects<=3;redirects++){
    const response=await fetch(current.href,{method,headers:options.range?{Range:options.range}:undefined,redirect:'manual',referrerPolicy:'no-referrer',signal});
    if(![301,302,303,307,308].includes(response.status))return response;
    const location=response.headers.get('location');await response.body?.cancel();
    if(!location||redirects===3)throw new Error('Invalid export redirect');
    const target=validateExportUrl(new URL(location,current).href,uid);
    if(target.origin!==initial.origin)throw new Error('Cross-origin export redirect denied');
    current=target;
  }
  throw new Error('Export redirect limit exceeded');
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
  const response = await fetchPostVideoExportResponse(url,{range:`bytes=${start}-${end}`,signal});
  return readExactRangeResponse(response, start, end, total);
}

export async function readExportSize(url: string): Promise<number> {
  const r = await fetchPostVideoExportResponse(url,{method:'HEAD'});
  const n = Number(r.headers.get('content-length'));
  if (!r.ok || r.status !== 200 || !Number.isSafeInteger(n) || n <= 0 || n > 30 * 1024 ** 3) throw new Error('Unknown export size');
  return n;
}
