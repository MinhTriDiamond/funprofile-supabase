import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

// Stub Deno.env cho module edge function (moralisFetch.ts dùng Deno.env.get).
const envMap: Record<string, string> = {
  MORALIS_API_KEY: 'key-aaaaaa',
  MORALIS_API_KEY_2: 'key-bbbbbb',
  MORALIS_API_KEY_3: 'key-cccccc',
};
// deno-lint-ignore no-explicit-any
(globalThis as any).Deno = { env: { get: (k: string) => envMap[k] } };

// Import động qua biến để typecheck của app không kéo file Deno vào graph.
const MODULE_PATH = '../../supabase/functions/_shared/moralisFetch.ts';
// deno-lint-ignore no-explicit-any
const mod: any = await import(/* @vite-ignore */ MODULE_PATH);
const {
  moralisFetchRaw,
  resetMoralisBreakers,
  resetMoralisFailures,
  areAllMoralisKeysTripped,
  isMoralisUnavailable,
  getTrippedKeys,
  nextUtcMidnight,
  __setMoralisFetchImpl,
} = mod;

function quotaResponse() {
  return new Response(
    JSON.stringify({ message: 'Total included usage has been consumed' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('Moralis circuit-breaker (chống đốt quota 3x)', () => {
  beforeEach(() => {
    resetMoralisBreakers();
    resetMoralisFailures();
  });

  afterAll(() => {
    __setMoralisFetchImpl(null);
  });

  it('key đã cạn quota không bị gọi lại HTTP ở các call sau', async () => {
    const calls: string[] = [];
    __setMoralisFetchImpl((_url, init) => {
      const key = new Headers(init?.headers).get('X-API-Key') ?? '';
      calls.push(key);
      return Promise.resolve(quotaResponse());
    });

    // Lần 1: thử lần lượt cả 3 key (mỗi key 1 HTTP call) rồi trip hết.
    await moralisFetchRaw('https://deep-index.moralis.io/api/v2.2/x/erc20/transfers');
    expect(calls.length).toBe(3);
    expect(areAllMoralisKeysTripped()).toBe(true);

    // Lần 2 và 3: fail-fast, KHÔNG thêm HTTP call nào.
    const before = calls.length;
    const r2 = await moralisFetchRaw('https://deep-index.moralis.io/api/v2.2/y');
    const r3 = await moralisFetchRaw('https://deep-index.moralis.io/api/v2.2/z');
    expect(calls.length).toBe(before);
    expect(r2.attempts).toBe(0);
    expect(r3.attempts).toBe(0);
    expect(r2.response.status).toBe(402);
    // Guard vẫn báo đúng "chưa quét được" (provider_unavailable).
    expect(isMoralisUnavailable()).toBe(true);
    expect(getTrippedKeys().length).toBe(3);
  });

  it('key còn sống vẫn được dùng khi key khác đã bị ngừng', async () => {
    const calls: string[] = [];
    __setMoralisFetchImpl((_url, init) => {
      const key = new Headers(init?.headers).get('X-API-Key') ?? '';
      calls.push(key);
      if (key === 'key-aaaaaa') return Promise.resolve(quotaResponse());
      return Promise.resolve(new Response('{"result":[]}', { status: 200 }));
    });

    const first = await moralisFetchRaw('https://deep-index.moralis.io/api/v2.2/a');
    expect(first.response.status).toBe(200);
    expect(calls).toEqual(['key-aaaaaa', 'key-bbbbbb']);

    // Call kế tiếp bỏ hẳn key #1 (đã trip), đi thẳng key #2.
    calls.length = 0;
    const second = await moralisFetchRaw('https://deep-index.moralis.io/api/v2.2/b');
    expect(second.response.status).toBe(200);
    expect(calls).toEqual(['key-bbbbbb']);
    expect(areAllMoralisKeysTripped()).toBe(false);
  });

  it('TTL ngừng quota chạy tới 00:00 UTC hôm sau', () => {
    const now = Date.UTC(2026, 7, 18, 15, 27, 0);
    expect(nextUtcMidnight(now)).toBe(Date.UTC(2026, 7, 19, 0, 0, 0));
  });
});

// giữ vi được import (tránh lint unused nếu về sau cần spy)
void vi;

// ---------------------------------------------------------------------------
// Cảnh báo quota theo tín hiệu 401 THẬT (20/08/2026) — không chờ ngưỡng % nội bộ
// ---------------------------------------------------------------------------
const { flushMoralisQuotaAlerts, getMoralisTripEvents } = mod;

function fakeAdminClient(inserts: Record<string, unknown>[]) {
  return {
    // deno-lint-ignore no-explicit-any
    from(table: string): any {
      if (table === 'user_roles') {
        return { select: () => ({ eq: () => ({ data: [{ user_id: 'admin-1' }] }) }) };
      }
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ gte: () => ({ limit: () => ({ data: [] }) }) }) }),
        }),
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return { data: null, error: null };
        },
      };
    },
    rpc: () => ({ data: null, error: null }),
  };
}

describe('Cảnh báo quota Moralis theo 401 thật', () => {
  beforeEach(() => {
    resetMoralisBreakers();
    resetMoralisFailures();
  });

  it('gửi notification admin ngay lần đầu key bị trip, dedupe trip trùng', async () => {
    __setMoralisFetchImpl(() => Promise.resolve(quotaResponse()));
    await moralisFetchRaw('https://deep-index.moralis.io/api/v2.2/x');
    expect(getMoralisTripEvents().length).toBe(3);

    const inserts: Record<string, unknown>[] = [];
    const sent = await flushMoralisQuotaAlerts(fakeAdminClient(inserts), 'unit-test');
    expect(sent).toBe(3);
    expect(inserts.length).toBe(3);
    expect(String(inserts[0].title)).toContain('đã cạn quota');
    expect(String(inserts[0].content)).toContain('MÙ ON-CHAIN MỘT PHẦN');

    // Đã flush ⇒ không gửi lại
    const inserts2: Record<string, unknown>[] = [];
    expect(await flushMoralisQuotaAlerts(fakeAdminClient(inserts2), 'unit-test')).toBe(0);
    expect(inserts2.length).toBe(0);
  });
});
