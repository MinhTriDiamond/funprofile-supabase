/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ start: vi.fn(), media: vi.fn() }));
vi.mock('../../webcam/services/webcamLiveApi', () => ({ startWebcamLiveSessionBackend: mocks.start }));
vi.mock('../../hooks/useMusicAutoPause', () => ({ useMusicAutoPause: () => {} }));
import PreLivePage from '../PreLivePage';
let desktop = true;
const listeners = new Set<() => void>();
function stream() {
  const video = { readyState: 'live', enabled: true, stop: vi.fn(), getSettings: () => ({ width: 1280, height: 720 }), onended: null };
  const audio = { enabled: true, stop: vi.fn() };
  return { getVideoTracks: () => [video], getAudioTracks: () => [audio], getTracks: () => [video, audio] };
}
beforeEach(() => {
  vi.clearAllMocks(); desktop = true; listeners.clear();
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
  window.matchMedia = vi.fn().mockImplementation(query => ({ get matches() { return query.includes('min-width: 1024') ? desktop : !desktop; }, addEventListener: (_: string, cb: () => void) => listeners.add(cb), removeEventListener: (_: string, cb: () => void) => listeners.delete(cb) }));
  mocks.media.mockImplementation(async () => stream());
  vi.stubGlobal('navigator', { ...navigator, userAgent: 'Desktop fixture', mediaDevices: { getUserMedia: mocks.media, enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {} } });
  mocks.start.mockRejectedValue(new Error('local test: stop before navigation'));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => render(<MemoryRouter><PreLivePage /></MemoryRouter>);
async function ready() { await waitFor(() => expect((screen.getByRole('button', { name: 'Phát trực tiếp', exact: true }) as HTMLButtonElement).disabled).toBe(false)); }
it('requires a ready camera before starting and forwards desktop settings to the existing start API', async () => {
  let resolve!: (value: any) => void; mocks.media.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  mount(); expect(screen.getByTestId('desktop-webcam-setup')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Đang chuẩn bị camera...' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { resolve(stream()); }); await ready();
  fireEvent.change(screen.getByLabelText('Nội dung buổi live'), { target: { value: 'Chia sẻ hôm nay' } });
  fireEvent.click(screen.getByRole('button', { name: 'Phát trực tiếp', exact: true }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalled());
  expect(mocks.start.mock.calls[0][0]).toMatchObject({ title: 'Chia sẻ hôm nay', description: 'Chia sẻ hôm nay', privacy: 'public', recordingAspectRatio: 'landscape_16_9' });
});
it('preserves muted audio when changing quality and reattaches the same stream on responsive resize', async () => {
  mount(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Tắt micro', exact: true }));
  const before = mocks.media.mock.calls.length;
  fireEvent.change(screen.getByLabelText('Chất lượng video'), { target: { value: '480p' } });
  await waitFor(() => expect(mocks.media.mock.calls.length).toBeGreaterThan(before)); await ready();
  const source = (document.querySelector('video') as HTMLVideoElement).srcObject as unknown as ReturnType<typeof stream>;
  expect(source.getAudioTracks()[0].enabled).toBe(false);
  const calls = mocks.media.mock.calls.length;
  await act(async () => { desktop = false; listeners.forEach(cb => cb()); });
  expect(screen.queryByTestId('desktop-webcam-setup')).toBeNull();
  expect((document.querySelector('video') as HTMLVideoElement).srcObject).toBe(source);
  expect(mocks.media.mock.calls.length).toBe(calls);
  await act(async () => { desktop = true; listeners.forEach(cb => cb()); });
  expect(screen.getByTestId('desktop-webcam-setup')).toBeTruthy();
  expect((document.querySelector('video') as HTMLVideoElement).srcObject).toBe(source);
});
it('keeps start disabled after permission denial and allows retry without hiding Back', async () => {
  mocks.media.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  mount(); await screen.findByText('Không thể truy cập camera và micro');
  expect((screen.getByRole('button', { name: 'Camera chưa sẵn sàng' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Quay lại', exact: true })).toBeTruthy();
  mocks.media.mockImplementation(async () => stream());
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' })); await ready();
});
