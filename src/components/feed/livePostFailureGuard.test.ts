import { describe, expect, it } from 'vitest';
import { evaluateNoRecording } from './livePostFailureGuard';

const baseNow = new Date('2026-06-02T12:00:00Z').getTime();
const longAgo = new Date('2026-06-02T11:00:00Z').toISOString(); // 60 phút trước
const justNow = new Date('2026-06-02T11:58:00Z').toISOString(); // 2 phút trước

describe('evaluateNoRecording', () => {
  const basePost = { id: 'p1', created_at: longAgo };

  it('không "no recording" khi vẫn còn URL playable', () => {
    const r = evaluateNoRecording({
      post: basePost,
      metadata: { archive_mp4_url: 'https://media.fun.rich/r.mp4' },
      liveSession: { ended_at: longAgo, recording_status: 'failed' },
      liveReplay: null,
      replayOverride: null,
      now: baseNow,
    });
    expect(r.isDefinitelyNoRecording).toBe(false);
    expect(r.reason).toBe('has_url');
  });

  it('không "no recording" khi recording đang processing', () => {
    const r = evaluateNoRecording({
      post: basePost,
      metadata: { archive_status: 'failed' },
      liveSession: { ended_at: longAgo, recording_status: 'processing' },
      liveReplay: null,
      replayOverride: null,
      now: baseNow,
    });
    expect(r.isDefinitelyNoRecording).toBe(false);
    expect(r.reason).toBe('still_processing');
  });

  it('không "no recording" khi archive_status archiving dù URL trống', () => {
    const r = evaluateNoRecording({
      post: basePost,
      metadata: { archive_status: 'archiving', status: 'ended' },
      liveSession: { ended_at: justNow },
      liveReplay: null,
      replayOverride: null,
      now: baseNow,
    });
    expect(r.isDefinitelyNoRecording).toBe(false);
    expect(r.reason).toBe('still_processing');
  });

  it('không "no recording" khi trong grace period 10 phút', () => {
    const r = evaluateNoRecording({
      post: { ...basePost, created_at: justNow },
      metadata: { recording_status: 'failed' },
      liveSession: { ended_at: justNow },
      liveReplay: null,
      replayOverride: null,
      now: baseNow,
    });
    expect(r.isDefinitelyNoRecording).toBe(false);
    expect(r.reason).toBe('within_grace');
  });

  it('không "no recording" khi backend không gửi tín hiệu thất bại', () => {
    const r = evaluateNoRecording({
      post: basePost,
      metadata: { status: 'ended' },
      liveSession: { ended_at: longAgo },
      liveReplay: null,
      replayOverride: null,
      now: baseNow,
    });
    expect(r.isDefinitelyNoRecording).toBe(false);
    expect(r.reason).toBe('no_failure_signal');
  });

  it('hiện "no recording" khi recording_status=failed, không URL, không processing, qua grace', () => {
    const r = evaluateNoRecording({
      post: basePost,
      metadata: {},
      liveSession: { ended_at: longAgo, recording_status: 'failed', archive_status: 'failed' },
      liveReplay: null,
      replayOverride: null,
      now: baseNow,
    });
    expect(r.isDefinitelyNoRecording).toBe(true);
    expect(r.reason).toBe('confirmed_failed');
  });
});
