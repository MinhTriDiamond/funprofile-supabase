import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForWalletBroadcast } from './waitForWalletBroadcast';

afterEach(() => { vi.useRealTimers(); });
describe('Android wallet broadcast response', () => {
  it('still receives the hash if the wallet responds after the slow-signing threshold', async () => {
    vi.useFakeTimers();
    let resolve!: (hash: string) => void;
    const wallet = new Promise<string>(r => { resolve = r; });
    const onSlow = vi.fn();
    const result = waitForWalletBroadcast(wallet, 45_000, onSlow);
    // Observe both outcomes immediately so an erroneous timeout is not unhandled.
    const observed = result.then(hash => ({ hash }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(90_000);
    expect(onSlow).toHaveBeenCalledTimes(1);
    resolve('0xconfirmed');
    await expect(observed).resolves.toEqual({ hash: '0xconfirmed' });
  });
  it('propagates an actual wallet rejection and cancels its slow prompt', async () => {
    vi.useFakeTimers();
    const onSlow = vi.fn();
    const rejected = new Error('User rejected');
    await expect(waitForWalletBroadcast(Promise.reject(rejected), 45_000, onSlow)).rejects.toBe(rejected);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(onSlow).not.toHaveBeenCalled();
  });
});
