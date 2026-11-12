/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberPendingDonation } from './pendingDonation';

// Node 26 exposes an unavailable localStorage accessor; use jsdom's Storage.
beforeEach(() => { vi.stubGlobal('localStorage', window.sessionStorage); });
afterEach(() => { window.sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('broadcast donation recovery snapshot', () => {
  it('preserves exact amount and recipient while the receipt is still pending', () => {
    const payload = { txHash: '0xabc', recipientId: 'recipient', senderId: 'sender', amount: '9007199254740993.000000000000000001', tokenSymbol: 'CAMLY', chainId: 56, timestamp: Date.now() };
    expect(rememberPendingDonation(payload)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('pending_donation_0xabc')!)).toEqual(payload);
  });
  it('does not throw and block the success card when Android storage is unavailable', () => {
    vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded'); });
    expect(rememberPendingDonation({ txHash: '0xabc', recipientId: 'recipient', amount: '200000', tokenSymbol: 'CAMLY', timestamp: Date.now() })).toBe(false);
  });
});
