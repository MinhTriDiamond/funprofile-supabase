/**
 * Validate input `identity-dispute-resolve`: UUID chuẩn, whitelist decision,
 * maxLength cho resolution_note.
 */

export const DECISIONS = ['accepted', 'rejected'] as const;
export type Decision = typeof DECISIONS[number];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const NOTE_MAX = 2000;

export interface ResolveOk {
  ok: true;
  disputeId: string;
  decision: Decision;
  resolutionNote: string;
}
export interface ResolveErr {
  ok: false;
  field: string;
  message: string;
}
export type ResolveResult = ResolveOk | ResolveErr;

export function validateDisputeResolve(body: unknown): ResolveResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, field: 'body', message: 'Dữ liệu yêu cầu không hợp lệ' };
  }
  const raw = body as Record<string, unknown>;

  const disputeId = typeof raw.dispute_id === 'string' ? raw.dispute_id.trim() : '';
  if (!UUID_RE.test(disputeId)) {
    return { ok: false, field: 'dispute_id', message: 'dispute_id phải là UUID hợp lệ' };
  }

  const decision = typeof raw.decision === 'string' ? raw.decision.trim() : '';
  if (!(DECISIONS as readonly string[]).includes(decision)) {
    return { ok: false, field: 'decision', message: 'Invalid input' };
  }

  let resolutionNote = '';
  if (raw.resolution_note !== undefined && raw.resolution_note !== null) {
    if (typeof raw.resolution_note !== 'string') {
      return { ok: false, field: 'resolution_note', message: 'resolution_note phải là chuỗi' };
    }
    resolutionNote = raw.resolution_note.trim();
    if (resolutionNote.length > NOTE_MAX) {
      return {
        ok: false,
        field: 'resolution_note',
        message: `resolution_note quá dài (tối đa ${NOTE_MAX} ký tự)`,
      };
    }
  }

  return { ok: true, disputeId, decision: decision as Decision, resolutionNote };
}
