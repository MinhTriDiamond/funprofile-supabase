// =============================================
// PPLP Crypto Utilities - Deno Compatible
// SHA-256, Evidence Anchoring, Canonical JSON
// =============================================

/** SHA-256 hash sử dụng Web Crypto API (hoạt động trên cả Deno và Browser) */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Tạo canonical JSON string (sorted keys, no whitespace) */
export function canonicalJSON(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/** Tạo evidence hash từ action data */
export async function generateEvidenceHash(
  actionType: string,
  actorId: string,
  metadata: Record<string, unknown>,
  timestamp: string
): Promise<string> {
  const canonical = canonicalJSON({
    action_type: actionType,
    actor_id: actorId,
    metadata,
    timestamp,
  });
  return sha256(canonical);
}

/** Tạo canonical hash cho dedup (chống trùng lặp) */
export async function generateCanonicalHash(
  actionType: string,
  actorId: string,
  contentPreview: string,
  timestamp: string
): Promise<string> {
  const data = `${actionType}:${actorId}:${contentPreview.substring(0, 100)}:${timestamp.substring(0, 10)}`;
  return sha256(data);
}

/** Hash cho evidence anchoring (kết hợp nhiều action types) */
export async function hashForEvidence(actionTypes: string[]): Promise<string> {
  const sorted = [...new Set(actionTypes)].sort();
  const joined = sorted.join(',');
  return sha256(joined);
}
