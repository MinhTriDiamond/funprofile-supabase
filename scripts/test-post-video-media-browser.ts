/** Browser/R2 harness: synthetic local MP4, mocked authority, no production credentials. */
import { chromium } from '@playwright/test';
import worker from '../workers/post-video-media/src/index';
import { signPostVideoPermit, verifyPostVideoPermit } from '../supabase/functions/_shared/postVideoRead';
const attachment='30000000-0000-0000-0000-000000000001',generation='40000000-0000-0000-0000-000000000001';
const path=`/media-optimized/${attachment}/${generation}.mp4`;
const temp=`/private/tmp/post-video-browser-${crypto.randomUUID()}.mp4`;
const ffmpeg=Bun.spawn(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:d=3','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',temp],{stdout:'ignore',stderr:'pipe'});
if(await ffmpeg.exited)throw new Error(await new Response(ffmpeg.stderr).text());
const bytes=new Uint8Array(await Bun.file(temp).arrayBuffer());
let revoked=false,clockAdvance=0,authorizations=0;
const env={POST_VIDEO_GATEWAY_SECRET:'local-test-only',POST_VIDEO_AUTH_URL:'https://local.invalid/functions/v1/post-video-read',POST_VIDEO_OUTPUT_BUCKET:{get:async(_key:string,options?:{range?:{offset:number;length:number}})=>{
 const r=options?.range;return {size:bytes.length,httpEtag:'"local-fixture"',body:new Blob([r?bytes.slice(r.offset,r.offset+r.length):bytes]).stream()};
}},fetch:async(_url:any,init:any)=>{
 authorizations++;const body=JSON.parse(init.body);
 try{await verifyPostVideoPermit(body.permit,'local-test-only',Date.now()+clockAdvance);}catch{return new Response('{}',{status:401});}
 return Response.json(revoked?{allowed:false}:{allowed:true,key:`optimized/${attachment}/${generation}.mp4`,size:bytes.length,mime:'video/mp4'});
}};
const server=Bun.serve({hostname:'localhost',port:8080,fetch:async req=>{
 const url=new URL(req.url);
 if(url.pathname.startsWith('/media-optimized/'))return worker.fetch(req,env);
 if(url.pathname==='/mint')return Response.json({permit:await signPostVideoPermit({viewerId:null,postId:'10000000-0000-0000-0000-000000000001',attachmentId:attachment,sourceGeneration:generation,expiresAt:Date.now()+clockAdvance+300000},'local-test-only')});
 if(url.pathname==='/expire'){clockAdvance=301000;return new Response('ok');}
 if(url.pathname==='/revoke'){revoked=true;return new Response('ok');}
 return new Response('<!doctype html><html><body><video controls muted id="video"></video></body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();await page.goto('http://localhost:8080');
 const result=await page.evaluate(async({path,size})=>{
  const install=async()=>{const {permit}=await(await fetch('/mint')).json();const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({permit})});if(r.status!==204)throw new Error('cookie exchange failed '+r.status);};
  await install();
  const video=document.querySelector('video')!;video.src=path;
  await new Promise<void>((resolve,reject)=>{video.onloadedmetadata=()=>resolve();video.onerror=()=>reject(new Error('video failed'));});
  await video.play();video.pause();video.currentTime=1;
  const head=await fetch(path,{method:'HEAD'});if(head.status!==200||head.headers.get('content-length')!==String(size))throw new Error('HEAD failed');
  const range=await fetch(path,{headers:{Range:'bytes=2-9'}});if(range.status!==206||(await range.arrayBuffer()).byteLength!==8)throw new Error('Range failed');
  const full=await fetch(path+'?download=1');if((await full.arrayBuffer()).byteLength!==size||!full.headers.get('content-disposition')?.includes('attachment'))throw new Error('download incomplete');
  await fetch('/expire');if((await fetch(path,{headers:{Range:'bytes=0-1'}})).status!==401)throw new Error('expired permit accepted');
  await install();if((await fetch(path,{headers:{Range:'bytes=0-1'}})).status!==206)throw new Error('renewal failed');
  await fetch('/revoke');if((await fetch(path,{headers:{Range:'bytes=0-1'}})).status!==403)throw new Error('revoked read accepted');
  return {duration:video.duration,position:video.currentTime,downloadBytes:size};
 },{path,size:bytes.length});
 console.log(JSON.stringify({passed:true,...result,authorizations}));
}finally{await browser?.close();server.stop(true);await Bun.file(temp).delete();}
