# BTC ownership backfill — ĐÃ GHI THẬT (Confirmed) — 2026-09-03

## 1. Kết quả ghi
- INSERT thành công **25 dòng** vào `btc_address_ownership_history`.
- Tiêu chí: `≥3 tx độc lập (khác tx_hash)` **VÀ** `≥3 ngày UTC khác nhau`,
  match **chỉ** `profiles.btc_address` (KHÔNG dùng `profile_btc_aux_addresses`).
- `verification_method = 'admin_manual'`, `valid_to = NULL`,
  `verified_at = valid_from = thời điểm donation BTC khớp user đầu tiên`,
  `request_id = 'backfill_20260903'`, `created_by = leminhtri (admin)`.
- Hoãn 6 dòng: `angelthuat` (3 tx / 2 ngày), `phamluong68`, `camlyd`,
  `angelbichvan`, aux `father` (`source=manual`, `first_seen_tx=NULL`).

## 2. Verify toàn vẹn bảng
```
total = 25 | active (valid_to IS NULL) = 25 | distinct address = 25
```
⇒ Không thừa/thiếu; unique index `idx_btc_ownership_active_unique (address) WHERE valid_to IS NULL`
không vi phạm (25 địa chỉ duy nhất / 25 dòng active).

## 3. Verify resolver (6 địa chỉ, gồm 3 tài khoản priority)
`resolve_btc_owner()` chỉ `service_role` được EXECUTE (đúng thiết kế Phase 1),
nên verify bằng **predicate y hệt thân hàm** + kiểm chứng thân hàm chưa bị sửa
(`fn_predicate_intact = true` cho cả 6 dòng).

| username | address | resolved = user_id |
|---|---|---|
| angelkim (priority) | bc1prndhwz6…dylxu | ✅ dcfd1a56… |
| angelgiau (priority) | bc1q0wmq7ev…7flf | ✅ ce344e2f… |
| father (priority) | bc1qgxf7c63…a8sv | ✅ 4466cccf… |
| angelquan | bc1p7etam62…m3mm | ✅ e16a7fa8… |
| angelthanhtien | bc1ptz7r9sc…phtfw | ✅ 80c0a487… |
| angelkhanhi | bc1qe4nzjar…lxkr | ✅ 040919cc… |

## 4. Cửa sổ quan sát 7 ngày MỚI
- **Bắt đầu: 2026-09-03 03:25:54 UTC** (thời điểm ngay sau khi INSERT xong).
- **Kết thúc: 2026-09-10 03:25:54 UTC**.
- Không chồng lấn cửa sổ cũ (26/08 17:06 → 02/09 17:06 UTC).
- Điều kiện đo: chỉ tính `btc_resolver_shadow_log.created_at > 2026-09-03 03:25:54+00`.
- Mục tiêu go Phase 3: `is_match = false ≤ 1%`.
- Cần chủ động chạy 1 dry-run cho 4 luồng admin còn im lặng
  (`btc-wallet-audit`, `btc-history-repair`, `btc-parser-v2`, `btc-discovery-v2`)
  để phủ đủ 7 call_site RC4.
