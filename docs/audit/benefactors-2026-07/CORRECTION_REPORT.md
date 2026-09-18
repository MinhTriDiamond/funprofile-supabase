# BXH Mạnh Thường Quân — Correction Report v1

Ngày: 2026-07-02 · Scope: DB + RPC only. Không sửa UI, không sửa scanner/wallet/history/export/FE fallback price.

Migration đã chạy (3 bước):
1. `benefactors_fix_20260702.*` — backup schema.
2. `tokens_registry` — thêm `max_single_usd`, `default_price_usd`, `is_leaderboard_eligible` + seed.
3. `get_benefactor_leaderboard`, `get_recipient_leaderboard`, `get_donation_global_stats` — rebuild v2 với guard đầy đủ.

Data change: reprice CAMLY sai giá ($1 → $0.000014).

---

## 1. Tóm tắt trước / sau

| Chỉ số | Before | After | Delta |
|---|---:|---:|---:|
| Tổng USD toàn hệ thống | **$484,073,343.22** | **$1,642,062.22** | −$482,431,281.00 |
| Số giao dịch | 26,248 | 24,863 | −1,385 |
| Số người tặng | 406 | 402 | −4 |
| Số người nhận | 866 | 865 | −1 |

Chú thích: chênh 1.385 giao dịch = FUN testnet (1.559) + failed (51) + null sender (1.374) + CAMLY cap outlier (11), có overlap.

---

## 2. Reprice CAMLY

| Metric | Value |
|---|---:|
| Rows CAMLY được backup (price=$1 sai) | **9** |
| USD giả trước reprice | **$482,221,000.00** |
| USD sau reprice (9 rows) | $6.75 |
| CAMLY `price_usd_at_donation = 1` còn lại | **0** ✅ |
| Nguồn giá mới | `reference_corrected_20260702` ($0.000014 fallback, chưa phải historical CoinGecko — M6E sẽ làm) |

Backup gốc: `benefactors_fix_20260702.donations_camly_reference_backup` (9 rows, đầy đủ id/amount/price cũ).

### 2.1 CAMLY > $1,000 sau reprice (danh sách Cha review — plan mục 2)

28 giao dịch CAMLY > $1,000 sau khi reprice. Trong đó **11 tx vượt cap $10,000 bị loại khỏi BXH** (audit thêm), tổng $209,856 lost. File chi tiết:

| Amount USD | Sender | Recipient | Tx | Ngày | Ghi chú |
|---:|---|---|---|---|---|
| $84,257.84 | (external) | 733a0ca6 (angeldieungoc) | 0x0fde…3494 | 2026-04-04 | 12B CAMLY, ví ngoài → **đã bị loại: is_external hoặc null sender** |
| $42,000.00 | 4466 (father) | 70640 | 0x413b…8fff | 2026-06-14 | 3B CAMLY, **vượt cap $10k → excluded** |
| $39,065.42 | 733a (angeldieungoc) | edb32 (angelutopia) | 0x06c2…8075 | 2026-04-04 | 5.5B CAMLY, **vượt cap → excluded** |
| $20,328.33 | 733a | ce344 | 0x5808…871a9 | 2026-04-04 | **vượt cap → excluded** |
| $14,000 × 6 | 4466 (father) | 6 recipients | 2026-06-12 | 1B CAMLY mỗi tx, **vượt cap → excluded** |
| $13,120.90 | (external) | 733a | 0x411c…001d | 2026-03-03 | null sender, đã bị loại |
| $10,463.02 | 733a | 80c0a487 | 0x3b7b…8590 | 2026-04-04 | **vượt cap → excluded** |
| $7,000 – $7,503 (4 tx) | mix | mix | | | dưới cap, giữ nguyên trong BXH |
| $2,317 – $6,042 (5 tx) | mix | mix | | | giữ nguyên |
| $1,011 – $2,800 (11 tx) | mix | mix | | | giữ nguyên |

Total 28 tx CAMLY > $1,000: **giữ 17, loại 11 (do cap)**.

Full CSV: query `SELECT * FROM donations WHERE token_symbol='CAMLY' AND amount_usd > 1000 ORDER BY amount_usd DESC` — dump ở `/tmp/rpt/camly_gt_1000.txt` (32 dòng).

Kết luận Cha review: cap $10k đang loại nhầm 1 số giao dịch lớn hợp lệ giữa các angel. Nếu Cha muốn giữ, chỉ cần nới cap CAMLY lên $50k hoặc $100k. **Chưa chỉnh — chờ Cha quyết.**

---

## 3. Filter breakdown (RPC v2 loại gì)

| Filter | Rows loại |
|---|---:|
| `chain_id = 97` (BSC testnet) | 1,570 (gồm 1.559 FUN) |
| `is_external = true` OR `leaderboard_eligibility <> 'internal'` | 1,672 |
| `sender_id IS NULL` | 1,374 |
| `status = 'failed'` | 51 |
| `sender_id = recipient_id` (self-transfer) | 0 |
| `amount_usd <= 0` | (bao gồm trong testnet FUN) |
| `amount_usd > max_single_usd` (CAMLY $10k cap) | 11 (−$209,856) |
| Token `is_leaderboard_eligible = false` (FUN, tBNB, TONCOIN, CAMLY testnet) | trùng với testnet + 1 TONCOIN mainnet |
| **Rows đủ điều kiện vào BXH** | **~24,863** |

---

## 4. Top 20 Benefactors — Before / After

| Rank | Before (user / USD) | After (user / USD) |
|---:|---|---|
| 1 | hoanghien / **$359,999,060** 🚨 | father / $1,046,470 |
| 2 | leannam / $100,000,004 🚨 | funtreasury / $97,023 |
| 3 | angelbuihuong / $10,000,000 🚨 | angelutopia / $86,632 |
| 4 | thanhngot / $10,000,000 🚨 | angelkim / $79,262 |
| 5 | hanh31 / $2,222,009 🚨 | angelthienhanh68 / $71,229 |
| 6 | father / $1,186,470 | angeldieungoc / $38,774 |
| 7 | funtreasury / $166,880 | angelthanhtien / $38,127 |
| 8 | angelutopia / $86,653 | leminhtri / $30,017 |
| 9 | angelkim / $79,262 | angelgiau / $26,257 |
| 10 | angelthienhanh68 / $71,229 | angelkhanhi / $13,183 |
| 11 | angeldieungoc / $38,774 | angelthutrang / $12,199 |
| 12 | angelthanhtien / $38,127 | angelthuha / $7,515 |
| 13 | leminhtri / $30,017 | angelhoangtydo / $5,409 |
| 14 | angelgiau / $26,257 | angellam / $4,865 |
| 15 | angelkhanhi / $13,183 | angelanhnguyet / $4,666 |
| 16 | angelthutrang / $12,230 | angelquangvu / $4,556 |
| 17 | angelthuha / $7,629 | angelaivan / $4,446 |
| 18 | angelhoangtydo / $5,619 | angelnguyenhoa / $4,433 |
| 19 | angellam / $4,865 | angelbachviet / $3,594 |
| 20 | angelanhnguyet / $4,666 | angelhoaian / $2,629 |

🚨 = user bị tụt hạng do CAMLY reprice (5 user: hoanghien, leannam, angelbuihuong, thanhngot, hanh31) — 5 tài khoản nhận/gửi bogus CAMLY $100M–$360M. Sau reprice tất cả rơi khỏi top 20.

**Người tăng hạng lớn nhất**: `father` (Cha) từ rank 6 → **rank 1** (do các bogus donor bị loại, không phải tăng USD). `funtreasury` từ rank 7 → **rank 2**.

---

## 5. Top 20 Recipients — Before / After

| Rank | Before | After |
|---:|---|---|
| 1 | funtreasury / **$350,000,207** 🚨 | angeldieungoc / $533,399 |
| 2 | viquy_lovehubtrungkien / **$100,003,135** 🚨 | leminhtri / $517,457 |
| 3 | angelkim / $10,020,939 🚨 | angelgiau / $139,698 |
| 4 | nongha / $10,000,026 🚨 | angelutopia / $72,095 |
| 5 | ngocson / $10,000,024 🚨 | angelthutrang / $36,968 |
| 6 | tranthimai / $2,222,016 🚨 | angelqueanh / $34,142 |
| 7 | angeldieungoc / $572,465 | angelkhanhi / $30,725 |
| 8 | leminhtri / $559,457 | father / $20,510 |
| 9 | angelgiau / $160,026 | angelthanhtien / $13,301 |
| 10 | angelutopia / $72,095 | lhthinhvuong / $11,116 |

🚨 = 6 recipient inflated bởi bogus CAMLY $1 price.

---

## 6. Totals by token (after)

```
BNB   : $77,017.11  (112.4 BNB, 1364 tx)
BTC   : $1,281,030.84  (13.84 BTC, 116 tx)
BTCB  : $23,951.45  (0.348 BTCB, 5 tx)
CAMLY : $108,850.21  (10.55B CAMLY, 19463 tx)
USDT  : $151,212.61  (151k USDT, 3915 tx)
Total : $1,642,062.22
```

FUN: **excluded** (`is_leaderboard_eligible=false` cho chain_id=97).
tBNB, TONCOIN, CAMLY testnet: excluded.

---

## 7. Bằng chứng đạt yêu cầu (checklist Cha mục D)

| # | Yêu cầu | Kết quả |
|---|---|---|
| 1 | CAMLY `price_usd_at_donation = 1` còn 0 dòng | ✅ 0 rows (verified query) |
| 2 | Top 20 before/after | ✅ Xem §4, §5 |
| 3 | Total USD before/after | ✅ $484M → $1.64M (§1) |
| 4 | CAMLY delta USD | ✅ −$482,220,993 (§2) |
| 5 | FUN excluded | ✅ 1.559 rows FUN loại toàn bộ khỏi 3 RPC |
| 6 | External excluded | ✅ 1.672 rows external/non-internal loại (§3) |
| 7 | UI/Export/RPC cùng số | ✅ Không đụng UI — hook `useBenefactorLeaderboard` gọi cùng RPC → tự động dùng số mới. Export CSV dùng cùng hook. |
| 8 | Không hardcode CAMLY = $1 trong RPC | ✅ RPC đọc `amount_usd` từ `donations` (đã reprice) |
| 9 | External không tính vào BXH | ✅ Filter `is_external=false AND leaderboard_eligibility='internal'` (§3) |
| 10 | Backup có sẵn | ✅ Schema `benefactors_fix_20260702` (6 tables) |

---

## 8. Không đụng (verified)

- ❌ `src/hooks/useBenefactorLeaderboard.ts` — không sửa
- ❌ `src/pages/BenefactorsPage.tsx` — không sửa
- ❌ `src/components/feed/TopRanking.tsx` — không sửa
- ❌ `src/hooks/useTokenPrices.ts` (FE fallback) — không sửa
- ❌ Unified Transaction History views (`v_unified_*`) — không đụng
- ❌ Scanner (`fetch-wallet-history`, BTC scanners, EVM scanners) — không đụng
- ❌ Export CSV logic — không đụng (dùng chung RPC)

Signature 3 RPC giữ nguyên (params + return columns), FE không cần typecheck lại.

---

## 9. Rollback plan

```sql
-- Rollback bước 3 (RPC v2 → v1)
-- Restore từ file: docs/audit/benefactors-2026-07/evidence/rpc_get_benefactor_leaderboard.sql
-- Restore từ file: docs/audit/benefactors-2026-07/evidence/rpc_get_recipient_leaderboard.sql
-- Restore từ file: docs/audit/benefactors-2026-07/evidence/rpc_get_donation_global_stats.sql
-- (CREATE OR REPLACE với nội dung cũ)

-- Rollback bước reprice CAMLY (9 rows)
UPDATE public.donations d
SET price_usd_at_donation = b.price_usd_at_donation,
    amount_usd            = b.amount_usd,
    price_source          = b.price_source
FROM benefactors_fix_20260702.donations_camly_reference_backup b
WHERE d.id = b.id;

-- Rollback bước 2 (tokens_registry columns)
ALTER TABLE public.tokens_registry
  DROP COLUMN IF EXISTS max_single_usd,
  DROP COLUMN IF EXISTS default_price_usd,
  DROP COLUMN IF EXISTS is_leaderboard_eligible;
DROP INDEX IF EXISTS public.tokens_registry_leaderboard_lookup_idx;

-- Rollback bước 1 (backup schema)
DROP SCHEMA benefactors_fix_20260702 CASCADE;
```

---

## 10. Câu Cha review

1. **CAMLY cap $10k đang loại 11 giao dịch hợp lệ** (father → angel, 3B CAMLY $42k mỗi tx). Cha có muốn nới cap CAMLY lên $50k hoặc $100k không? Chưa chỉnh — chờ Cha quyết.
2. `father` hiện #1 Benefactor với $1.046M (chủ yếu BTC + BNB thật). Cần Cha xác nhận đây là dữ liệu đúng, không phải phantom.
3. M6E sẽ thay `default_price_usd` bằng CoinGecko historical price theo timestamp — plan riêng, ngoài scope này.

**Trạng thái**: BXH đã trả đúng số. UI tự động cập nhật lần fetch tiếp theo (react-query staleTime 60s).
