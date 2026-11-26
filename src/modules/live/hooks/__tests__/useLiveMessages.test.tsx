/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), insert: vi.fn(), callbacks: [] as Array<(payload: any) => Promise<void>> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: mocks.auth }, removeChannel: vi.fn(),
  channel: () => { const channel = { on: (_: string, _filter: any, callback: any) => { mocks.callbacks.push(callback); return channel; }, subscribe: () => channel }; return channel; },
  from: (table: string) => {
    if (table === 'profiles') return { select: () => ({ in: async (_: string, ids: string[]) => ({ data: ids.map(id => ({ id, username: 'Test', avatar_url: null })) }) }) };
    let session: string;
    const query = { select: () => query, eq: (_: string, id: string) => { session = id; return query; }, order: () => query, limit: () => mocks.load(session),
      insert: (payload: any) => ({ select: () => ({ single: () => mocks.insert(payload) }) }) };
    return query;
  },
} }));
import { useLiveMessages } from '../useLiveMessages';
const row = (id: number, content = 'Xin chào', session_id = 'session') => ({ id, session_id, user_id: 'owner', content, created_at: `2026-11-26T13:18:${String(id).padStart(2, '0')}Z` });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); mocks.callbacks.length = 0; mocks.auth.mockResolvedValue({ data: { session: { user: { id: 'owner' } } } }); mocks.load.mockResolvedValue({ data: [], error: null }); });
afterEach(cleanup);
async function mount() { const hook = renderHook(({ session }) => useLiveMessages(session), { initialProps: { session: 'session' } }); await act(async () => {}); return hook; }
async function echo(value: any, index = mocks.callbacks.length - 1) { await act(async () => { await mocks.callbacks[index]({ new: value }); }); }
it('locks before auth resolves: two rapid sends create one optimistic entry and one database insert', async () => {
  const auth = deferred<any>(), write = deferred<any>(); mocks.auth.mockReturnValue(auth.promise); mocks.insert.mockReturnValue(write.promise);
  const hook = await mount(); let a!: Promise<void>, b!: Promise<void>;
  act(() => { a = hook.result.current.sendMessage(' Xin chào '); b = hook.result.current.sendMessage('Xin chào'); });
  expect(mocks.auth).toHaveBeenCalledTimes(1);
  await act(async () => { auth.resolve({ data: { session: { user: { id: 'owner' } } } }); });
  expect(mocks.insert).toHaveBeenCalledTimes(1); expect(hook.result.current.messages).toHaveLength(1);
  await act(async () => { write.resolve({ data: row(1), error: null }); await Promise.all([a, b]); });
  expect(hook.result.current.messages.map(m => m.id)).toEqual([1]);
});
it('reconciles response then repeated realtime echoes into one canonical comment', async () => {
  mocks.insert.mockResolvedValue({ data: row(2), error: null }); const hook = await mount();
  await act(async () => { await hook.result.current.sendMessage('Xin chào'); });
  await echo(row(2)); await echo(row(2));
  expect(hook.result.current.messages.map(m => m.id)).toEqual([2]);
});
it('reconciles realtime before the insert response without leaving an optimistic duplicate', async () => {
  const write = deferred<any>(); mocks.insert.mockReturnValue(write.promise); const hook = await mount(); let sent!: Promise<void>;
  await act(async () => { sent = hook.result.current.sendMessage('Xin chào'); });
  await echo(row(3)); expect(hook.result.current.messages.map(m => m.id)).toEqual([3]);
  await act(async () => { write.resolve({ data: row(3), error: null }); await sent; });
  expect(hook.result.current.messages.map(m => m.id)).toEqual([3]);
});
it('preserves a new comment when the initial history read finishes late', async () => {
  const history = deferred<any>(); mocks.load.mockReturnValue(history.promise); mocks.insert.mockResolvedValue({ data: row(4), error: null });
  const hook = await mount(); await act(async () => { await hook.result.current.sendMessage('Xin chào'); });
  await act(async () => { history.resolve({ data: [], error: null }); });
  expect(hook.result.current.messages.map(m => m.id)).toEqual([4]);
});
it('removes failed optimistic state and permits an explicit retry', async () => {
  mocks.insert.mockResolvedValueOnce({ data: null, error: new Error('test failure') }).mockResolvedValueOnce({ data: row(5), error: null }); const hook = await mount();
  await act(async () => { await expect(hook.result.current.sendMessage('Xin chào')).rejects.toThrow('test failure'); });
  expect(hook.result.current.messages).toEqual([]);
  await act(async () => { await hook.result.current.sendMessage('Xin chào'); });
  expect(mocks.insert).toHaveBeenCalledTimes(2); expect(hook.result.current.messages.map(m => m.id)).toEqual([5]);
});
it('allows intentionally repeating the same text after completion, keeping both server IDs', async () => {
  mocks.insert.mockResolvedValueOnce({ data: row(6), error: null }).mockResolvedValueOnce({ data: row(7), error: null }); const hook = await mount();
  await act(async () => { await hook.result.current.sendMessage('Xin chào'); });
  await act(async () => { await hook.result.current.sendMessage('Xin chào'); });
  await echo(row(6)); await echo(row(7));
  expect(hook.result.current.messages.map(m => m.id)).toEqual([6, 7]);
});
it('does not append an old session write after navigating to another live', async () => {
  const write = deferred<any>(); mocks.insert.mockReturnValue(write.promise); const hook = await mount(); let sent!: Promise<void>;
  await act(async () => { sent = hook.result.current.sendMessage('Xin chào'); });
  await act(async () => { hook.rerender({ session: 'other' }); });
  await act(async () => { write.resolve({ data: row(8), error: null }); await sent; });
  expect(hook.result.current.messages).toEqual([]);
});
