import { useLanguage } from '@/i18n/LanguageContext';
import { useRef } from 'react';
import { SocialVideoPlayer } from '@/components/ui/SocialVideoPlayer';
import { usePostVideoPlayback } from '@/hooks/usePostVideoPlayback';
export function OptimizedPostVideoPlayer({src,poster,className,controls=true}:{src:string;poster?:string;className?:string;controls?:boolean}) {
 const {language}=useLanguage();const vi=language==='vi';
 const videoRef=useRef<HTMLVideoElement>(null),errorRetries=useRef(0);
 const {ready,error,renew}=usePostVideoPlayback(src,videoRef);
 return <div className={className}>
  <SocialVideoPlayer videoRef={videoRef} showControls={controls} className="h-full w-full">
   <video ref={videoRef} src={ready?src:undefined} poster={poster} playsInline preload="metadata" className="h-full w-full object-contain"
    onError={()=>{if(errorRetries.current++<1)void renew(true).catch(()=>{});}} />
  </SocialVideoPlayer>
  {!ready&&<div role="status" className="flex flex-col items-center gap-2 bg-muted p-4 text-sm text-muted-foreground">
   <span>{error?(vi?error:'Video unavailable. Check your access and try again.'):(vi?'Đang chuẩn bị video…':'Preparing video…')}</span>
   {error&&<button type="button" className="rounded-md bg-secondary px-3 py-2 text-secondary-foreground" onClick={e=>{e.stopPropagation();errorRetries.current=0;void renew(false).catch(()=>{});}}>{vi?'Thử lại':'Retry'}</button>}
  </div>}
 </div>;
}
