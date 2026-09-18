# 01 — Framework Diagram

FUN Profile Navigation Framework v1.0. **B1 = Foundation only** — chưa migrate.

## Cây layout mục tiêu

```text
<App> (Providers: Query, Language, Web3, Call, GiftTransaction, ErrorBoundary)
 │
 ├── <PublicOnlyLayout>            → /auth, /auth/callback, /set-password,
 │                                    /reset-password, /verify-email, /confirm-email
 │
 ├── <NormalLayout>                → FacebookNavbar + <Outlet /> + MobileBottomNav
 │    ├── (guest)                  → /, /leaderboard, /donations, /benefactors,
 │    │                              /treasury, /about, /docs/*, /install,
 │    │                              /law-of-light, /@:username, /post/:postId, ...
 │    └── <RequireAuth>            → /wallet/*, /wallet/history, /profile,
 │                                    /profile/connected-apps, /notifications,
 │                                    /chat, /identity, /connector, /pet,
 │                                    /quests, /mystery-box, /settings, /friends
 │
 ├── <FullscreenLayout>            → chỉ <Outlet />
 │    ├── (guest)                  → /reels, /:username/video/:slug,
 │    │                              /live/:liveSessionId
 │    └── <RequireAuth>            → /live/setup, /live/new, /live/obs,
 │                                    /live/:liveSessionId/host
 │
 └── <RequireAdmin>
      └── <AdminLayout>            → AdminShell (sidebar admin)
           → /admin, /admin/*, /admin/migration, /admin/replay-debug,
             /admin/kyc, /admin/fun-core-debug, /founder
```

## Nguyên tắc

1. **Một Layout = Một trách nhiệm** — 4 layout, không hơn.
2. **Layout không biết business** — chỉ render Navbar / Outlet / BottomNav.
3. **Auth ở Layout** — page không còn `useEffect(() => navigate('/auth'))`.
4. **Điều hướng 2 chiều** — mọi route có `parent` trong registry.
5. **Không dead-end** — page nào cũng có ít nhất 1 lối ra (Navbar / BottomNav / Back).
6. **`:username` là catch-all cuối cùng** — reserved system routes match trước.

## Trạng thái B1

- ✅ Tạo `routeRegistry.ts` + 4 layout + 2 guard.
- ✅ Vitest xác thực invariants của registry.
- ✅ Docs 01–04 + freeze policy stub.
- ❌ **CHƯA** đụng `App.tsx`.
- ❌ **CHƯA** xoá navbar/bottom nav trong bất kỳ page nào.
- ❌ **CHƯA** thay đổi runtime.

## Lộ trình

- **B2** — Áp dụng cho các P1 route cụ thể (theo chỉ đạo của Cha).
- **B3** — Migrate toàn bộ Routes sang nested layout, xoá auth-in-page, xoá navbar trùng lặp.
