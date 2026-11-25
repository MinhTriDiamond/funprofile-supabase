import { assertPrivateVideoDestination } from './postVideoR2.ts';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export interface PostVideoReadInput { attachmentId:string; viewerId:string|null; sourceGeneration:string }
export interface VideoPermit extends PostVideoReadInput { postId:string; expiresAt:number }
export interface PostVideoReadRepository {
 asset(attachmentId:string):Promise<any>; post(postId:string):Promise<any>;
 friends(viewer:string,owner:string):Promise<boolean>; blocked(viewer:string,owner:string):Promise<boolean>;
}
export async function authorizePostVideoRead(input:PostVideoReadInput,repo:PostVideoReadRepository):Promise<{allowed:boolean;key?:string;size?:number;mime?:string;postId?:string}> {
 const deny={allowed:false};
 if(!uuid.test(input.attachmentId)||!uuid.test(input.sourceGeneration)||(input.viewerId!==null&&!uuid.test(input.viewerId)))return deny;
 const a=await repo.asset(input.attachmentId);
 if(!a||a.cancelled||!a.published_at||a.source_generation!==input.sourceGeneration)return deny;
 assertPrivateVideoDestination(a.output_bucket,a.output_key);
 const post=await repo.post(a.post_id);
 if(!post||post.deleted_at)return deny;
 if(input.viewerId&&await repo.blocked(input.viewerId,post.user_id))return deny;
 const owner=input.viewerId===post.user_id;
 if(!owner&&post.visibility!=='public'&&!(post.visibility==='friends'&&input.viewerId&&await repo.friends(input.viewerId,post.user_id)))return deny;
 return {allowed:true,key:a.output_key,size:a.output_size,mime:'video/mp4',postId:post.id};
}
const encode=(s:string)=>btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=(s:string)=>atob(s.replaceAll('-','+').replaceAll('_','/'));
async function key(secret:string) {if(!secret)throw new Error('Missing video secret');return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signVideoMac(value:string,secret:string) {
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),new TextEncoder().encode(value)));
 return encode(String.fromCharCode(...bytes));
}
export async function verifyVideoMac(value:string,signature:string,secret:string) {
 try{return await crypto.subtle.verify('HMAC',await key(secret),Uint8Array.from(decode(signature),c=>c.charCodeAt(0)),new TextEncoder().encode(value));}catch{return false;}
}
export async function signPostVideoPermit(payload:VideoPermit,secret:string) {
 const body=encode(JSON.stringify(payload));return `${body}.${await signVideoMac(`post-video-permit:${body}`,secret)}`;
}
export async function verifyPostVideoPermit(token:string,secret:string,now=Date.now()):Promise<VideoPermit> {
 if(token.length>2048)throw new Error('Invalid video permit');
 const parts=token.split('.');
 if(parts.length!==2||!await verifyVideoMac(`post-video-permit:${parts[0]}`,parts[1],secret))throw new Error('Invalid video permit');
 const payload=JSON.parse(decode(parts[0]));
 if(!uuid.test(payload.postId)||!uuid.test(payload.attachmentId)||!uuid.test(payload.sourceGeneration)||(payload.viewerId!==null&&!uuid.test(payload.viewerId))||
   !Number.isSafeInteger(payload.expiresAt)||payload.expiresAt<=now||payload.expiresAt>now+300000)throw new Error('Expired or invalid video permit');
 return payload;
}
export function createPostVideoReadRepository(admin:any):PostVideoReadRepository {
 const check=async(q:PromiseLike<{data:any;error:any}>)=>{const r=await q;if(r.error)throw new Error('Media authorization lookup failed');return r.data;};
 return {
  asset:async id=>{
   const attachment=await check(admin.from('post_attachments').select('post_id,file_url,transform_meta').eq('id',id).maybeSingle());
   if(!attachment?.transform_meta?.post_video_job_id)return null;
   const job=await check(admin.from('post_video_processing_jobs').select('post_id,attachment_id,source_generation,output_key,output_bucket,output_size,output_verified_at,published_at,cancelled,gateway_url').eq('id',attachment.transform_meta.post_video_job_id).eq('attachment_id',id).maybeSingle());
   if(!job||job.post_id!==attachment.post_id||job.gateway_url!==attachment.file_url||!job.output_verified_at)return null;
   return job;
  },
  post:id=>check(admin.from('posts').select('id,user_id,visibility,deleted_at').eq('id',id).maybeSingle()),
  friends:async(viewer,owner)=>(await check(admin.from('friendships').select('id').eq('status','accepted').or(`and(user_id.eq.${viewer},friend_id.eq.${owner}),and(user_id.eq.${owner},friend_id.eq.${viewer})`).limit(1))).length>0,
  blocked:async(viewer,owner)=>(await check(admin.from('user_blocks').select('blocker_id').or(`and(blocker_id.eq.${viewer},blocked_id.eq.${owner}),and(blocker_id.eq.${owner},blocked_id.eq.${viewer})`).limit(1))).length>0,
 };
}

/** Byte bounded, including chunked bodies with no Content-Length. */
export async function readPostVideoJson(request:Request):Promise<{raw:string;body:any}> {
 if(!request.body)throw new Error('Missing request body');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try {
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096)throw new Error('Request too large');chunks.push(value);}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const raw=new TextDecoder().decode(bytes);return {raw,body:JSON.parse(raw)};
}
