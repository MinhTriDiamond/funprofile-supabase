import { describe, expect, it, vi } from 'vitest';
import { persistRtmpVideoSignalLostAt, reconcileRtmpSessionVideoSignal } from '../../../supabase/functions/_shared/rtmpVideoSignalGraceService.ts';

function createAdmin(response: { data: unknown; error: unknown }, current: { data: unknown; error: unknown } = { data: null, error: null }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let queryCount = 0;
  const builder: Record<string, any> = {};
  for (const method of ['update', 'select', 'eq', 'is', 'in']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.maybeSingle = async () => queryCount === 1 ? response : current;
  const admin = {
    from: vi.fn(() => {
      queryCount += 1;
      return builder;
    }),
  };
  return { admin, calls };
}

describe('persistRtmpVideoSignalLostAt', () => {
  it('stores the first marker conditionally and returns its persisted value', async () => {
    const { admin, calls } = createAdmin({ data: { video_signal_lost_at: '2026-10-17T00:00:00.000Z' }, error: null });
    await expect(persistRtmpVideoSignalLostAt(admin as any, 'session-1', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:01.000Z'))
      .resolves.toBe('2026-10-17T00:00:00.000Z');
    expect(calls).toContainEqual({ method: 'is', args: ['video_signal_lost_at', null] });
  });

  it('preserves a marker won by a concurrent watchdog instead of refreshing it', async () => {
    const anchor = '2026-10-17T00:00:00.000Z';
    const { admin } = createAdmin({ data: null, error: null }, { data: { video_signal_lost_at: anchor }, error: null });
    await expect(persistRtmpVideoSignalLostAt(admin as any, 'session-1', '2026-10-17T00:01:00.000Z', '2026-10-17T00:01:00.000Z'))
      .resolves.toBe(anchor);
  });

  it('throws database errors rather than claiming the grace marker was recorded', async () => {
    const error = new Error('database unavailable');
    const { admin } = createAdmin({ data: null, error });
    await expect(persistRtmpVideoSignalLostAt(admin as any, 'session-1', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:01.000Z'))
      .rejects.toBe(error);
  });
});

describe('reconcileRtmpSessionVideoSignal', () => {
  it('uses the fenced end callback once after grace and a final successful no-video read', async () => {
    const builder: Record<string, any> = {};
    for (const method of ['update', 'eq', 'is', 'in', 'select']) builder[method] = () => builder;
    builder.maybeSingle = async () => ({ data: { id: 'session-1' }, error: null });
    const admin = { from: vi.fn(() => builder) };
    const end = vi.fn(async () => ({ ended: true, idempotent: false, in_progress: false }));
    const observation = { inputConnected: true, videoStreaming: false, confirmedDisconnected: false, errors: [], reason: 'input_connected_no_video' };

    const result = await reconcileRtmpSessionVideoSignal(admin as any, {
      id: 'session-1',
      status: 'live',
      video_signal_lost_at: '2026-10-17T00:00:00.000Z',
    }, observation, {
      now: '2026-10-17T00:03:00.000Z',
      graceSeconds: 180,
      detect: vi.fn(async () => observation),
      end,
    });

    expect(result.action).toBe('ended');
    expect(end).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-1' }), 'source_disconnected_no_active_video');
  });
});
