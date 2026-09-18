# BTC manual-confirm cleanup — 22/08/2026

## Bước 1 — Hợp nhất song sinh thật (1 cặp)
Audit raw JSON: `step1-twin-merge-audit.json` (xuất TRƯỚC khi xoá).
Đã xoá theo ID cụ thể (không dùng pattern):
- donation `8f5cfe7f-f6b4-481c-ba09-2b787a17e9cd` (hash giả `btc-manual-1775149454615`)
- post `77b2ee57-c4d3-45cc-9b87-3466f8066a31`
- message `25cd11e3-723a-4bc2-bd67-0c0d71bef183`
- transactions `73559673-89c7-4b70-85e4-29abf6534a9b`, `6d0dbe6e-ee8c-4b0a-b0e5-0943192fc31c`

Giữ nguyên bản ghi thật `9e9dc3fa-2c40-4b58-9906-a5bd1cfc732d`
(tx `49de3b3c...de7a`, post `252fa4b0...`, message `34649f22...`, 2 dòng transactions) — verify còn đủ.

## Bước 2 — 15 dòng không song sinh
15 donation → `status='pending_verification'`, `pending_verification_since = now()` (22/08/2026).
`is_external` giữ nguyên false. 15 post gift_celebration giữ nguyên, không badge.

## Bước 3 — Cron mềm 30 ngày
`public.btc_pending_verification_sweep(ttl_days=30)` — SECURITY DEFINER, chỉ service_role.
Cron `btc-pending-verification-sweep-daily` `10 4 * * *`.
- Nhánh A (merge): chỉ merge khi khớp CHẶT — cùng sender_id + recipient_id + amount TUYỆT ĐỐI
  + `sender_address` on-chain thuộc chính người gửi (`profiles.btc_address` hoặc
  `profile_btc_aux_addresses` chưa disabled). Không dùng khớp lỏng amount+time.
- Nhánh B (reject mềm): quá 30 ngày → `status='rejected_unverified'`, KHÔNG xoá dữ liệu, không đổi post.
- Mỗi nhánh có BEGIN/EXCEPTION riêng, log vào `pplp_v2_event_log`
  (`btc_pending_merged`, `btc_pending_rejected`, `btc_pending_sweep_run`).
- Vitest guard: `src/__tests__/btc-pending-verification-sweep.test.ts` — 11/11 pass.

## Việc riêng #8 — transactions mồ côi
`btc-manual-1775881266455` / id `92b63665-14ba-4136-905e-41a45a899eae`
user = `father` (4466cccf-...), to_address = `bc1qgxf7c63apt54h06g876y4ctq0me3jh86fta8sv`
(đúng địa chỉ thật của Father), amount 0.000099999 BTC, 11/04/2026.
=> Dòng phía NGƯỜI NHẬN của một lần bấm "Tôi đã gửi xong": `record-donation` ghi 2 dòng
transactions (sender + recipient) rồi donation bị xoá/gộp ở đợt dọn trước, để lại dòng recipient.
CHƯA xử lý theo yêu cầu.

## Việc riêng #9 — giá bất thường
`1d912189-284e-44b4-b9a4-8ab0d1d71576`: `price_usd_at_donation = 617.86871685`,
`amount_usd = 0.39`, `price_source='historical'`. 3 dòng cùng 0.00063 BTC sau đó 30' đều
`78655.34555332` → $49.55.
=> Không phải bug công thức (0.00063 x 617.87 = 0.389 — tính đúng theo giá được truyền vào).
Giá 617.87 là mức giá của BNB ngày 03/05/2026, tức nguồn giá trả về SAI TOKEN đúng 1 lần
(lookup fallback theo symbol sai). Sự cố 1 lần, không lặp lại ở 3 dòng kế. CHƯA sửa.
