import type { Page } from '@playwright/test';

/**
 * Mock toàn bộ endpoint mempool.space + blockstream để polling/balance không phụ thuộc mạng thật.
 * Trả về 0 tx và balance 0 — đủ cho kịch bản "chưa gửi xong".
 */
export async function mockBtcEndpoints(page: Page) {
  await page.route(/mempool\.space\/api\/address\/[^/]+\/txs/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route(/mempool\.space\/api\/address\/[^/]+$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
      }),
    }),
  );
  await page.route(/blockstream\.info\/api\/address\/.*/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
      }),
    }),
  );
}

/**
 * Inject một spy trên window.location.href setter để bắt mọi lần code thử `bitcoin:` deep-link.
 * Lưu vào window.__btcHrefSpy (mảng các URL đã thử set).
 */
export async function installLocationHrefSpy(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __btcHrefSpy?: string[] };
    w.__btcHrefSpy = [];
    try {
      const proto = Object.getPrototypeOf(window.location);
      const desc = Object.getOwnPropertyDescriptor(proto, 'href');
      if (desc && desc.set) {
        const originalSet = desc.set;
        Object.defineProperty(window.location, 'href', {
          configurable: true,
          get: () => document.location.toString(),
          set(v: string) {
            (window as unknown as { __btcHrefSpy: string[] }).__btcHrefSpy.push(String(v));
            if (typeof v === 'string' && v.startsWith('bitcoin:')) {
              // Không chuyển trang để test tiếp tục.
              return;
            }
            originalSet.call(window.location, v);
          },
        });
      }
    } catch {
      /* ignore */
    }
  });
}

export async function getHrefSpy(page: Page): Promise<string[]> {
  return await page.evaluate(() => (window as unknown as { __btcHrefSpy?: string[] }).__btcHrefSpy || []);
}
