export function isPostVideoManagedStream(video:{creator?:unknown;meta?:{name?:unknown}}) {
 return typeof video.creator==='string'&&/^post-video:[a-f0-9-]{36}$/.test(video.creator)||
  typeof video.meta?.name==='string'&&/^post-video-[a-f0-9-]{36}$/.test(video.meta.name);
}
export async function collectPostVideoReferences(admin:any):Promise<{protectedStreamUids:Set<string>;protectedR2Keys:Set<string>}> {
 const protectedStreamUids=new Set<string>(),protectedR2Keys=new Set<string>();
 for(const [table,columns] of [['post_video_processing_jobs','stream_uid,source_key,output_key'],['post_attachments','file_url,storage_key,file_type']]) {
  for(let start=0;;start+=500) {
   const {data,error}=await admin.from(table).select(columns).range(start,start+499);
   if(error||!Array.isArray(data))throw new Error('Cannot verify post video references');
   for(const row of data) {
    if(typeof row.stream_uid==='string')protectedStreamUids.add(row.stream_uid);
    for(const k of ['source_key','output_key','storage_key'])if(typeof row[k]==='string'&&(table!=='post_attachments'||row.file_type==='video'||row[k].startsWith('videos/')))protectedR2Keys.add(row[k]);
    if(typeof row.file_url==='string')for(const match of row.file_url.matchAll(/https:\/\/(?:customer-[a-z0-9-]+\.cloudflarestream\.com|(?:iframe\.|watch\.)?videodelivery\.net)\/([a-f0-9]{32})(?:\/|$)/g))protectedStreamUids.add(match[1]);
   }
   if(data.length<500)break;
  }
 }
 return {protectedStreamUids,protectedR2Keys};
}
