/**
 * btc-raw-sat-guard
 * ------------------------------------------------------------------
 * Guard chống hồi quy sự cố P0 BTC (satoshi thô ghi thẳng vào cột
 * `amount` thay vì BTC canonical).
 *
 * Chạy 2 tầng check độc lập, cả hai đều phải sạch mới trả ok=true:
 *
 *   1. threshold_1000 — quét 3 bảng (transactions/donations/
 *      wallet_transfers) tìm row có token_symbol='BTC' và amount > 1000.
 *      1000 BTC KHÔNG phải giới hạn nghiệp vụ mà là ngưỡng phát hiện
 *      satoshi thô cỡ lớn (1 725 sat sẽ KHÔNG bị ngưỡng này bắt,
 *      nhưng 1 160 801 899 sat = 1.16 tỷ "BTC" giả sẽ bị bắt ngay).
 *
 *   2. cross_table_ratio_1e8 — bản chất của bug: cùng tx_hash BTC có
 *      2 row với tỉ số max/min ≈ 10^8 tức 1 bảng ghi thô còn bảng kia
 *      ghi canonical. Ngưỡng ±0.5 quanh 100 000 000 là dung sai
 *      rounding của phép chia numeric (KHÔNG phải magic number).
 *      Yêu cầu ≥2 source_table khác nhau để loại false positive
 *      "cùng tx nhiều output trong cùng 1 bảng". False positive tình
 *      cờ giữa 2 bảng khác nhau là rủi ro có ý thức ở v2 — reviewer
 *      xem `variants` loại bằng mắt trong 10s.
 *
 * Access: admin-only qua requireUser + has_role('admin'). CI/cron
 * gọi bằng Authorization: Bearer <service_role_key> — service_role
 * bypass tất cả gate.
 * ------------------------------------------------------------------
 */
import { corsHeaders, createAdminClient, requireUser, json, normalizeError } from '../_shared/httpAuth.ts';

const THRESHOLD = 1000;

/**
 * Constant-time string compare cho secret bypass gate.
 * Deno KHÔNG có crypto.subtle.timingSafeEqual (chỉ Node.js mới có), nên
 * hand-roll XOR accumulate: không short-circuit trên byte đầu khác, và
 * xử lý length mismatch bằng cách accumulate cả chênh lệch độ dài.
 * Rò rỉ duy nhất còn lại là độ dài tổng — chấp nhận (public shape đã biết).
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createAdminClient();

    // Auth gate — chấp nhận service_role (CI/cron) hoặc user admin.
    // Constant-time compare bằng XOR accumulate (không short-circuit, xử lý length mismatch).
    const authHeader = req.headers.get('Authorization') || '';
    const serviceKey =
      Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const isServiceRole = !!serviceKey && constantTimeEqual(authHeader, `Bearer ${serviceKey}`);

    if (!isServiceRole) {
      const user = await requireUser(req);
      const { data: isAdmin } = await admin.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin',
      });
      if (!isAdmin) return json({ error: 'FORBIDDEN' }, 403);
    }

    const { data: scan, error: scanErr } = await admin.rpc('btc_raw_sat_guard_scan');
    if (scanErr) throw scanErr;

    const s = (scan ?? {}) as {
      threshold_1000?: { ok: boolean; offenders: unknown[] };
      cross_table_ratio_1e8?: { ok: boolean; offenders: unknown[] };
    };
    const check1 = s.threshold_1000 ?? { ok: true, offenders: [] };
    const check2 = s.cross_table_ratio_1e8 ?? { ok: true, offenders: [] };
    const ok = check1.ok && check2.ok;

    return json({
      ok,
      checks: {
        threshold_1000: check1,
        cross_table_ratio_1e8: check2,
      },
      threshold: THRESHOLD,
      note: 'Threshold 1000 là ngưỡng phát hiện raw-satoshi, KHÔNG phải giới hạn nghiệp vụ.',
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    const n = normalizeError(err);
    return json({ error: n.message, code: n.code }, n.status ?? 500);
  }
});
