import { supabase } from '@/integrations/supabase/client';
import { parsePostVideoLocator } from './postVideoPlayback';
export async function authorizePostVideoPlayback(url:string,signal?:AbortSignal) {
 const locator=parsePostVideoLocator(url);if(!locator)throw new Error('Invalid private video locator');
 const {data:{session}}=await supabase.auth.getSession();
 const headers:Record<string,string>={'content-type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY};
 if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
 const mint=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-video-read`,{method:'POST',headers,body:JSON.stringify({action:'mint',attachmentId:locator.attachmentId,sourceGeneration:locator.sourceGeneration}),signal});
 if(!mint.ok){await fetch(locator.url,{method:'DELETE',credentials:'include',cache:'no-store',signal}).catch(()=>{});throw new Error('Không có quyền xem video hoặc phiên đăng nhập đã hết hạn');}
 const {permit,expiresAt}=await mint.json();
 if(typeof permit!=='string'||typeof expiresAt!=='number')throw new Error('Invalid video permission response');
 const install=await fetch(locator.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({permit}),credentials:'include',cache:'no-store',signal});
 if(install.status!==204)throw new Error('Không thể cấp quyền phát video');
 return {url:locator.url,expiresAt};
}
export async function downloadOptimizedPostVideo(url:string) {
 const access=await authorizePostVideoPlayback(url);
 const a=document.createElement('a');a.href=access.url+'?download=1';a.download='video.mp4';a.rel='noopener';
 document.body.appendChild(a);a.click();a.remove();
}
