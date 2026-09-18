# 02 — Route Registry

Nguồn dữ liệu: `src/config/routeRegistry.ts` (snapshot 2026-07 theo hiện trạng `src/App.tsx`).

> ⚠️ Registry phản ánh **hiện trạng thực tế**, không phản ánh kiến trúc mơ ước.
> Khi `App.tsx` thay đổi, cập nhật registry cùng commit.

## Bất biến

1. **`:username` phải là entry cuối cùng.** Reserved system routes MUST be checked
   before username fallback.
2. **Không route trùng path.**
3. **Mọi `parent` phải tồn tại trong registry.**
4. **`publicOnly` ⇒ `auth = guest`. `layout = admin` ⇒ `auth ∈ {admin, founder}`.**
5. **Route mới bắt buộc đăng ký vào registry** (kể cả khi `App.tsx` chưa migrate).

## Theo domain

### system
`/begin` → `/law-of-light` · `/auth` · `/auth/callback` · `/set-password` · `/reset-password` · `/verify-email` · `/confirm-email` · `/install` · `/about` · `/docs/*` · `/settings` · `/settings/:tab`

### social
`/` · `/friends` · `/users` · `/leaderboard[/:tab]` · `/notifications` · `/chat[/:conversationId]` · `/profile` · `/profile/:userId` · `/profile/connected-apps` · `/@:username` · `/p/:shareCode` · `/post/:postId` · `/:username/posts/:publicId` · `/:username/post/:slug` · `:username` (catch-all)

### finance
`/wallet/*` · `/wallet/history` · `/profile/:username/history` · `/donations` · `/benefactors` · `/treasury` · `/mint`

### identity
`/identity` · `/identity/:tab` · `/identity/onboarding` · `/connector` · `/connector/given`

### game
`/pet` · `/pet/shop` · `/pet/appeal` · `/pet/arena` · `/quests` · `/mystery-box`

### creator
`/reels[/:reelId]` · `/:username/video/:slug` · `/live` · `/live/setup` · `/live/new` · `/live/obs[/:sessionId]` · `/live/stream` · `/live/:liveSessionId[/host]` · `/:username/live/:slug`

### admin
`/admin` · `/admin/migration` · `/admin/replay-debug` · `/admin/kyc` · `/admin/fun-core-debug`

### governance
`/founder`

## Note cho B2

Các entry đang có `notes` là candidate P1 sẽ xử lý ở B2:
- `/notifications` — thiếu FacebookNavbar trên desktop.
- `/pet`, `/pet/appeal`, `/pet/arena` — thiếu MobileBottomNav.
- `/admin/migration`, `/admin/replay-debug`, `/admin/kyc`, `/admin/fun-core-debug` — hiện ngoài AdminShell, sẽ đưa vào.
