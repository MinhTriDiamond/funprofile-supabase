/** Actual workerd runtime, mock authority/R2; no production bindings or credentials. */
import { resolve } from 'node:path';
const workspace=resolve('.local-backups/optimized-video-download-2026-11-25');
await Bun.write(`${workspace}/worker-runtime-fixture.ts`, `
import worker from '../../workers/post-video-media/src/index';
export default {fetch(request:Request){return worker.fetch(request,{
 POST_VIDEO_GATEWAY_SECRET:'local-only',POST_VIDEO_AUTH_URL:'https://local.invalid/functions/v1/post-video-read',
 fetch:async()=>Response.json({allowed:true,key:'optimized/30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001.mp4',size:10}),
 POST_VIDEO_OUTPUT_BUCKET:{get:async(_key,options)=>{const r=options?.range;const offset=r?.offset||0,length=(r?.length||10)+(new URL(request.url).searchParams.get('body')==='short'?-1:new URL(request.url).searchParams.get('body')==='long'?1:0);return {size:10,httpEtag:'"local"',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(Array.from({length},(_,i)=>offset+i)));c.close();}})};}}
});}};
`);
await Bun.write(`${workspace}/worker-runtime.json`,JSON.stringify({name:'post-video-runtime-test',main:'./worker-runtime-fixture.ts',compatibility_date:'2026-11-24',workers_dev:false}));
const child=Bun.spawn(['bunx','wrangler','dev','--local','--config',`${workspace}/worker-runtime.json`,'--port','8089','--ip','127.0.0.1','--log-level','error'],{stdout:'pipe',stderr:'pipe',env:{...process.env,CI:'true'}});
const out=new Response(child.stdout).text(),err=new Response(child.stderr).text();
try {
 const url='http://127.0.0.1:8089/media-optimized/30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001.mp4';
 let started=false;
 for(let i=0;i<60;i++){try{await fetch(url);started=true;break;}catch{await Bun.sleep(250);}}
 if(!started)throw new Error('workerd did not start');
 for(const [range,status,length] of [[undefined,200,10],['bytes=2-5',206,4]] as const){
  const r=await fetch(url,{headers:{Cookie:'post_video_permit=permit',...(range?{Range:range}:{})}});
  if(r.status!==status)throw new Error('Unexpected status '+r.status);
  if(r.headers.get('content-length')!==String(length))throw new Error(`workerd Content-Length missing or wrong (${r.headers.get('content-length')})`);
  if((await r.arrayBuffer()).byteLength!==length)throw new Error('workerd truncated body');
 }
 for(const body of ['short','long']){
  let rejected=false;
  try {const r=await fetch(url+'?body='+body,{headers:{Cookie:'post_video_permit=permit'}});await r.arrayBuffer();rejected=!r.ok;}catch{rejected=true;}
  if(!rejected)throw new Error('workerd accepted '+body+' body');
 }
 console.log('Actual workerd GET/206 Content-Length and exact streaming bodies, short/long body rejection passed');
}finally{child.kill();await child.exited;await Bun.write(`${workspace}/worker-runtime.log`,(await out)+(await err));}
