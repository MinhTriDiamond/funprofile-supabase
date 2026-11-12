import { describe, expect, it } from 'vitest';
import { getRtmpActiveVideoPatch } from '../../../supabase/functions/_shared/rtmpSessionStatus';

import { isFreshLiveSession } from './utils/liveSessionFreshness';
import { getPostPlayback } from '../../components/feed/postPlaybackResolver';

const now = '2026-11-12T13:20:00.000Z';
describe('public RTMP state after confirmed current video', () => {
  it.each(['live', 'ready_to_go_live', 'source_connected', 'reconnecting', 'disconnect_grace'])(
    'keeps published %s sessions live and visible without a webcam heartbeat', (status) => {
      expect(getRtmpActiveVideoPatch({ status, post_id: 'published-post', title: 'Title', description: 'Description' }, now))
        .toEqual({ status: 'live', host_connection_status: 'online', last_seen_at: now });
    },
  );
  it('preserves live even when a legacy session has no post link', () => {
    expect(getRtmpActiveVideoPatch({ status: 'live' }, now)?.status).toBe('live');
  });
  it('recognizes live_post_id as publication evidence', () => {
    expect(getRtmpActiveVideoPatch({ status: 'ready_to_go_live', live_post_id: 'published-post' }, now)?.status).toBe('live');
  });
  it('keeps an unpublished producer in pre-live', () => {
    expect(getRtmpActiveVideoPatch({ status: 'source_connected', title: 'Title', description: 'Description' }, now)?.status).toBe('ready_to_go_live');
    expect(getRtmpActiveVideoPatch({ status: 'waiting_for_obs' }, now)?.status).toBe('source_connected');
  });
  it.each(['ended', 'ending', 'processing_replay', 'failed', 'archived'])(
    'does not revive %s sessions', (status) => {
      expect(getRtmpActiveVideoPatch({ status, post_id: 'published-post' }, now)).toBeNull();
    },
  );
  it('does not revive a session with ended_at despite a stale live status', () => {
    expect(getRtmpActiveVideoPatch({ status: 'live', post_id: 'published-post', ended_at: now }, now)).toBeNull();
  });
});


describe('feed contract for published RTMP video', () => {
  it('repairs the observed pre-live/offline snapshot into a fresh live feed state', () => {
    const observed = { status: 'ready_to_go_live', post_id: 'published-post', host_connection_status: 'offline', last_seen_at: null };
    const repaired = { ...observed, ...getRtmpActiveVideoPatch(observed, now) };
    expect(isFreshLiveSession(observed, Date.parse(now))).toBe(false);
    expect(isFreshLiveSession(repaired, Date.parse(now))).toBe(true);
    expect(getPostPlayback({ post_type: 'live', metadata: {
      live_mode: 'rtmp_obs', live_status: repaired.status,
      hls_url: 'https://videodelivery.net/current/manifest/video.m3u8',
      replay_status: 'processing', archive_status: 'pending',
    } }, { liveSession: repaired }).status).toBe('live');
  });
});
