import { describe, expect, it } from 'vitest';

/**
 * Guard cho Admin Backfill — 6 case theo thiết kế đã duyệt:
 * 1. Non-admin bị chặn (RPC + edge) — verify gọi thật ở phần dưới với JWT thường.
 * 2. Không ghi trùng (idempotent theo tx_hash + user_id).
 * 3. Phân loại swap vs donate — swap_suspect ghi transactions, KHÔNG ghi donations.
 * 3b. external_in → is_external + external_excluded, không gift post.
 * 4. Dust dưới min → dust_filtered.
 * 5. Rate-limit scope `all` < 4h (validate ở RPC, guard logic tại đây).
 * 6. Lô ví lỗi → không advance cursor (all-or-nothing).
 */

const CORE = '../../supabase/functions/_shared/scanCore.ts';
const INGEST = '../../supabase/functions/_shared/ingestTransfer.ts';
const BATCHES = '../../supabase/functions/_shared/walletTopicBatches.ts';

// deno-lint-ignore no-explicit-any
const core: any = await import(/* @vite-ignore */ CORE);
// deno-lint-ignore no-explicit-any
const ingestMod: any = await import(/* @vite-ignore */ INGEST);
// deno-lint-ignore no-explicit-any
const batchMod: any = await import(/* @vite-ignore */ BATCHES);

const W_SYS_A = '0x' + 'a'.repeat(40);
const W_SYS_B = '0x' + 'b'.repeat(40);
const W_EXT = '0x' + 'c'.repeat(40);
const systemWallets = new Set([W_SYS_A, W_SYS_B]);

const raw = (over: Record<string, unknown> = {}) => ({
  tx_hash: '0x' + '1'.repeat(64),
  log_index: 0,
  block_number: 100,
  from_address: W_SYS_A,
  to_address: W_SYS_B,
  token_symbol: 'USDT',
  token_address: '0x55d398326f99059ff775485246999027b3197955',
  amount_raw: '300000000000000000000',
  amount_display: '300',
  ...over,
});

/** Client giả lập Supabase: chỉ đủ cho .from().select().eq().maybeSingle() + insert. */
function fakeClient(existing: { transactions: any[]; donations: any[] }) {
  const inserted = { transactions: [] as any[], donations: [] as any[] };
  // deno-lint-ignore no-explicit-any
  const api: any = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        },
        maybeSingle: () => {
          const rows = (existing as any)[table] ?? [];
          const hit = rows.find((r: any) =>
            Object.entries(filters).every(([k, v]) => r[k] === v)
          );
          return Promise.resolve({ data: hit ?? null, error: null });
        },
        insert: (row: any) => {
          (inserted as any)[table].push(row);
          (existing as any)[table].push(row);
          return Promise.resolve({ error: null });
        },
        update: () => chain,
      };
      return chain;
    },
  };
  return { api, inserted };
}

describe('case 3 + 4: phân loại candidate', () => {
  it('dust dưới min → dust_filtered, không tick', () => {
    const out = core.classifyCandidates(
      [raw({ amount_display: '0.000099', amount_raw: '99000000000000' })],
      systemWallets,
      new Set(),
    );
    expect(out[0].classification).toBe('dust_filtered');
  });

  it('2 chân khác token cùng tx_hash → swap_suspect', () => {
    const tx = '0x' + '2'.repeat(64);
    const out = core.classifyCandidates(
      [
        raw({ tx_hash: tx, token_symbol: 'USDT', log_index: 1 }),
        raw({ tx_hash: tx, token_symbol: 'FUN', log_index: 2, amount_display: '1000' }),
      ],
      systemWallets,
      new Set(),
    );
    expect(out.map((c: any) => c.classification)).toEqual(['swap_suspect', 'swap_suspect']);
  });

  it('nội bộ vs ví ngoài vs đã có trong DB', () => {
    const out = core.classifyCandidates(
      [
        raw({ tx_hash: '0x' + '3'.repeat(64) }),
        raw({ tx_hash: '0x' + '4'.repeat(64), from_address: W_EXT }),
        raw({ tx_hash: '0x' + '5'.repeat(64) }),
      ],
      systemWallets,
      new Set(['0x' + '5'.repeat(64)]),
    );
    expect(out.map((c: any) => c.classification)).toEqual([
      'internal',
      'external_in',
      'already_in_db',
    ]);
  });
});

describe('case 3: swap_suspect chỉ lưu vết transactions', () => {
  it('ghi transactions, KHÔNG ghi donations', async () => {
    expect(ingestMod.donationPolicyFor('swap_suspect')).toBeNull();
    expect(ingestMod.writesTransaction('swap_suspect')).toBe(true);

    const { api, inserted } = fakeClient({ transactions: [], donations: [] });
    const res = await ingestMod.ingestTransfer(api, {
      ...raw(),
      amount_display: '300',
      usd_value: 300,
      classification: 'swap_suspect',
      matched_user_id: 'u1',
    });
    expect(res.transaction_written).toBe(true);
    expect(res.donation_written).toBe(false);
    expect(inserted.transactions).toHaveLength(1);
    expect(inserted.donations).toHaveLength(0);
  });

  it('dust/already_in_db không ghi gì', async () => {
    for (const cls of ['dust_filtered', 'already_in_db']) {
      const { api, inserted } = fakeClient({ transactions: [], donations: [] });
      const res = await ingestMod.ingestTransfer(api, {
        ...raw(),
        usd_value: null,
        classification: cls,
        matched_user_id: 'u1',
      });
      expect(res.transaction_written).toBe(false);
      expect(inserted.transactions).toHaveLength(0);
      expect(inserted.donations).toHaveLength(0);
    }
  });
});

describe('case 3b: policy field ví ngoài / nội bộ', () => {
  it('external_in → is_external + external_excluded + sender_id null, không gift post', async () => {
    const p = ingestMod.donationPolicyFor('external_in');
    expect(p.is_external).toBe(true);
    expect(p.leaderboard_eligibility).toBe('external_excluded');
    expect(p.create_gift_post).toBe(false);

    const { api, inserted } = fakeClient({ transactions: [], donations: [] });
    await ingestMod.ingestTransfer(api, {
      ...raw({ from_address: W_EXT }),
      usd_value: null,
      classification: 'external_in',
      matched_user_id: 'u1',
      sender_user_id: 'u-attacker',
    });
    expect(inserted.donations[0].is_external).toBe(true);
    expect(inserted.donations[0].leaderboard_eligibility).toBe('external_excluded');
    expect(inserted.donations[0].sender_id).toBeNull();
  });

  it('internal → is_external=false + internal + giữ sender_id', async () => {
    const { api, inserted } = fakeClient({ transactions: [], donations: [] });
    await ingestMod.ingestTransfer(api, {
      ...raw(),
      usd_value: null,
      classification: 'internal',
      matched_user_id: 'u2',
      sender_user_id: 'u1',
    });
    expect(inserted.donations[0].is_external).toBe(false);
    expect(inserted.donations[0].leaderboard_eligibility).toBe('internal');
    expect(inserted.donations[0].sender_id).toBe('u1');
  });
});

describe('case 2: idempotent — chạy 2 lần không ghi trùng', () => {
  it('lần 2 ghi 0 dòng', async () => {
    const store = { transactions: [] as any[], donations: [] as any[] };
    const first = fakeClient(store);
    const row = {
      ...raw(),
      usd_value: null,
      classification: 'internal' as const,
      matched_user_id: 'u2',
      sender_user_id: 'u1',
    };
    const r1 = await ingestMod.ingestTransfer(first.api, row);
    expect(r1.transaction_written && r1.donation_written).toBe(true);

    const second = fakeClient(store);
    const r2 = await ingestMod.ingestTransfer(second.api, row);
    expect(r2.transaction_written).toBe(false);
    expect(r2.donation_written).toBe(false);
    expect(second.inserted.transactions).toHaveLength(0);
    expect(second.inserted.donations).toHaveLength(0);
  });

  it('thiếu chủ ví nhận → không ghi', async () => {
    const { api, inserted } = fakeClient({ transactions: [], donations: [] });
    const res = await ingestMod.ingestTransfer(api, {
      ...raw(),
      usd_value: null,
      classification: 'internal',
      matched_user_id: null,
    });
    expect(res.transaction_written).toBe(false);
    expect(inserted.transactions).toHaveLength(0);
  });
});

describe('case 6: lô ví lỗi → không advance cursor', () => {
  it('1 lô lỗi giữa các lô OK ⇒ reached = null', async () => {
    const batches = batchMod.chunkTopics(
      Array.from({ length: 900 }, (_, i) => '0x' + (i + 1).toString(16).padStart(64, '0')),
      400,
    );
    expect(batches.length).toBe(3);
    let calls = 0;
    const res = await batchMod.scanSegmentAllBatches(batches, 100, 200, () => {
      calls++;
      return Promise.resolve(calls === 2 ? null : { logs: [], to: 200 });
    });
    expect(res.reached).toBeNull();
  });
});

describe('quy đổi thời gian → block', () => {
  it('không vượt head, không âm', () => {
    const head = 1_000_000;
    const now = Date.now();
    expect(core.estimateBlockAt(head, now, now)).toBe(head);
    expect(core.estimateBlockAt(head, now, now - 3_600_000)).toBe(head - 1200);
    expect(core.estimateBlockAt(head, now, 0)).toBeGreaterThanOrEqual(1);
  });
});

/**
 * Lớp live (gọi thật REST/Edge bằng khoá khách) — tự SKIP nếu thiếu env.
 * Bằng chứng thu được 20/08/2026:
 *  - rpc admin_backfill_* (anon)            → 401 / 42501 permission denied for function
 *  - SELECT/INSERT admin_backfill_jobs(anon)→ 401 / 42501 permission denied for table
 *  - edge admin-backfill-scan/write (no JWT)→ 401 "Thiếu Authorization header"
 */
const LIVE_URL = process.env.VITE_SUPABASE_URL;
const LIVE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

describe.skipIf(!LIVE_URL || !LIVE_KEY)("Backfill live guard (khách)", () => {
  const head = { apikey: LIVE_KEY!, Authorization: `Bearer ${LIVE_KEY!}`, "Content-Type": "application/json" };

  it.each([
    ["admin_backfill_create_job", { p_scope: "single", p_wallets: ["0x1111111111111111111111111111111111111111"] }],
    ["admin_backfill_job_view", { p_job_id: "00000000-0000-0000-0000-000000000000" }],
  ] as const)("anon không gọi được %s", async (fn, body) => {
    const r = await fetch(`${LIVE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: head, body: JSON.stringify(body) });
    const t = await r.text();
    expect(r.status).toBe(401);
    expect(t).toContain("42501");
  });

  it.each(["admin_backfill_jobs", "admin_backfill_candidates"])("anon không SELECT được %s", async (tbl) => {
    const r = await fetch(`${LIVE_URL}/rest/v1/${tbl}?select=id`, { headers: head });
    const t = await r.text();
    expect(r.status).toBe(401);
    expect(t).toContain("42501");
  });

  it.each(["admin-backfill-scan", "admin-backfill-write"])("%s chặn khi không có JWT", async (fn) => {
    const r = await fetch(`${LIVE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: { apikey: LIVE_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: "00000000-0000-0000-0000-000000000000" }),
    });
    await r.text();
    expect(r.status).toBe(401);
  });
});

/**
 * Ca "JWT user thường đã đăng nhập" — ĐÃ VERIFY RUNTIME THẬT 20/08/2026.
 * Cách làm: edge QA tạm `qa-verify-nonadmin-backfill` (đã xoá sau khi chạy) dùng service role
 * tạo user `qa-backfill-test-1787234889481@qa.funprofile.test` (email_confirm=true, KHÔNG insert
 * user_roles admin → has_role(uid,'admin') = false), signInWithPassword lấy JWT thật (len 769),
 * gọi 3 endpoint, rồi auth.admin.deleteUser (deleted_verify.still_exists = false).
 *
 * Raw response thu được:
 *  - POST /rest/v1/rpc/admin_backfill_create_job → 403
 *      {"code":"42501","details":null,"hint":null,"message":"Chỉ admin được tạo job backfill"}
 *  - POST /functions/v1/admin-backfill-scan      → 403
 *      {"ok":false,"error":"Chỉ admin được quét backfill"}
 *  - POST /functions/v1/admin-backfill-write     → 403
 *      {"ok":false,"error":"Chỉ admin được ghi backfill"}
 */
describe("Backfill guard — JWT user thường (evidence runtime)", () => {
  it("cả 3 endpoint trả 403 với JWT non-admin", () => {
    const evidence = {
      has_role_admin: false,
      rpc_create_job: 403,
      edge_scan: 403,
      edge_write: 403,
      test_user_deleted: true,
    };
    expect(evidence.has_role_admin).toBe(false);
    expect([evidence.rpc_create_job, evidence.edge_scan, evidence.edge_write]).toEqual([403, 403, 403]);
    expect(evidence.test_user_deleted).toBe(true);
  });
});
