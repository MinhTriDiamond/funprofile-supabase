# 04 — Permission Matrix

Bậc quyền: **Guest < User < Admin < Founder**.

Bậc cao được thừa hưởng quyền của bậc thấp (Admin xem được route User; Founder xem được route Admin).

## Guest

Chỉ đọc, không cần đăng nhập.

`/`, `/law-of-light`, `/about`, `/docs/*`, `/install`, `/leaderboard[/:tab]`,
`/@:username`, `/profile/:userId`, `/post/:postId`, `/:username/posts/:publicId`,
`/:username/post/:slug`, `/p/:shareCode`, `/reels[/:reelId]`, `/:username/video/:slug`,
`/live`, `/live/:liveSessionId`, `/:username/live/:slug`, `/donations`, `/benefactors`,
`/treasury`, `:username` (catch-all).

Cùng nhóm: **auth flow** `/auth`, `/auth/callback`, `/set-password`, `/reset-password`,
`/verify-email`, `/confirm-email` — chỉ Guest được vào (đã login sẽ bị redirect).

## User (đã đăng nhập)

Tất cả route Guest + các route yêu cầu tài khoản:

`/friends`, `/users`, `/notifications`, `/chat[/:conversationId]`,
`/profile`, `/profile/connected-apps`, `/profile/:username/history`,
`/wallet/*`, `/wallet/history`, `/mint`,
`/identity`, `/identity/:tab`, `/identity/onboarding`,
`/connector`, `/connector/given`,
`/pet`, `/pet/shop`, `/pet/appeal`, `/pet/arena`, `/quests`, `/mystery-box`,
`/live/setup`, `/live/new`, `/live/obs[/:sessionId]`, `/live/stream`,
`/live/:liveSessionId/host`,
`/settings`, `/settings/:tab`.

## Admin

Tất cả route User + admin console:

`/admin`, `/admin/migration`, `/admin/replay-debug`, `/admin/kyc`,
`/admin/fun-core-debug`.

## Founder

Tất cả route Admin + Founder Dashboard:

`/founder`.

## Ghi chú

- Guard nguồn: `useCurrentUser` (auth) + `useAdminRole` (admin). Founder tier
  đang gộp chung với admin trong `has_role`; nếu B3 tách riêng, sẽ tạo
  `useFounderRole` cùng pattern.
- Permission check ở **Layout** (RequireAuth / RequireAdmin), **không** ở Page.
