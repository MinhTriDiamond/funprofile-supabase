# Việc #1 — Xác nhận độc lập (không phụ thuộc log app) + Bước 4 đã thực thi

Ngày: 2026-08-24.

## 1. Quét multi-leg độc lập → 0 KẾT QUẢ

Query: `transactions` sau `2026-06-30 09:00Z`, group theo `tx_hash`, giữ nhóm có
`count(distinct token_symbol) > 1` (pattern đặc trưng của 1 swap = nhiều leg khác token,
cùng tx_hash).

**Kết quả: 0 dòng.**

`swap_transactions`: vẫn 46 dòng, dòng cuối 30/06/2026 09:00Z.

## 2–3. Kết luận nhánh

⇒ **Nghiêng về nhánh (a): không ai dùng Swap từ 01/07/2026.** Không có bằng chứng độc lập
nào cho thấy có swap thật bị fail silent. Hạ **P0 → P1 "quan sát tiến"** như đã đề xuất.
Lưu ý giới hạn bằng chứng: nếu swap on-chain xảy ra mà scanner cũng không ghi vào
`transactions`, phép quét này sẽ không thấy — nên P1 vẫn giữ, không đóng.

## 4. Đã thực thi (không đổi hành vi nghiệp vụ swap)

- **Bảng `swap_failures`** (khuôn `signup_failure_log` + dedup của `token_price_fetch_failures`):
  `tx_hash, chain_id, user_id, stage, reason, http_status, sqlstate, error_message,
  context jsonb, attempts, first_failed_at, last_failed_at, notified_at`.
  UNIQUE `(coalesce(tx_hash,''), coalesce(chain_id,-1), stage)` ⇒ lần lỗi sau tăng `attempts`.
  RLS: chỉ admin SELECT; ghi qua RPC `log_swap_failure` (SECURITY DEFINER, chỉ `service_role`).
- **7 nhánh nuốt lỗi ở `record-swap` nay đều ghi log bền**: `invalid_body`, `validation`,
  `verify_provider_error` (Moralis outage), `invalid_tx`, `verify_transient`, `insert_error`,
  `audit_log`, `unhandled`. Mọi lần ghi log là best-effort — không chặn/không đổi verdict swap.
- **FE `SwapTab.tsx`**: bỏ hàng đợi `localStorage['pendingSwapRecords']` (không có consumer),
  thay bằng gọi edge mới `log-swap-failure` (stage `client_record_failed`). Toast cho user
  giữ nguyên nguyên văn.
- **Badge admin**: `SwapFailuresBadge` hiển thị số lỗi 7 ngày / 30 ngày / tổng attempts +
  stage mới nhất, đặt trong tab "Đối soát ví đa chuỗi" (`/admin`). **Chưa** push notification
  chủ động (đúng yêu cầu).
