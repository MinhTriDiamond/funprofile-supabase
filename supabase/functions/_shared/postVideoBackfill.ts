import { readExactRangeResponse } from './postVideoTransfer.ts';
import { signedR2Request } from './r2MultipartService.ts';

export interface Mp4Probe { duration:number; width:number; height:number; codecs:string[] }
/** Bounded ISO-BMFF metadata parser: never trusts box lengths or reads media payloads. */
export function probeMp4Metadata(bytes:Uint8Array):Mp4Probe|null {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=(a:number,b:number)=>new TextDecoder().decode(bytes.subarray(a,b));
 let duration=0,width=0,height=0;const codecs=new Set<string>();let visited=0;
 const scan=(start:number,end:number,depth:number)=>{
  if(depth>8)return;
  for(let at=start;at+8<=end&&visited++<10000;){
   let size=view.getUint32(at),header=8;const type=text(at+4,at+8);
   if(size===1){if(at+16>end)return;const n=view.getBigUint64(at+8);if(n>BigInt(end-at))return;size=Number(n);header=16;}
   if(size===0)size=end-at;if(size<header||at+size>end)return;const body=at+header,limit=at+size;
   if(['moov','trak','mdia','minf','stbl'].includes(type))scan(body,limit,depth+1);
   if(type==='mvhd'&&body+20<=limit){const version=bytes[body];if(version===0){const scale=view.getUint32(body+12),ticks=view.getUint32(body+16);if(scale>0)duration=ticks/scale;}else if(version===1&&body+32<=limit){const scale=view.getUint32(body+20),ticks=view.getBigUint64(body+24);if(scale>0&&ticks<=BigInt(Number.MAX_SAFE_INTEGER))duration=Number(ticks)/scale;}}
   if(type==='tkhd'&&limit-body>=8){width=Math.max(width,view.getUint32(limit-8)/65536);height=Math.max(height,view.getUint32(limit-4)/65536);}
   if(type==='stsd'&&body+16<=limit){const count=view.getUint32(body+4);let entry=body+8;for(let i=0;i<Math.min(count,32)&&entry+8<=limit;i++){const length=view.getUint32(entry);if(length<8||entry+length>limit)break;codecs.add(text(entry+4,entry+8));entry+=length;}}
   at=limit;
  }
 };
 scan(0,bytes.length,0);
 // Tail ranges may start inside mdat. Only a complete moov box is considered.
 if(!duration)for(let at=4;at+4<bytes.length;at++){if(bytes[at]!==109||bytes[at+1]!==111||bytes[at+2]!==111||bytes[at+3]!==118)continue;const start=at-4,size=view.getUint32(start);if(size>=8&&start+size<=bytes.length){scan(start,start+size,0);if(duration)break;}}
 return duration>0&&Number.isFinite(duration)?{duration,width,height,codecs:[...codecs]}:null;
}
export function backfillProbeDecision(input:{size:number;mime:string;probe:Mp4Probe|null;kind:string}) {
 if(!Number.isSafeInteger(input.size)||input.size<=0||input.size>10737418240)return 'held_size';
 if(input.kind==='webcam'&&!input.probe)return 'held_metadata';
 if(input.probe&&input.probe.duration>14400)return 'held_duration';
 const p=input.probe;
 // Preserve already lean, browser-compatible webcam recordings rather than lossy re-encoding.
 if(input.kind==='webcam'&&p&&p.duration>=1&&p.width>0&&p.height>0&&Math.max(p.width,p.height)<=1920&&p.codecs.includes('avc1')&&p.codecs.every(c=>['avc1','mp4a'].includes(c))&&input.size*8/p.duration<=1200000)return 'already_compressed';
 return 'admit';
}
async function checked(q:PromiseLike<{data:any;error:any}>){const r=await q;if(r.error)throw new Error('Backfill database operation failed');return r.data;}
async function readMetadataRange(key:string,size:number,etag:string,start:number,end:number){
 const r=await signedR2Request({method:'GET',bucket:'fun-rich-media',key,headers:{Range:`bytes=${start}-${end}`,'If-Match':etag}});
 if(r.status!==206||r.headers.get('content-range')!==`bytes ${start}-${end}/${size}`||r.headers.get('content-length')!==String(end-start+1)){await r.body?.cancel();throw new Error('Backfill range proof failed');}
 return readExactRangeResponse(r,start,end,size);
}
export async function processPostVideoBackfill(admin:any){
 const lease=crypto.randomUUID(),q=await checked(admin.rpc('claim_post_video_backfill',{p_lease:lease}));if(!q)return null;
 const finish=(status:string,reason:string,probe:unknown={})=>checked(admin.rpc('finish_post_video_backfill',{p_id:q.id,p_lease:lease,p_status:status,p_reason:reason,p_probe:probe}));
 try{
  const head=await signedR2Request({method:'HEAD',bucket:'fun-rich-media',key:q.source_key});await head.body?.cancel();
  if(head.status===404){await finish('skipped','source_missing');return {id:q.id,status:'source_missing'};}
  if(head.status!==200)throw new Error('Backfill source access failed');
  const raw=head.headers.get('content-length'),size=Number(raw),etag=head.headers.get('etag'),mime=head.headers.get('content-type')||'';
  if(raw===null||!etag||etag.length>256||!Number.isSafeInteger(size)||size<=0||size>10737418240){await finish('held','invalid_source_size_or_etag');return {id:q.id,status:'held'};}
  let probe:Mp4Probe|null=null;
  if(/\.(mp4|mov)$/i.test(q.source_key)){
   const length=Math.min(size,4*1048576);probe=probeMp4Metadata(await readMetadataRange(q.source_key,size,etag,0,length-1));
   if(!probe&&size>length)probe=probeMp4Metadata(await readMetadataRange(q.source_key,size,etag,size-length,size-1));
  }
  const facts={size,mime,probe,kind:q.kind},decision=backfillProbeDecision(facts);
  if(decision!=='admit'){await finish(decision==='already_compressed'?'skipped':'held',decision,facts);return {id:q.id,status:decision};}
  const admitted=await checked(admin.rpc('admit_post_video_backfill',{p_id:q.id,p_lease:lease,p_size:size,p_etag:etag,p_probe:facts}));
  return admitted?{id:q.id,status:'queued',jobId:admitted.jobId}:{id:q.id,status:'not_admitted'};
 }catch{
  // Do not turn network ambiguity into "missing" or admit a second source.
  await finish('held','source_inspection_failed');return {id:q.id,status:'inspection_held'};
 }
}
