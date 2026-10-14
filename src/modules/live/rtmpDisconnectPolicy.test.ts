import { describe, expect, it } from 'vitest';
import { isConfirmedRtmpDisconnectedState, isVideoInRtmpSessionWindow, mayAutoEndRtmpDisconnect, type RtmpDisconnectObservation } from '../../../supabase/functions/_shared/rtmpDisconnectPolicy.ts';

const disconnected: RtmpDisconnectObservation = {
  confirmedDisconnected: true,
  inputConnected: false,
  currentSessionVideoStreaming: false,
  hasReadError: false,
};

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
