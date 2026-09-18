# record-swap · USD validation — Phương án A, GIAI ĐOẠN 1 (LOG-ONLY)

Ngày bắt đầu: 2026-08-17 · Trạng thái: **đang quan sát, CHƯA enforce**

## 1. Thiết kế (đúng mô hình `donations_set_usd_default()`)

- Bảng log: `public.swap_price_validation_log`
  (`swap_id`, `tx_hash`, `chain_id`, `side` from|to, `token_symbol`, `swap_date`,
  `amount`, `code_amount_usd`, `code_price_usd`, `history_price_usd`, `diff_pct`,
  `verdict`, `phase`). RLS: **admin-only SELECT**, `service_role` ghi.
  Không tái dùng `donation_price_validation_log` vì schema gắn `donation_id`
  và chỉ có 1 leg, còn swap có 2 leg (out/in).
- Trigger `AFTER INSERT ON swap_transactions` → `swap_price_validation_logonly()`
  (SECURITY DEFINER, `REVOKE ALL FROM PUBLIC/anon/authenticated`).
  So sánh USD client khai với `token_price_history` **cùng ngày**, ghi 1 row / leg.
- **KHÔNG** ghi lại `from_amount_usd` / `to_amount_usd`. Giá đang lưu không đổi.

### Verdict
| verdict | nghĩa |
|---|---|
| `testnet_skip` | leg là FUN (token testnet, không có giá thị trường) |
| `no_code_price` | client không khai USD, nhưng có giá lịch sử |
| `no_code_no_history` | client không khai USD và không có giá lịch sử |
| `no_history` | client khai USD nhưng không có giá lịch sử để đối chiếu |
| `ok` | lệch ≤ 2% |
| `would_fail` | lệch > 2% — **ở Giai đoạn 2 sẽ bị gạt sang NULL** |

## 2. Baseline dữ liệu cũ (46 swap, đối chiếu tại thời điểm bật)

| verdict | leg | swap |
|---|---|---|
| `no_code_price` | 86 | 46 |
| `no_code_no_history` | 6 | 6 |

⇒ **0% swap cũ có USD client khai** — 3 cột `from_amount_usd`/`to_amount_usd`/`quote_id`
mới thêm ở M6B, chưa có dữ liệu. Vậy tỷ lệ lệch >2% **chỉ đo được từ swap MỚI**
sau khi trigger hoạt động. Cần đủ 24–48h swap thật mới có số liệu kết luận.

## 3. Báo cáo cần chạy sau 24–48h

```sql
select verdict, count(*) legs, count(distinct swap_id) swaps,
       round(avg(diff_pct)::numeric, 2) avg_diff,
       round(max(diff_pct)::numeric, 2) max_diff
from public.swap_price_validation_log
where phase = 'log_only' and created_at > now() - interval '48 hours'
group by 1 order by 2 desc;
```

Tiêu chí trình CTO: **% leg có `would_fail`** trên tổng leg có cả USD khai + giá lịch sử.

## 4. Giai đoạn 2 (enforce) — CHƯA LÀM

Chỉ thực hiện sau khi CTO xem số liệu log-only. Khi bật:
`would_fail` ⇒ `amount_usd = NULL`, verdict `validation_failed`, swap **vẫn được ghi**.

## 5. Vitest guard

`src/__tests__/swap-price-validation.test.ts` — **11/11 pass**, mirror ở
`src/lib/swapPriceValidation.ts`:
- Giai đoạn 1: 7 case, có case **bất biến** khẳng định log-only không đổi giá đang lưu.
- Giai đoạn 2: 4 case cho hành vi enforce dự kiến.
