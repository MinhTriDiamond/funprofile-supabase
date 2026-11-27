import{createHash}from'node:crypto';
import { resolve } from 'node:path';
const root=process.argv[2];
if(!root||!resolve(root).includes('/.local-backups/'))throw new Error('Use an ignored .local-backups directory containing inventory.json');
const posts=(await Bun.file(root+'/inventory.json').json()).rows;
const groups:Record<string,number>={},items:any[]=[];
function add(x:any){items.push(x);groups[x.classification]=(groups[x.classification]||0)+1;}
for(const p of posts){const meta=p.metadata||{},sessions=p.sessions||[];
const rtmp=meta.live_mode==='rtmp_obs'||sessions.some((s:any)=>s.mode==='rtmp_obs')||['rtmp','obs'].includes(meta.source_type)||meta.rtmp_config_id;
const webcam=!rtmp&&(meta.live_mode==='agora_webcam'||sessions.some((s:any)=>s.mode==='agora_webcam'));
const base={postId:p.id,userId:p.user_id,createdAt:p.created_at,visibility:p.visibility,kind:rtmp?'rtmp':webcam?'webcam':'feed'};
if(rtmp){add({...base,classification:'excluded_rtmp'});continue;}
if(p.visibility!=='public'){add({...base,classification:'held_privacy'});continue;}
if(p.post_type==='live'||sessions.some((s:any)=>!s.ended_at&&!['ended','offline','failed'].includes(s.status))){add({...base,classification:'held_live'});continue;}
const sources=new Map<string,any>();for(const a of p.attachments||[])sources.set(a.file_url,{url:a.file_url,attachment:a});for(const m of p.media_urls||[]){if(m?.type==='video'&&m.url&&!sources.has(m.url))sources.set(m.url,{url:m.url});}if(p.video_url&&!sources.has(p.video_url))sources.set(p.video_url,{url:p.video_url});
for(const entry of sources.values()){
 const url=entry.url,a=entry.attachment;const existing=(p.jobs||[]).find((j:any)=>j.attachment_id===a?.id||j.source_key===a?.storage_key);
 if(existing){add({...base,url,classification:existing.phase==='complete'?'already_processed':'existing_job',job:existing});continue;}
 let u:URL;try{u=new URL(url);}catch{add({...base,classification:'held_invalid_url'});continue;}
 if(u.pathname.startsWith('/media-optimized/')){add({...base,classification:'already_optimized'});continue;}
 if(/(^|\.)(videodelivery\.net|cloudflarestream\.com)$/.test(u.hostname)||u.hostname==='iframe.videodelivery.net'){add({...base,classification:'already_stream_encoded',url});continue;}
 if(!['media.fun.rich','pub-e83e74b0726742fbb6a60bc08f95624b.r2.dev'].includes(u.hostname)||u.search||u.hash||u.pathname.includes('%')||u.pathname.includes('..')){add({...base,classification:'held_external_or_ambiguous_url',url});continue;}
 const key=u.pathname.slice(1);
 if(webcam){const known=meta.cloudflare_video_uid||meta.stream_uid;const matches=meta.r2_object_key===key||sessions.some((s:any)=>s.r2_object_key===key);add({...base,url,key,classification:known&&matches?'webcam_archived_encoded':'held_webcam_provenance',sessionIds:sessions.map((s:any)=>s.id)});continue;}
 if(p.post_type!=='normal'||meta.live_session_id){add({...base,url,key,classification:'held_unknown_live'});continue;}
 if(!/^videos\/(?:[a-f0-9-]{36}\/)?[A-Za-z0-9_.-]+\.(mp4|mov|webm|mkv)$/i.test(key)){add({...base,url,key,classification:'held_source_key'});continue;}
 add({...base,url,key,attachmentId:a?.id||null,declaredSize:a?.size_bytes||null,classification:'feed_candidate',candidateId:createHash('sha256').update(p.id+'\n'+url).digest('hex')});
}}
await Bun.write(root+'/classified.json',JSON.stringify(items,null,2));await Bun.write(root+'/summary.json',JSON.stringify({posts:posts.length,sourceItems:items.length,groups},null,2));console.log(JSON.stringify({posts:posts.length,sourceItems:items.length,groups}));

// Only explicitly classified, local snapshots become server-side inventory.
const rtmpKeys=new Set<string>();
for(const p of posts){const m=p.metadata||{};if(m.live_mode!=='rtmp_obs'&&!(p.sessions||[]).some((s:any)=>s.mode==='rtmp_obs'))continue;
 for(const key of [m.r2_object_key,...(p.sessions||[]).map((s:any)=>s.r2_object_key)])if(typeof key==='string')rtmpKeys.add(key);
 for(const url of [p.video_url,...(p.attachments||[]).map((a:any)=>a.file_url),...(p.media_urls||[]).filter((m:any)=>m?.type==='video').map((m:any)=>m.url)])try{rtmpKeys.add(new URL(url).pathname.slice(1));}catch{}
}
const eligible=items.filter(x=>(x.classification==='feed_candidate'||x.classification==='held_webcam_provenance'&&x.key===`replays/${x.userId}/${x.sessionIds?.[0]}/replay.mp4`)&&!rtmpKeys.has(x.key));
const quote=(s:unknown)=>"'"+String(s).replaceAll("'","''")+"'";
let sql="BEGIN;\nDO $$ BEGIN IF (SELECT enabled FROM public.post_video_backfill_control WHERE id) THEN RAISE EXCEPTION 'Pause admission before seeding'; END IF; END $$;\n";
for(const x of eligible){const hex=createHash('sha256').update(x.postId+'\n'+x.url).digest('hex').slice(0,32),id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');sql+=`INSERT INTO public.post_video_backfill_items(id,run_name,post_id,user_id,source_url,source_key,kind,created_at) VALUES(${quote(id)}::uuid,'old-videos-2026-11-27',${quote(x.postId)}::uuid,${quote(x.userId)}::uuid,${quote(x.url)},${quote(x.key)},${quote(x.kind)},${quote(x.createdAt)}::timestamptz) ON CONFLICT DO NOTHING;\n`;}
sql+='COMMIT;\n';
await Bun.write(root+'/seed.sql',sql);await Bun.write(root+'/seed-summary.json',JSON.stringify({run:'old-videos-2026-11-27',entries:eligible.length,feed:eligible.filter(x=>x.kind==='feed').length,webcam:eligible.filter(x=>x.kind==='webcam').length,excludedRtmpKeys:rtmpKeys.size},null,2));
console.log(JSON.stringify({seedEntries:eligible.length,feed:eligible.filter(x=>x.kind==='feed').length,webcam:eligible.filter(x=>x.kind==='webcam').length}));
