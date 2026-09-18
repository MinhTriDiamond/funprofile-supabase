# NHÓM 1 — Đóng nốt M6B (#2 · #3 · #4 · #8)

Ngày: 2026-08-27 (UTC)

---

## #2 — Gap M6B: 57 dòng

**(1) Nguyên nhân:** lỗi **điều kiện UNION của view**, KHÔNG phải lỗi dữ liệu nguồn.
Nhánh `transactions` chỉ whitelist BTC(0) · USDT(56) · BNB(56, token_address NULL);
không có nhánh nào cho CAMLY (56/137) và FUN (97). 57 dòng đều tồn tại đầy đủ trong
`transactions`, chỉ bị view lọc bỏ.

Phân bố: 38 CAMLY 56 (token_address NULL) · 12 CAMLY 56 (checksum) · 3 CAMLY 56 (lowercase)
· 3 FUN 97 · 1 CAMLY 137. Khoảng 04/12/2025 → 13/06/2026.

**(2) Giá trị:** ≈ **6.293.659 CAMLY** + **1.148 FUN (chain 97 = testnet)**.
Không có BTC/USDT/BNB. ⇒ **không đủ lớn để ảnh hưởng báo cáo USD trọng yếu**; ảnh hưởng
thật là *tính đầy đủ* của Unified History/Export, không phải tổng tài sản.

**(3) Preview dry-run** (chưa áp dụng — bằng chứng: `evidence/m6b-gap-preview.txt`):

| old_rows | new_rows | added_rows | removed_rows | still_excluded |
|---:|---:|---:|---:|---:|
| 1 118 | 1 175 | **57** | 0 | 0 |

Whitelist đề xuất = whitelist cũ `OR (CAMLY AND chain_id IN (56,137)) OR (FUN AND chain_id IN (56,97))`.
Đúng 57 dòng thêm, 0 dòng mất, 0 dòng còn bị loại.

**(4) Vitest guard (#8):** đã tạo `src/__tests__/m6b-unified-view-gap-guard.test.ts`
— lớp offline soi bằng chứng preview, lớp live (chạy khi có `PGHOST`) kiểm tra view có
whitelist CAMLY/FUN và **đếm gap = 0**.

⏸ **Dừng ở Preview** — chờ CTO Confirm mới `CREATE OR REPLACE VIEW` thật.

---

## #3 — Export

**(5) Đối chiếu tổng tiền theo token (3 user, 01/08 → 31/08/2026)**

Nguồn cũ: `donations` (điều kiện `sender_id`/`recipient_id` = user).
Nguồn mới: `v_unified_transactions_primary` (bản **đã dedup**, chính là nguồn RPC
`get_unified_transactions` mà hook mới gọi).

| user | token | CŨ — dòng / tổng | MỚI — dòng / tổng | Khớp |
|---|---|---|---|---|
| 040919cc… | CAMLY | 67 / 57 221 991 | 67 / 57 221 991 | ✅ |
| 040919cc… | FUN | 2 / 20 998 | 2 / 20 998 | ✅ |
| 040919cc… | USDT | 58 / 7 210,235483485775492318 | 58 / 7 210,235483485775492318 | ✅ |
| b7856e97… | BNB | 4 / 0,3555 | 4 / 0,3555 | ✅ |
| b7856e97… | CAMLY | 70 / 47 388 670 | 70 / 47 388 670 | ✅ |
| b7856e97… | FUN | 4 / 111 006,9 | 4 / 111 006,9 | ✅ |
| b7856e97… | USDT | 53 / 5 064,98 | 53 / 5 064,98 | ✅ |
| fc042e3b… | BNB | 7 / 0,429 | 7 / 0,429 | ✅ |
| fc042e3b… | CAMLY | 154 / 49 163 845 | 154 / 49 163 845 | ✅ |
| fc042e3b… | FUN | 3 / 132 428 | 3 / 132 428 | ✅ |
| fc042e3b… | USDT | 56 / 4 779 | 56 / 4 779 | ✅ |

**Khớp 100% cả số dòng và tổng tiền theo từng token.**

⚠️ Sửa lỗi báo cáo trước: các con số lệch (USDT 8 270 / CAMLY 52 488 669…) đến từ việc
đếm trên `v_unified_transactions` **chưa dedup**, không phải trên `..._primary` mà hook
thật sử dụng. Sau khi đo đúng nguồn, không còn lệch nào ở scope 1 user.


**(6) Giải thích tỷ lệ 1 879 → 3 560 (không tròn 2×)**
Tháng 8/2026 có **1 879 donation**, trong đó **1 683 hai chân** (có cả `sender_id` và
`recipient_id`) và **196 một chân** (ví ngoài / thiếu một phía).
1 683 × 2 + 196 = **3 562**; unified quan sát 3 560 (lệch 2 dòng do 2 donation không có
cả hai phía). ⇒ tỷ lệ 1,89× được giải thích trọn vẹn bởi số donation một chân.

**(7) maskPii + export_audit_logs:** hook mới **không đụng** hai lớp này. Masking nằm ở
`src/utils/export/exportExcel.ts` (`applyMask` từ `./maskPii`) và ghi audit ở
`src/utils/export/auditLog.ts` (`insert` vào `export_audit_logs`) — cả hai chạy ở tầng
`exportTransactionsExcel`, sau khi nhận rows. `useUnifiedTransactionsExport` chỉ trả
`TxExportRow[]`, nên mask + audit giữ nguyên hành vi.

**(8) Thay 1 consumer — CẦN CTO chọn lại mục tiêu.**
`DonationHistoryAdminTab` **không dùng** đường Excel/`TxExportRow`: nó gọi
`fetchAllDonationsForExport()` rồi `exportDonationsToCSV()` — định dạng CSV theo shape
`donations`, khác schema `TxExportRow`. Thay ngay sẽ phải đổi cả format file admin đang dùng.
Đề xuất: đổi **`TransactionExportMenu`** (Excel, đúng shape `TxExportRow`, có mask + audit)
làm consumer đầu tiên; `DonationHistoryAdminTab` chuyển sau, kèm quyết định có đổi
CSV → Excel hay không. ⏸ chờ CTO chốt.

---

## #4 — `is_external` hardcode `false`

**(9) Định nghĩa "universe nội bộ"** dùng trong biểu thức `NOT EXISTS` đề xuất — chính xác 4 nguồn:

1. `profiles.public_wallet_address` (khác NULL/rỗng, so sánh `lower()`)
2. `profiles.btc_address` (so sánh qua `public.btc_normalize_address()` — bech32 lowercase, legacy giữ case)
3. `custodial_wallets.wallet_address` (233 dòng, `lower()`)
4. `profile_btc_aux_addresses.address` (1 707 dòng, qua `btc_normalize_address()`)

Biểu thức thay cho `false AS is_external` ở nhánh `transactions`:

```sql
NOT EXISTS (
  SELECT 1 FROM internal_addr ia
  WHERE ia.addr = CASE WHEN t.chain_id = 0
                       THEN public.btc_normalize_address(cp.addr)
                       ELSE lower(cp.addr) END
)
```
với `cp.addr` = địa chỉ **đối ứng** (`to_address` khi direction = out, `from_address` khi in;
`unknown` ⇒ xét cả hai, nội bộ nếu bất kỳ phía khớp), và `internal_addr` là CTE UNION 4 nguồn trên.
Không đổi bất kỳ cột nào khác của view; reversible bằng `CREATE OR REPLACE VIEW`.

Số liệu audit trước: **1 063/1 118 dòng** lẽ ra `true`, 55 dòng `false` là đúng.
Ảnh hưởng: nhãn "Ví ngoài" + bộ lọc `externalOnly`; **0 quyết định BXH/gift** (các hàm đó không đọc view).

⏸ Chờ CTO duyệt logic. Sau khi Confirm sẽ query lại xác nhận đúng 1 063 → `true`, 55 vẫn `false`.

---

## #4 — ĐÃ ĐÓNG SỔ (2026-08-28)

Chuẩn duy nhất: `v_unified_transactions_primary`, nhánh `transactions` = **550 dòng**
(không dùng tập thô 1.174 dòng vì lẫn 624 dòng bị dedup nhường chỗ).

1. Tạo view `v_internal_addresses` (security_invoker) = DISTINCT lower(addr) từ 4 nguồn:
   `custodial_wallets`, `profiles.public_wallet_address`, `profiles.btc_address`,
   `profile_btc_aux_addresses`. Thêm 4 index `lower()`.
   ⚠️ `CREATE INDEX CONCURRENTLY` không khả dụng (role psql không phải owner; migration
   chạy trong transaction) ⇒ dùng `CREATE INDEX` thường, bảng nhỏ (240/868/1.707 dòng).

2. Preview dry-run (trước khi áp dụng):

| total | old_true | old_false | flip_true | keep_false | undetermined |
|---:|---:|---:|---:|---:|---:|
| 550 | 0 | 550 | **483** | **55** | **12** |

3. Áp dụng thật (`CREATE OR REPLACE VIEW`), sau khi áp dụng:

| tx_rows | is_external=true | false | undetermined | undetermined_but_true |
|---:|---:|---:|---:|---:|
| 550 | **483** | 67 (55 + 12) | 12 | **0** |

Biểu thức: `CASE WHEN from/to rỗng THEN false ELSE (fi.addr IS NULL OR ti.addr IS NULL) END`;
12 dòng thiếu địa chỉ được đánh dấu `metadata->>'external_undetermined' = 'true'`.

4. Hiệu năng user nặng nhất (2.021 dòng): page-1 `_primary` **403,7 ms** (baseline 482 ms),
   RPC `get_unified_transactions('profile', …, limit 50)` **215,2 ms**. Không hồi quy.

5. Guard test mở rộng: `src/__tests__/m6b-unified-view-gap-guard.test.ts` — **10/10 pass**
   với PGHOST thật; set id chuẩn commit tại `evidence/is-external-primary-sets.json`.

Ghi chú: `v_internal_addresses` là security_invoker, nên đường production (RPC
`get_unified_transactions`, SECURITY DEFINER) và job service_role thấy đủ universe;
công cụ audit đọc view trực tiếp bằng JWT user có thể thấy universe hẹp hơn do RLS.
