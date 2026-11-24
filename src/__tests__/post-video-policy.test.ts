import { describe, it, expect } from 'vitest';
import { decidePostVideoAction, computePostVideoBudget, type PostVideoFacts } from '../../supabase/functions/_shared/postVideoPolicy';
const facts: PostVideoFacts = { sourceOwned: true, postExists: true, sourceUnchanged: true, isPublic: true, exportReady: true, r2Verified: true, outputSmaller: true, outputPublished: true, streamIsLive: false, streamOwned: true, streamStillReferenced: false, sourceVerified: true };
describe('post video safety policy', () => {
  it.each(['r2Verified', 'outputPublished', 'sourceOwned', 'streamOwned'] as const)('never deletes before %s', key => {
    expect(decidePostVideoAction({ phase: 'stream_delete_pending' }, { ...facts, [key]: false }).type).not.toBe('delete_stream');
  });
  it('never deletes live or referenced Stream media', () => {
    expect(decidePostVideoAction({ phase: 'stream_delete_pending' }, { ...facts, streamIsLive: true }).type).toBe('needs_review');
    expect(decidePostVideoAction({ phase: 'stream_delete_pending' }, { ...facts, streamStillReferenced: true }).type).toBe('wait');
    expect(decidePostVideoAction({ phase: 'stream_delete_pending' }, facts).type).toBe('delete_stream');
  });
  it('does not swap to an export that is larger or unverified', () => {
    expect(decidePostVideoAction({ phase: 'publishing' }, { ...facts, outputSmaller: false }).type).toBe('needs_review');
    expect(decidePostVideoAction({ phase: 'publishing' }, { ...facts, r2Verified: false }).type).toBe('wait');
    expect(decidePostVideoAction({ phase: 'publishing' }, facts).type).toBe('publish_r2');
  });
  it.each(['sourceUnchanged', 'postExists', 'isPublic'] as const)('does not publish after %s changed', key => {
    expect(decidePostVideoAction({ phase: 'publishing' }, { ...facts, [key]: false }).type).toBe('needs_review');
  });
  it('can dispose a non-beneficial VOD only while its original source is verified', () => {
    expect(decidePostVideoAction({ phase: 'not_beneficial' }, { ...facts, outputPublished: false, r2Verified: false, sourceVerified: false }).type).toBe('wait');
    expect(decidePostVideoAction({ phase: 'not_beneficial' }, { ...facts, outputPublished: false, r2Verified: false }).type).toBe('delete_stream');
  });
  it('never produces an original R2 deletion action', () => {
    for (const phase of ['queued', 'encoding', 'r2_upload', 'publishing', 'complete', 'not_beneficial'] as const) {
      expect(decidePostVideoAction({ phase }, facts).type).not.toBe('delete_source');
    }
  });
  it('budgets in seconds conservatively and fails closed for missing usage', () => {
    expect(computePostVideoBudget({ limitMinutes: 1000, usedMinutes: 700.001, reservedMinutes: 10, liveReserveMinutes: 240 })).toBeCloseTo(49.983333, 5);
    expect(computePostVideoBudget({ limitMinutes: 1000, usedMinutes: NaN, reservedMinutes: 0, liveReserveMinutes: 240 })).toBe(0);
    expect(computePostVideoBudget({ limitMinutes: 1000, usedMinutes: 900, reservedMinutes: 0, liveReserveMinutes: 240 })).toBe(0);
  });
});
