export interface PostVideoCronEnv { POST_VIDEO_PROCESS_URL?:string; POST_VIDEO_CRON_SECRET?:string }
/** A scheduled event, independent of tabs. Idle runs issue just one tick. */
export async function runPostVideoCron(env:PostVideoCronEnv,fetcher:typeof fetch=fetch,sleep:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
 if(env.POST_VIDEO_PROCESS_URL!=='https://tljfqavndndfsvtazibe.supabase.co/functions/v1/process-post-videos'||!env.POST_VIDEO_CRON_SECRET||env.POST_VIDEO_CRON_SECRET.length<32)throw new Error('Post video cron is not configured');
 for(let step=0;step<6;step++){
  const r=await fetcher(env.POST_VIDEO_PROCESS_URL,{method:'POST',headers:{'content-type':'application/json','x-post-video-cron-secret':env.POST_VIDEO_CRON_SECRET},body:JSON.stringify({action:'tick'}),redirect:'manual',signal:AbortSignal.timeout(125000)});
  if(!r.ok){await r.body?.cancel();throw new Error('Post video scheduled tick failed');}
  const data=await r.json() as {results?:{phase?:string}[]};
  if(!data.results?.length||data.results.every(x=>x.phase==='busy'))break;
  if(step<5)await sleep(1100);
 }
}
