import { describe, expect, it, vi } from 'vitest';
import {
  classifyRtmpVideoSignal,
  isEligibleRtmpSessionForNoVideoGrace,
  isConfirmedRtmpDisconnectedState,
  isVideoInRtmpSessionWindow,
  mayAutoEndRtmpDisconnect,
  reconcileRtmpNoVideoGrace,
  type RtmpDisconnectObservation,
} from '../../../supabase/functions/_shared/rtmpDisconnectPolicy.ts';

const disconnected: RtmpDisconnectObservation = {
  confirmedDisconnected: true,
  inputConnected: false,
  currentSessionVideoStreaming: false,
  hasReadError: false,
};

const connectedWithoutCurrentVideo = {
  inputConnected: true,
  videoStreaming: false,
  confirmedDisconnected: false,
  errors: [],
  reason: 'input_connected_no_video',
};

describe('RTMP video-signal grace policy', () => {
  it('classifies input connected without current-session video separately from disconnect', () => {
    expect(classifyRtmpVideoSignal(connectedWithoutCurrentVideo)).toBe('input_connected_no_video');
    expect(classifyRtmpVideoSignal(disconnected)).toBe('input_disconnected');
  });

  it('only starts no-video grace for a live or publicly reconnecting session', () => {
    expect(isEligibleRtmpSessionForNoVideoGrace({ status: 'live' })).toBe(true);
    expect(isEligibleRtmpSessionForNoVideoGrace({ status: 'reconnecting', post_id: 'post-1' })).toBe(true);
    expect(isEligibleRtmpSessionForNoVideoGrace({ status: 'source_connected' })).toBe(false);
  });

  it('starts grace at the first successful connected/no-video observation', async () => {
    const persistNoVideoSince = vi.fn(async () => undefined);
    const result = await reconcileRtmpNoVideoGrace({
      observation: connectedWithoutCurrentVideo,
      videoSignalLostAt: null,
      eligibleForGrace: true,
      now: '2026-10-17T00:00:00.000Z',
      graceSeconds: 180,
      persistNoVideoSince,
      recoverVideo: vi.fn(),
      finalCheck: vi.fn(),
      endSession: vi.fn(),
    });

    expect(result).toMatchObject({ action: 'grace', videoSignalLostAt: '2026-10-17T00:00:00.000Z' });
    expect(persistNoVideoSince).toHaveBeenCalledWith('2026-10-17T00:00:00.000Z');
  });

  it('does not extend the grace window on later no-video ticks', async () => {
    const persistNoVideoSince = vi.fn(async () => undefined);
    const noteNoVideo = vi.fn(async () => undefined);
    const result = await reconcileRtmpNoVideoGrace({
      observation: connectedWithoutCurrentVideo,
      videoSignalLostAt: '2026-10-17T00:00:00.000Z',
      eligibleForGrace: true,
      now: '2026-10-17T00:02:00.000Z',
      graceSeconds: 180,
      persistNoVideoSince,
      noteInputConnectedNoVideo: noteNoVideo,
      recoverVideo: vi.fn(),
      finalCheck: vi.fn(),
      endSession: vi.fn(),
    });

    expect(result).toMatchObject({ action: 'grace', videoSignalLostAt: '2026-10-17T00:00:00.000Z' });
    expect(persistNoVideoSince).not.toHaveBeenCalled();
    expect(noteNoVideo).toHaveBeenCalledWith('2026-10-17T00:00:00.000Z');
  });

  it('clears grace when current-session video returns', async () => {
    const recoverVideo = vi.fn(async () => undefined);
    const result = await reconcileRtmpNoVideoGrace({
      observation: { ...connectedWithoutCurrentVideo, videoStreaming: true, reason: 'active_video_found' },
      videoSignalLostAt: '2026-10-17T00:00:00.000Z',
      eligibleForGrace: true,
      now: '2026-10-17T00:02:00.000Z',
      graceSeconds: 180,
      persistNoVideoSince: vi.fn(),
      recoverVideo,
      finalCheck: vi.fn(),
      endSession: vi.fn(),
    });

    expect(result).toMatchObject({ action: 'recovered', videoSignalLostAt: null });
    expect(recoverVideo).toHaveBeenCalledOnce();
  });

  it('defers on Cloudflare errors or unknown states without ending', async () => {
    const endSession = vi.fn();
    for (const observation of [
      { ...connectedWithoutCurrentVideo, errors: ['list failed'] },
      { ...connectedWithoutCurrentVideo, inputConnected: false, reason: 'unknown_input_state' },
    ]) {
      const result = await reconcileRtmpNoVideoGrace({
        observation,
        videoSignalLostAt: '2026-10-17T00:00:00.000Z',
        eligibleForGrace: true,
        now: '2026-10-17T00:05:00.000Z',
        graceSeconds: 180,
        persistNoVideoSince: vi.fn(),
        recoverVideo: vi.fn(),
        finalCheck: vi.fn(),
        endSession,
      });
      expect(result.action).toBe('deferred');
    }
    expect(endSession).not.toHaveBeenCalled();
  });

  it('does not end when persisting the grace marker fails', async () => {
    const endSession = vi.fn();
    await expect(reconcileRtmpNoVideoGrace({
      observation: connectedWithoutCurrentVideo,
      videoSignalLostAt: null,
      eligibleForGrace: true,
      now: '2026-10-17T00:05:00.000Z',
      graceSeconds: 180,
      persistNoVideoSince: vi.fn().mockRejectedValue(new Error('database unavailable')),
      recoverVideo: vi.fn(),
      finalCheck: vi.fn(),
      endSession,
    })).rejects.toThrow('database unavailable');
    expect(endSession).not.toHaveBeenCalled();
  });

  it('requires a successful final no-video check after grace and ends once', async () => {
    const finalCheck = vi.fn(async () => connectedWithoutCurrentVideo);
    const endSession = vi.fn(async () => undefined);
    const result = await reconcileRtmpNoVideoGrace({
      observation: connectedWithoutCurrentVideo,
      videoSignalLostAt: '2026-10-17T00:00:00.000Z',
      eligibleForGrace: true,
      now: '2026-10-17T00:03:00.000Z',
      graceSeconds: 180,
      persistNoVideoSince: vi.fn(),
      recoverVideo: vi.fn(),
      finalCheck,
      endSession,
    });
    expect(result.action).toBe('ended');
    expect(finalCheck).toHaveBeenCalledOnce();
    expect(endSession).toHaveBeenCalledOnce();
  });

  it('keeps the session when final check sees current video or becomes unknown', async () => {
    for (const finalObservation of [
      { ...connectedWithoutCurrentVideo, videoStreaming: true, reason: 'active_video_found' },
      { ...connectedWithoutCurrentVideo, errors: ['temporary API failure'] },
    ]) {
      const recoverVideo = vi.fn();
      const endSession = vi.fn();
      const result = await reconcileRtmpNoVideoGrace({
        observation: connectedWithoutCurrentVideo,
        videoSignalLostAt: '2026-10-17T00:00:00.000Z',
        eligibleForGrace: true,
        now: '2026-10-17T00:03:00.000Z',
        graceSeconds: 180,
        persistNoVideoSince: vi.fn(),
        recoverVideo,
        finalCheck: vi.fn(async () => finalObservation),
        endSession,
      });
      expect(result.action).toBe(finalObservation.videoStreaming ? 'recovered' : 'deferred');
      expect(endSession).not.toHaveBeenCalled();
    }
  });
});

describe('mayAutoEndRtmpDisconnect', () => {
  it('keeps the session when a temporary negative check is followed by a live source', () => {
    expect(mayAutoEndRtmpDisconnect(disconnected, {
      ...disconnected,
      confirmedDisconnected: false,
      inputConnected: true,
    })).toBe(false);
  });

  it('keeps the session when Cloudflare returns an error or unknown state', () => {
    expect(mayAutoEndRtmpDisconnect(disconnected, { ...disconnected, hasReadError: true })).toBe(false);
    expect(mayAutoEndRtmpDisconnect(disconnected, { ...disconnected, confirmedDisconnected: false })).toBe(false);
  });

  it('does not start or expire grace from an unknown Cloudflare input state', () => {
    const unknown = { ...disconnected, confirmedDisconnected: false, hasReadError: true };
    expect(mayAutoEndRtmpDisconnect(unknown, disconnected)).toBe(false);
    expect(mayAutoEndRtmpDisconnect(disconnected, unknown)).toBe(false);
  });

  it('ends only after both checks confirm a prolonged real disconnect', () => {
    expect(mayAutoEndRtmpDisconnect(disconnected, disconnected)).toBe(true);
  });

  it('does not preserve a session for a live video outside the current session', () => {
    const currentSessionStart = '2026-10-14T12:00:00.000Z';
    const oldSessionVideoIsCurrent = isVideoInRtmpSessionWindow('2026-10-14T11:50:00.000Z', currentSessionStart);
    expect(oldSessionVideoIsCurrent).toBe(false);
    // Detection excludes the mismatched video, so it cannot prevent a real disconnect end.
    expect(mayAutoEndRtmpDisconnect(disconnected, disconnected)).toBe(true);
    expect(mayAutoEndRtmpDisconnect(disconnected, {
      ...disconnected,
      currentSessionVideoStreaming: true,
    })).toBe(false);
  });

  it('requires a session timestamp before treating any live video as current', () => {
    expect(isVideoInRtmpSessionWindow('2026-10-14T12:00:00.000Z', null)).toBe(false);
  });

  it('distinguishes explicit disconnected states from unrecognized Cloudflare states', () => {
    expect(isConfirmedRtmpDisconnectedState('disconnected')).toBe(true);
    expect(isConfirmedRtmpDisconnectedState('idle')).toBe(true);
    expect(isConfirmedRtmpDisconnectedState('mystery')).toBe(false);
    expect(isConfirmedRtmpDisconnectedState('')).toBe(false);
  });
});
