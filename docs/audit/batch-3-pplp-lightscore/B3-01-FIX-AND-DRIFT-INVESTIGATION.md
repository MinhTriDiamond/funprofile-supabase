# B3-01 vá xong + B3-02 đề xuất + Điều tra drift 3.1

Ngày: 2026-08-17. Nguyên tắc: bằng chứng thật, không placeholder.

---

## 1. B3-01 — Live verify TRƯỚC khi vá (bằng chứng thật)

Công cụ: edge function tạm `b301-rls-verify` (đã xoá sau khi chạy) tạo user thật qua
`auth.admin.createUser`, đăng nhập lấy JWT thật, gọi Data API bằng publishable key.

### Kết quả TRƯỚC khi vá

```json
{
  "test1_update_other_users_post": { "data": [], "count": 0 },
  "test2_self_set_reward_eligible": { "data": [{ "id": "c8606bab-…", "is_reward_eligible": true }] },
  "test3_change_user_id": { "data": null, "error": "new row violates row-level security policy for table \"posts\"" },
  "own_post_after": { "is_reward_eligible": true }
}
```

- TEST 1 (sửa bài người khác): **BỊ CHẶN** (0 row, do `USING`).
- TEST 2 (tự set `is_reward_eligible = true` cho bài NGẮN của mình): **THÀNH CÔNG → LỖ HỔNG P0 XÁC NHẬN**.
- TEST 3 (đổi `user_id` sang UUID khác): **BỊ CHẶN**, nhưng bị chặn *tình cờ* — vì
  `policy` không có `WITH CHECK` nên Postgres fallback dùng `USING` cho row mới.
  Không phải bảo vệ có chủ đích.

`relacl` trước khi vá: `anon=arwdDxtm`, `authenticated=arwdDxtm` (rộng hơn nhu cầu).

### Cách vá đã chọn (kiến trúc)

Hai lựa chọn đã cân nhắc:

| Phương án | Ưu | Nhược |
|---|---|---|
| (A) Tách `is_reward_eligible` sang bảng riêng `post_reward_state` | Không thể chạm từ bảng chính | Phải sửa ~20 chỗ đọc + 5 edge function ghi, rủi ro regression cao, downtime chấm điểm |
| (B) Giữ cột trong `posts`, bảo vệ bằng `WITH CHECK` + trigger ghim cột hệ thống + siết GRANT | Không đổi read path, không sửa FE, hiệu lực ngay cho toàn bộ 5 cột hệ thống | Cột vẫn nằm trong bảng chính (phòng thủ theo tầng, không theo cấu trúc) |

**Đã chọn (B)** — vì writer audit cho thấy chỉ edge function (service_role) ghi
`is_reward_eligible`, frontend chỉ đọc; nên rào bằng trigger đủ kín mà không cần đổi kiến trúc.

Nội dung vá:

1. Trigger `BEFORE UPDATE` `posts_freeze_system_columns()` ghim về `OLD` 5 cột:
   `is_reward_eligible`, `moderation_status`, `content_hash`, `pplp_pillar`, `user_id`.
   Chỉ enforce khi role của request là `anon`/`authenticated`; `service_role`,
   `postgres` (cron/migration) ghi tự do; admin (`has_role(auth.uid(),'admin')`) bypass.
2. Policy `Users can update their own posts` viết lại có **cả** `USING` và
   `WITH CHECK` = `auth.uid() = user_id`.
3. `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.posts FROM anon`
   (giữ `SELECT`).

### Bẫy đã gặp và sửa (quan trọng)

Bản trigger đầu dùng `current_user NOT IN ('anon','authenticated')`. **Không có tác dụng** —
vì `SECURITY DEFINER` làm `current_user` = owner (`postgres`), nên nhánh bypass luôn đúng.
Live re-test lần 1 vẫn cho `is_reward_eligible = true`. Đã sửa sang
`current_setting('role', true)` (role thật của request PostgREST).

### Kết quả SAU khi vá (live, cùng công cụ)

```json
{
  "test1_other_users_post": { "rows": 0, "error": null },
  "test2_self_set_reward_eligible": { "data": [{ "is_reward_eligible": false }], "error": null },
  "test3_change_user_id": { "data": [{ "user_id": "4007c1ea-… (vẫn là chính user)" }] },
  "test4_normal_content_edit": { "data": [{ "content": "user sửa nội dung bình thường" }] },
  "own_post_after": { "is_reward_eligible": false, "content": "user sửa nội dung bình thường" }
}
```

- TEST 2: giá trị bị ghim `false` → **đã bịt**.
- TEST 3: request "thành công" nhưng `user_id` không đổi (bị ghim) → không mất bài, không chuyển chủ.
- TEST 4: sửa nội dung bình thường **vẫn chạy** → không phá UX.

`relacl` sau khi vá: `anon=rm` (chỉ read + reference-metadata), `authenticated=arwdDxtm`
(cần cho insert/update/delete bài của mình, đã bị RLS + trigger chặn phần hệ thống).

Bằng chứng snapshot: `evidence/fn_posts_freeze_system_columns.sql`,
`evidence/policy_posts_update.sql`, `evidence/relacl_posts.txt`.

Vitest guard: `src/__tests__/b301-posts-system-columns-guard.test.ts` — 12/12 pass
(offline snapshot + lớp live tự skip khi không có `PGHOST`).

---

## 2. B3-02 (race condition EPOCH_CAP) — ĐỀ XUẤT, CHƯA CODE

Hiện trạng: `pplp-auto-submit` đọc tổng `confirmed` hôm nay → tính `remainingByAction`
trong bộ nhớ, rồi submit tuần tự. Không có lock. Cron 15 phút; nếu một run chạy quá 15 phút
(hoặc admin bấm tay song song), hai run cùng đọc cùng `remaining` → cùng submit → có thể
vượt soft cap 950K ở tầng DB trước khi tới trần on-chain 1.000.000.

Đề xuất (chờ CTO duyệt hướng trước khi code):

**Lớp 1 — Single-flight bằng Postgres advisory lock (khuyến nghị chính)**
- Đầu run: `SELECT pg_try_advisory_lock(hashtext('pplp-auto-submit'))` qua một RPC nhỏ
  `pplp_auto_submit_try_lock()` / `..._unlock()` (SECURITY DEFINER, chỉ service_role).
- Không lấy được lock → return `{ skipped: 'already_running' }`, không tốn gas.
- Nhả lock ở `finally`. Advisory lock session-scoped tự nhả nếu connection chết → không kẹt vĩnh viễn.
- Ưu: không thêm bảng, không đổi schema, chống đúng đường race duy nhất (nhiều run song song).

**Lớp 2 — Chốt cap ở tầng DB (phòng thủ sâu, không thay lớp 1)**
- Bảng `pplp_daily_action_mint (action_name text, utc_day date, minted_wei numeric, PRIMARY KEY (action_name, utc_day))`.
- Trước mỗi submit: `INSERT … ON CONFLICT … DO UPDATE SET minted_wei = minted_wei + :amt WHERE pplp_daily_action_mint.minted_wei + :amt <= 950e21`
  → 0 row nghĩa là hết quota, skip (giữ `signed`, không tăng `retry_count`).
- Nếu tx on-chain fail sau đó: trừ ngược trong cùng transaction rollback/compensate.
- Ưu: đúng cả khi có writer thứ ba (admin FE `lockWithPPLP`, B3-04) không đi qua auto-submit.

**Không đề xuất**: `SELECT … FOR UPDATE` trên `pplp_mint_requests` — chống được double-pick
cùng request nhưng KHÔNG chống vượt cap tổng theo action.

Khuyến nghị: làm Lớp 1 trước (nhỏ, rủi ro thấp), Lớp 2 ở đợt sau cùng với B3-04.

---

## 3. Điều tra drift 3.1 — CHỈ BÁO CÁO, KHÔNG KẾT LUẬN HƯỚNG SỬA

### 3.1.a Sửa lại một kết luận sai của báo cáo Batch 3 trước

Báo cáo trước ghi "`pplp_v25_phase_config` có 2 row cùng `is_active=true`". **Sai.**
Query thật:

```
phase_name | alpha | beta | gamma | is_active | created_at
early      | 0.7   | 0.2  | 0.1   | t         | 2026-04-17 04:48:44.847746+00
growth     | 0.5   | 0.3  | 0.2   | f         | 2026-04-17 04:48:44.847746+00
mature     | 0.4   | 0.3  | 0.3   | f         | 2026-04-17 04:48:44.847746+00
```

Chỉ **1 row active** (`early`). Drift thật nằm ở **2 bảng khác nhau**:

```
pplp_v25_config: config_key=default, alpha=0.4, beta=0.3, gamma=0.3, is_active=t,
                 updated_at=2026-04-16 18:23:40.914602+00
```

### 3.1.b Code thực sự đọc cái nào (không suy đoán)

`supabase/functions/pplp-v25-aggregate/index.ts:24-37`:

```ts
const { data: activePhase } = await supabase.from('pplp_v25_phase_config')
  .select('alpha, beta, gamma').eq('is_active', true).maybeSingle();
const { data: cfg } = await supabase.from('pplp_v25_config')
  .select('alpha, beta, gamma, display_compression').eq('config_key','default').maybeSingle();
const alpha = Number(activePhase?.alpha ?? cfg?.alpha ?? 0.4);
```

→ **`pplp_v25_phase_config` (early) THẮNG**. Vì row `early` tồn tại, hệ thống đang chạy
**α=0.7 / β=0.2 / γ=0.1**. `pplp_v25_config` (0.4/0.3/0.3) chỉ là fallback chết —
không bao giờ được dùng khi còn 1 phase active.

Các consumer khác: `pplp-v25-mint-preview` đọc `phase_config`; `pplp-v25-tier-assigner`
đọc `pplp_v25_config` (chỉ threshold/multiplier, không dùng α/β/γ).
Admin `LightScoreParameterPanel.tsx:45-49` cho phép đổi phase active (set `is_active=false`
cho phần còn lại rồi `true` cho phase chọn) và ghi audit qua `saveRow`.

### 3.1.c Lịch sử: ai/khi nào đổi α/β/γ

Cả 3 row `phase_config` cùng `created_at = updated_at = 2026-04-17 04:48:44` → **chưa từng
bị sửa sau khi seed**. Nghĩa là **không có ai đổi từ 0.4/0.3/0.3 sang 0.7/0.2/0.1**:
0.4/0.3/0.3 là con số seed trong `pplp_v25_config` (16/04, spec gốc v2.5), còn 0.7/0.2/0.1
là con số seed của `phase_config` `early` thêm vào ngày hôm sau (17/04) khi làm LS Param
Table v1.0. Hai nguồn cùng tồn tại từ đầu, memory chỉ chép con số của nguồn cũ.
→ Đây là **drift tài liệu do thêm bảng mới, không phải thay đổi ngoài ý muốn**.
Ghi chú: `pplp_v25_param_audit_log` không có cột `param_table`/`param_code` như báo cáo
trước ngụ ý — chưa dùng để lần dấu vụ này.

### 3.1.d Lịch sử `epoch_config.soft_ceiling`: 5M → 20M → 50M

Có migration ghi lại đầy đủ:

| Thời điểm | File migration | Giá trị |
|---|---|---|
| 2026-04-16 17:44 | `20260416174452_5a612909-…sql:41,279` | seed `DEFAULT 5000000` |
| 2026-04-20 17:00 | `20260420170019_4b17d6ad-…sql:26` | `SET soft_ceiling = 20000000` |
| 2026-04-30 18:16 | `20260430181641_680e9754-…sql:2` | `SET soft_ceiling = 50000000` |
| 2026-05-01 00:56 | `20260501005648_cde0459c-…sql:7-15` | `soft_ceiling = 50000000`, `min_epoch_mint = 50000000`, `user_pool_pct = 0.70`, thêm `max_share_per_user = 0.03` |

`epoch_config.updated_at` trong DB = `2026-05-01 00:56:47.576487+00`, khớp migration cuối.

Ngữ cảnh của migration 01/05: cùng file đó **tính lại toàn bộ allocation tháng 4/2026**
theo `v_total_mint := 50000000`, `v_user_pool := 35000000`, `v_cap_amount := 1050000`
(anti-whale 3%). Tức 50M được dùng làm cơ sở phân bổ thật cho một epoch đã chốt,
không phải giá trị sót lại do vô tình.

**Không kết luận** nên sửa code theo tài liệu hay ngược lại. Hai điểm cần Cha/CTO quyết:

1. α/β/γ: giữ `early` 0.7/0.2/0.1 đang chạy (và cập nhật memory), hay chuyển phase?
   Nếu chuyển phase, TLS toàn hệ thống đổi → cần backfill + thông báo.
2. `soft_ceiling` 50M: đã dùng thật cho allocation T4/2026. Tài liệu ghi "Nấc 1 = 20M".
   Cần xác nhận 50M là quyết định kinh doanh đã duyệt (chỉ quên cập nhật tài liệu),
   hay 20M mới là mức mong muốn (khi đó phải xử lý cả phần đã phân bổ theo 50M).

---

## Trạng thái

| Việc | Trạng thái |
|---|---|
| B3-01 vá + live verify 2 vòng + Vitest guard | ✅ Xong |
| B3-02 cơ chế lock | 📋 Đề xuất, chờ CTO duyệt hướng |
| Drift 3.1 (α/β/γ + soft_ceiling) | 🔍 Điều tra xong, chờ Cha/CTO quyết |
| B3-03 (không re-evaluate sau khi sửa bài), B3-04, B3-05 | ⏳ Chưa xử lý |
