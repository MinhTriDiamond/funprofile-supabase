import { describe,it,expect,vi } from 'vitest';
import { parsePostVideoLocator, renewVideoAtPosition } from '../../utils/postVideoPlayback';
describe('optimized video playback',()=>{
 it('recognizes only the configured gateway and exact attachment generation',()=>{
  expect(parsePostVideoLocator('https://evil.example/media-optimized/a/b.mp4')).toBeNull();
  expect(parsePostVideoLocator('https://fun.rich/media-optimized/30000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001.mp4')?.attachmentId).toContain('30000000');
 });
 it('expiredTokenRefreshKeepsPosition and playback state',async()=>{
  const video=new EventTarget() as HTMLVideoElement;
  Object.assign(video,{currentTime:123,paused:false,duration:300,play:vi.fn().mockResolvedValue(undefined),load:vi.fn(()=>{video.currentTime=0;queueMicrotask(()=>video.dispatchEvent(new Event('loadedmetadata')));})});
  const renew=vi.fn().mockResolvedValue(undefined);
  await renewVideoAtPosition(video,renew);
  expect(renew).toHaveBeenCalledTimes(1);expect(video.currentTime).toBe(123);expect(video.play).toHaveBeenCalled();
 });
 it('never reloads into an unauthorized source when renewal fails',async()=>{
  const load=vi.fn();const video={load,currentTime:5} as unknown as HTMLVideoElement;
  await expect(renewVideoAtPosition(video,async()=>{throw new Error('denied');})).rejects.toThrow();expect(load).not.toHaveBeenCalled();
 });
});
