/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../LiveSharePanel', () => ({ LiveSharePanel: () => null }));
vi.mock('../LiveActivityPanel', () => ({ LiveActivityPanel: () => null }));
import { HostLiveChatPanel } from '../HostLiveChatPanel';
afterEach(cleanup);
function mount(send: (text: string) => Promise<void>) {
  render(<HostLiveChatPanel session={{ started_at: null } as any} sessionId="local" viewers={[]} messages={[]} messagesLoading={false} reactions={[]} onSendMessage={send} />);
  const input = screen.getByPlaceholderText('Viết bình luận với khán giả...');
  fireEvent.change(input, { target: { value: 'Xin chào' } });
  return { input, button: screen.getByRole('button', { name: 'Gửi bình luận' }) as HTMLButtonElement };
}
it('Enter twice plus click while awaiting a slow send invokes one send; retains new typing', async () => {
  let finish!: () => void; const send = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const { input, button } = mount(send);
  fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.click(button);
  expect(send).toHaveBeenCalledTimes(1); expect(button.disabled).toBe(true);
  fireEvent.change(input, { target: { value: 'Nội dung tiếp theo' } });
  await act(async () => { finish(); });
  expect((input as HTMLInputElement).value).toBe('Nội dung tiếp theo'); expect(button.disabled).toBe(false);
});
it('does not send when Enter commits an IME composition or repeats a held key', () => {
  const send = vi.fn().mockResolvedValue(undefined); const { input } = mount(send);
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
  fireEvent.keyDown(input, { key: 'Enter', repeat: true });
  expect(send).not.toHaveBeenCalled();
});
it('retains text and unlocks on failure, then clears after a successful retry', async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error('test')).mockResolvedValueOnce(undefined);
  const { input, button } = mount(send);
  await act(async () => { fireEvent.click(button); });
  expect((input as HTMLInputElement).value).toBe('Xin chào'); expect(button.disabled).toBe(false);
  await act(async () => { fireEvent.click(button); });
  expect(send).toHaveBeenCalledTimes(2); expect((input as HTMLInputElement).value).toBe('');
});
