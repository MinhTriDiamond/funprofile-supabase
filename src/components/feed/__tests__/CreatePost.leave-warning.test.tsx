/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  save: vi.fn(), getDraft: vi.fn(), getSession: vi.fn(), upload: vi.fn(), fetch: vi.fn(), toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ userId: 'owner' }) }));
vi.mock('@/hooks/useAccountCapabilities', () => ({ useAccountCapabilities: () => ({ canCreatePost: true, isLoading: false }) }));
vi.mock('@/hooks/useHaptics', () => ({ useHaptics: () => () => {} }));
vi.mock('@/hooks/usePplpEvaluate', () => ({ usePplpEvaluate: () => ({ evaluateAsync: vi.fn() }) }));
vi.mock('@/i18n/LanguageContext', () => ({ useLanguage: () => ({ language: 'vi', t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/usePostDraft', () => ({
  usePostDraftAutoSave: vi.fn(), getPostDraft: mocks.getDraft, clearPostDraft: vi.fn().mockResolvedValue(true),
  savePostDraftNow: mocks.save, restoreDraftAttachments: (draft: any) => draft.attachments,
  setDialogOpenState: vi.fn(), getDialogOpenState: () => false,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: mocks.getSession },
  from: () => { const query: any = { select: () => query, eq: () => query,
    single: async () => ({ data: { id: 'owner', username: 'Test' } }), maybeSingle: async () => ({ data: null }) }; return query; },
} }));
vi.mock('@/utils/r2Upload', () => ({ uploadToR2: mocks.upload }));
vi.mock('@/utils/imageCompression', () => ({ getVideoDuration: async () => 367, compressPostImage: async (file: File) => file }));
vi.mock('@/utils/videoPoster', () => ({ generateVideoPoster: async () => null }));
vi.mock('@/lib/optimisticFeed', () => ({ addOptimisticGhost: vi.fn(), removeOptimisticGhost: vi.fn(), buildOptimisticGhost: () => ({}) }));
vi.mock('../FriendTagDialog', () => ({ FriendTagDialog: () => null }));
vi.mock('../LocationCheckin', () => ({ LocationCheckin: () => null }));
vi.mock('../FeelingActivityDialog', () => ({ FeelingActivityDialog: () => null }));
vi.mock('../EmojiPicker', () => ({ EmojiPicker: () => null }));
vi.mock('../PrivacySelector', () => ({ PrivacySelector: () => null }));
vi.mock('@/modules/live/components/StartLiveDialog', () => ({ StartLiveDialog: () => null }));
vi.mock('@/modules/feed/components/post/ImageEditorModal', () => ({ ImageEditorModal: () => null }));
vi.mock('@/modules/feed/components/post/AttachmentPreviewGrid', () => ({ AttachmentPreviewGrid: () => null }));
import { CreatePost } from '../FacebookCreatePost';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDraft.mockResolvedValue(null); mocks.save.mockResolvedValue(true);
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'local-test' } } });
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const unload = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
async function open() {
  render(<MemoryRouter initialEntries={['/?compose=post']}><CreatePost onPostCreated={() => {}} /></MemoryRouter>);
  await screen.findByRole('textbox', { hidden: true });
}
const close = () => fireEvent.click(screen.getAllByRole('button', { name: 'close' }).at(-1)!);
it('does not warn for an empty composer; closing text asks before discarding', async () => {
  await open(); expect(unload()).toBe(false);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nội dung chưa đăng' } });
  expect(unload()).toBe(true); close();
  expect(await screen.findByRole('alertdialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'fcpContinueEditing' }));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Nội dung chưa đăng');
  close(); fireEvent.click(screen.getByRole('button', { name: 'fcpDiscardPost' }));
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull()); expect(unload()).toBe(false);
});
it('keeps the composer open when saving a draft fails', async () => {
  await open(); mocks.save.mockResolvedValue(false);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nháp' } }); close();
  fireEvent.click(screen.getByRole('button', { name: 'fcpSaveDraft' }));
  await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('fcpDraftSaveFailed'));
  expect(screen.getByRole('alertdialog')).toBeTruthy(); expect(mocks.toast.success).not.toHaveBeenCalled(); expect(unload()).toBe(true);
});
it('warns during optimistic publishing after the dialog hides, then stops after success', async () => {
  let finish!: (r: Response) => void;
  mocks.fetch.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  await open(); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bài viết đang gửi' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'postButton' }).at(-1)!);
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
  expect(screen.queryByRole('textbox')).toBeNull(); expect(unload()).toBe(true);
  await act(async () => { finish(Response.json({ postId: 'test' })); });
  await waitFor(() => expect(unload()).toBe(false));
});
it('restores the warning and content when publishing fails', async () => {
  let finish!: (r: Response) => void;
  mocks.fetch.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  await open(); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Giữ bài khi lỗi' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'postButton' }).at(-1)!);
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
  await act(async () => { finish(Response.json({ error: 'Test error' }, { status: 500 })); });
  expect((await screen.findByRole('textbox') as HTMLTextAreaElement).value).toBe('Giữ bài khi lỗi'); expect(unload()).toBe(true);
});

it('keeps a tab warning after saving and closing while a video is uploading', async () => {
  let uploaded!: (value: any) => void;
  mocks.upload.mockImplementation(() => new Promise(resolve => { uploaded = resolve; }));
  await open();
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(['test'], 'test.mp4', { type: 'video/mp4' })] } });
  await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
  close(); expect(await screen.findByText('fcpUploadingLeaveDesc')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'fcpSaveDraft' }));
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull()); expect(unload()).toBe(true);
  await act(async () => { uploaded({ url: 'https://local.invalid/test.mp4', key: 'test.mp4' }); });
  await waitFor(() => expect(unload()).toBe(false));
});
it('explains why the composer must stay while a submit is being prepared', async () => {
  let authorize!: (value: any) => void;
  mocks.getSession.mockImplementation(() => new Promise(resolve => { authorize = resolve; }));
  mocks.fetch.mockResolvedValue(Response.json({ postId: 'test' }));
  await open(); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Đang chuẩn bị gửi' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'postButton' }).at(-1)!);
  await waitFor(() => expect(mocks.getSession).toHaveBeenCalled()); close();
  expect(await screen.findByText('fcpPostingLeaveDesc')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'fcpDiscardPost' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'fcpStayOnPage' })); expect(unload()).toBe(true);
  await act(async () => { authorize({ data: { session: { access_token: 'local-test' } } }); });
  await waitFor(() => expect(unload()).toBe(false));
});
