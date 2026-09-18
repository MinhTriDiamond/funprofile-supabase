# Ghi chú đóng P0 — BTC raw-satoshi ghi vào cột `amount`

> Đợt: 2026-07-10 → 2026-07-13.
> Trạng thái: **P0 đóng** ở phạm vi producer + lịch sử + guard runtime.
> Tài liệu này viết cho người đọc 3 tháng sau — kể cả cái đã đóng lẫn cái còn hở.

---

## 1. Nguyên nhân gốc

`supabase/functions/wallet-reconciliation-cron/index.ts` ghi giá trị satoshi thô (số nguyên `int64`, ví dụ `1_160_801_899`) trực tiếp vào cột `amount` của các bảng lịch sử BTC, trong khi ở toàn bộ code khác `amount` là **BTC canonical** (numeric, ví dụ `11.60801899`). Sai đơn vị đúng hệ số **1e8**.

**Cái đã nổ:** 18 row với `token_symbol='BTC'` và `amount > 1000` — bất khả thi về nghiệp vụ, phát hiện qua audit thủ công.

**Cái suýt nổ (đáng ghi lại):** trong cùng cron còn 1 nhánh ghi vào `donations.amount` (line ~223) mang cùng bug nhưng chưa nổ, vì thứ tự thực thi may mắn khiến nhánh này ít được kích hoạt hơn. Nếu chỉ fix nhánh đã nổ mà bỏ nhánh này, chỉ là hoãn ngày phát nổ.

Bản chất bug: **thiếu hàm chuyển đơn vị chung**. Mỗi call-site tự chọn đơn vị theo trí nhớ, và cron viết mới không đọc convention có sẵn.

---

## 2. Đã fix (đóng ở đợt này)

### 2.1. Shared helper — chặn tái diễn ở tầng type
- `supabase/functions/_shared/btcAmount.ts` — `satsToBtc(sats: bigint | number | string): number` dùng `viem.formatUnits(BigInt(sats), 8)`.
- **Fail-loud:** throw ngay khi input là float (ví dụ `1.5e8`), không im lặng round. Chọn fail-loud vì bug gốc chính là "chuyển đơn vị nhầm âm thầm".

### 2.2. Producer fix — cắt nguồn chảy
- `wallet-reconciliation-cron`, 3 chỗ (line 204, 215, 227): thay ghi thô bằng `satsToBtc()`.
- Per-vout `try/catch` fail-safe: 1 vout hỏng không kéo cả block hỏng theo.

### 2.3. Sửa 18 row lịch sử
- Cập nhật `amount = amount / 100000000` bằng phép chia numeric exact (không qua float trung gian).
- Backup toàn bộ 18 row ở `_backup_btc_p0_fix_20260713` (11 cột). **Chưa xoá** — giữ tới khi migration ổn định ít nhất 30 ngày rồi mới drop backup.

### 2.4. Guard runtime — canh hồi quy
- **RPC** `public.btc_raw_sat_guard_scan()` chạy 2 tầng check độc lập:
  1. `threshold_1000` — quét `transactions`/`donations`/`wallet_transfers` tìm row `token_symbol='BTC' AND amount > 1000`. 1000 BTC KHÔNG phải giới hạn nghiệp vụ, mà là ngưỡng phát hiện satoshi thô cỡ lớn.
  2. `cross_table_ratio_1e8` — cùng `tx_hash` BTC có 2 row ở ≥2 bảng khác nhau với tỉ số max/min ≈ 10^8 (dung sai ±0.5 quanh 100_000_000 là rounding numeric).
- **Edge** `btc-raw-sat-guard/index.ts` admin-only, gate qua `requireUser + has_role('admin')` hoặc `Bearer <service_role>` (constant-time compare, hand-rolled XOR accumulate, không short-circuit trên length mismatch).
- **Cron** `btc-raw-sat-guard-daily` (`45 4 * * *`) gọi RPC trực tiếp trong DB, chỉ INSERT `notifications` type `btc_guard_drift` cho admin khi drift thật. Actor = FUN.RICH. Dry-run xác nhận trên DB sạch trả 0 row (điều kiện WHERE đúng chiều, không spam).

Xem `docs/ops/cron-jobs-inventory.md` cho vị trí `btc-raw-sat-guard-daily` trong lịch cron.

---

## 3. Nợ có ý thức (chưa làm — GHI RÕ LÀ NỢ)

### 3.1. Migrate call-site còn lại sang shared helper — chờ shadow-compare
- `scan-btc-transactions` và `btc-wallet-audit` **đang chạy đúng** nhờ range check theo địa chỉ, không đang chảy máu.
- Chưa swap sang `satsToBtc()` vì cần shadow-compare 1 chu kỳ để chứng minh output khớp bit-for-bit.
- **Rủi ro nếu không làm:** khi ai đó thêm nhánh mới vào 2 function này, có thể tái diễn bug gốc do không dùng helper chung.

### 3.2. `payload.amount_btc` trong finding log chưa populate
- INSERT vào cột `amount` đã đúng đơn vị (BTC canonical), nhưng field `payload.amount_btc` trong log audit chưa được điền → khó đối chiếu cross-check ở BI.
- **Rủi ro:** thấp về tài chính, cao về khả năng điều tra sau này.

### 3.3. Cross-table guard — false-positive 2 bảng chênh 1e8
- Ngưỡng ±0.5 quanh 100_000_000 sẽ bắt trúng nếu 2 output hợp lệ ở 2 bảng khác nhau tình cờ chênh đúng hệ số này.
- Trường `variants` trong output guard đủ để reviewer loại bằng mắt trong 10 giây. **Chấp nhận có ý thức ở v2**, không leo lên v3 tự động cluster.

### 3.4. Phân loại thực tế của 18 row
- Ước lượng đầu điều tra: 12 qua `transactions` / 6 qua `donations`.
- Thực tế sau audit: **7 hiện qua `transactions` / 11 bị dedupe che ở nhánh `donations`**. Cập nhật con số này để bất kỳ ai đọc lại điều tra không bị lệch mental model.

---

## 4. Ngoài phạm vi P0 này — nợ BTC lớn hơn còn treo

Không đóng trong đợt này, nhưng liệt kê để không trôi:

- **94 error trong `btc_full_reconcile_audit_20260621`** — chưa phân loại, chưa fix.
- **`btc_ownership_snapshot` rỗng** — cron `btc-ownership-reverify-auto-resume` chạy `*/5` nhưng bảng vẫn 0 row, cần điều tra.
- **92 tx gap T4/2026** — khoảng trống scanner chưa lấp.
- **Phần 1+2 audit BTC (kiểm kê `btc_*` + coverage baseline internal/external)** — Lovable bỏ qua ngay ở báo cáo đầu, món nợ cũ nhất trong nhóm này.

Cộng thêm luồng riêng (Lovable đã xin turn khác):
- **Rà soát đường ghi địa chỉ ví** (3 câu về RLS/edge/audit trên `profiles.wallet_address`, `custodial_wallets`, mọi edge UPDATE ví). Liên quan vụ nghi lộ key trước hardening 11/06/2026 — nguyên nhân **chưa truy ra**.

---

## 5. Thứ tự làm tiếp (Lovable đề xuất, chờ CTO xếp)

Ưu tiên **sự cố tài chính chưa rõ nguyên nhân** trước **lỗi đã biết không chảy máu tiếp**:

1. **[HIGH]** Rà soát đường-ghi-ví (nghi lộ key) — ngang hàng với item 2 vì cả hai đều là "chưa rõ nguyên nhân".
2. **[HIGH]** 94 error `btc_full_reconcile_audit_20260621` — phân loại + fix.
3. **[MED]** `btc_ownership_snapshot` rỗng — điều tra cron.
4. **[MED]** 92 tx gap T4/2026 — lấp scanner.
5. **[LOW]** Migrate 2 call-site còn lại sang `satsToBtc()` (nợ 3.1) — sau shadow-compare 1 chu kỳ.
6. **[LOW]** Populate `payload.amount_btc` trong finding log (nợ 3.2).
7. **[LOW]** Phần 1+2 audit BTC kiểm kê + coverage baseline (món nợ cũ nhất).

---

## 6. Chữ ký

- Producer fix + shared helper: `supabase/functions/_shared/btcAmount.ts` + `wallet-reconciliation-cron/index.ts`
- Guard: `public.btc_raw_sat_guard_scan()` + `supabase/functions/btc-raw-sat-guard/index.ts`
- Cron: `btc-raw-sat-guard-daily` (`45 4 * * *`, actor FUN.RICH `a97cbb6c-2d00-40e9-a35a-f181273b17bb`)
- Backup: `public._backup_btc_p0_fix_20260713` (18 row, giữ ≥30 ngày)
- Hồ sơ cron cập nhật: `docs/ops/cron-jobs-inventory.md`
