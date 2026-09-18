# E2E — luồng gửi/nhận BTC native

Playwright e2e bảo vệ bản vá BTC ngày 12/06/2026:
- Desktop KHÔNG kích hoạt MetaMask qua `bitcoin:` protocol → không kẹt "Đang xử lý...".
- Mobile vẫn deep-link đúng + panel QR fallback.
- Trang Wallet hiện QR nhận BTC + copy địa chỉ.

## Cài đặt 1 lần

```bash
bunx playwright install chromium webkit
```

## Chạy

```bash
# Tự khởi động `bun run dev` ở cổng 8080
bun x playwright test

# Hoặc chỉ định base URL (vd: preview Lovable)
E2E_BASE_URL=https://id-preview--xxx.lovable.app bun x playwright test

# 1 file
bun x playwright test e2e/btc-send-desktop.spec.ts
```

## Auth fixture

Một số test cần user đã đăng nhập + đã có địa chỉ BTC. Tạo `e2e/.auth/user.json` thủ công:

1. Mở preview, đăng nhập bằng tài khoản test (vd `angelhoangtydo`).
2. DevTools console:
   ```js
   copy(JSON.stringify({ localStorage: Object.entries(localStorage) }, null, 2))
   ```
3. Dán vào `e2e/.auth/user.json` (đã gitignore).

Set thêm:
```bash
export E2E_RECIPIENT_HANDLE=angelthanhtien   # user nhận có địa chỉ bc1p…
```

Nếu không có `.auth/user.json` hoặc `E2E_RECIPIENT_HANDLE` → các test phụ thuộc sẽ tự `test.skip()`.

## Mock

Tất cả call `mempool.space` và `blockstream.info` đều được route fulfill bằng mock (xem `fixtures/btcMocks.ts`) — test không phụ thuộc mạng Bitcoin thật.

`installLocationHrefSpy` ghi đè setter `window.location.href` để bắt mọi lần code thử mở `bitcoin:` deep-link mà KHÔNG thực sự chuyển trang.
