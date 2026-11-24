import { corsHeaders, json, requireUser, createAdminClient, HttpError } from '../_shared/httpAuth.ts';
import { authorizePostVideoRead, createPostVideoReadRepository, signPostVideoPermit, verifyPostVideoPermit, verifyVideoMac, readPostVideoJson } from '../_shared/postVideoRead.ts';
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:corsHeaders});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try {
  const {raw,body}=await readPostVideoJson(req);
  const admin=createAdminClient(),repo=createPostVideoReadRepository(admin);
  const secret=Deno.env.get('POST_VIDEO_READ_SECRET');
  if(!secret||secret.length<32)return json({error:'Media reader unavailable'},503);
  if(body.action==='mint') {
   const viewerId=req.headers.has('authorization')?(await requireUser(req)).id:null;
   const access=await authorizePostVideoRead({attachmentId:body.attachmentId,sourceGeneration:body.sourceGeneration,viewerId},repo);
   if(!access.allowed||!access.postId)return json({allowed:false},403);
   const expiresAt=Date.now()+300000;
   const permit=await signPostVideoPermit({attachmentId:body.attachmentId,sourceGeneration:body.sourceGeneration,viewerId,postId:access.postId,expiresAt},secret);
   return json({permit,expiresAt});
  }
  if(body.action==='authorize') {
   const timestamp=req.headers.get('x-post-video-time'),mac=req.headers.get('x-post-video-mac');
   const gatewaySecret=Deno.env.get('POST_VIDEO_GATEWAY_SECRET');
   if(!gatewaySecret||gatewaySecret.length<32||!timestamp||!mac||!Number.isSafeInteger(Number(timestamp))||Math.abs(Date.now()-Number(timestamp))>30000||
      !await verifyVideoMac(`${timestamp}.${raw}`,mac,gatewaySecret))return json({allowed:false},401);
   const permit=await verifyPostVideoPermit(body.permit,secret);
   if(permit.attachmentId!==body.attachmentId||permit.sourceGeneration!==body.sourceGeneration)return json({allowed:false},403);
   const access=await authorizePostVideoRead(permit,repo);
   if(!access.allowed||access.postId!==permit.postId)return json({allowed:false},403);
   return json(access);
  }
  return json({error:'Invalid action'},400);
 }catch(e){return json({allowed:false,error:e instanceof HttpError?e.message:'Media authorization failed'},e instanceof HttpError?e.status:403);}
});
