import { test, expect } from '@playwright/test';
import { mockBtcEndpoints, installLocationHrefSpy, getHrefSpy } from './fixtures/btcMocks';
import { loadAuth } from './fixtures/auth';

/**
 * Desktop: bấm xác nhận BTC → KHÔNG kích hoạt MetaMask (`bitcoin:`),
 * panel QR hiện ngay với cảnh báo Taproot, không kẹt "Đang xử lý...".
 *
 * Yêu cầu: có e2e/.auth/user.json với session hợp lệ và một user đích đã liên kết địa chỉ bc1p…
 * Biến env: E2E_RECIPIENT_HANDLE (vd: angelthanhtien). Skip nếu thiếu.
 */
test.describe('BTC send — desktop', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop only');

  const recipient = process.env.E2E_RECIPIENT_HANDLE;

  test.beforeEach(async ({ page }) => {
    await mockBtcEndpoints(page);
    await installLocationHrefSpy(page);
    await loadAuth(page);
  });

  test('mở dialog gift, chọn BTC, xác nhận → QR hiện, không deep-link, không kẹt', async ({ page }) => {
    test.skip(!recipient, 'cần env E2E_RECIPIENT_HANDLE trỏ vào user có địa chỉ bc1p…');

    await page.goto(`/${recipient}`);
    await page.getByRole('button', { name: /tặng|gift|donate/i }).first().click();

    // Chọn token BTC
    await page.getByRole('button', { name: /BTC/i }).first().click();
    await page.getByPlaceholder(/0\.0|số lượng/i).first().fill('0.0001');

    // Bấm xác nhận
    await page.getByRole('button', { name: /xác nhận|confirm|gửi/i }).first().click();

    // Panel QR phải hiện (svg qrcode)
    await expect(page.locator('svg').filter({ has: page.locator('path, rect') }).first()).toBeVisible({ timeout: 5_000 });

    // Cảnh báo MetaMask
    await expect(page.getByText(/MetaMask không gửi được/i)).toBeVisible();

    // KHÔNG có deep-link bitcoin: bị gọi
    const spy = await getHrefSpy(page);
    const triedBitcoin = spy.some((u) => u.startsWith('bitcoin:'));
    expect(triedBitcoin).toBe(false);

    // "Đang xử lý..." không xuất hiện > 1.5s
    await page.waitForTimeout(1_500);
    await expect(page.getByText(/đang xử lý\.\.\./i)).toHaveCount(0);

    // Bấm Huỷ đóng sạch panel
    await page.getByRole('button', { name: /huỷ|hủy|cancel/i }).first().click();
  });
});
