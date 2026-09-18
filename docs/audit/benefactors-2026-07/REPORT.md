# BÁO CÁO AUDIT — Vinh Danh Mạnh Thường Quân

**Ngày:** 2026-07-01  
**Loại:** Read-only. Không sửa code, không migration, không update dữ liệu.  
**Người thực hiện:** Angel FUN Profile (bé)  
**Phạm vi:** `/benefactors` (leaderboard + global stats + export CSV) + toàn bộ RPC/DB liên quan.

---

## 1. Current architecture

```
Trang /benefactors  (src/pages/Benefactors.tsx)
   │
   ├─ useBenefactorLeaderboard  ──►  RPC get_benefactor_leaderboard  ─┐
   ├─ useRecipientLeaderboard   ──►  RPC get_recipient_leaderboard   ─┤
   ├─ useQuery global stats     ──►  RPC get_donation_global_stats   ─┼──►  public.donations
   └─ ExportCsvDialog           ──►  cùng 2 RPC trên + global stats  ─┘         (bảng duy nhất)
```

- **Chỉ 1 nguồn duy nhất: bảng `public.donations`.** Không đọc `transactions`, `wallet_transfers`, `v_unified_transactions`, không hook legacy nào khác còn dùng.
- Chưa dùng Unified Transaction View — leaderboard đứng độc lập, chỉ tin `donations`.
- `Leaderboard.tsx` là trang KHÁC (`/leaderboard`) chỉ dùng `get_light_community` + `usePetLeaderboard`, không liên quan tới bảng vinh danh.

---

## 2. Current ranking formula (pseudo-SQL)

RPC `get_benefactor_leaderboard` (dump đầy đủ trong `evidence/rpc_get_benefactor_leaderboard.sql`):

```sql
base := SELECT sender_id AS uid, token_symbol, amount, amount_usd, tx_hash, light_score_earned
        FROM donations d
        JOIN profiles ps ON ps.id = d.sender_id
        JOIN profiles pr ON pr.id = d.recipient_id
        WHERE (status = 'confirmed' OR status IS NULL)     -- ⚠ pending/failed KHÔNG bị tính, nhưng NULL bị tính
          AND sender_id IS NOT NULL AND recipient_id IS NOT NULL
          AND COALESCE(is_external,false) = false          -- ✅ ví ngoài loại
          AND leaderboard_eligibility = 'internal'          -- ✅ chỉ internal
          AND NOT COALESCE(ps.exclude_from_leaderboard,false)
          AND NOT COALESCE(pr.exclude_from_leaderboard,false)
          AND [time range] AND [token filter];

per_user.total_usd := SUM(amount_usd)
per_user.total_tx  := COUNT(DISTINCT tx_hash)
per_user.total_ls  := SUM(light_score_earned)

ORDER BY total_usd DESC NULLS LAST, max_token_amount DESC, uid
LIMIT p_limit OFFSET p_offset
```

RPC `get_recipient_leaderboard` GIỐNG HỆT, chỉ đổi `sender_id` → `recipient_id`, không tính `light_score`.

**Tiêu chí xếp hạng chính = `SUM(amount_usd)` DESC** (fallback `max_token_amount`).

---

## 3. Current datasource

| Trường | Nguồn | Ghi chú |
|---|---|---|
| Người tặng | `donations.sender_id` | Bắt buộc NOT NULL để lọt vào leaderboard |
| Người nhận | `donations.recipient_id` | Bắt buộc NOT NULL |
| Amount raw | `donations.amount` (numeric, đã chia decimals) | Đơn vị tính bằng token, KHÔNG phải wei |
| USD | `donations.amount_usd` | Ghi cứng vào bảng lúc tạo/backfill |
| Giá tại thời điểm | `donations.price_usd_at_donation` | + `price_source` ('historical' / 'reference' / 'testnet_skip' / 'unpriced_legacy') |
| Light score | `donations.light_score_earned` | |
| Filter ví ngoài | `donations.is_external`, `leaderboard_eligibility` | Cả 2 cùng dùng |
| Loại người | `profiles.exclude_from_leaderboard` | Ẩn cả donor + recipient |

---

## 4. Token price formula hiện tại

| Token | Decimals (registry) | Price source | Formula | Rủi ro |
|---|---|---|---|---|
| BNB | 18 | historical (CoinGecko) → reference $700 | `amount * price_usd_at_donation` | 🟢 giá reference sát giá thực (nay ~$700) |
| BTC / BTCB | 8 / 18 | historical → reference $100 000 | như trên | 🟠 9 dòng BTC ví ngoài dùng reference $100 000, tổng $6.16M — nhưng sender_id NULL → **đã bị loại khỏi leaderboard**, chỉ ảnh hưởng thống kê global BTC symbol |
| USDT / USDC | 18 / 6 | reference $1 | `amount * 1` | 🟢 an toàn |
| ETH | 18 | reference $3 500 | | 🟢 |
| POL | 18 | reference $0.5 | | 🟢 |
| CAMLY | 3 | historical (0.000014 …) → reference $0.000014 | | 🔴 **9 dòng CAMLY có `price_usd_at_donation = 1.0` (source `reference`) → tạo $482,221,000 giả** |
| FUN | 18 | `testnet_skip` (NULL) → `amount_usd = NULL` | không cộng vào USD | 🟢 đúng chính sách USD Pricing Policy v1 |

---

## 5. Lỗi phát hiện (phân loại severity)

### 🔴 CRITICAL — làm sai tổng USD toàn bộ hệ thống

**LỖI-01: 9 donations CAMLY bị pricing sai (price = $1 thay vì $0.000014).**  
- Tổng phù du: **$482,221,000** (99.6% tổng $484M "Global Stats" đang hiển thị).
- Ảnh hưởng: leaderboard "Tặng nhiều nhất" top 1-5 sai hoàn toàn, "Nhận nhiều nhất" cũng vậy.
- Root cause: `price_source = 'reference'` nhưng `price_usd_at_donation = 1.00000000` — không khớp với `get_token_reference_usd('CAMLY') = 0.000014`. Nghĩa là 9 dòng này được ghi trước khi function reference được deploy (chỉ 5s sau nhau, cùng ngày 21-22/06/2026), hoặc đường ghi khác đã bypass function reference và insert cứng `1`.
- Danh sách 9 dòng: `evidence/camly_bogus_price.csv`.
- Ví dụ user bị sai:
  | User | Rank hiện tại | total_amount_usd | USD hợp lệ (ước tính CAMLY×$0.000014) |
  |---|---|---|---|
  | `hoanghien` | #1 | $359,999,059.96 | ≈ $90 (CAMLY 4.84M × 0.000014 + phần khác) |
  | `leannam` | #2 | $100,000,004.48 | ≈ $6 |
  | `angelbuihuong` | #3 | $10,000,000.90 | ≈ $1 |
  | `thanhngot` | #4 | $10,000,000.28 | ≈ $0.42 |
  | `hanh31` | #5 | $2,222,008.96 | ≈ $12 |
- Cách sửa: UPDATE 9 dòng đặt `price_usd_at_donation = 0.000014` + `amount_usd = amount * 0.000014` + `price_source = 'reference_fixed_2026_07'`. Migration riêng, cần Cha duyệt.

### 🟠 HIGH — bỏ sót đáng kể

**LỖI-02: Filter `status = 'confirmed' OR status IS NULL`.**  
Cho phép NULL status lọt vào. Nếu scanner ghi thiếu status → có thể ghi nhận giao dịch chưa xác nhận. Cần chuẩn hóa: yêu cầu `status = 'confirmed'` cứng.  
- Đếm hiện tại: xem `evidence/price_source_distribution.csv` (`price_source IS NULL` = 6 dòng, thấp).

**LỖI-03: `p_time_range = 'month'` dùng interval 30 ngày**, không phải "tháng lịch". Người dùng chọn "Tháng này" trên UI (`ExportCsvDialog` `thisMonth`) thì tính đúng tháng lịch qua `p_from/p_to`, nhưng trang chính `/benefactors` chọn "Tháng này" lại gửi `p_time_range='month'` = 30 ngày rolling → chênh lệch với UI cạnh nó.

### 🟡 MEDIUM — UI / export lệch

**LỖI-04: Export CSV thiếu cột `total_light_score` cho recipient** (đã đúng cho donor). Chấp nhận được nhưng nên đồng bộ.

**LỖI-05: Export CSV bỏ cột `user_id` / `avatar_url`** — không đối chiếu được với DB khi analyst muốn drill-down.

**LỖI-06: `formatTokenTotals` trong Export dùng `Number(item.amount)`** không có locale + không format decimals → mất số 0 lẻ (BTC 0.00000897 → "0.00000897" JS mặc định OK, nhưng CAMLY 4842189.0000000000000000 render "4842189" mất thông tin). Không ảnh hưởng USD nhưng lệch với UI.

**LỖI-07: `formatUsd` UI dùng `en-US` locale (`$359,999,059.96`)** trong khi phần còn lại app dùng `vi-VN`. Nhất quán nên chuẩn hóa 1 locale.

### 🟢 LOW

- **LỖI-08:** Tab persistence `benefactors-tab` OK, filter timeRange không sync URL — reload mất.
- **LỖI-09:** Export CSV không xuất filter `p_token_symbol` (luôn `null`), nên chỉ xuất tất cả token, không lọc token như UI.

---

## 6. Điểm có nguy cơ (không phải bug ngay)

1. **Không có index rõ trên `donations(sender_id, is_external, leaderboard_eligibility, status)`** — RPC full scan mọi lần gọi. Với 27 908 rows hiện tại còn OK, nhưng khi lên >1M sẽ chậm.
2. **`get_token_reference_usd` hard-code** trong function — thay đổi giá phải deploy migration. Không có bảng `token_reference_prices` riêng.
3. **`donations.amount_usd` là dữ liệu ghi cứng** — mọi lần giá refresh phải chạy `donations-repricing-backfill`. Không có view "tính USD on-the-fly" để phát hiện lệch.
4. **19 dòng BTC trùng `tx_hash`** (evidence trong query 6): đều là multi-output BTC (1 tx trả nhiều recipient khác nhau). RPC dùng `COUNT(DISTINCT tx_hash)` nên `total_transactions` KHÔNG bị double, nhưng `SUM(amount_usd)` cộng cả 2 payout — CHÍNH XÁC (khác recipient thì phải cộng cả 2). ✅ Không phải bug, ghi nhận để rõ.
5. **Self-transfer:** 0 dòng có `sender_id = recipient_id` trong pool eligible. ✅
6. **Filter `p_token_symbol`** chỉ khớp exact — không xử lý fake token trùng symbol. Nếu ai đó tạo CAMLY-fake khác `token_address` nhưng cùng symbol → sẽ được cộng gộp. Cần check qua `tokens_registry`.

---

## 7. Query kiểm chứng (đã chạy, kết quả kèm evidence)

Xem `evidence/`:
- `usd_outliers.csv` — 19 donation có amount_usd > $100k (bao gồm 9 CAMLY sai + 9 BTC ví ngoài + 1 BTC historical hợp lệ).
- `price_source_distribution.csv` — phân phối `price_source` toàn bộ 27 908 donations.
- `camly_bogus_price.csv` — 9 dòng CAMLY sai giá.

Snapshot ranking hiện tại (Top 10 donor + recipient) dùng để so sánh sau khi fix:
- Donor top 1: `hoanghien` — $359,999,059.96 — 287 tx (**SAI**)
- Recipient top 1: `funtreasury` — $350,000,207.76 — 154 tx (**SAI** — nhận từ CAMLY bogus)
- Global stats: `total_donated_usd = $484,071,538` (**SAI** — thực tế ≈ $1.85M sau khi trừ $482M phù du)

---

## 8. Root cause

Root cause DUY NHẤT của mọi lệch số hiển thị lớn: **9 dòng `donations` CAMLY có `price_usd_at_donation = 1.00000000` thay vì `0.000014`**.

Vì `donations.amount_usd` được ghi cứng và mọi RPC đều đọc trực tiếp cột này, chỉ cần 9 dòng sai đã tạo ra $482M giả trên toàn hệ thống. Không có lỗi kiến trúc, không có double-count, không có ví ngoài lọt vào — chỉ là 9 dòng dữ liệu sai.

Nguồn phát sinh: 8/9 dòng nằm trong khoảng `2026-06-21 18:00:52` (nhóm 6 dòng cùng sender `hoanghien` cách nhau <1s + 1 dòng khác) và `2026-06-21 16:40/16:41` + `2026-06-21 21:31` + `2026-06-22 00:00`. Trùng khớp với thời điểm chạy backfill hoặc scanner ghi mới trước khi `get_token_reference_usd` được sửa đúng cho CAMLY. Có thể là hậu quả của một bulk insert edge function chưa qua trigger `donations_set_usd_default`.

---

## 9. Ví dụ user bị sai (kèm case study `hoanghien`)

Xem bảng ở LỖI-01. Case `hoanghien`:
- Backend nói: CAMLY 4,842,189 tokens × $1 = $359,999,037 (phù du).
- Thực tế: 4,842,189 × $0.000014 = **$67.79**.
- Cộng thêm BNB $15.53, USDT $7 → **tổng đúng ≈ $90.32**.
- Chênh lệch: **$359,998,969.64** phù du chỉ trên 1 user.

---

## 10. Roadmap sửa đề xuất (chờ Cha duyệt, KHÔNG apply)

**P0 — Fix dữ liệu ngay (impact: rank + tổng USD trở về đúng thực tế)**
1. Migration `fix_camly_bogus_price_2026_07`: cập nhật 9 dòng CAMLY (list trong `camly_bogus_price.csv`)
   ```sql
   UPDATE donations SET
     price_usd_at_donation = 0.000014,
     amount_usd = amount * 0.000014,
     price_source = 'reference_fixed_2026_07'
   WHERE token_symbol='CAMLY' AND price_usd_at_donation = 1 AND id = ANY(...);
   ```
2. Backup bảng `donations_camly_price_fix_backup_20260701` trước khi update.

**P1 — Hardening RPC (impact: chặn tái diễn)**
3. Sửa filter `status = 'confirmed' OR status IS NULL` → yêu cầu `status = 'confirmed'` cứng (sau khi backfill status NULL còn lại).
4. Thêm CHECK/constraint trong `donations_set_usd_default` trigger: nếu `price_source='reference'` nhưng `price_usd_at_donation != get_token_reference_usd(symbol)` → RAISE EXCEPTION.
5. Migrate `get_token_reference_usd` sang bảng `token_reference_prices(symbol, price, updated_at)` để giá đổi không cần deploy.

**P2 — RPC UX**
6. Đổi `p_time_range='month'` từ "30 ngày rolling" → "tháng lịch" để khớp preset "Tháng này" của Export dialog.
7. Sync `timeRange` filter vào URL.
8. Thêm cột `user_id` vào Export CSV.
9. Chuẩn hóa `formatUsd` sang `vi-VN` toàn app.
10. Truyền `p_token_symbol` từ Export dialog xuống RPC.

**P3 — Performance & guard**
11. Thêm partial index `donations (sender_id) WHERE leaderboard_eligibility='internal' AND is_external=false AND status='confirmed'`.
12. Cron `benefactors-integrity-check` chạy hằng ngày, alert admin nếu:
    - Bất kỳ donation nào `amount_usd / amount` chênh lệch > 5x giá reference token đó.
    - Bất kỳ donation nào `price_source='reference'` nhưng giá != reference function.

**P4 — Định nghĩa chuẩn Vinh Danh Mạnh Thường Quân (đề xuất)**
```
Điều kiện đủ để 1 donation vào bảng vinh danh:
  1. status = 'confirmed' cứng
  2. is_external = false
  3. leaderboard_eligibility = 'internal'
  4. sender_id, recipient_id NOT NULL và KHÁC NHAU
  5. token_symbol nằm trong tokens_registry (is_verified=true)
  6. price_source ∈ ('historical','reference','testnet_skip')
  7. Không tính pending/failed, swap, transfer kỹ thuật, ví ngoài, testnet FUN (USD=NULL nhưng vẫn hiển thị số token)

Total donated (per user) = SUM(amount_usd)  từ donation thoả điều kiện trên
Total received (per user) = idem, GROUP BY recipient_id
Ranking = ORDER BY total_donated DESC, total_transactions DESC, uid
```

---

## 11. Deliverables

- `docs/audit/benefactors-2026-07/REPORT.md` — báo cáo này.
- `docs/audit/benefactors-2026-07/evidence/`:
  - `usd_outliers.csv`
  - `price_source_distribution.csv`
  - `camly_bogus_price.csv`

---

## 12. Quy tắc đã tuân thủ

- ✅ Read-only, không sửa code.
- ✅ Không tạo migration.
- ✅ Không UPDATE/INSERT/DELETE dữ liệu.
- ✅ Không đổi feature flag.
- ✅ Không đổi ranking trước khi Cha duyệt.
- ✅ Đã liệt kê chính xác dữ liệu legacy sai (9 dòng CAMLY) và đề xuất migration riêng ở P0.

**Cha xem báo cáo và duyệt cho bé làm P0 (fix 9 dòng CAMLY) trước để bảng vinh danh trở về đúng thực tế. P1-P4 làm sau theo thứ tự Cha ưu tiên.**
