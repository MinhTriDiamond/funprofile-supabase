/** @vitest-environment jsdom */
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/i18n/LanguageContext',()=>({useLanguage:()=>({t:(key:string)=>key})}));
import {PostComposerPreview} from '../PostComposerPreview';
import type {DraftAttachment} from '@/modules/feed/types';
afterEach(cleanup);
const image=(id:string,sortOrder:number):DraftAttachment=>({id,kind:'image',previewUrl:`blob:${id}`,fileUrl:`https://example.invalid/${id}`,sortOrder,sizeBytes:10,mimeType:'image/png',uploadStatus:'local',source:'picker',altText:id});
it('shows current privacy, text and the same ordered local media without upload controls',()=>{render(<PostComposerPreview name="Test" content="Nội dung mới" privacy="private" attachments={[image('second',1),image('first',0)]}/>);expect(screen.getByText('privacyOnlyMe')).toBeTruthy();expect(screen.getByTestId('composer-preview-text').textContent).toBe('Nội dung mới');expect(screen.getAllByRole('img').map(i=>i.getAttribute('src'))).toEqual(['blob:first','blob:second']);expect(screen.queryByRole('button')).toBeNull();});
it('never loads or plays an additional copy of a selected video',()=>{const video={...image('video',0),kind:'video' as const,previewUrl:'blob:video-source',thumbnailUrl:'blob:video-poster'};const{container,rerender}=render(<PostComposerPreview name="Test" content="" privacy="friends" attachments={[video]}/>);expect(screen.getByRole('img').getAttribute('src')).toBe('blob:video-poster');expect(container.querySelector('video')).toBeNull();rerender(<PostComposerPreview name="Test" content="Đã sửa" privacy="public" attachments={[]}/>);expect(screen.queryByRole('img')).toBeNull();expect(screen.getByText('privacyPublic')).toBeTruthy();});
