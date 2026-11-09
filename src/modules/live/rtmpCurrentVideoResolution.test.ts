import { describe, expect, it } from 'vitest';
import {
  getRtmpSessionWindowStartMs,
  matchRtmpVideoToSession,
  resolveRtmpCurrentActiveVideo,
} from '../../../supabase/functions/_shared/cloudflareStreamService.ts';
import { classifyRtmpVideoSignal } from '../../../supabase/functions/_shared/rtmpDisconnectPolicy.ts';

const INPUT_ID = 'input-1';

/**
 * Phiên thật của bug 2026-10-17: `armed_at` MUỘN hơn `created` của video mà Cloudflare
 * trả về (Cloudflare đóng dấu `created` theo lúc encoder CONNECT, không theo started_at).
 * `created_at` sớm nhất là 11:59:00Z nên cửa sổ phiên phải mở từ 11:59:00Z.
 */
const SESSION: Record<string, unknown> = {
  id: 'session-1',
  owner_id: 'user-1',
  cloudflare_live_input_id: INPUT_ID,
  created_at: '2026-10-17T11:59:00.000Z',
  armed_at: '2026-10-17T12:00:00.000Z',
  started_at: '2026-10-17T12:00:30.000Z',
};

function liveVideo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uid: 'video-current',
    live: true,
    created: '2026-10-17T12:00:10.000Z',
    liveInput: INPUT_ID,
    meta: { userId: 'user-1' },
    ...overrides,
  };
}

describe('getRtmpSessionWindowStartMs', () => {
  it('lấy mốc SỚM NHẤT trong các cột thời gian của phiên', () => {
    expect(getRtmpSessionWindowStartMs(SESSION)).toBe(Date.parse('2026-10-17T11:59:00.000Z'));
    expect(getRtmpSessionWindowStartMs({
      go_live_clicked_at: '2026-10-17T12:00:30.000Z',
      armed_at: '2026-10-17T12:00:00.000Z',
    })).toBe(Date.parse('2026-10-17T12:00:00.000Z'));
  });

  it('trả NaN khi phiên không có mốc thời gian nào', () => {
    expect(Number.isNaN(getRtmpSessionWindowStartMs({ id: 'session-1' }))).toBe(true);
  });
});

describe('matchRtmpVideoToSession', () => {
  it('nhận video khớp metadata phiên kể cả khi created nằm ngoài cửa sổ DB', () => {
    const video = liveVideo({
      created: '2026-10-17T11:00:00.000Z',
      meta: { liveSessionId: 'session-1', userId: 'user-1' },
    });
    const match = matchRtmpVideoToSession(video, SESSION, { skewSeconds: 0 });
    expect(match.ok).toBe(true);
    expect(match.exactSessionMeta).toBe(true);
  });

  it('loại video mang metadata của phiên khác', () => {
    const video = liveVideo({ meta: { liveSessionId: 'session-2', userId: 'user-1' } });
    const match = matchRtmpVideoToSession(video, SESSION, { skewSeconds: 60 });
    expect(match.ok).toBe(false);
    expect(match.reason).toBe('other_session_meta');
  });

  it('loại video của Live Input khác', () => {
    const video = liveVideo({ liveInput: 'input-other' });
    expect(matchRtmpVideoToSession(video, SESSION, { skewSeconds: 60 }).reason).toBe('other_live_input');
  });

  it('loại video tạo trước cửa sổ phiên khi không có metadata', () => {
    const video = liveVideo({ created: '2026-10-17T11:50:00.000Z' });
    const match = matchRtmpVideoToSession(video, SESSION, { skewSeconds: 60 });
    expect(match.ok).toBe(false);
    expect(match.reason).toBe('video_before_session_window');
  });
});

describe('resolveRtmpCurrentActiveVideo', () => {
  it('KHÔNG coi là mất nguồn khi Live Input đang connected và có video đang live (bug 2026-10-17)', () => {
    // Video đang live thật nhưng created sớm hơn cửa sổ phiên ⇒ trước fix bị loại nhầm.
    const video = liveVideo({ created: '2026-10-17T11:55:00.000Z' });
    const resolution = resolveRtmpCurrentActiveVideo({
      videos: [video],
      session: SESSION,
      inputConnected: true,
    });

    expect(resolution.video).toBe(video);
    expect(resolution.uid).toBe('video-current');
    expect(resolution.reason).toBe('live_input_active_video');
    expect(classifyRtmpVideoSignal({
      inputConnected: true,
      videoStreaming: !!resolution.video,
      confirmedDisconnected: false,
      errors: [],
    })).toBe('current_video');
  });

  it('ưu tiên video khớp metadata phiên', () => {
    const windowed = liveVideo({ uid: 'video-windowed', created: '2026-10-17T12:00:10.000Z' });
    const metaMatched = liveVideo({
      uid: 'video-meta',
      created: '2026-10-17T11:00:00.000Z',
      meta: { liveSessionId: 'session-1', userId: 'user-1' },
    });
    const resolution = resolveRtmpCurrentActiveVideo({
      videos: [windowed, metaMatched],
      session: SESSION,
      inputConnected: true,
    });
    expect(resolution.uid).toBe('video-meta');
    expect(resolution.reason).toBe('session_meta_live');
  });

  it('tin video đã lưu (cloudflare_video_uid) khi video đó đang live', () => {
    const persisted = liveVideo({ uid: 'video-persisted', created: '2026-10-17T10:00:00.000Z' });
    const resolution = resolveRtmpCurrentActiveVideo({
      videos: [],
      persistedVideo: persisted,
      session: { ...SESSION, cloudflare_video_uid: 'video-persisted' },
      inputConnected: true,
    });
    expect(resolution.uid).toBe('video-persisted');
    expect(resolution.reason).toBe('persisted_uid_live');
  });

  it('loại video của phiên khác dù Live Input đang connected', () => {
    const foreign = liveVideo({ uid: 'video-foreign', meta: { liveSessionId: 'session-2', userId: 'user-1' } });
    const resolution = resolveRtmpCurrentActiveVideo({
      videos: [foreign],
      session: SESSION,
      inputConnected: true,
    });
    expect(resolution.video).toBeNull();
    expect(resolution.reason).toBe('no_active_video');
  });

  it('vẫn kết luận mất nguồn khi input connected nhưng không có video live nào', () => {
    const vodOnly = { uid: 'vod-1', created: '2026-10-17T12:00:10.000Z', readyToStream: true, status: { state: 'ready' } };
    const resolution = resolveRtmpCurrentActiveVideo({
      videos: [vodOnly],
      session: SESSION,
      inputConnected: true,
    });
    expect(resolution.video).toBeNull();
    expect(classifyRtmpVideoSignal({
      inputConnected: true,
      videoStreaming: !!resolution.video,
      confirmedDisconnected: false,
      errors: [],
    })).toBe('input_connected_no_video');
  });
});
