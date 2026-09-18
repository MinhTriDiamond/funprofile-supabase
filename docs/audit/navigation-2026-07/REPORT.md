# Navigation Audit Report — FUN Profile

**Ngày**: 2026-07  
**Scope**: Toàn bộ routes, navbar coverage, nested layout, permissions, mobile nav.  
**Trạng thái**: Chỉ audit — chưa sửa code.

---

## 1. Route Inventory

Nguồn: `src/App.tsx` (khai báo phẳng, ~70 route). Đối chiếu `src/pages/`.

### 1.1 Public / Auth routes

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/auth` | `Auth` | — | — | — | public | Auth shell riêng |
| `/auth/callback` | `AuthCallback` | — | — | — | public | Redirect only |
| `/set-password` | `SetPassword` | — | — | — | public | |
| `/reset-password` | `ResetPassword` | — | — | — | public | |
| `/verify-email` | `VerifyEmail` | — | — | — | public | |
| `/confirm-email` | `ConfirmEmail` | — | — | — | public | |
| `/law-of-light` | `LawOfLight` | — | — | — | public | Onboarding |
| `/begin` | Redirect → `/law-of-light` | — | — | — | public | |

### 1.2 Root & Feed

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/` | `Feed` | ✅ | ✅ | — | public | Home |
| `/friends` | `Friends` | ✅ | ✅ | — | auth | |
| `/notifications` | `Notifications` | ❌ | ✅ | ✅ (custom header) | auth | **P1** — thiếu FacebookNavbar |
| `/chat` | `Chat` | ✅ (list) / ❌ (thread) | ✅ (list) / ❌ (thread) | ✅ | auth | Thread ẩn nav để full-screen — OK |
| `/chat/:conversationId` | `Chat` | ❌ | ❌ | ✅ | auth | full-screen thread |
| `/leaderboard` (+`/:tab`) | `Leaderboard` | ✅ | ✅ | — | public | |
| `/users` | `Users` | ✅ | ✅ | — | public | |
| `/about` | `About` | ✅ | ✅ | — | public | |
| `/install` | `Install` | ❌ | ❌ | ✅ (nút) | public | Standalone landing — OK có custom nav |
| `/reels`, `/reels/:reelId` | `Reels` | ✅ (desktop) | ✅ | — | public | Fullscreen mobile — OK |
| `/:username/video/:slug` | `Reels` | ✅ / ✅ | ✅ | — | public | |

### 1.3 Profile

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/profile` | `Profile` (self) | ✅ | ✅ | — | auth | |
| `/profile/:userId` | `Profile` | ✅ | ✅ | — | public | UUID direct |
| `/profile/:username/history` | `ProfileHistoryPage` | ✅ | ✅ | ✅ | public | |
| `/profile/connected-apps` | `ConnectedApps` | ✅ | ✅ | ✅ | auth | Nested profile |
| `/@:username` | `Profile` | ✅ | ✅ | — | public | Canonical |
| `/:username` | `Profile` | ✅ | ✅ | — | public | **⚠ Duplicate/nguy hiểm** — catch-all cuối cùng, xem §6 |

### 1.4 Wallet

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/wallet` | `Wallet` (via `/wallet/*`) | ✅ | ✅ | — | auth | |
| `/wallet/*` | `Wallet` | ✅ | ✅ | — | auth | Subroutes nội bộ (fun_money, ...) |
| `/wallet/history` | `WalletHistoryPage` | ✅ | ✅ | (❌ BackToHome) | auth | **P2** — nên có Back về `/wallet` |
| `/wallet/fun_money` | `Wallet` (nội bộ) | ✅ | ✅ | — | auth | Redirect từ `/mint` |
| `/mint` | Redirect → `/wallet/fun_money` | — | — | — | — | Alias |

### 1.5 Donation / Benefactors / History

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/donations` | `Donations` | ✅ | ✅ | — | public | Global gift feed |
| `/benefactors` | `Benefactors` | ✅ | ✅ | — | public | |
| `/treasury` | `TreasuryPublicPage` | ✅ | ✅ | — | public | |

### 1.6 Content

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/post/:postId` | `Post` | ✅ | ✅ | ✅ | public | |
| `/:username/posts/:publicId` | `Post` | ✅ | ✅ | ✅ | public | Canonical |
| `/:username/post/:slug` | `Post` | ✅ | ✅ | ✅ | public | Legacy slug |
| `/p/:shareCode` | `ShareRedirect` | ✅ | ✅ | — | public | Redirect |

### 1.7 Live

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/live` | `LiveDiscoveryPage` | ✅ | ✅ | — | public | |
| `/live/setup` | `PreLivePage` | ? | ? | ✅ | auth | Fullscreen host prep |
| `/live/new` | `LiveHostPage` | — | — | ✅ | auth | Fullscreen |
| `/live/obs`, `/live/obs/:sessionId` | `RtmpLivePage` | ? | ? | ✅ | auth | |
| `/live/:sessionId` | `LiveAudiencePage` | — | — | ✅ | public | Fullscreen |
| `/live/:sessionId/host` | `LiveHostPage` | — | — | ✅ | auth | Fullscreen |
| `/:username/live/:slug` | `LiveAudiencePage` | — | — | ✅ | public | |
| `/live/stream` | Redirect → `/live/new` | — | — | — | — | Alias |

### 1.8 Pet / Mini Game

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/pet` | `PetPage` | ✅ | ❌ | ✅ (BackToHome) | auth | **P1** — thiếu MobileBottomNav |
| `/pet/shop` | `PetShopPage` | ❌ | ❌ | ✅ (BackToHome + MiniGameAppBar) | auth | Có nav riêng cụm Pet — OK nhưng lệch chuẩn |
| `/pet/arena` | `PetArenaPage` | ✅ | ❌ | ✅ | auth | **P1** — thiếu MobileBottomNav |
| `/pet/appeal` | `PetAppealPage` | ✅ | ❌ | ✅ | auth | **P1** — thiếu MobileBottomNav |
| `/quests` | `QuestsPage` | ✅ | ✅ | ✅ | auth | |
| `/mystery-box` | `MysteryBoxPage` | ✅ | ✅ | ✅ | auth | |

### 1.9 Identity / Connector

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/identity` | `IdentityDashboard` | ✅ | ✅ | — | auth | |
| `/identity/:tab` | `IdentityDashboard` | ✅ | ✅ | ✅ | auth | Tab: onboarding, entities, ... |
| `/identity/onboarding` | `IdentityOnboarding` | ✅ | ✅ | ✅ | auth | **⚠** Trùng nghĩa với `/identity/onboarding` từ `:tab` (xem §6) |
| `/connector` | `ConnectorPage` | ✅ | ✅ | — | auth | |
| `/connector/given` | `ConnectorGivenPage` | ✅ | ✅ | ✅ | auth | |

### 1.10 Settings

| Path | Component | Navbar | BottomNav | Back | Auth | Ghi chú |
|---|---|---|---|---|---|---|
| `/settings` (+`/:tab`) | `Settings` | ✅ | ✅ | — | auth | 1 page, tab qua URL |
| `SecuritySettings` | Redirect → `/settings/security` | — | — | — | — | Orphan file, xem §5 |

### 1.11 Admin

| Path | Component | Layout | Auth | Ghi chú |
|---|---|---|---|---|
| `/admin` | `AdminShell` + `AdminSection` (index) | AdminShell (sidebar) | admin | ✅ nested route đúng chuẩn |
| `/admin/*` | `AdminShell` + `AdminSection` | AdminShell | admin | Slug parse từ URL |
| `/admin/migration` | `AdminMigration` | Custom (FacebookNavbar) | admin | **P1** — nằm ngoài AdminShell |
| `/admin/replay-debug` | `AdminReplayDebug` | Custom | admin | **P1** — nằm ngoài AdminShell |
| `/admin/kyc` | `AdminKycPage` | Custom | admin | **P1** — nằm ngoài AdminShell (đã có slug `identity-kyc` planned) |
| `/admin/fun-core-debug` | `FunCoreDebugPage` | Custom | admin | **P1** — nằm ngoài AdminShell |
| `/founder` | `FounderDashboard` | FacebookNavbar | admin | Không phải `/admin/founder` |

### 1.12 Docs

| Path | Component | Navbar | Ghi chú |
|---|---|---|---|
| `/docs/*` | `DocsRouter` | ✅ (bên trong) | Nested routing riêng |

### 1.13 Catch-all

| Path | Component |
|---|---|
| `*` | `NotFound` — ❌ không có navbar, chỉ có nút "Về trang chủ" |

---

## 2. Navbar Coverage

| Root page | FacebookNavbar | MobileBottomNav | Ghi chú |
|---|---|---|---|
| `/` | ✅ | ✅ | OK |
| `/wallet` | ✅ | ✅ | OK |
| `/wallet/history` | ✅ | ✅ | OK — nhưng thiếu Back |
| `/profile/:username` | ✅ | ✅ | OK |
| `/profile/:username/history` | ✅ | ✅ | OK |
| `/donations` | ✅ | ✅ | OK |
| `/benefactors` | ✅ | ✅ | OK |
| `/leaderboard` | ✅ | ✅ | OK |
| `/settings` | ✅ | ✅ | OK |
| `/notifications` | ❌ | ✅ | **P1 — thiếu FacebookNavbar** |
| `/admin` (shell) | ❌ (AdminShell sidebar riêng) | ✅ trong AdminShell | OK |
| `/admin/migration|replay-debug|kyc|fun-core-debug` | ✅ FacebookNavbar | ✅ | **P1** — không dùng AdminShell |
| `/pet`, `/pet/arena`, `/pet/appeal` | ✅ | ❌ | **P1** — mobile mất điều hướng |
| `/pet/shop` | ❌ FacebookNavbar (dùng MiniGameAppBar) | ❌ | Lệch chuẩn cụm |

---

## 3. Mobile Navigation

| Vấn đề | Route bị ảnh hưởng | Mức |
|---|---|---|
| Không có `MobileBottomNav` | `/pet`, `/pet/arena`, `/pet/appeal` | P1 |
| Không có `FacebookNavbar` | `/notifications` (mobile OK vì có header riêng, desktop mất nav) | P1 |
| Thiếu nút Back về scope cha | `/wallet/history` → `/wallet` | P2 |
| AdminShell subpages | có `SidebarTrigger` mobile — OK | — |
| Fullscreen live/reels | cố ý ẩn — OK | — |

Chuẩn có sẵn: `NavigationHistoryTracker` + `getParentRoute` (từ `src/config/parentRoutes.ts`) — bảng cha đã khai `/wallet/*` → `/wallet`. Chỉ cần render nút Back thống nhất.

---

## 4. Permission Navigation

| Vai trò | Nhìn thấy đúng? | Ghi chú |
|---|---|---|
| Guest | Public routes (Feed, Profile, Donations, Benefactors, Leaderboard, Post, Reels, Live audience) | Nav mục Wallet/Notifications ẩn qua `useCapabilities` |
| User (auth) | Thêm Wallet/Chat/Notifications/Settings/Identity/Pet | OK |
| Admin | Thêm crown → `/admin` (AdminShell) và `/founder` | OK |
| Non-admin vào `/admin` | Redirect (AdminShell tự check) | ✅ đã có |
| Guest vào `/wallet*` | Redirect `/auth` bên trong `Wallet`/`WalletHistoryPage` | ✅ |
| Guest vào `/settings`, `/notifications`, `/chat`, `/identity`, `/pet*`, `/connector*`, `/quests`, `/mystery-box` | Cần check lại từng page — hiện làm ad-hoc, KHÔNG có ProtectedRoute wrapper | **P2 — tiêu chuẩn hoá bằng `<RequireAuth>` layout** |

---

## 5. Dead Routes / Orphan Pages

| File | Vấn đề |
|---|---|
| `src/pages/SecuritySettings.tsx` | Chỉ redirect `/settings/security`, không được khai trong `App.tsx`. Có thể xoá. |
| `src/pages/Admin.tsx` | Còn tồn tại nhưng route `/admin` giờ dùng `AdminShell`. Xem có còn được import không → **cần grep**, nếu không thì xoá. |
| `docs`-related pages riêng lẻ (`ArchitectureDocs`, `EcosystemDocs`, `IntegrationDocs`, `MasterCharterDocs`, `PlatformDocs`, `PplpDocs`, `SdkRepositoryDocs`, `DocsChangelog`) | Chỉ mount qua `DocsRouter`. OK, không orphan. |
| `/admin/replay-debug`, `/admin/fun-core-debug` | Không có link CTA nào trong UI — dev tools, cần được nhóm dưới `AdminShell` để không "mồ côi". |

---

## 6. Duplicate / Confusing Routes

1. **`/:username` catch-all cuối cùng vs `/@:username`, `/profile/:userId`**  
   3 cách để mở profile. `/:username` bắt mọi slug 1-đoạn không match route khác — rủi ro va chạm với route mới thêm (ví dụ ai thêm `/marketplace` sẽ bị hiểu là username). **P1** — nên yêu cầu prefix (`/@`) hoặc chuyển catch-all thành `/u/:username`.

2. **`/identity/onboarding` vs `/identity/:tab`**  
   Tuyến `/identity/onboarding` bị route trước `:tab` bắt → đang render `IdentityOnboarding` do route order. Nhưng nếu ai gõ `/identity/onboarding` từ tab handler khác, dễ nhầm. Chuẩn hoá: `IdentityDashboard` xử lý tab `onboarding` HOẶC bỏ `/identity/:tab` khi tab là `onboarding`.

3. **`/admin/*` split**  
   `/admin/migration`, `/admin/replay-debug`, `/admin/kyc`, `/admin/fun-core-debug` khai ngoài `AdminShell` → không có sidebar, không có breadcrumb, layout khác — người dùng admin sẽ thấy "mồ côi". **P1**.

4. **`/founder` vs `/admin`**  
   Founder Dashboard nằm ngoài AdminShell. Về ngữ nghĩa nên là `/admin/founder` hoặc riêng `/founder` nhưng dùng chung layout.

5. **`/mint`, `/live/stream`, `/begin`** — alias redirect, OK.

6. **`/wallet/history` vs `/profile/:username/history`** — cùng nội dung nhưng scope khác. Đã đúng theo Phase 8 SSOT. Không phải duplicate.

---

## 7. Proposed Nested Route Architecture

```text
<Root>
├── <PublicLayout>            # FacebookNavbar + MobileBottomNav mặc định
│   ├── /                     Feed
│   ├── /leaderboard          Leaderboard (+ /:tab)
│   ├── /users                Users
│   ├── /about                About
│   ├── /donations            Donations
│   ├── /benefactors          Benefactors
│   ├── /treasury             Treasury
│   ├── /post/:postId         Post
│   ├── /p/:shareCode         ShareRedirect
│   ├── /reels[+/:id]         Reels
│   ├── /live                 LiveDiscovery
│   └── <ProfileLayout path="/@:username">   # profile chip + tabs
│       ├── index             Profile
│       ├── history           ProfileHistoryPage
│       ├── connected-apps    ConnectedApps (self only)
│       └── posts/:id         Post canonical
│
├── <AuthShell>               # standalone
│   ├── /auth
│   ├── /auth/callback
│   ├── /set-password, /reset-password, /verify-email, /confirm-email
│   └── /law-of-light
│
├── <AppLayout requiresAuth>  # navbar + bottom nav + guard
│   ├── /notifications
│   ├── /chat[+/:id]          (thread tự ẩn nav)
│   ├── /friends
│   ├── /identity[+/:tab]     (dashboard w/ tabs, onboarding = tab)
│   ├── /connector[+/given]
│   ├── /quests
│   ├── /mystery-box
│   ├── <PetLayout path="/pet">
│   │   ├── index             PetPage
│   │   ├── shop              PetShopPage
│   │   ├── arena             PetArenaPage
│   │   └── appeal            PetAppealPage
│   ├── <WalletLayout path="/wallet">
│   │   ├── index             Wallet (tabs)
│   │   ├── history           WalletHistoryPage
│   │   └── fun_money         (subroute nội bộ)
│   └── <SettingsLayout path="/settings">
│       └── :tab              Settings
│
├── <AdminShell requiresAdmin> path="/admin"
│   ├── index                 Overview
│   ├── migration             AdminMigration
│   ├── replay-debug          AdminReplayDebug
│   ├── kyc                   AdminKycPage → nested vào group "identity"
│   ├── fun-core-debug        FunCoreDebugPage
│   ├── founder               FounderDashboard (dời từ /founder)
│   └── */ (slug parser)      AdminSection
│
├── <FullscreenLayout>        # không navbar
│   ├── /live/new             LiveHostPage
│   ├── /live/:id             LiveAudiencePage
│   ├── /live/:id/host        LiveHostPage
│   ├── /live/obs[+/:id]      RtmpLivePage
│   └── /:username/live/:slug LiveAudiencePage
│
├── /install                  Install (custom landing)
├── /docs/*                   DocsRouter
└── *                         NotFound (bọc PublicLayout để có navbar)
```

**Nguyên tắc**:
- Auth guard chuyển từ `useEffect` ad-hoc từng page → 1 `<RequireAuth>` layout route.
- Navbar/BottomNav render 1 lần ở layout, không lặp trong từng page.
- Nested URL = nested layout (Pet, Wallet, Profile, Admin).
- Alias redirect vẫn giữ ở top-level.

---

## 8. Priority Fix List

### P0 — Route/UX gãy (không có)
Không có route nào hiện tại inaccessible hoặc mất hoàn toàn điều hướng cho end-user chính.

### P1 — Layout sai / thiếu navbar / duplicate nguy hiểm
1. `/notifications` thiếu `FacebookNavbar` (desktop mất top nav).
2. `/pet`, `/pet/arena`, `/pet/appeal` thiếu `MobileBottomNav`.
3. `/pet/shop` không thống nhất pattern navbar với cụm Pet.
4. `/admin/migration`, `/admin/replay-debug`, `/admin/kyc`, `/admin/fun-core-debug` không nằm trong `AdminShell` → mất sidebar admin.
5. `/founder` nằm ngoài Admin cluster → nên `/admin/founder`.
6. Catch-all `/:username` va chạm namespace — chuyển sang `/@:username` bắt buộc hoặc `/u/:username`.
7. `NotFound` không có navbar → user bị "kẹt" nếu vào URL sai.

### P2 — Chuẩn hoá / cleanup
1. Introduce `<RequireAuth>` layout route thay cho từng `useEffect` redirect.
2. Introduce `<PublicLayout>` / `<AppLayout>` chứa `FacebookNavbar` + `MobileBottomNav` — mỗi page không phải import lại.
3. `WalletHistoryPage` + `ProfileHistoryPage` + `ConnectedApps` + Pet subpages: chuẩn hoá nút Back qua `getParentRoute` (đã có sẵn util).
4. Xoá `src/pages/SecuritySettings.tsx` (orphan) — thay bằng redirect ở App.tsx nếu vẫn cần.
5. Kiểm tra `src/pages/Admin.tsx` có còn import ở đâu không, xoá nếu không.
6. Gộp `/identity/onboarding` vào `/identity/:tab` handler duy nhất.

### P3 — Polish
1. Breadcrumb ở AdminShell (đã có sidebar, thêm crumb theo group/item của `adminNav.ts`).
2. Breadcrumb ở Wallet/Profile subroute (Wallet › History, @user › History).
3. Bổ sung meta title/desc theo route (SEO cho public routes).
4. Thống nhất transition/scroll-restoration khi đổi route.

---

## Phụ lục — CTA Coverage nhanh

| Đích | Có CTA từ UI? |
|---|---|
| `/wallet` | ✅ MobileBottomNav + Navbar |
| `/wallet/history` | ✅ (nút trong Wallet) |
| `/profile` (self) | ✅ Navbar avatar |
| `/profile/:u/history` | ✅ tab trong Profile |
| `/donations` | ✅ Navbar menu (kiểm tra lại link) |
| `/benefactors` | ⚠ chưa có menu chính — cần thêm |
| `/settings` | ✅ menu user |
| `/admin` | ✅ crown icon (admin) |
| `/notifications` | ✅ Navbar bell |
| `/chat` | ✅ Navbar |
| `/founder` | ⚠ chỉ admin biết URL — nên thêm vào AdminShell |
| `/treasury` | ⚠ chưa có link menu chính |
| `/identity` | ✅ menu |
| `/connector` | ⚠ chưa có link menu chính |
| `/quests`, `/mystery-box`, `/pet` | ✅ từ Pet section / Bottom nav |

---

**Kết luận**: Kiến trúc route hiện tại là flat (~70 route trong 1 file), nav coverage 90% ổn. 3 nhóm P1 (Notifications navbar, Pet mobile nav, Admin subpages ngoài shell) và namespace risk từ `/:username` catch-all là hạng mục cần xử lý trước.

---

## Addendum — Chốt định hướng từ Cha (2026-07)

Sau khi Cha review report, một số đề xuất §7 được điều chỉnh lại. **Đây là bản chốt để Phase B triển khai.**

### A. Điều chỉnh so với report gốc

1. **GIỮ `/:username` — KHÔNG chuyển sang `/@:username` / `/u/:username`.**
   URL "sạch" theo chuẩn social (facebook.com/zuck, x.com/elonmusk, github.com/torvalds) là tài sản thương hiệu. Cách xử lý va chạm namespace: **Route Priority Registry** — mọi top-level route (`/wallet`, `/settings`, `/admin`, `/live`, `/identity`, `/pet`, `/connector`, `/founder`, `/treasury`, ...) đăng ký trước; `/:username` là catch-all cuối cùng, kèm reserved-list guard trong loader.

2. **Đơn giản hoá layout tree — chỉ 4 layout, không 7.**
   ```
   AppLayout (root, providers + nav history tracker)
   ├─ NormalLayout      (FacebookNavbar + MobileBottomNav)
   ├─ FullscreenLayout  (Live host, Reels immersive, Chat thread)
   └─ AdminLayout       (AdminShell sidebar)
   ```
   Wallet / Profile / Pet / Identity **không** cần layout riêng — chỉ là nested pages dưới `NormalLayout`, back button dùng `getParentRoute` (đã có).

3. **`/founder` GIỮ NGUYÊN top-level — KHÔNG dời vào `/admin/founder`.**
   Founder là vai trò (role), không phải mục admin. Tương tự `/ceo`. Vẫn dùng `AdminLayout` shell để có sidebar/breadcrumb nhất quán, nhưng path giữ `/founder`.

### B. Roadmap 4 phase

**Phase A — Navigation Audit** ✅ (report này)

**Phase B — Navigation Refactor** (ưu tiên triển khai kế tiếp)
- [ ] Tạo `<RequireAuth>` layout route, gỡ bỏ pattern `useEffect(() => if(!user) navigate('/auth'))` rải rác.
- [ ] Đưa toàn bộ `/admin/*` + `/founder` + `/kyc` vào `AdminLayout` (AdminShell).
- [ ] Fix `/notifications` — thêm `FacebookNavbar`.
- [ ] Fix cụm Pet (`/pet`, `/pet/arena`, `/pet/appeal`, `/pet/shop`) — thêm `MobileBottomNav`, chuẩn hoá `MiniGameAppBar`.
- [ ] Back button chuẩn cho Wallet/Profile subpages qua `getParentRoute`.
- [ ] Route Priority Registry + reserved-username guard cho `/:username`.
- [ ] `NotFound` có `FacebookNavbar` (không kẹt user).

**Phase C — Navigation Graph** (audit tiếp theo, chưa code)
- Vẽ graph tất cả luồng di chuyển liên module: Wallet → History → Tx Detail → Profile → Wallet ; Donation → Profile → Benefactors → Donation ; Guest → Signup → Feed → Wallet → ...
- Xác định **dead-end pages** (page vào được nhưng không có lối ra tự nhiên).
- Xác định **back-loops** (Back button quay về sai chỗ).
- Đầu ra: `docs/audit/navigation-graph-2026-07/GRAPH.md` + Mermaid diagram.

**Phase D — Information Architecture** (chuẩn hoá module)
- Phân loại toàn bộ module FUN Profile theo domain:
  - **Social**: Feed, Profile, Friends, Chat, Notifications, Reels, Live, Leaderboard, Users, Benefactors, Donations
  - **Finance**: Wallet, History, Treasury, Swap, Disperse, Reward Claim
  - **Identity**: Identity, KYC, Trust, DID, SBT, DIB
  - **Creator**: Live host, Reels compose, Post compose, Inner Work
  - **Game**: Pet (Lumi), Mystery Box, Quests, Arena, Shop
  - **Governance**: PPLP, Mint, Epoch, Connector, Cascade
  - **Admin**: AdminShell, Founder, Migration, Debug
- Xác định module nào là **Core** vs **Satellite**, phụ thuộc lẫn nhau ra sao.
- Đầu ra: `docs/audit/information-architecture-2026-07/IA.md` — kim chỉ nam cho Marketplace, AI, Treasury, Statistics tương lai.

### C. Thứ tự thực thi được Cha chốt (v1.0)

1. Phase B (refactor navigation — tối đa 1 sprint).
2. Phase C (audit graph — không sửa code, 1-2 ngày).
3. Phase D (IA — không sửa code, 2-3 ngày).
4. Sau khi có IA rõ ràng mới mở tính năng mới (Marketplace / Statistics / AI).

---

## Addendum v1.1 — Mở rộng Roadmap (2026-07, Cha duyệt)

Report này được chốt làm **Navigation Architecture v1.0** của FUN Profile. Sau khi hoàn thành **Phase B**, team **đóng băng Navigation** (không thêm route tuỳ ý) và tiếp tục Phase C → G trước khi mở các module lớn (Marketplace / Statistics / AI).

### Roadmap đầy đủ

```
A  Navigation Audit                 ✅ (report này)
B  Navigation Refactor              → sprint kế tiếp
C  Navigation Graph                 → audit, không code
D  Information Architecture         → audit, không code
E  Feature Dependency Graph         → audit, không code
F  Design System Audit              → audit, không code
G  State Management Audit           → audit, không code
───────────────────────────────────────────────────
   Unified Statistics Engine
   Marketplace
   Angel AI
   FUN Super App
```

### Phase E — Feature Dependency Graph

Không audit route, mà audit **module nào phụ thuộc module nào**.

- Chuỗi Finance: `Wallet → History → Statistics → Benefactors → Treasury → Dashboard`.
- Chuỗi Social: `Profile → Feed → Post → Reaction → Notification`.
- Xác định **shared dependencies** (SSOT, hooks, services dùng chung) và **cross-domain coupling** (ví dụ Reward Claim phụ thuộc Wallet + PPLP + Identity).
- Đầu ra: `docs/audit/feature-dependency-2026-07/GRAPH.md` + Mermaid + bảng "khi refactor X thì phải test Y, Z".

### Phase F — Design System Audit

Kiểm kê UI primitives sau khi app đã lớn:

- Component: Button, Card, Modal, Dropdown, Table, Tabs, Badge, Avatar, Toast, Dialog, Sheet, Popover, Skeleton, EmptyState, ...
- Đếm số **variant** thực sự dùng vs. số variant khai báo.
- Phát hiện **duplicate component** (ví dụ nhiều loại `EmptyState`, `LoadingSkeleton`).
- Audit **token semantic** trong `src/index.css` + `tailwind.config.ts`: màu, spacing, radius, shadow, typography — cái nào bị hardcode (`bg-[#...]`) vi phạm design system.
- Đầu ra: `docs/audit/design-system-2026-07/REPORT.md`.

### Phase G — State Management Audit

Phân loại toàn bộ state trong app:

- **Server State** — React Query (SSOT dữ liệu backend).
- **UI State** — `useState` / `useReducer` (ephemeral).
- **Persistent State** — `localStorage` / `sessionStorage` (tab, draft, preference).
- **Cross-component State** — Context / Zustand (auth, active account, call context, ...).
- **URL State** — search params / hash (shareable).

Đầu ra: `docs/audit/state-management-2026-07/REPORT.md` + quy tắc "loại state nào dùng công cụ nào" — kim chỉ nam cho Marketplace và Angel AI.

### D. Nguyên tắc phát triển (rút ra từ 2026 Q2-Q3)

Từ nay mỗi module mới bắt buộc đi theo pipeline:

```
Audit → Principle → SSOT → Contract → Performance → UX → Architecture → Feature
```

Không còn pipeline cũ `Nghĩ ra → Code → Sửa → Vá`. Đây là điều khoản văn hoá kỹ thuật của FUN Profile, áp dụng cho mọi phase từ Marketplace trở đi.

### E. Freeze policy sau Phase B

Sau khi Phase B merge, mọi PR thêm route mới phải:

1. Đăng ký trong **Route Priority Registry**.
2. Chọn 1 trong 4 layout (`NormalLayout` / `FullscreenLayout` / `AdminLayout` / `AppLayout` root).
3. Có back path hợp lệ trong `parentRoutes.ts`.
4. Không được đứng ngoài registry — reviewer từ chối PR vi phạm.


