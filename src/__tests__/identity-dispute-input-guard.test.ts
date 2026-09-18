import { describe, it, expect } from 'vitest';
import { validateDisputeSubmit } from '../../supabase/functions/identity-dispute-submit/validateDisputeInput';
import { validateDisputeResolve } from '../../supabase/functions/identity-dispute-resolve/validateResolveInput';

const UUID = '11111111-2222-4333-8444-555555555555';
const REASON = 'Tôi cho rằng quyết định này chưa chính xác, xin xem lại giúp.';
const field = (r: unknown) => (r as { field: string }).field;

describe('identity-dispute-submit — validate input', () => {
  it('nhận input hợp lệ', () => {
    const r = validateDisputeSubmit({
      dispute_type: 'sybil_flag',
      target_ref: 'flag-2026-08',
      reason: `  ${REASON}  `,
      evidence: { url: 'https://x.test' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reason).toBe(REASON);
    expect(r.disputeType).toBe('sybil_flag');
  });

  it('whitelist dispute_type', () => {
    for (const t of ['hack', '', null, 'SBT_REVOKE', 1]) {
      const r = validateDisputeSubmit({ dispute_type: t, target_ref: 'x', reason: REASON });
      expect(r.ok).toBe(false);
      expect(field(r)).toBe('dispute_type');
    }
  });

  it('sbt_revoke / sbt_freeze yêu cầu target_ref là UUID', () => {
    expect(validateDisputeSubmit({ dispute_type: 'sbt_revoke', target_ref: 'not-uuid', reason: REASON }).ok).toBe(false);
    expect(validateDisputeSubmit({ dispute_type: 'sbt_freeze', target_ref: UUID, reason: REASON }).ok).toBe(true);
  });

  it('chặn target_ref rỗng / quá dài', () => {
    expect(field(validateDisputeSubmit({ dispute_type: 'sybil_flag', target_ref: '  ', reason: REASON }))).toBe('target_ref');
    expect(field(validateDisputeSubmit({ dispute_type: 'sybil_flag', target_ref: 'x'.repeat(129), reason: REASON }))).toBe('target_ref');
  });

  it('reason: min 20, max 2000 ký tự', () => {
    expect(field(validateDisputeSubmit({ dispute_type: 'sybil_flag', target_ref: 'x', reason: 'ngắn' }))).toBe('reason');
    expect(field(validateDisputeSubmit({ dispute_type: 'sybil_flag', target_ref: 'x', reason: 'a'.repeat(2001) }))).toBe('reason');
    expect(field(validateDisputeSubmit({ dispute_type: 'sybil_flag', target_ref: 'x', reason: 123 }))).toBe('reason');
  });

  it('evidence phải là object, giới hạn số khoá và kích thước', () => {
    expect(field(validateDisputeSubmit({ dispute_type: 'sybil_flag', target_ref: 'x', reason: REASON, evidence: [] }))).toBe('evidence');
    const manyKeys = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 1]));
    expect(field(validateDisputeSubmit({ dispute_type: 'sybil_flag', target_ref: 'x', reason: REASON, evidence: manyKeys }))).toBe('evidence');
    expect(field(validateDisputeSubmit({ dispute_type: 'sybil_flag', target_ref: 'x', reason: REASON, evidence: { big: 'x'.repeat(9000) } }))).toBe('evidence');
  });

  it('chặn body không phải object', () => {
    expect(validateDisputeSubmit(null).ok).toBe(false);
    expect(validateDisputeSubmit([]).ok).toBe(false);
  });
});

describe('identity-dispute-resolve — validate input', () => {
  it('nhận input hợp lệ', () => {
    const r = validateDisputeResolve({ dispute_id: UUID, decision: 'accepted', resolution_note: ' ok ' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.disputeId).toBe(UUID);
    expect(r.resolutionNote).toBe('ok');
  });

  it('dispute_id phải là UUID', () => {
    for (const id of ['', 'abc', 12, null, '11111111-2222-3333-4444-555555555555555']) {
      expect(field(validateDisputeResolve({ dispute_id: id, decision: 'accepted' }))).toBe('dispute_id');
    }
  });

  it('whitelist decision', () => {
    for (const d of ['approve', '', 'ACCEPTED', null]) {
      expect(field(validateDisputeResolve({ dispute_id: UUID, decision: d }))).toBe('decision');
    }
  });

  it('resolution_note: kiểu chuỗi, tối đa 2000 ký tự', () => {
    expect(field(validateDisputeResolve({ dispute_id: UUID, decision: 'rejected', resolution_note: 1 }))).toBe('resolution_note');
    expect(field(validateDisputeResolve({ dispute_id: UUID, decision: 'rejected', resolution_note: 'x'.repeat(2001) }))).toBe('resolution_note');
    expect(validateDisputeResolve({ dispute_id: UUID, decision: 'rejected' }).ok).toBe(true);
  });

  it('chặn body không phải object', () => {
    expect(validateDisputeResolve(null).ok).toBe(false);
    expect(validateDisputeResolve('x').ok).toBe(false);
  });
});
