# G2 · HISTORICAL_REBUILD_PLAN — replay toàn bộ BTC lịch sử

**Spec-only.** Non-destructive. Soft-supersede. Feature flag rollback.

## 1. Strategy
**Dual-write → shadow diff → cutover.** KHÔNG rebuild in-place. KHÔNG hard-delete.

## 2. 6 bước

### Bước 1 — Fetch layer (G5)
- Lấy toàn bộ `tx_hash` distinct của `chain_family='bitcoin'` từ `donations` + `wallet_transfers` + `transactions`.
- Ước lượng: **~3.500–5.000 tx** (dựa trên G1 = 128 tx cho 3 user, extrapolate 7 user + 3 bảng).
- Fetch mempool.space concurrency ≤ 3, cache `btc_raw_tx_cache`, retry backoff.
- **Trần cứng 10.000 tx** (Cha chốt). Vượt → dừng, báo Cha.
- Ghi `fetch_errors.csv` mọi tx fetch fail.

### Bước 2 — Shadow classify
- Parser v2 chạy trên tx cache, ghi vào `btc_tx_semantic` (shadow store).
- KHÔNG đụng `donations` / `wallet_transfers` / view.
- Ghi `classifier_version='v2.0.0'`.

### Bước 3 — Diff report
Sinh `btc_rebuild_diff.csv`:
| tx_hash | vout_index | rc_code_detected | current_row (donations) | new_row (semantic) | decision |
|---|---|---|---|---|---|

`decision` enum: `add_new` | `supersede_current` | `keep_current` | `manual_review`.
Xuất per-user report cho 7 user QA.

### Bước 4 — Backfill `vout_index`
- Với row cũ `donations`/`wallet_transfers` có match 1-1 shadow → backfill `vout_index`.
- Row ambiguous (nhiều candidate vout) → giữ NULL + tag `legacy_no_vout`.
- Không cưỡng ép guess.

### Bước 5 — Soft-supersede
- Row cũ sai (RC-11/12/13/15/16/17) → set `superseded_by = <new_id>`, `integrity_status='superseded'`.
- Row cũ đúng nhưng thiếu vout_index → `integrity_status='ok'`, tag `legacy_no_vout`.
- **KHÔNG hard-delete.** Data cũ giữ nguyên cho audit + rollback.

### Bước 6 — View cutover (G6)
- Migration đảo view `v_btc_history` sang đọc từ `btc_tx_semantic` UNION ALL legacy tail.
- Migrate consumer trước:
  - `useWalletHistory`
  - `usePublicDonationHistory`
  - Benefactors / leaderboard hook
  - Treasury dashboard
  - SDK `getBtcHistory` (nếu có)
- Sau cutover: KHÔNG consumer nào đọc trực tiếp `donations`/`wallet_transfers`/`transactions` cho BTC.

## 3. Ưu tiên 3 user G1 trước (Cha chốt)
- G3 impl: shadow classify chỉ cho 3 user (utopia, kim, thienhanh68).
- QA 3 user pass → mở rộng 4 user còn lại (thuha, hoangtydo, trogiauco, father).
- Father chạy CUỐI, cần Cha duyệt từng verdict aux.

## 4. Fetch budget (Cha chốt)
- Vài nghìn tx OK.
- **Vượt 10.000 tx → dừng và báo Cha.**
- Concurrency thấp, cache, retry/backoff, log fetch errors.

## 5. Rollback (tóm tắt, chi tiết ở `ROLLBACK_PLAN.md`)
- Feature flag `scan_btc_v2_enabled=false` → v1 chạy lại ngay.
- View revert về `donations` cũ (migration đảo chiều đã prepare ở G3).
- Shadow store giữ nguyên, chỉ ngưng đọc.

## 6. Không được làm trong rebuild
- ❌ Hard-delete row cũ.
- ❌ Sửa row cũ in-place (chỉ set superseded_by + integrity_status).
- ❌ Xoá `profile_btc_aux_addresses`.
- ❌ Đụng leaderboard / benefactors trong G6 (để G7).
- ❌ Mở rộng >3 user khi 3 user G1 chưa pass QA.
