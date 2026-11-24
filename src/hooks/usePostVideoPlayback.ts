import { useCallback,useEffect,useRef,useState,type RefObject } from 'react';
import { authorizePostVideoPlayback } from '@/utils/postVideoReadClient';
import { renewVideoAtPosition } from '@/utils/postVideoPlayback';
import { useCurrentUser } from './useCurrentUser';
export function usePostVideoPlayback(url:string,videoRef:RefObject<HTMLVideoElement>) {
 const {userId}=useCurrentUser();
 const [ready,setReady]=useState(false),[error,setError]=useState<string|null>(null);
 const inflight=useRef<Promise<unknown>|null>(null),timer=useRef<ReturnType<typeof setTimeout>>(),controller=useRef<AbortController>();
 const renew=useCallback(async(reload=false)=>{
  if(inflight.current)return inflight.current;
  const signal=controller.current?.signal;
  const authorize=async()=>{
   const access=await authorizePostVideoPlayback(url,signal);
   if(signal?.aborted)return;
   setReady(true);setError(null);clearTimeout(timer.current);
   timer.current=setTimeout(()=>{void renew(false).catch(()=>{});},Math.max(1000,access.expiresAt-Date.now()-30000));
  };
  const promise=(reload&&videoRef.current?renewVideoAtPosition(videoRef.current,authorize):authorize())
   .catch(e=>{if(!signal?.aborted){setError('Không thể phát video. Vui lòng kiểm tra quyền truy cập và thử lại.');setReady(false);}throw e;})
   .finally(()=>{if(inflight.current===promise)inflight.current=null;});
  inflight.current=promise;return promise;
 },[url,videoRef,userId]);
 useEffect(()=>{
  controller.current=new AbortController();setReady(false);setError(null);inflight.current=null;
  void renew(false).catch(()=>{});
  return ()=>{controller.current?.abort();clearTimeout(timer.current);};
 },[renew]);
 return {ready,error,renew};
}
