import { useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
type Status={phase?:string;outcome?:string;retryable?:boolean};
function statuses(metadata:unknown):Record<string,Status> {
 const value=(metadata as {video_processing_by_attachment?:unknown}|null)?.video_processing_by_attachment;
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,Status>:{};
}
export function getPostVideoPresentation(metadata:unknown,attachmentId:string) {
 const s=statuses(metadata)[attachmentId];if(!s||typeof s!=='object')return null;
 if(s.outcome==='original_retained'||s.phase==='not_beneficial')return {state:'original',retryable:false};
 if(s.phase==='ready'||s.phase==='complete')return {state:'ready',retryable:false};
 if(s.phase==='failed'||s.phase==='needs_review')return {state:'failed',retryable:s.retryable===true};
 if(s.phase==='cancelled')return null;
 return {state:'processing',retryable:false};
}
export function PostVideoProcessing({metadata,ownerId}:{metadata:unknown;ownerId:string}) {
 const {userId}=useCurrentUser(),{language}=useLanguage(),[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState('');
 const vi=language==='vi';
 const labels:Record<string,string>=vi?{processing:'Đang tối ưu video nền — video gốc vẫn xem được',ready:'Đã tối ưu video',original:'Giữ video gốc — bản xử lý không nhỏ hơn',failed:'Tối ưu video tạm dừng — video gốc vẫn xem được'}:{processing:'Optimizing video in the background — original available',ready:'Video optimized',original:'Original retained — processed video was not smaller',failed:'Optimization paused — original available'};
 return <>{Object.keys(statuses(metadata)).map(id=>{
  const status=getPostVideoPresentation(metadata,id);if(!status)return null;
  return <div role="status" key={id} className="flex flex-wrap items-center gap-2 bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
   <span>{labels[status.state]}</span>
   {userId===ownerId&&status.retryable&&<button type="button" disabled={!!busy} className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground" onClick={async e=>{
    e.stopPropagation();setBusy(id);setMessage('');
    try{const {data,error}=await (supabase as any).rpc('request_post_video_retry',{p_attachment_id:id});if(error||data!==true)throw new Error();setMessage(vi?'Đã yêu cầu thử lại':'Retry requested');}catch{setMessage(vi?'Chưa thể thử lại. Vui lòng thử sau.':'Retry unavailable. Please try later.');}finally{setBusy(null);}
   }}>{vi?'Thử lại':'Retry'}</button>}
  </div>;
 })}{message&&<div role="status" className="px-3 py-1 text-xs text-muted-foreground">{message}</div>}</>;
}
