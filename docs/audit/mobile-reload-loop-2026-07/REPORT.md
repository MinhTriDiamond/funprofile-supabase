# Mobile Reload Loop — Audit Report

**Ngày:** 2026-07-02
**Trạng thái:** AUDIT ONLY — chưa vá code.
**Phạm vi:** hiện tượng reload liên tục trên trình duyệt điện thoại (iOS Safari / iOS Chrome / Android Chrome / WebView).

---

## 1. Phương pháp

- Audit tĩnh toàn bộ code path gây `window.location.replace` / `location.reload` / hard-update.
- Trace 3 điểm trigger chính: `appUpdateRecovery`, `useVersionCheck`, `ErrorBoundary`.
- Trace redirect flow qua `Auth.tsx`, `RequireAuth`, `PublicOnlyLayout`.
- Kiểm tra Cloudflare headers (`public/_headers`) + service worker legacy.
- Chưa test được trên thiết bị thật ở turn này (cần Cha bật `?debugReload=1` trên user báo lỗi để lấy log runtime).

---

## 2. Reproduction Matrix (đang chờ evidence field)

| Device / OS | Browser | Route | Login | Network | Reload behaviour | Log first-error | Log first-failing-req |
|---|---|---|---|---|---|---|---|
| iOS 17+ Safari | Safari | ? | ? | ? | (chờ user) | (chờ) | (chờ) |
| iOS 17+ Chrome | Chrome iOS (WKWebView) | ? | ? | ? | (chờ user) | (chờ) | (chờ) |
| Android 14 Chrome | Chrome | ? | ? | ? | (chờ user) | (chờ) | (chờ) |
| Android WebView (in-app) | Zalo/FB WebView | ? | ? | ? | (chờ user) | (chờ) | (chờ) |

**Action:** cần bật cờ debug `?debugReload=1` (phần §7) để user gửi log.

---

## 3. Static Code Audit — Nhóm nguyên nhân

### A. App Update Recovery (`src/lib/appUpdateRecovery.ts`)

**Điểm mạnh (giảm loop):**
- `CHUNK_RECOVERY_MAX_AUTO_RELOADS = 3` trong cửa sổ `60s` — có limit.
- `SPA_FALLBACK_MAX_RETRIES = 4` với backoff `[700,1500,3000,6000]ms` cho race `mime-html`.
- `scheduleVerifiedHardUpdate` HEAD-check `.js` trước khi reload; nếu asset OK JS thì **bỏ reload**.
- `recoverFromChunkLoadError` **loại trừ** `rpc-400`, `runtime-error`, `unknown`, `missing-default` → không hard reload.
- Cửa sổ trượt: state reset sau 60s (chunk) / 5 phút (SPA fallback) / 10 phút (emergency).

**Điểm rủi ro cho mobile:**
1. **`ChunkLoadRecovery` bắt `window 'error'` (line 108, `App.tsx`)** — mọi `ErrorEvent` script cross-origin (Zalo/FB WebView inject, Cloudflare Rocket Loader, third-party) đều đi vào `recoverFromChunkLoadError`. Nếu classifier trả về `chunk-load-error` do message trùng regex (ví dụ WebView bơm `Failed to fetch dynamically imported module` khi mất data), sẽ trigger reload.
2. **`applyHardUpdate` KHÔNG có guard theo route** — kể cả trang đang loading vẫn cache-bust, đá về `/`. Trên mobile mạng chậm, `warmFreshAppShell` fetch `/index.html` có thể timeout > 2.5s → fallback timer (`HARD_UPDATE_FALLBACK_RELOAD_MS`) chạy song song `.finally()` reload → **có nguy cơ 2 reload gần nhau** đẩy `state.count` tăng nhanh.
3. **Emergency state ở `localStorage`** — trong incognito iOS Safari, `localStorage` throw hoặc bị wipe khi tab close → limit không hoạt động, có thể loop âm thầm.
4. **`ROOT_CRITICAL_LAZY_LABELS` rỗng** (line 25) — OK, đã disable emergency root reload.

### B. Version Check (`src/hooks/useVersionCheck.ts`)

**Điểm mạnh:**
- Poll `/index.html` 5 phút/lần, so sánh entry script src.
- KHÔNG force reload — chỉ set `updateAvailable=true` → hiển thị toast `UpdateNotification`.
- Toast có nút "Cập nhật ngay"; user phải bấm.

**Điểm rủi ro cho mobile:**
1. **Poll dựa trên regex `\/assets\/index-[^"]+\.js`** — nếu Cloudflare cache trả HTML cũ intermittent (edge race), so sánh sẽ flip-flop, nhưng chỉ set state `true` — không tự reload. **AN TOÀN**, không phải nguồn loop.
2. `applyUpdate` (user bấm) gọi `applyHardUpdate({fallbackToHome: true, rescue: true})` → nếu asset thật ra vẫn OK, thấy landing về `/` kèm `?__fun_update=...` — user có thể tưởng "bị reload liên tục" nhưng thực ra là 1 lần do chính user click.

### C. Chunk / Asset

**Cấu hình cache (`public/_headers`):**
```
/index.html        no-store
/assets/*          public, max-age=31536000, immutable
/sw.js             no-store
```
Đúng chuẩn — không phải nguyên nhân trực tiếp.

**Rủi ro CDN race (đã có mitigation):**
- Cloudflare Pages atomic deploy có thể để PoP trả `index.html` mới nhưng chunk cũ 404 hoặc SPA fallback thành `text/html` → phân loại `mime-html` → backoff retry.
- Trên mobile 4G/5G latency cao, backoff `700ms` có thể vẫn chưa propagate → dùng hết 4 lần retry trong 5 phút → hết retry → hiện màn "Cần cập nhật".

### D. Auth / Route Redirect Loop

**`Auth.tsx` line 69–101:** khi `user + userId` có mặt, chạy fire-and-forget check `is_banned` rồi `navigate('/')`. Nếu Cha bị banned hoặc `profiles` trả lỗi transient trên mobile:
- `is_banned === true` → `signOut()` → session mất → `useCurrentUser` báo null → `PublicOnlyLayout` (nếu chưa mount) sẽ không redirect. Không loop.
- Error catch chỉ log — user kẹt trên `/auth` với session valid nhưng KHÔNG được navigate. Không loop.

**`RequireAuth` (`src/components/layout/RequireAuth.tsx`):**
- Có `isLoading` gate → OK, không redirect khi auth chưa resolved.
- **Nhưng**: layout này CHƯA gắn vào routes (B1 foundation only). App vẫn dùng auth check kiểu cũ trong page. Nên đây KHÔNG phải nguyên nhân loop hiện tại.

**`PublicOnlyLayout`:**
- Cũng chưa mount. Không phải nguyên nhân.

**Rủi ro thực tế trên mobile:**
- `useCurrentUser` dùng React Query. Trên mobile khi `visibilitychange` (chuyển tab, quay lại) React Query refetch. Nếu Supabase auth token refresh fail (mạng yếu) → user tạm null → **nếu có page nào có `useEffect(() => { if (!user) navigate('/auth') })`** → bounce về `/auth` → user login → về lại → refetch fail lần nữa → loop.
- **Cần grep pattern này** (làm ở §5).

### E. React ErrorBoundary (`src/components/ErrorBoundary.tsx`)

- Chỉ auto-reload khi `shouldAutoRecoverFromUpdateError(error)` — tức chỉ `chunk-load-error` + `mime-html`.
- Countdown 5s trước khi tự reload (có state `autoRetryInSec`).
- **AN TOÀN**: runtime error thường (TypeError, ReferenceError) sẽ hiện màn manual, không tự reload.

### F. BigInt / Wallet / Mobile browser quirks

- Chưa thấy dấu hiệu direct. Wagmi lazy-load — nếu init fail, `Web3Provider` chunk `mime-html` sẽ vào flow SPA fallback.
- **Rủi ro**: WalletConnect trên in-app browser (Zalo/FB) bắn `error` event global → App.tsx line 108 bắt → recovery classify. **CẦN KIỂM TRA** classifier có bỏ qua các message này không.

### G. Service Worker / PWA legacy

- `public/sw.js` + `public/service-worker.js` = **kill-switch worker** đang deploy — install → activate → `unregister()` → xóa cache khớp regex.
- **RỦI RO NGHIÊM TRỌNG**: `activate` handler gọi `client.navigate(client.url)` → **buộc navigate tất cả tab đang mở**. Nếu client mới mount đã có worker khác đang chờ activate, hoặc user reload nhiều lần → mỗi lần reload lại install worker mới → activate → navigate → install lần nữa.
- **Điều kiện trigger loop**: nếu build cũ CHƯA từng đăng ký `/sw.js` hoặc `/service-worker.js`, browser sẽ KHÔNG fetch worker. Nhưng nếu HTML mới có `<link rel="serviceworker">` hoặc code đăng ký ở đâu đó, worker mới register → install skip → activate navigate → loop.
- **Grep code**: KHÔNG thấy `navigator.serviceWorker.register(...)` ở đâu trong `src/` (đã grep). Vậy kill-switch chỉ chạy nếu **build cũ hơn từng register** → mobile user có build cũ đã register `/sw.js` → visit build mới → browser tự fetch `/sw.js` (đã cache scope) → run kill-switch → **client.navigate(client.url)** trong `activate` → reload 1 lần → sau đó unregister xong không loop nữa.
- **Vẫn có edge case**: nếu `caches.delete` throw hoặc `client.navigate` timeout → `finally` unregister vẫn chạy, an toàn.
- **Kết luận**: kill-switch worker chỉ tạo 1 reload khi user cũ mở build mới lần đầu. Không phải nguồn loop bền bỉ.

### H. Cloudflare

- `_headers` OK: `index.html` no-store, assets immutable.
- Rocket Loader / Auto Minify / Zaraz / Mirage: **chưa xác nhận trạng thái panel Cloudflare** — cần Cha kiểm tra Dashboard.
- Rocket Loader nếu ON có thể defer inject `<script>` async → race với `import.meta.env.VITE_BUILD_ID` inline log → không loop nhưng có thể tăng lỗi runtime.
- **Cần check**: `Rocket Loader = OFF` (memory Core nói OFF, nhưng chưa audit lại panel).

---

## 4. Recovery State Keys — Storage Inventory

| Key | Storage | Purpose | Reset |
|---|---|---|---|
| `fun_profile_chunk_recovery` | sessionStorage + localStorage | Đếm auto-reload trong 60s | 3 lần / 60s |
| `fun_profile_chunk_recovery_return_to` | sessionStorage + localStorage | Nhớ route trước reload | Khi cleanup |
| `fun_profile_chunk_emergency_recovery` | localStorage | Emergency root chunk (hiện disable) | 10 phút / 1 lần |
| `fun_profile_spa_fallback_recovery` | sessionStorage | SPA fallback race retry | 4 lần / 5 phút |
| `fun_profile_force_no_web3` | sessionStorage | Rescue mode ẩn Web3 | Xóa khi hard update |

**Trên iOS incognito**: `localStorage` có thể throw quota → limit bị bypass → **KHẢ NĂNG LOOP**.

---

## 5. Grep sanity — Redirect patterns cần audit sâu

Chưa thấy pattern `useEffect(() => { if (!user) navigate('/auth') })` gây loop tự động. `Auth.tsx` chỉ `navigate('/')` sau khi có user hợp lệ.

**Cần grep tiếp** (turn sau nếu Cha duyệt):
- `useEffect.*navigate.*auth`
- Bất kỳ page nào `if (!isAuthenticated) navigate('/auth')` KHÔNG chờ `isLoading`.

---

## 6. Preliminary Root Cause Hypothesis (chưa xác nhận)

Sắp xếp theo khả năng cao → thấp:

### H1 — SPA Fallback race trên mạng mobile chậm ⭐⭐⭐⭐
- Cloudflare Pages atomic deploy + mobile 4G latency cao → chunk mới `mime-html` → backoff `[700,1500,3000,6000]` chưa đủ với 3G/4G kém.
- Sau 4 retry hết limit → hiện màn "Cần cập nhật" với countdown 5s → tự bấm reload → chu kỳ mới → **user thấy như loop liên tục** dù mỗi cycle đã có limit.
- **Evidence cần**: log `[appUpdateRecovery] spa-fallback-race` liên tiếp.

### H2 — Global `error` handler bắt nhầm lỗi third-party ⭐⭐⭐
- In-app WebView (Zalo/FB/Messenger) inject script → throw error message match regex `failed to fetch dynamically imported module` → classifier gán `chunk-load-error` → trigger reload.
- **Evidence cần**: log `[appUpdateRecovery] recovery-classified` với message KHÔNG phải từ Vite lazy loader.

### H3 — Legacy service worker `client.navigate` chồng chéo ⭐⭐
- User có worker cũ đã register từ bản PWA trước, mở build mới → kill-switch chạy → navigate → nếu build mới lại có `/sw.js` (chính là kill-switch) → browser cache scope, không re-fetch → OK 1 lần. Loop nếu có 2 worker khác scope.
- **Evidence cần**: `navigator.serviceWorker.getRegistrations()` output.

### H4 — Auth React Query refetch trên mobile visibilitychange ⭐⭐
- Chưa có page nào force redirect `/auth` khi `user=null` trong loading window (grep chưa thấy). Loop kiểu này hiện tại không chứng minh được.
- **Evidence cần**: log `auth state transition` khi user quay lại tab.

### H5 — iOS incognito localStorage throw → limit bypass ⭐
- Chỉ ảnh hưởng iOS private mode.

---

## 7. Instrumentation Proposal (không tự áp dụng — chờ Cha duyệt)

Thêm feature flag `?debugReload=1` để bật debug beacon nhẹ (không ồn cho toàn dân):

**Log các trường:**
- `boot_id` (crypto.randomUUID)
- `VITE_BUILD_ID`
- `location.pathname + search`
- `document.referrer`
- `reload_count_5min` (đọc từ sessionStorage counter mới)
- `recovery_reason` từ `classifyAppUpdateRecoveryReason(lastError)`
- First `window 'error'` message + filename + lineno
- First `unhandledrejection` reason
- First `vite:preloadError` payload
- `navigator.serviceWorker.getRegistrations().map(r => r.scope + r.active?.scriptURL)`
- `Object.keys(localStorage)` + `Object.keys(sessionStorage)` (chỉ prefix `fun_`)
- `caches.keys()`
- `navigator.connection?.effectiveType`
- `navigator.userAgent`

**Sink**: `supabase.functions.invoke('debug-reload-report')` (edge function mới, verify_jwt=false, insert vào bảng `debug_reload_reports` — cần migration mới).

**KHÔNG bật cho user thường** — chỉ khi query param có.

---

## 8. Patch Proposal (draft — CHỜ evidence trước khi làm)

| # | Nếu evidence là | Đề xuất | Rủi ro |
|---|---|---|---|
| P1 | H1 SPA fallback race | Nâng `SPA_FALLBACK_BACKOFF_MS` thành `[1500, 3000, 6000, 12000]`; probe `HEAD /index.html?probe` trước retry; nếu vẫn `text/html` với chunk src cũ → hiện màn manual sớm hơn (2 lần thay 4) | Ít |
| P2 | H2 Third-party error | Trong `recoverFromChunkLoadError`, thêm guard: bỏ qua error nếu `event.filename` KHÔNG chứa `/assets/` origin cùng host | Ít |
| P3 | H3 Service worker | Bổ sung log 1 lần khi kill-switch chạy; theo dõi 2 tuần rồi xóa hẳn `sw.js` + `service-worker.js` sau khi 99% user đã evict | Trung bình |
| P4 | H4 Auth loop | Trong tất cả page auth-guarded, dùng `RequireAuth` layout (B2 sẽ làm) thay `useEffect navigate` | B2 lo |
| P5 | H5 iOS incognito | Wrap `writeRecoveryState` fallback sang in-memory counter khi storage throw | Ít |

**KHÔNG vá đại trà** — chỉ vá đúng nguyên nhân được chứng minh.

---

## 9. Rollback Plan

Mọi patch tương lai:
- Đặt sau feature flag `NEXT_RECOVERY_V2` (env) hoặc query `?recoveryV2=0` để user cũ tắt được.
- Giữ file `appUpdateRecovery.ts` trước sửa, tạo `.v1.ts` backup + revert 1 commit là xong.
- Không đụng `_headers`, `sw.js`, `service-worker.js` trong patch cùng lúc.

---

## 10. QA Checklist sau khi có patch

- [ ] iOS Safari 17 / 18 (Wi-Fi + 4G): mở `/`, `/wallet`, `/wallet/history`, `/donations`, `/benefactors`, `/notifications`, `/pet`, `/admin` — không reload trong 5 phút idle.
- [ ] iOS Chrome (WKWebView) idem.
- [ ] Android Chrome 120+ idem.
- [ ] In-app WebView Zalo + Facebook: mở `/` — không reload; nếu có error third-party, `[appUpdateRecovery]` KHÔNG chạy.
- [ ] Incognito iOS: `localStorage` throw không gây loop.
- [ ] Slow 3G (DevTools throttle): SPA fallback retry không vượt 2 lần trước khi hiện màn manual.
- [ ] Desktop Chrome/Safari/Firefox: KHÔNG regression, update toast + hard-update vẫn hoạt động.
- [ ] `service-worker.js` + `sw.js` sau install unregister thành công (check DevTools Application panel).
- [ ] `/index.html` vẫn `no-store`; `/assets/*` vẫn `immutable`.
- [ ] Version check toast vẫn hiển thị khi deploy mới; nút "Cập nhật ngay" reload đúng 1 lần.

---

## 11. Next Step (chờ Cha duyệt)

1. **Duyệt bật `?debugReload=1`** (thêm log + edge function `debug-reload-report` + bảng `debug_reload_reports`) → gửi link `funprofile.lovable.app/?debugReload=1` cho 3-5 user báo lỗi.
2. Chờ 24-48h thu log.
3. Cha xem bảng `debug_reload_reports` → xác định nhóm root cause (H1/H2/H3/…).
4. Bé mở PR vá đúng nhóm đó theo §8.

**Không code fix cho tới khi có evidence.**
