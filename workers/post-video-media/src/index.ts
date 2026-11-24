import { signVideoMac, readPostVideoJson } from '../../../supabase/functions/_shared/postVideoRead';
interface Env {
 POST_VIDEO_OUTPUT_BUCKET:{get(key:string,options?:{range?:{offset:number;length:number}}):Promise<{body:ReadableStream<Uint8Array>;size:number;httpEtag:string}|null>};
 POST_VIDEO_GATEWAY_SECRET:string; POST_VIDEO_AUTH_URL:string;
 fetch?:typeof fetch; // Local harness only; Workers bindings never provide a fetch override.
}
function allowedOrigin(origin:string|null){return !!origin&&(origin==='https://fun.rich'||/^https:\/\/[a-z0-9-]+\.funprofile-supabase\.pages\.dev$/.test(origin)||origin==='http://localhost:8080');}
function parseRange(value:string|null,size:number) {
 if(!value)return null;
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!m||(!m[1]&&!m[2]))throw new Error('Invalid range');
 const suffix=!m[1],n=Number(m[2]);
 const start=suffix?Math.max(0,size-n):Number(m[1]);
 const end=suffix?size-1:m[2]?Math.min(Number(m[2]),size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||suffix&&n<=0)throw new Error('Invalid range');
 return {start,end,length:end-start+1};
}
export default {
 async fetch(request:Request,env:Env):Promise<Response> {
  const u=new URL(request.url), origin=request.headers.get('origin');
  const cors=allowedOrigin(origin)?{'Access-Control-Allow-Origin':origin!,'Access-Control-Allow-Credentials':'true','Vary':'Origin'}:{};
  const headers:Record<string,string>={...cors,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  const respond=(status:number,message='')=>new Response(message||null,{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'content-type,range'}});
  const m=/^\/media-optimized\/([a-f0-9-]{36})\/([a-f0-9-]{36})\.mp4$/.exec(u.pathname);
  if(!m)return respond(404);
  if(!['GET','HEAD','POST'].includes(request.method))return respond(405);
  try {
   let permit:string|undefined;
   if(request.method==='POST') {
    if(!allowedOrigin(origin))return respond(403);
    if(Number(request.headers.get('content-length')||0)>4096)return respond(413);
    permit=(await readPostVideoJson(request)).body.permit;
   } else permit=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('post_video_permit='))?.slice(18);
   if(typeof permit!=='string'||!permit||permit.length>2048)return respond(401);
   const body=JSON.stringify({action:'authorize',permit,attachmentId:m[1],sourceGeneration:m[2]});
   const timestamp=String(Date.now());
   const endpoint=new URL(env.POST_VIDEO_AUTH_URL);
   if(endpoint.protocol!=='https:'||endpoint.pathname!=='/functions/v1/post-video-read')return respond(503);
   const result=await (env.fetch||fetch)(endpoint,{method:'POST',headers:{'content-type':'application/json','x-post-video-time':timestamp,'x-post-video-mac':await signVideoMac(`${timestamp}.${body}`,env.POST_VIDEO_GATEWAY_SECRET)},body,redirect:'manual',signal:AbortSignal.timeout(15000)});
   if(!result.ok)return respond(result.status===401?401:403);
   const access=await result.json() as {allowed:boolean;key?:string;size?:number;mime?:string};
   if(!access.allowed)return respond(403);
   if(access.key!==`optimized/${m[1]}/${m[2]}.mp4`||!Number.isSafeInteger(access.size)||access.size!<=0)return respond(503);
   if(request.method==='POST')return new Response(null,{status:204,headers:{...headers,'Set-Cookie':`post_video_permit=${permit}; Path=${u.pathname}; Max-Age=300; Secure; HttpOnly; SameSite=None`}});
   const size=access.size!;
   let range:ReturnType<typeof parseRange>;
   try {range=parseRange(request.headers.get('range'),size);}catch{return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${size}`}});}
   const object=await env.POST_VIDEO_OUTPUT_BUCKET.get(access.key!,range?{range:{offset:range.start,length:range.length}}:undefined);
   if(!object||object.size!==size){await object?.body.cancel();return respond(404);}
   const length=range?.length||size;
   Object.assign(headers,{'Content-Type':'video/mp4','Content-Length':String(length),'Accept-Ranges':'bytes','ETag':object.httpEtag});
   if(range)headers['Content-Range']=`bytes ${range.start}-${range.end}/${size}`;
   if(u.searchParams.get('download')==='1')headers['Content-Disposition']='attachment; filename="video.mp4"';
   if(request.method==='HEAD'){await object.body.cancel();return new Response(null,{status:range?206:200,headers});}
   let transferred=0;
   const bounded=object.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){transferred+=chunk.length;if(transferred>length)throw new Error('R2 body exceeds expected size');controller.enqueue(chunk);},flush(){if(transferred!==length)throw new Error('R2 body truncated');}}));
   return new Response(bounded,{status:range?206:200,headers});
  }catch{return respond(503);}
 }
};
