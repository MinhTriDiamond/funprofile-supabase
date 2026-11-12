/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSendToken } from '../useSendToken';

const mocks = vi.hoisted(() => ({ send: vi.fn(), reset: vi.fn(), getSession: vi.fn() }));
vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1111111111111111111111111111111111111111', isConnected: true, chainId: 56 }),
  useSendTransaction: () => ({ sendTransactionAsync: mocks.send, isPending: false, reset: mocks.reset }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  useChainId: () => 56,
  usePublicClient: () => null,
  useDisconnect: () => ({ disconnectAsync: vi.fn() }),
  useConnect: () => ({ connectAsync: vi.fn(), connectors: [] }),
}));
vi.mock('@/contexts/ActiveAccountContext', () => ({ useActiveAccount: () => ({ activeAddress: null, accounts: [] }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
vi.mock('@/utils/mobileWalletConnect', () => ({ isMobileDevice: () => true, isInjectedMobileBrowser: () => false }));
vi.mock('@/utils/mobileWalletDeepLink', () => ({ openWalletAppForSigning: vi.fn(), getReturnToAppUrl: () => '', nudgeReturnToApp: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ default: { debug: vi.fn() } }));

beforeEach(() => { mocks.getSession.mockResolvedValue({ data: { session: null } }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
it('receives a late Android hash and retains the 30-second duplicate-send guard', async () => {
  vi.useFakeTimers();
  let resolve!: (hash: `0x${string}`) => void;
  mocks.send.mockReturnValue(new Promise<`0x${string}`>(r => { resolve = r; }));
  const { result } = renderHook(() => useSendToken());
  const params = {
    token: { symbol: 'BNB', name: 'BNB', decimals: 18, address: null, logo: '', color: '' },
    recipient: '0x2222222222222222222222222222222222222222', amount: '0.123456789', skipBackground: true, targetChainId: 56,
  };
  let sent!: Promise<string | null>;
  await act(async () => { sent = result.current.sendToken(params); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(100_000); });
  expect(result.current.txStep).toBe('signing');
  expect(result.current.isPending).toBe(true);
  // Resetting the UI cannot cancel an unresolved wallet request or unlock a resend.
  act(() => { result.current.resetState(); });
  let whileSigning: string | null = 'unexpected';
  await act(async () => { whileSigning = await result.current.sendToken(params); });
  expect(whileSigning).toBeNull();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  const hash = `0x${'a'.repeat(64)}` as `0x${string}`;
  await act(async () => { resolve(hash); await sent; });
  await expect(sent).resolves.toBe(hash);
  expect(result.current.txHash).toBe(hash);
  let second: string | null = 'unexpected';
  await act(async () => { second = await result.current.sendToken(params); });
  expect(second).toBeNull();
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('unlocks sending after an actual rejection from the wallet', async () => {
  const hash = `0x${'b'.repeat(64)}` as `0x${string}`;
  mocks.send.mockRejectedValueOnce(new Error('User rejected')).mockResolvedValueOnce(hash);
  const { result } = renderHook(() => useSendToken());
  const params = {
    token: { symbol: 'BNB', name: 'BNB', decimals: 18, address: null, logo: '', color: '' },
    recipient: '0x3333333333333333333333333333333333333333', amount: '0.123456788', skipBackground: true, targetChainId: 56,
  };
  let rejected: string | null = 'unexpected';
  await act(async () => { rejected = await result.current.sendToken(params); });
  expect(rejected).toBeNull();
  expect(result.current.txStep).toBe('idle');
  expect(result.current.isPending).toBe(false);
  let retried: string | null = null;
  await act(async () => { retried = await result.current.sendToken(params); });
  expect(retried).toBe(hash);
  expect(mocks.send).toHaveBeenCalledTimes(2);
});


it('rechecks the 30-second guard when a second click finishes its session lookup late', async () => {
  const hash = `0x${'c'.repeat(64)}` as `0x${string}`;
  mocks.send.mockResolvedValue(hash);
  let releaseLookup!: (value: { data: { session: null } }) => void;
  mocks.getSession.mockResolvedValueOnce({ data: { session: null } })
    .mockReturnValueOnce(new Promise(resolve => { releaseLookup = resolve; }));
  const { result } = renderHook(() => useSendToken());
  const params = {
    token: { symbol: 'BNB', name: 'BNB', decimals: 18, address: null, logo: '', color: '' },
    recipient: '0x4444444444444444444444444444444444444444', amount: '0.123456787', skipBackground: true, targetChainId: 56,
  };
  let first!: Promise<string | null>;
  let second!: Promise<string | null>;
  await act(async () => {
    first = result.current.sendToken(params);
    second = result.current.sendToken(params);
    await first;
  });
  await expect(first).resolves.toBe(hash);
  await act(async () => { releaseLookup({ data: { session: null } }); await second; });
  await expect(second).resolves.toBeNull();
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
