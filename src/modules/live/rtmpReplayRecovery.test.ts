import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recoverMissingRtmpReplays } from '../../../supabase/functions/_shared/rtmpReplayRecovery.ts';

const external = vi.hoisted(() => ({ videos: [] as any[], posts: [] as string[] }));
vi.mock('../../../supabase/functions/_shared/cloudflareStreamService.ts', async (original) => ({
  ...await original<any>(),
  listStreamLiveInputVideos: async () => external.videos,
  getStreamPlaybackUrls: (uid: string) => ({ hls: `https://video.example/${uid}/index.m3u8`, dash: '', mp4: '' }),
}));
vi.mock('../../../supabase/functions/_shared/replayFeedService.ts', () => ({
  createOrUpdateInstantReplayPost: async (_admin: any, replay: any) => {
    external.posts.push(replay.id);
    return 'post-1';
  },
}));

function fixture(replayPatch: Record<string, unknown> = {}, options: { readError?: boolean; writeError?: boolean; race?: boolean; leaseRace?: boolean; noReplay?: boolean; crowded?: boolean; missingOlder?: boolean; crowdCount?: number } = {}) {
  const session: any = {
    id: 'session-1', owner_id: 'owner-1', cloudflare_live_input_id: 'input-1',
    cloudflare_video_uid: 'video-1', post_id: 'post-1', status: 'ended',
    started_at: '2026-11-18T12:44:00Z', created_at: '2026-11-18T12:44:00Z', ended_at: '2026-11-18T14:33:00Z',
  };
  const replay: any = {
    id: 'replay-1', live_session_id: 'session-1', archive_status: 'pending',
    chunked_recording_id: 'original-placeholder-id', user_id: 'owner-1',
    stream_uid: null, cloudflare_video_uid: null, r2_video_url: null,
    r2_object_key: null, stream_deleted_at: null, archive_lease_until: null, ...replayPatch,
  };
  let sessionWrites = 0;
  const olderSessions = options.crowded ? Array.from({ length: options.crowdCount ?? 30 }, (_, i) => ({ ...session, id: `healthy-${String(i).padStart(2, '0')}` })) : [];
  const olderReplays = options.missingOlder ? [] : olderSessions.map((s) => ({ ...replay, id: `replay-${s.id}`, live_session_id: s.id, stream_uid: 'already-archived' }));
  const admin: any = {
    from(table: string) {
      let operation = 'select'; let payload: any; let single = false; let limit = Infinity;
      const filters: Array<(row: any) => boolean> = [];
      const chain: any = {
        select: () => chain,
        eq: (key: string, value: any) => { filters.push((row) => row[key] === value); return chain; },
        is: (key: string, value: any) => { filters.push((row) => (row[key] ?? null) === value); return chain; },
        in: (key: string, values: any[]) => { filters.push((row) => values.includes(row[key])); return chain; },
        gt: (key: string, value: any) => { filters.push((row) => row[key] > value); return chain; },
        lte: (key: string, value: any) => { filters.push((row) => row[key] <= value); return chain; },
        not: (key: string, _operator: string, value: any) => { filters.push((row) => (row[key] ?? null) !== value); return chain; },
        or: (value: string) => {
          if (value.startsWith('archive_lease_until.')) filters.push((row) => !row.archive_lease_until || Date.parse(row.archive_lease_until) <= Date.now());
          return chain;
        },
        order: () => chain, limit: (value: number) => { limit = value; return chain; },
        update: (patch: any) => { operation = 'update'; payload = patch; return chain; },
        upsert: (patch: any) => { operation = 'upsert'; payload = patch; return chain; },
        single: () => { single = true; return chain; },
        maybeSingle: () => { single = true; return chain; },
        then(resolve: any, reject: any) {
          let result: any;
          if (table === 'live_sessions' && operation === 'select') result = { data: [...olderSessions, session].filter((row) => filters.every((filter) => filter({ mode: 'rtmp_obs', ...row }))).slice(0, limit), error: null };
          else if (table === 'live_replays' && operation === 'select') {
            const rows = [...olderReplays, ...(options.noReplay ? [] : [replay])].filter((row) => filters.every((filter) => filter(row))).slice(0, limit).map((row) => ({ ...row }));
            result = { data: single ? rows[0] ?? null : rows, error: options.readError ? { message: 'read failed' } : null };
          }
          else if (table === 'live_replays' && operation === 'update') {
            if (options.race) replay.stream_uid = 'winner-video';
            if (options.leaseRace) replay.archive_lease_until = '2099-01-01T00:00:00Z';
            const matches = filters.every((filter) => filter(replay));
            if (matches && !options.writeError) Object.assign(replay, payload);
            result = { data: matches && !options.writeError ? (single ? { ...replay } : [{ ...replay }]) : null, error: options.writeError ? { message: 'write failed' } : null };
          } else if (table === 'live_replays' && operation === 'upsert') {
            Object.assign(replay, payload); result = { data: { ...replay }, error: null };
          } else {
            if (table === 'live_sessions' && operation === 'update') {
              for (const row of [...olderSessions, session]) if (filters.every((filter) => filter(row))) { sessionWrites++; Object.assign(row, payload); }
            }
            result = { data: null, error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return { admin, replay, session, olderSessions, sessionWrites: () => sessionWrites };
}

beforeEach(() => {
  external.posts.length = 0;
  external.videos = [{ uid: 'video-1', liveInput: 'input-1', created: '2026-11-18T12:44:00Z', duration: 6540,
    readyToStream: true, status: { state: 'ready' }, meta: { liveSessionId: 'session-1', userId: 'owner-1' } }];
});

describe('RTMP replay source recovery', () => {
  it('fills a missing source on the existing pending replay instead of leaving it stuck', async () => {
    const state = fixture();
    expect(await recoverMissingRtmpReplays(state.admin)).toBe(1);
    expect(state.replay).toMatchObject({ id: 'replay-1', chunked_recording_id: 'original-placeholder-id', stream_uid: 'video-1', cloudflare_video_uid: 'video-1', cloudflare_vod_enabled: true });
    expect(external.posts).toEqual(['replay-1']);
  });

  it('continues creating a replay when no row exists', async () => {
    const state = fixture({}, { noReplay: true });
    expect(await recoverMissingRtmpReplays(state.admin)).toBe(1);
    expect(state.replay).toMatchObject({ live_session_id: 'session-1', chunked_recording_id: 'session-1', stream_uid: 'video-1' });
  });

  it('recovers a placeholder after 30 older sessions that already have replay sources', async () => {
    const state = fixture({}, { crowded: true });
    expect(await recoverMissingRtmpReplays(state.admin)).toBe(1);
    expect(state.replay.stream_uid).toBe('video-1');
  });

  it('bounds failed attempts and cools down sessions without replays so later sources get a turn', async () => {
    const state = fixture({}, { crowded: true, missingOlder: true });
    expect(await recoverMissingRtmpReplays(state.admin)).toBe(0);
    expect(state.olderSessions.filter((row) => row.archive_next_retry_at).length).toBe(5);
    for (let i = 0; i < 6; i++) await recoverMissingRtmpReplays(state.admin);
    expect(state.replay.stream_uid).toBe('video-1');
    expect(external.posts).toEqual(['replay-1']);
  });

  it('prioritizes untried sessions when 50 earlier failures become due again on the next minute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T00:00:00Z'));
    try {
      const state = fixture({}, { crowded: true, missingOlder: true, crowdCount: 50 });
      for (let tick = 0; tick < 11; tick++) {
        await recoverMissingRtmpReplays(state.admin);
        await vi.advanceTimersByTimeAsync(60_000);
      }
      expect(state.replay.stream_uid).toBe('video-1');
      expect(external.posts).toEqual(['replay-1']);
    } finally { vi.useRealTimers(); }
  });

  it.each([
    { stream_uid: 'existing-video' }, { cloudflare_video_uid: 'existing-video' },
    { r2_video_url: 'https://media.example/ready.mp4' }, { r2_object_key: 'uploading.mp4' },
    { stream_deleted_at: '2026-11-18T15:00:00Z' }, { archive_status: 'unrecoverable' },
    { archive_lease_until: '2099-01-01T00:00:00Z' },
  ])('preserves a replay with source, R2, terminal state or active lease: %j', async (patch) => {
    const state = fixture(patch);
    const before = { ...state.replay };
    expect(await recoverMissingRtmpReplays(state.admin)).toBe(0);
    expect(state.replay).toEqual(before);
    expect(external.posts).toEqual([]);
  });

  it('does not recover a video belonging to another session', async () => {
    external.videos[0].meta.liveSessionId = 'other-session';
    const state = fixture();
    expect(await recoverMissingRtmpReplays(state.admin)).toBe(0);
    expect(state.replay.stream_uid).toBeNull();
    expect(state.session.status).toBe('ended');
    expect(state.session.archive_next_retry_at).toBeDefined();
  });

  it('keeps the winning worker source and does not publish after losing the conditional update', async () => {
    const state = fixture({}, { race: true });
    expect(await recoverMissingRtmpReplays(state.admin)).toBe(0);
    expect(state.replay.stream_uid).toBe('winner-video');
    expect(state.sessionWrites()).toBe(0);
    expect(external.posts).toEqual([]);
  });

  it('keeps a lease acquired by a worker between the read and the source update', async () => {
    const state = fixture({}, { leaseRace: true });
    expect(await recoverMissingRtmpReplays(state.admin)).toBe(0);
    expect(state.replay.stream_uid).toBeNull();
    expect(external.posts).toEqual([]);
  });

  it('reports a batch read error without treating it as a missing row', async () => {
    const state = fixture({}, { readError: true });
    await expect(recoverMissingRtmpReplays(state.admin)).rejects.toBeDefined();
    expect(state.replay.stream_uid).toBeNull();
    expect(state.session.status).toBe('ended');
    expect(external.posts).toEqual([]);
  });

  it('contains an individual replay write error so the cron can continue archiving other replays', async () => {
    const state = fixture({}, { writeError: true });
    expect(await recoverMissingRtmpReplays(state.admin)).toBe(0);
    expect(state.replay.stream_uid).toBeNull();
    expect(state.session.status).toBe('ended');
    expect(state.session.archive_next_retry_at).toBeDefined();
    expect(external.posts).toEqual([]);
  });
});
