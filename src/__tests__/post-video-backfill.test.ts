import {describe,it,expect} from 'vitest';
import {probeMp4Metadata,backfillProbeDecision} from '../../supabase/functions/_shared/postVideoBackfill';
const box=(kind:string,body:Uint8Array)=>{const a=new Uint8Array(8+body.length);new DataView(a.buffer).setUint32(0,a.length);a.set(new TextEncoder().encode(kind),4);a.set(body,8);return a;};
const concat=(...xs:Uint8Array[])=>{const a=new Uint8Array(xs.reduce((n,x)=>n+x.length,0));let at=0;for(const x of xs){a.set(x,at);at+=x.length;}return a;};
function movie(){const mvhd=new Uint8Array(100),view=new DataView(mvhd.buffer);view.setUint32(12,1000);view.setUint32(16,60000);const tkhd=new Uint8Array(84);new DataView(tkhd.buffer).setUint32(76,1280*65536);new DataView(tkhd.buffer).setUint32(80,720*65536);const stsd=new Uint8Array(16);new DataView(stsd.buffer).setUint32(4,1);new DataView(stsd.buffer).setUint32(8,8);stsd.set(new TextEncoder().encode('avc1'),12);return box('moov',concat(box('mvhd',mvhd),box('trak',concat(box('tkhd',tkhd),box('mdia',box('minf',box('stbl',box('stsd',stsd))))))));}
describe('backfill MP4 inspection',()=>{
 it('reads bounded duration, dimensions and codec',()=>expect(probeMp4Metadata(movie())).toEqual({duration:60,width:1280,height:720,codecs:['avc1']}));
 it('finds complete moov after a partial mdat tail',()=>expect(probeMp4Metadata(concat(new Uint8Array(64),movie()))?.duration).toBe(60));
 it('rejects truncated metadata',()=>expect(probeMp4Metadata(movie().slice(0,40))).toBeNull());
 it('does not trust oversized box lengths',()=>{const a=movie();new DataView(a.buffer).setUint32(0,0xffffffff);expect(probeMp4Metadata(a)).toBeNull();});
 it('does not infer duration from arbitrary text',()=>expect(probeMp4Metadata(new TextEncoder().encode('moov mvhd avc1'))).toBeNull());
});
describe('backfill compression decisions',()=>{
 const input={size:7000000,mime:'video/mp4',probe:{duration:60,width:1280,height:720,codecs:['avc1','mp4a']},kind:'webcam'};
 it('preserves a lean H264/AAC webcam source',()=>expect(backfillProbeDecision(input)).toBe('already_compressed'));
 it('admits a high bitrate source for actual size comparison',()=>expect(backfillProbeDecision({...input,size:100000000})).toBe('admit'));
 it('does not claim unsupported codec is compressed',()=>expect(backfillProbeDecision({...input,probe:{...input.probe,codecs:['hvc1']}})).toBe('admit'));
 it('holds webcam metadata ambiguity rather than re-encoding a lean source blindly',()=>expect(backfillProbeDecision({...input,probe:null})).toBe('held_metadata'));
 it('does not apply webcam heuristic to feed uploads',()=>expect(backfillProbeDecision({...input,kind:'feed'})).toBe('admit'));
 it('holds duration beyond provider bound',()=>expect(backfillProbeDecision({...input,probe:{...input.probe,duration:14401}})).toBe('held_duration'));
 it.each([0,-1,NaN,10737418241])('holds invalid source size %s',size=>expect(backfillProbeDecision({...input,size})).toBe('held_size'));
});
