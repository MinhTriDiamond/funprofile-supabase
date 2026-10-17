import { describe, expect, it } from 'vitest';
import { evaluateAgoraCallTokenAccess } from '../../../supabase/functions/_shared/agoraCallTokenPolicy';

const request = (overrides: Partial<Parameters<typeof evaluateAgoraCallTokenAccess>[0]> = {}) => ({
  authenticated: true, isActiveMember: true, callStatus: 'ringing', blocked: false, ...overrides,
});

describe('Agora call token access policy', () => {
  it('rejects unauthenticated, nonmember, blocked and terminal call requests', () => {
    expect(evaluateAgoraCallTokenAccess(request({ authenticated: false })).allowed).toBe(false);
    expect(evaluateAgoraCallTokenAccess(request({ isActiveMember: false })).code).toBe('CALL_FORBIDDEN');
    expect(evaluateAgoraCallTokenAccess(request({ blocked: true })).code).toBe('CALL_BLOCKED');
    expect(evaluateAgoraCallTokenAccess(request({ callStatus: 'ended' })).code).toBe('CALL_NOT_ACTIVE');
  });
  it('allows active members only for ringing or active calls', () => {
    expect(evaluateAgoraCallTokenAccess(request()).allowed).toBe(true);
    expect(evaluateAgoraCallTokenAccess(request({ callStatus: 'active' })).allowed).toBe(true);
    expect(evaluateAgoraCallTokenAccess(request({ callStatus: 'pending' })).allowed).toBe(false);
  });
});
