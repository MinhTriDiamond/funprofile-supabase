/** @vitest-environment jsdom */
import { useEffect } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GiftTransactionProvider, useGiftTransaction } from '../GiftTransactionContext';

vi.mock('viem', () => ({
  http: vi.fn(),
  createPublicClient: () => ({ getTransactionReceipt: () => new Promise(() => {}) }),
}));
const hash = `0x${'1'.repeat(64)}`;
const wrapper = GiftTransactionProvider;
const payload = { tokenSymbol: 'CAMLY', amount: '200000', chainId: 56, recipientId: 'recipient', step: 'signing' as const };

beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('gift state when Android returns from wallet', () => {
  it('does not trigger another consumer render for the same signing update', () => {
    let renders = 0;
    const { result } = renderHook(() => { renders++; return useGiftTransaction(); }, { wrapper });
    act(() => { result.current.start(payload); });
    const previous = result.current.current;
    const previousRenders = renders;
    act(() => { result.current.update({ step: 'signing', txHash: null, scanUrl: null }); });
    expect(result.current.current).toBe(previous);
    expect(renders).toBe(previousRenders);
  });

  it('keeps a confirmed transaction successful when a stale dialog emits broadcasted', () => {
    const { result } = renderHook(() => useGiftTransaction(), { wrapper });
    act(() => { result.current.start({ ...payload, txHash: hash }); });
    act(() => { result.current.finishSuccess(hash); });
    act(() => { result.current.update({ step: 'broadcasted', txHash: hash }); });
    expect(result.current.current?.step).toBe('success');
  });

  it('does not restart the success hide timer for an identical success event', () => {
    const { result } = renderHook(() => useGiftTransaction(), { wrapper });
    act(() => { result.current.start(payload); });
    act(() => { result.current.finishSuccess(hash); });
    const previous = result.current.current;
    act(() => { result.current.finishSuccess(hash); });
    expect(result.current.current).toBe(previous);
  });

  it('settles a dialog-style context synchronization effect instead of looping', () => {
    let effectRuns = 0;
    const { result } = renderHook(() => {
      const gift = useGiftTransaction();
      useEffect(() => {
        effectRuns++;
        if (effectRuns > 8) throw new Error('Gift context update loop');
        if (!gift.current) gift.start(payload);
        else gift.update({ step: 'signing', txHash: null, scanUrl: null });
      }, [gift]);
      return gift;
    }, { wrapper });
    expect(result.current.current?.step).toBe('signing');
    expect(effectRuns).toBeLessThanOrEqual(3);
  });

  it('does not turn a confirmed gift into a timeout error from a stale dialog', () => {
    const { result } = renderHook(() => useGiftTransaction(), { wrapper });
    act(() => { result.current.start(payload); });
    act(() => { result.current.finishSuccess(hash); });
    act(() => { result.current.finishError('Timeout'); });
    expect(result.current.current?.step).toBe('success');
  });

  it('can explicitly start a new gift after a confirmed gift', () => {
    const { result } = renderHook(() => useGiftTransaction(), { wrapper });
    act(() => { result.current.start({ ...payload, id: 'first' }); });
    act(() => { result.current.finishSuccess(hash); });
    act(() => { result.current.start({ ...payload, id: 'second' }); });
    expect(result.current.current?.id).toBe('second');
    expect(result.current.current?.step).toBe('signing');
  });
});
