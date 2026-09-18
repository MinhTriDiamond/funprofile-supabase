/**
 * Validate input `identity-dispute-submit`: whitelist enum, maxLength, UUID chuẩn.
 * Không phụ thuộc thư viện ngoài để dùng được cả trong Deno và Vitest.
 */

export const DISPUTE_TYPES = [
  'sbt_revoke',
  'sbt_freeze',
  'sybil_flag',
  'trust_penalty',
  'did_demotion',
] as const;
export type DisputeType = typeof DISPUTE_TYPES[number];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const REASON_MIN = 20;
export const REASON_MAX = 2000;
export const TARGET_REF_MAX = 128;
export const EVIDENCE_MAX_BYTES = 8000;
export const EVIDENCE_MAX_KEYS = 20;

/** Các loại dispute mà `target_ref` bắt buộc là UUID (token_id của SBT). */
export const UUID_TARGET_TYPES: DisputeType[] = ['sbt_revoke', 'sbt_freeze'];

export interface DisputeSubmitOk {
  ok: true;
  disputeType: DisputeType;
  targetRef: string;
  reason: string;
  evidence: Record<string, unknown>;
}
export interface DisputeInputErr {
  ok: false;
  field: string;
  message: string;
}
export type DisputeSubmitResult = DisputeSubmitOk | DisputeInputErr;

export function validateDisputeSubmit(body: unknown): DisputeSubmitResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, field: 'body', message: 'Dữ liệu yêu cầu không hợp lệ' };
  }
  const raw = body as Record<string, unknown>;

  const disputeType = typeof raw.dispute_type === 'string' ? raw.dispute_type.trim() : '';
  if (!(DISPUTE_TYPES as readonly string[]).includes(disputeType)) {
    return { ok: false, field: 'dispute_type', message: 'Invalid dispute_type' };
  }

  if (typeof raw.target_ref !== 'string') {
    return { ok: false, field: 'target_ref', message: 'Thiếu target_ref' };
  }
  const targetRef = raw.target_ref.trim();
  if (!targetRef) {
    return { ok: false, field: 'target_ref', message: 'Thiếu target_ref' };
  }
  if (targetRef.length > TARGET_REF_MAX) {
    return {
      ok: false,
      field: 'target_ref',
      message: `target_ref quá dài (tối đa ${TARGET_REF_MAX} ký tự)`,
    };
  }
  if (UUID_TARGET_TYPES.includes(disputeType as DisputeType) && !UUID_RE.test(targetRef)) {
    return { ok: false, field: 'target_ref', message: 'target_ref phải là UUID hợp lệ' };
  }

  if (typeof raw.reason !== 'string') {
    return { ok: false, field: 'reason', message: `Cần lý do ≥ ${REASON_MIN} ký tự` };
  }
  const reason = raw.reason.trim();
  if (reason.length < REASON_MIN) {
    return { ok: false, field: 'reason', message: `Cần lý do ≥ ${REASON_MIN} ký tự` };
  }
  if (reason.length > REASON_MAX) {
    return { ok: false, field: 'reason', message: `Lý do quá dài (tối đa ${REASON_MAX} ký tự)` };
  }

  let evidence: Record<string, unknown> = {};
  const evRaw = raw.evidence;
  if (evRaw !== undefined && evRaw !== null) {
    if (typeof evRaw !== 'object' || Array.isArray(evRaw)) {
      return { ok: false, field: 'evidence', message: 'evidence phải là object' };
    }
    const keys = Object.keys(evRaw as Record<string, unknown>);
    if (keys.length > EVIDENCE_MAX_KEYS) {
      return {
        ok: false,
        field: 'evidence',
        message: `evidence tối đa ${EVIDENCE_MAX_KEYS} khoá`,
      };
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(evRaw);
    } catch {
      return { ok: false, field: 'evidence', message: 'evidence không hợp lệ' };
    }
    if (serialized.length > EVIDENCE_MAX_BYTES) {
      return { ok: false, field: 'evidence', message: 'evidence quá lớn' };
    }
    evidence = evRaw as Record<string, unknown>;
  }

  return { ok: true, disputeType: disputeType as DisputeType, targetRef, reason, evidence };
}
