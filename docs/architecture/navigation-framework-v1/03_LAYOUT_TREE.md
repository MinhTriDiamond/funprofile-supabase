# 03 — Layout Tree

## 4 layouts (tối đa, không được thêm ngoài duyệt)

| Layout | File | Trách nhiệm |
|---|---|---|
| `NormalLayout` | `src/components/layout/NormalLayout.tsx` | FacebookNavbar + Outlet + MobileBottomNav |
| `FullscreenLayout` | `src/components/layout/FullscreenLayout.tsx` | Chỉ Outlet (Reels, Live host) |
| `AdminLayout` | `src/components/layout/AdminLayout.tsx` | Bọc `AdminShell` (sidebar admin) |
| `PublicOnlyLayout` | `src/components/layout/PublicOnlyLayout.tsx` | Auth flow — redirect nếu đã login |

## 2 guards (layout wrapper)

| Guard | File | Hành vi |
|---|---|---|
| `RequireAuth` | `src/components/layout/RequireAuth.tsx` | Chưa auth → `/auth` (state.from để post-login quay lại) |
| `RequireAdmin` | `src/components/layout/RequireAdmin.tsx` | Chưa admin → `/` |

Cả hai dùng API sẵn có (`useCurrentUser`, `useAdminRole`), không tạo logic auth mới.

## Nguyên tắc "1 Layout = 1 trách nhiệm"

- ❌ KHÔNG tạo `WalletLayout`, `ProfileLayout`, `PetLayout`...
- Nếu một module cần hình thái riêng (sub-tabs, back button, sticky bar), xử lý
  ở component nội bộ module — không sinh layout mới.

## Trạng thái B1

- Foundation ready.
- `App.tsx` vẫn giữ nguyên flat routes.
- Không import các layout mới ở đâu → **không có side effect runtime**.
- B2 sẽ apply layout cho các P1 routes.
- B3 migrate toàn bộ Routes sang nested layout.
