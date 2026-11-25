export function parsePostVideoLocator(url:string) {
 try {
  const u=new URL(url);
  if(u.origin!=='https://fun.rich')return null;
  const match=/^\/media-optimized\/([a-f0-9-]{36})\/([a-f0-9-]{36})\.mp4$/.exec(u.pathname);
  return match?{attachmentId:match[1],sourceGeneration:match[2],url:u.origin+u.pathname}:null;
 }catch{return null;}
}
export async function renewVideoAtPosition(video:HTMLVideoElement,authorize:()=>Promise<unknown>) {
 await authorize();
 const position=video.currentTime,wasPlaying=!video.paused;
 await new Promise<void>((resolve,reject)=>{
  const done=()=>{cleanup();video.currentTime=Math.min(position,Number.isFinite(video.duration)?Math.max(0,video.duration-0.05):position);resolve();};
  const error=()=>{cleanup();reject(new Error('Video reload failed'));};
  const timer=setTimeout(error,10000);
  const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',error);};
  video.addEventListener('loadedmetadata',done,{once:true});video.addEventListener('error',error,{once:true});video.load();
 });
 if(wasPlaying)await video.play().catch(()=>{});
}
