import { test, expect } from '@playwright/test';
import { mockBtcEndpoints, installLocationHrefSpy, getHrefSpy } from './fixtures/btcMocks';
import { loadAuth } from './fixtures/auth';

/**
 * Mobile: deep-link bitcoin: ĐƯỢC gọi (sau ~350ms), panel QR vẫn render đầy đủ để fallback.
 * Nút "Mở ví BTC" chỉ hiện trên mobile.
 */
test.describe('BTC send — mobile', () => {
  test.skip(({ browserName }) => browserName !== 'webkit', 'mobile only (iPhone 13)');

  const recipient = process.env.E2E_RECIPIENT_HANDLE;

  test.beforeEach(async ({ page }) => {
    await mockBtcEndpoints(page);
    await installLocationHrefSpy(page);
    await loadAuth(page);
  });

  test('xác nhận → bitcoin: được trigger, panel QR vẫn hiện, có nút Mở ví BTC', async ({ page }) => {
    test.skip(!recipient, 'cần env E2E_RECIPIENT_HANDLE');

    await page.goto(`/${recipient}`);
    await page.getByRole('button', { name: /tặng|gift|donate/i }).first().click();
    await page.getByRole('button', { name: /BTC/i }).first().click();
    await page.getByPlaceholder(/0\.0|số lượng/i).first().fill('0.0001');
    await page.getByRole('button', { name: /xác nhận|confirm|gửi/i }).first().click();

    // Đợi deep-link được gọi
    await page.waitForTimeout(800);
    const spy = await getHrefSpy(page);
    const tried = spy.find((u) => u.startsWith('bitcoin:'));
    expect(tried, 'phải có ít nhất 1 lần thử mở bitcoin: deep-link').toBeTruthy();
    expect(tried!).toMatch(/^bitcoin:[a-z0-9]+\?amount=0\.0001/i);

    // QR + nút "Mở ví BTC" mobile
    await expect(page.locator('svg').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /mở ví btc/i })).toBeVisible();
  });
});
