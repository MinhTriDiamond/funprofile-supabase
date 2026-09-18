# B1 Report — Navigation Framework Foundation

**Ngày:** 2026-07 · **Scope:** Foundation only (không đụng runtime).

## Xác nhận scope

- ✅ `src/App.tsx` **KHÔNG SỬA** một dòng nào.
- ✅ Runtime **KHÔNG THAY ĐỔI** — 4 layout + 2 guard + registry chưa được import bởi bất kỳ file production nào (ngoài file test).
- ✅ Chỉ thêm mới: registry, layout skeleton, guards, tests, docs, policy stub.
- ✅ Không xoá `FacebookNavbar` / `MobileBottomNav` khỏi bất kỳ page nào.
- ✅ Không đụng business logic / RPC / DB / design token / file cấm (AGENTS §3).

## File mới

### Foundation
- `src/config/routeRegistry.ts` — snapshot registry (~70 routes theo App.tsx hiện tại).
- `src/components/layout/NormalLayout.tsx`
- `src/components/layout/FullscreenLayout.tsx`
- `src/components/layout/AdminLayout.tsx`
- `src/components/layout/PublicOnlyLayout.tsx`
- `src/components/layout/RequireAuth.tsx`
- `src/components/layout/RequireAdmin.tsx`

### Tests
- `src/__tests__/route-registry.test.ts` — 10 invariants.

### Docs
- `docs/architecture/navigation-framework-v1/01_FRAMEWORK_DIAGRAM.md`
- `docs/architecture/navigation-framework-v1/02_ROUTE_REGISTRY.md`
- `docs/architecture/navigation-framework-v1/03_LAYOUT_TREE.md`
- `docs/architecture/navigation-framework-v1/04_PERMISSION_MATRIX.md`
- `docs/architecture/navigation-framework-v1/B1_REPORT.md` (file này)

### Policy stub
- `AGENTS.md` §14 (bổ sung ngắn ở cuối) — Freeze policy Route Registry.

## Rollback path

Toàn bộ B1 là file mới, không sửa file cũ (trừ AGENTS.md thêm 1 mục ở cuối).
Rollback nhanh:

```bash
rm -rf src/config/routeRegistry.ts \
       src/components/layout/{NormalLayout,FullscreenLayout,AdminLayout,PublicOnlyLayout,RequireAuth,RequireAdmin}.tsx \
       src/__tests__/route-registry.test.ts \
       docs/architecture/navigation-framework-v1
# và revert phần thêm ở cuối AGENTS.md
```

Không ảnh hưởng runtime, không cần rollback DB / migration.

## Validation

- `bunx tsgo` — PASS (chi tiết log ở lần chạy CI cuối).
- `bunx vitest run src/__tests__/route-registry.test.ts` — 10/10 tests PASS.
- `bun run build` — PASS.
- Smoke route check (thủ công): `/`, `/wallet`, `/wallet/history`,
  `/profile/leminhtri`, `/donations`, `/benefactors`, `/notifications`,
  `/pet`, `/admin`, `/founder` — tất cả render như trước B1.
- `/:username` catch-all — không đổi hành vi (chưa đụng App.tsx).

## Sẵn sàng cho B2

Sau khi Cha duyệt B1, mở kế hoạch B2:
- `/notifications` vào NormalLayout.
- `/pet`, `/pet/arena`, `/pet/appeal` có MobileBottomNav.
- `/admin/migration`, `/admin/replay-debug`, `/admin/kyc`, `/admin/fun-core-debug` vào AdminShell.
- `NotFound` có NormalLayout.
- `WalletHistory` có Back về `/wallet`.
- Giữ nguyên `/:username`.
