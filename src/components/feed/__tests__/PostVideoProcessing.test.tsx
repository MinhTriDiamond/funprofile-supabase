/** @vitest-environment jsdom */
import { afterEach,describe,it,expect,vi } from 'vitest';
import { cleanup,render,screen } from '@testing-library/react';
import { PostVideoProcessing,getPostVideoPresentation } from '../PostVideoProcessing';
vi.mock('@/hooks/useCurrentUser',()=>({useCurrentUser:()=>({userId:'owner'})}));
vi.mock('@/i18n/LanguageContext',()=>({useLanguage:()=>({language:'vi'})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn().mockResolvedValue({data:true})}}));
afterEach(cleanup);
describe('background optimization status',()=>{
 it.each(['queued','importing','encoding','r2_upload'])('shows %s alongside existing video children',phase=>{
  render(<><video src="original.mov"/><PostVideoProcessing metadata={{video_processing_by_attachment:{a:{phase}}}} ownerId="owner"/></>);
  expect(document.querySelector('video')?.getAttribute('src')).toBe('original.mov');expect(screen.getByRole('status')).toBeTruthy();
 });
 it('keeps different attachments independent',()=>{
  const metadata={video_processing_by_attachment:{a:{phase:'encoding'},b:{phase:'ready'}}};
  expect(getPostVideoPresentation(metadata,'a')?.state).toBe('processing');expect(getPostVideoPresentation(metadata,'b')?.state).toBe('ready');
 });
 it('does not claim compression for not-beneficial output',()=>{
  render(<PostVideoProcessing metadata={{video_processing_by_attachment:{a:{phase:'complete',outcome:'original_retained'}}}} ownerId="owner"/>);
  expect(screen.getByRole('status').textContent).toContain('Giữ video gốc');expect(screen.getByRole('status').textContent).not.toContain('Đã tối ưu');
 });
 it('offers retry only for an owner and a server-approved retryable failure',()=>{
  const metadata={video_processing_by_attachment:{a:{phase:'needs_review',retryable:true}}};
  const {rerender}=render(<PostVideoProcessing metadata={metadata} ownerId="other"/>);expect(screen.queryByRole('button')).toBeNull();
  rerender(<PostVideoProcessing metadata={metadata} ownerId="owner"/>);expect(screen.getByRole('button').textContent).toContain('Thử lại');
 });
 it('renders nothing for image-only or skipped non-public posts',()=>{
  const {container}=render(<PostVideoProcessing metadata={{}} ownerId="owner"/>);expect(container.textContent).toBe('');
 });
});
