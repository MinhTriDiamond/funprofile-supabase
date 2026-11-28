import {describe,it,expect} from 'vitest';
import {recordingArchiveScope,eligibleUnpublishedRecording,validateRecordingParts,RECORDING_ARCHIVE_PART_BYTES as part} from '../../../supabase/functions/_shared/unpublishedRecordingPolicy';
const uid='4a574ce41a29381867c59842c8f7f38c',input='165f93ddeee3ec027722e1b173b113e4';
const video={uid,liveInput:input,status:{state:'ready'},readyToStream:true,requireSignedURLs:false,duration:3381.37};
describe('unpublished recording archive',()=>{
 it('requires a finished public VOD from the exact input and UID',()=>{
  expect(eligibleUnpublishedRecording(video,uid,input)).toBe(true);
  for(const patch of [{live:true},{status:{state:'live-inprogress'}},{requireSignedURLs:true},{requireSignedURLs:undefined},{duration:14401},{duration:0},{uid:'other'},{liveInput:'other'}]) expect(eligibleUnpublishedRecording({...video,...patch},uid,input)).toBe(false);
 });
 it('preserves provenance when Cloudflare returns a nested input',()=>expect(eligibleUnpublishedRecording({...video,liveInput:{uid:input}},uid,input)).toBe(true));
 it('requires full ordered parts with exact byte coverage',()=>{
  const parts=[{partNumber:1,etag:'a'.repeat(32),size:part},{partNumber:2,etag:'b'.repeat(32),size:1234}];
  expect(validateRecordingParts(parts,part+1234)).toBe(true);
  expect(validateRecordingParts(parts.slice(0,1),part+1234)).toBe(false);
  expect(validateRecordingParts([...parts].reverse(),part+1234)).toBe(false);
  expect(validateRecordingParts([{...parts[0],etag:'<xml>'},parts[1]],part+1234)).toBe(false);
  expect(validateRecordingParts(parts,part+1235)).toBe(false);
 });
 it('accepts only the matching scoped unexpired token',async()=>{
  const token='temporary-operator';const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
  const s={tokenHash:hash,configId:'e0d48bc5-c7a6-4909-9e48-e7c6d935eef6',streamUid:uid,expiresAt:'2026-11-29T00:00:00Z',maxBytes:10*1024**3};const now=Date.parse('2026-11-28T00:00:00Z');
  expect((await recordingArchiveScope(JSON.stringify(s),token,now))?.streamUid).toBe(uid);
  for(const [raw,t,time]of [[JSON.stringify(s),'wrong',now],[JSON.stringify(s),token,now+86400000],['{}',token,now],[JSON.stringify({...s,configId:'../bad'}),token,now],[JSON.stringify({...s,maxBytes:100*1024**3}),token,now]] as const)expect(await recordingArchiveScope(raw,t,time)).toBeNull();
 });
});
