# BATCH 3 — AUDIT PPLP / Light Score / Trust Engine

Nguyên tắc: chỉ phát hiện + bằng chứng, KHÔNG sửa code trong đợt audit này.
Ngày chạy: xem git log của file. Môi trường: DB production (psql read-only), code nhánh hiện tại.

---

## 3.2 EPOCH_CAP 950K FUN / action / UTC day

### Enforcement thực tế
| Tầng | Vị trí | Nội dung |
|---|---|---|
| Soft cap ngày/action | `supabase/functions/pplp-auto-submit/index.ts:155-196` | `SOFT_CAP_PER_ACTION = 950_000 × 1e18` wei; đọc tổng `status='confirmed'` hôm nay group by `action_name`, skip request nếu vượt |
| Cùng hằng số | `pplp-rebalance-throttled-action:28`, `pplp-split-stuck-throttled:27`, `pplp-resplit-orphan-parents:28`, `pplp-backlog-status:13`, `pplp-backlog-history:13`, `pplp-recovery-run:13` | dùng lại 950k, mỗi file khai báo riêng (không có hằng số chung) |
| Cap tháng/user | DB trigger `enforce_monthly_mint_cap` | 1.050.000 FUN/user/epoch = 50M × 0.70 × 0.03 (khớp `epoch_config`) |
| 1 lệnh active/user | unique index `idx_one_active_mint_per_user` (`pending_sig, signing, signed, submitted`) | giới hạn theo user, KHÔNG giới hạn theo action |

### Bằng chứng số thật
Query tổng `confirmed` theo (action, ngày UTC) 60 ngày gần nhất: **không ngày nào vượt 950.000 FUN**; giá trị lớn nhất đúng bằng 950.000 (nhiều ngày, các action GIVING/SERVICE/INNER_WORK/HELPING/CHANNELING). Trạng thái hiện tại: `confirmed` 1.199 lệnh / 105.357.901 FUN; `failed` 758; `submitted` **0 dòng**.

### Phát hiện

**P1 — Không có single-flight lock cho `pplp-auto-submit` (race condition tầng DB)**
- Kiểm tra `rg "advisory_lock|pg_try_advisory|lease"` trên toàn bộ `supabase/functions`: **không có** lock/lease nào cho nhánh PPLP (chỉ `live-replay-archive-cron` dùng lease).
- Cửa sổ race: `remainingByAction` được tính 1 lần đầu run từ `status='confirmed'`, và chỉ trừ dần **trong bộ nhớ của run đó**. Hai run song song (cron `*/15` chồng lấn khi run trước chạy lâu, hoặc admin gọi tay đồng thời) đều đọc cùng `remaining` → mỗi run có thể submit tới trọn phần còn lại ⇒ tổng ngày có thể lên tới ~2× soft cap (1.9M) trước khi chạm trần on-chain 1.000.000/action/day.
- Tại sao chưa xảy ra trên số liệu: trần on-chain 1M chặn phần vượt (TX revert), nên hậu quả hiện tại là **gas thất thoát + lệnh bị đánh `failed`**, không phải mint vượt trần. Đây chính là loại sự cố đã tạo 322 lệnh failed hồi 03/05/2026.
- Đề xuất (chưa làm): `pg_try_advisory_lock` hoặc bảng lease `pplp_auto_submit_lease` trước vòng lặp; và tính `used` gồm cả `submitted`/`signed`-đang-gửi.

**P2 — Đường mint bỏ qua throttle hoàn toàn: admin submit từ FE**
- `src/hooks/usePplpAdmin.ts:492` gọi `writeContractAsync(..., 'lockWithPPLP', ...)` trực tiếp từ ví admin. Không có bất kỳ kiểm tra 950k/action/day nào trên đường này (chỉ verify nonce, dòng 455-478).
- Rủi ro: admin bấm submit tay trong khi cron đang xả backlog ⇒ cùng dạng vượt soft cap như trên.

**P3 — `pplp-recovery-run` tính "đã dùng hôm nay" bằng `updated_at` thay vì `confirmed_at`**
- `supabase/functions/pplp-recovery-run/index.ts:170-179` filter `.gte('updated_at', dayStart)`. Lệch spec nhưng lệch về phía **an toàn** (đếm thêm lệnh confirmed cũ bị update hôm nay ⇒ remaining nhỏ hơn thực tế). Không gây vượt cap.

**P3 — Hằng số 950k lặp lại ở 7 file** (không import chung) ⇒ nguy cơ drift khi đổi cap.

---

## 3.3 Aggregation Completeness Guard

Guard tồn tại và đúng thiết kế: `supabase/functions/pplp-epoch-snapshot/index.ts:149-206`
- Chặn nếu `light_actions.mint_status='pending'` trong tháng epoch > 50 dòng.
- Chặn nếu số user thiếu khỏi aggregation > 5% hoặc > 20 user.
- Bypass tường minh bằng `{ "force_snapshot": true }`, có ghi audit `epoch.snapshot.aborted_by_guard`.

**P2 — Bypass không được rào bằng quyền và không ghi dấu vào bản snapshot**
- `force_snapshot` chỉ là field trong body; khi bypass, guardReport được log nhưng **không** lưu cờ "snapshot này đã bypass guard" vào `mint_epochs`/`epoch_metrics` ⇒ về sau không truy được epoch nào đã bỏ qua guard (chính là tình huống T4/2026).

**CHƯA CHẠY**: chưa đối chiếu từng epoch gần đây (T5–T8/2026) giữa số user có `light_actions` và số dòng `mint_allocations` để tìm epoch thiếu mà guard không chặn — cần cửa sổ query dài, xin duyệt trước khi chạy loạt query nặng trên production.

---

## 3.4 Post reward eligibility (MIN_POST_LENGTH_FOR_LS = 50)

Gate tồn tại đúng: `supabase/functions/pplp-evaluate/index.ts:305-330` (`MIN_CONTENT_LENGTH = 50`, có media thì miễn), mirror `src/config/pplp.ts`.

**P0 — `posts` cấp full quyền ghi cho `anon` + `authenticated`, RLS UPDATE không có `WITH CHECK` và không giới hạn cột**
- `pg_class.relacl` của `posts`: `anon=arwdDxtm`, `authenticated=arwdDxtm` (có UPDATE mọi cột).
- Policy `Users can update their own posts` (UPDATE, role `public`): `USING (auth.uid() = user_id)`, `WITH CHECK = NULL`.
- Hệ quả: user tự sửa **chính cột `is_reward_eligible`** của bài mình thành `true`, hoặc đổi `user_id` (không có WITH CHECK chặn), tự vô hiệu hoá gate 50 ký tự và cả cờ chặn trùng nội dung. Không cần đụng edge function nào.

**P1 — Không tái chấm sau khi sửa bài**
- Không có trigger nào trên `posts` liên quan reward (`pg_trigger`: rate limit, slug, outbox, updated_at). `pplp-evaluate` chỉ chạy lúc tạo.
- Số thật: **16.408** bài có `updated_at` > thời điểm chấm + 1 phút (light_actions `post`/`post_create`, từ 03/05/2026).
- Bài text-only < 50 ký tự, không media, tạo sau 03/05/2026: **2.787** bài, trong đó **1.870** vẫn `is_reward_eligible = true`.
- Nhưng LS thực đã cấp cho nhóm này rất nhỏ: **11 light_actions / 200,31 LS / 4 user** ⇒ thiệt hại kinh tế hiện tại không đáng kể; rủi ro nằm ở khả năng khai thác về sau (P0 ở trên).

---

## 3.1 Drift công thức so với memory

| Hạng mục | Code/DB thực tế | Memory | Kết luận |
|---|---|---|---|
| α/β/γ TLS | `pplp-v25-aggregate/index.ts:25-35` ưu tiên `pplp_v25_phase_config` (phase `early` active: 0.7/0.2/0.1), fallback `pplp_v25_config` (0.4/0.3/0.3) | `mem://governance/pplp-v25-engine-spec` ghi α=0.4/β=0.3/γ=0.3 "ưu tiên Legacy" | **P3 drift tài liệu** — spec file mô tả sai giá trị đang chạy; index.md thì đúng (Early 0.7/0.2/0.1). Ngoài ra tồn tại **2 nguồn tham số cùng `is_active=true`**, dễ nhầm khi tinh chỉnh (P2 vận hành). |
| SoftCeiling | `epoch_config.soft_ceiling = 50.000.000`, `system_stage=bootstrap`; `src/config/cascade-constants.ts` = 50M (đã sync) | index.md Core: "SoftCeiling 20M/tháng — Nấc 1"; `docs/pplp-action-mapping-spec.md` cũng ghi 20M | **P2 drift tài liệu/quản trị** — trần thực đã lên Nấc 2 (50M) nhưng memory + spec chưa cập nhật. |
| Cap/user/tháng | trigger `enforce_monthly_mint_cap` = 1.050.000 | 1.05M = 50M×0.70×0.03 | Khớp. |
| Vesting 15/85, 28 ngày | `epoch_config`: 0.15 / 28 | khớp | Khớp. |
| Mint weight | `pplp-epoch-snapshot:313-321`: `weighted = raw_ls × tier_mult × consistency`, chia theo tỉ lệ user_pool | khớp "Phương án A" | Khớp. |
| TC | `identity-trust-engine`: TC = (0.30VS+0.25BS+0.15SS+0.20OS+0.10HS)×RF, clamp [0.30, 1.50]; tier T0..T4 tại 0.60/0.80/1.00/1.25 | khớp memory | Khớp. |

---

## Tổng hợp mức độ

| ID | Mức | Vấn đề |
|---|---|---|
| B3-01 | **P0** | `posts` cho `anon`/`authenticated` UPDATE mọi cột + policy UPDATE thiếu `WITH CHECK` ⇒ tự set `is_reward_eligible`, tự đổi `user_id` |
| B3-02 | P1 | `pplp-auto-submit` không có single-flight lock; `used` chỉ đếm `confirmed` ⇒ race vượt soft cap (hậu quả: gas + lệnh failed) |
| B3-03 | P1 | Không tái chấm LS sau khi sửa bài (16.408 bài đã sửa sau chấm) |
| B3-04 | P2 | Admin FE submit `lockWithPPLP` bỏ qua throttle hoàn toàn |
| B3-05 | P2 | `force_snapshot` không rào quyền, không đánh dấu trên epoch đã bypass guard |
| B3-06 | P2 | Hai nguồn α/β/γ cùng active (`pplp_v25_config` vs `pplp_v25_phase_config`) |
| B3-07 | P2 | Drift tài liệu SoftCeiling 20M → 50M chưa cập nhật memory/spec |
| B3-08 | P3 | `pplp-recovery-run` dùng `updated_at` thay `confirmed_at` (lệch an toàn) |
| B3-09 | P3 | Hằng số 950k lặp ở 7 file |
| B3-10 | P3 | Spec `pplp-v25-engine-spec` ghi α/β/γ sai so với phase đang active |

## CHƯA CHẠY
- Đối chiếu completeness từng epoch T5–T8/2026 (3.3).
- Thử nghiệm race thực tế bằng 2 lần gọi `pplp-auto-submit` song song (cần duyệt vì tiêu gas thật).
- Đọc thân `pplp-v2-onchain-mint` / `pplp-v2-mint-worker` (nhánh v2 song song) để xác nhận có/không cap riêng.
