import { test, expect } from '@playwright/test';
import { mockBtcEndpoints } from './fixtures/btcMocks';
import { loadAuth } from './fixtures/auth';

/**
 * Nhận BTC: trang Wallet → tab BTC → mở dialog QR nhận, kiểm tra QR + địa chỉ + nút Copy/Chia sẻ.
 * Cần auth (user đã có btcAddress).
 */
test.describe('BTC receive', () => {
  test.beforeEach(async ({ page }) => {
    await mockBtcEndpoints(page);
    const auth = await loadAuth(page);
    test.skip(!auth.loaded, 'cần e2e/.auth/user.json đã đăng nhập');
  });

  test('QR nhận BTC hiển thị và có thể copy địa chỉ', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/wallet');
    await page.getByRole('tab', { name: /BTC|bitcoin/i }).first().click().catch(() => {});

    // Mở dialog nhận
    await page.getByRole('button', { name: /nhận|receive/i }).first().click();

    // QR SVG phải hiện
    await expect(page.locator('svg').first()).toBeVisible();

    // Địa chỉ bc1… hiển thị
    await expect(page.getByText(/bc1[a-z0-9]{10,}/i).first()).toBeVisible();

    // Copy
    await page.getByRole('button', { name: /sao chép|copy/i }).first().click();
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    expect(clip).toMatch(/^bc1/i);
  });
});
