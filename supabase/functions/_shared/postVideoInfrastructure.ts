import { createMultipartUpload,uploadPart,completeMultipartUpload,signedR2Request } from './r2MultipartService.ts';
import { verifyPostVideoOutput,POST_VIDEO_PRIVATE_BUCKET } from './postVideoR2.ts';
import { readPostVideoStorageUsage,postVideoStreamConfig } from './postVideoStream.ts';
/** Privileged preflight: a 1KiB synthetic object, never a user original or Stream import. */
export async function probePostVideoInfrastructure() {
 const key=`optimized/${crypto.randomUUID()}/${crypto.randomUUID()}.mp4`,bucket=POST_VIDEO_PRIVATE_BUCKET;
 const bytes=new Uint8Array(1024);bytes.set([102,116,121,112],4);
 const upload=await createMultipartUpload(key,'video/mp4',bucket);
 let completed=false,deleted=false;
 try {
  const part=await uploadPart({bucket,key,uploadId:upload.uploadId,partNumber:1,body:bytes,contentLength:bytes.length});
  await completeMultipartUpload({bucket,key,uploadId:upload.uploadId,parts:[part]});completed=true;
  await verifyPostVideoOutput(bucket,key,bytes.length);
  const usage=await readPostVideoStorageUsage();
  const r=await signedR2Request({bucket,key,method:'DELETE'});await r.body?.cancel();
  if(!r.ok&&r.status!==404)throw new Error('Infrastructure fixture removal failed');deleted=true;
  return {privateR2Verified:true,fixtureDeleted:true,bucket,streamAccountId:postVideoStreamConfig().accountId,usage};
 }finally{
  if(!completed){const r=await signedR2Request({bucket,key,method:'DELETE',query:{uploadId:upload.uploadId}});await r.body?.cancel();if(!r.ok&&r.status!==404)throw new Error('Infrastructure multipart removal failed');}
  if(!deleted){const r=await signedR2Request({bucket,key,method:'DELETE'});await r.body?.cancel();if(!r.ok&&r.status!==404)throw new Error('Infrastructure fixture removal failed');}
 }
}
