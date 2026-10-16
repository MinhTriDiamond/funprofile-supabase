# AGENTS.md — Hướng dẫn cho Codex CLI / AI agents khi code dự án FUN Profile
<!-- LOVABLE:BEGIN -->
- Feed sidebar metallic finishes use scoped CSS tokens to preserve other pages and live bindings.
<!-- LOVABLE:END -->
> File này được Codex CLI, Claude Code, và mọi AI agent tự động đọc khi khởi động trong thư mục dự án. Tuân thủ NGHIÊM NGẶT các quy ước dưới đây.

---

## 1. Ngôn ngữ giao tiếp

- **LUÔN trả lời bằng tiếng Việt có dấu.** Không viết tiếng Việt không dấu.
- Xưng "bé" (agent) và gọi user là "Cha" hoặc theo ngữ cảnh.
- Giọng văn ngắn gọn, tôn trọng, không dùng emoji thừa.

---

## 2. Tech stack (không đổi)

- **Vite 5 + React 18 + TypeScript 5 + Tailwind CSS v3 + shadcn/ui**.
- **Backend:** Lovable Cloud (Supabase managed). Project ref: `bhtsnervqiwchluwuxki`.
- **Package manager:** `bun` (ưu tiên) hoặc `npm`. Cài thêm dùng `bun add <pkg>`.
- **Test:** `bunx vitest run`. **Typecheck:** `tsgo` (không dùng `tsc --noEmit`).
- **Dev server:** `bun run dev` → port 8080.

Không thêm framework khác (Next.js / Vue / Svelte / Angular).

---

## 3. File CẤM SỬA

| File / thư mục | Lý do |
|---|---|
| `src/integrations/supabase/client.ts` | Auto-generated bởi Lovable |
| `src/integrations/supabase/types.ts` | Auto-generated từ DB schema |
| `.env` (các biến `VITE_SUPABASE_*`) | Lovable-managed |
| `supabase/config.toml` (các trường project-level) | Auto-generated |

Nếu cần thêm config edge function (verify_jwt, import_map), thêm block riêng cho function đó, KHÔNG sửa project-level.

---

## 4. Database & migration

- Mọi schema change phải tạo file mới trong `supabase/migrations/<timestamp>_<slug>.sql`.
- **BẮT BUỘC** mỗi `CREATE TABLE public.<name>` đi kèm:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<name> TO authenticated;
  GRANT ALL ON public.<name> TO service_role;
  ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;
  -- Sau đó CREATE POLICY ...
  ```
- KHÔNG đụng schema `auth`, `storage`, `realtime`, `supabase_functions`, `vault`.
- Roles user **KHÔNG để trong `profiles`** — luôn dùng bảng `user_roles` riêng + function `has_role(uid, role)` SECURITY DEFINER.
- Dùng trigger (không CHECK constraint) cho rule phụ thuộc `now()` hoặc dữ liệu động.

---

## 5. Design system

- **KHÔNG hardcode** class màu Tailwind kiểu `text-white`, `bg-black`, `bg-[#abc123]`.
- Dùng semantic token (HSL) đã khai báo trong `src/index.css` và `tailwind.config.ts`.
- Mobile-first. Layout chính: Bottom Nav 5 nút, Facebook-like post footer.
- Tab persistence qua `localStorage`, URL parameter ưu tiên cao hơn.

---

## 6. Token math (cực kỳ quan trọng)

- **LUÔN dùng string-based BigInt** cho mọi phép tính token / gas / wei.
- KHÔNG dùng `parseFloat`, `Number()` cho số token — sẽ mất precision và đã từng gây sự cố mất 1.5 BNB (04/06/2026).
- Convert WEI ↔ token bằng `viem` (`parseUnits` / `formatUnits`).
- Mọi địa chỉ ví **lowercase trước khi so sánh / lưu DB**.

---

## 7. Wallet auth & security

- Đăng nhập ví: Wagmi + signature challenge (TTL 5 phút), KHÔNG nhập tay địa chỉ.
- Mobile: auto switch sang BSC (chainId 56) sau khi connect.
- `useSendToken` BẮT BUỘC giữ duplicate-send guard 30 giây (recipient + symbol + amount).
- Ví ngoài (`sender_id IS NULL` hoặc `is_external = true`) KHÔNG tạo `gift_celebration` post.

---

## 8. Business rules cốt lõi (PPLP v2.5 + Monetary v1)

- **6 on-chain action types** đã đăng ký 21/04/2026: `INNER_WORK`, `CHANNELING`, `GIVING`, `HELPING`, `GRATITUDE`, `SERVICE`. Mọi mint mới phải map vào 1 trong 6 (xem `src/config/pplp-action-registry.ts`); fallback = `INNER_WORK`.
- **EPOCH_CAP throttle:** 950 000 FUN / action / UTC day. Vượt → throttle qua `pplp-auto-submit`.
- **Light Score:** Post text-only `< 50` ký tự + không media → `is_reward_eligible = false` (hằng `MIN_POST_LENGTH_FOR_LS = 50` ở `src/config/pplp.ts`).
- **Monetary v1:** uncapped supply, SoftCeiling 20M FUN/tháng, lock 15/85.
- **Reward approval:** 1 pending/user, validate profile, max 500K CAMLY/ngày.

---

## 9. Edge function quy ước

- Đặt code trong `supabase/functions/<name>/index.ts` (không subfolder).
- Import shared helper:
  ```ts
  import { corsHeaders, json, requireUser, createAdminClient } from '../_shared/httpAuth.ts'
  ```
- Hỗ trợ `OPTIONS` (CORS preflight) trước mọi handler.
- KHÔNG dùng `supabase.rpc('execute_sql', ...)` với input user. KHÔNG nhận raw SQL từ frontend.
- Validate input bằng Zod hoặc check thủ công, trả 400 với message rõ.
- Gọi function từ frontend: `supabase.functions.invoke('<name>')` HOẶC `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/<name>`. **KHÔNG** hardcode `/api/<name>`.

---

## 10. Notification, Realtime, Quy ước UI khác

- Notification realtime qua `notifications` table + `notificationService.ts`.
- Reels comments count đọc trực tiếp từ `reel_comments` (không cache lệch).
- Background music: singleton audio player (Light Economy Anthem).
- Mọi avatar/click cô lập (không bubble lên thẻ cha).

---

## 11. Workflow khuyến nghị khi dùng Codex CLI

1. **Code thường ngày** (UI, hook, util, refactor, test): làm bằng Codex CLI ở local → commit → push GitHub → Lovable tự sync 2 chiều.
2. **Việc nên giao về Lovable (Angel)**:
   - Tạo / duyệt migration (cần approval flow của Lovable).
   - Deploy edge function lần đầu (Lovable auto-deploy khi push).
   - Quản lý secrets (`add_secret`, `update_secret`).
   - Publish `funprofile.lovable.app` / set custom domain.
3. **Query database từ CLI:** dùng edge function `admin-sql` (xem `docs/CODEX_CLI_SETUP.md`).

---

## 12. Checklist trước khi commit

- [ ] Không hardcode màu / không sửa file cấm.
- [ ] BigInt string cho token math.
- [ ] Wallet address lowercase.
- [ ] Migration có đủ GRANT + RLS + policy.
- [ ] Edge function có CORS + verify JWT trong code.
- [ ] Typecheck pass (`tsgo`).
- [ ] Test pass (`bunx vitest run`) nếu chạm logic.

---

## 13. Tham khảo sâu hơn

- `.lovable/memory/index.md` — toàn bộ memory dự án (Angel duy trì).
- `docs/CODEX_CLI_SETUP.md` — hướng dẫn setup Codex CLI step-by-step.
- `docs/LIGHT_SCORE_MATH_SPEC.md` — công thức Light Score chi tiết.
- `docs/pplp-action-mapping-spec.md` — mapping 14 DB action → 6 on-chain.
- `pdk/docs/` — Product Development Kit, common prompts, troubleshooting.

> Khi nghi ngờ, đọc memory tương ứng trong `.lovable/memory/` trước khi đề xuất giải pháp. Memory được coi là **rule bắt buộc**, không phải gợi ý.

---

## 14. Navigation Framework v1.0 (Freeze policy — B1 Foundation)

Từ 2026-07 FUN Profile có **Navigation Framework v1.0**. Chi tiết ở
`docs/architecture/navigation-framework-v1/`.

Quy tắc bắt buộc khi thêm/sửa route:

1. **Đăng ký vào `src/config/routeRegistry.ts`** trước khi thêm `<Route>` mới ở `App.tsx` (dù chưa migrate nested layout).
2. Chọn **1 trong 4 layout**: `normal | fullscreen | admin | publicOnly`. Không tạo layout thứ 5 nếu chưa được duyệt.
3. Nếu route có màn hình cha, ghi `parent` trong registry và bổ sung `PARENT_ROUTE_MAP` (`src/config/parentRoutes.ts`) để nút Back hoạt động.
4. `:username` **phải là entry cuối cùng** trong registry. Reserved system routes match trước username fallback.
5. Auth guard đặt ở **Layout**, không đặt trong Page. Không viết `useEffect(() => navigate('/auth'))` mới.
