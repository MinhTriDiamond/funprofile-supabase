import { describe, expect, it, vi } from 'vitest';
import { initializeRtmpSession } from './rtmpSessionInitialization';

describe('initializeRtmpSession', () => {
  it('uses the default mode once when preference lookup fails', async () => {
    const readPreference = vi.fn().mockRejectedValue(new Error('profile unavailable'));
    const createSession = vi.fn().mockResolvedValue({ id: 'session-1' });

    await expect(initializeRtmpSession(readPreference, createSession)).resolves.toEqual({ id: 'session-1' });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(undefined);
  });

  it('does not retry creation when create or resume fails', async () => {
    const readPreference = vi.fn().mockResolvedValue(true);
    const createSession = vi.fn().mockRejectedValue(new Error('create failed'));

    await expect(initializeRtmpSession(readPreference, createSession)).rejects.toThrow('create failed');

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith({ persistent: true });
  });

  it('passes a stored false preference explicitly', async () => {
    const createSession = vi.fn().mockResolvedValue({ id: 'session-2' });

    await initializeRtmpSession(vi.fn().mockResolvedValue(false), createSession);

    expect(createSession).toHaveBeenCalledOnce();
    expect(createSession).toHaveBeenCalledWith({ persistent: false });
  });
});
