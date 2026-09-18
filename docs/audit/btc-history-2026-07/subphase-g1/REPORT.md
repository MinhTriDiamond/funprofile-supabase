# Sub-phase G1 — BTC Semantic Specification & History Truth Audit

**Ngày:** 2026-07-03
**Trạng thái:** COMPLETED — audit + spec only, không sửa code/DB/UI.
**Yêu cầu Cha:** duyệt `BTC_SEMANTIC_SPEC.md` trước khi mở G2.

## 1. Kết luận nhanh

- Fetched **128 tx** từ mempool.space (7 tx cache từ Sub-phase F, 118 tx fetch mới, 3 tx cache từ semantic/) — **0 fetch error**.
- Truth table cho 3 user trọng tâm: **316 rows** (mọi vout của mọi tx liên quan).
- **`unexplained.csv` = 0** ✅ — Spec draft giải thích được 100% row DB sai.
- Phát hiện **7 RC-code có evidence thật**, trong đó **5 code mới** (RC-11, RC-12, RC-13, RC-15, RC-16, RC-17 — bổ sung ngoài RC-10).

## 2. Kết quả diff

| Metric | Value |
|---|---|
| DB donation rows (3 core) | 122 |
| DB wallet_transfer rows (3 core) | 73 |
| Tx phân tích | 128 |
| Coinjoin tx (>1 sender owner) | 3 |
| Rows unexplained | **0** |
| Missing donation rows (RC-13) | 53 |

### RC counts (rows flagged)

| RC | Định nghĩa ngắn | Rows |
|---|---|---|
| RC-15 | is_external sai (cả 2 phía nội bộ mà vẫn true) | 62 |
| RC-11 | Double attribution (1 tx → nhiều donation cho cùng recipient) | 28 |
| RC-12 | chain_family='evm' cho tx BTC | 27 |
| RC-16 | Coinjoin bị attribution sender | 3 |
| RC-17 | Change output bị nhận diện là recipient | 1 |
| RC-13 | On-chain có vout mà DB thiếu row | 53 |

## 3. Per-user

### 3.1 `angelutopia`
- **tx sai:** 32 / 61 tx liên quan.
- **Symptom nổi bật:**
  - 0.5 BTC → angelgiau (tx `40f8c056…`): thực chất là transfer nội bộ (self-address bc1qfxr7dw70sqrsq34w8la46pl7xheqfdcyujnm4n vốn nằm trong aux của angelutopia) nhưng bị flag `is_external=true` (RC-15). Angelgiau không có trong vout.
  - 0.907 BTC → angelthienhanh68 (tx `1da80ffa…`): tx coinjoin (2 sender inputs) → RC-16. Không được attribute.
- **Missing rows:** 1.

### 3.2 `angelkim`
- **tx sai:** 41 / 46 tx liên quan — **nặng nhất**.
- **Symptom nổi bật:**
  - 1.018 BTC → angelgiau (tx `2f38060e…`): 1 tx trên chain sinh 2 donation trong DB (RC-11) — chỉ 1 vout thực thuộc angelgiau.
  - 0.151 BTC → angelthutrang (tx `05a78ade…`): trên chain là batch payout 13 vout, sender vin (bc1qm34l…) đúng là 1 aux của angelkim; nhưng `is_external=true` (RC-15). Ngoài ra DB còn thiếu 4 vout khác thuộc chính angelkim (RC-13).
  - 27 tx được đánh `chain_family='evm'` cho hash BTC (RC-12) — chủ yếu các tx nhỏ.
- **Missing rows:** 38 — rất nhiều batch payout mất vout.

### 3.3 `angelthienhanh68`
- **tx sai:** 14 / 19 tx liên quan.
- **Symptom nổi bật:**
  - 0.907 BTC ↔ angelutopia (tx `1da80ffa…`): coinjoin (RC-16). DB đang gán angelthienhanh68→angelutopia; on-chain vin có input của cả 2 → không được attribute.
- **Missing rows:** 1.

## 4. Sau khi áp spec đúng, mỗi user thấy gì?

### `angelutopia`
- Loại bỏ 32 dòng sai (mostly `is_external` fix + change/self detection).
- 0.5 BTC `40f8c056…` chuyển sang **wallet_transfers internal** (không phải "tặng angelgiau").
- Tx coinjoin 0.907 BTC hiển thị `needs_review`.

### `angelkim`
- 27 tx đang mất khỏi UI vì `chain_family='evm'` → sẽ hiện lại thành BTC.
- Batch payout `05a78ade…`: thay vì 2 dòng "gửi angelthutrang" trùng nhau, sẽ hiện 1 dòng gửi angelthutrang + 4 dòng self-transfer + N external_out.
- 53 vout thiếu sẽ được backfill.

### `angelthienhanh68`
- Bỏ 1 dòng coinjoin sai → chuyển sang review.
- 13/19 tx còn lại giữ nguyên (đã đúng).

## 5. Deliverables

```
docs/audit/btc-history-2026-07/subphase-g1/
├── REPORT.md                        (file này)
├── BTC_SEMANTIC_SPEC.md             (draft SSOT — cần Cha duyệt)
└── evidence/
    ├── raw_tx/                      (128 JSON từ mempool)
    ├── ownership_map.csv            (1553 addr trusted)
    ├── ownership_map_full.csv       (1818 addr full)
    ├── tx_hashes_3users.txt         (125 tx unique)
    ├── rows_donations_3users.csv    (122)
    ├── rows_wallet_transfers_3users.csv (73)
    ├── semantic_diff.csv            (122 rows chấm RC)
    ├── unexplained.csv              (0 rows ✅)
    ├── missing_donations.csv        (53 rows RC-13)
    ├── truth_table_3users.csv       (316 rows)
    ├── fetch_errors.csv             (0)
    └── summary.json
```

## 6. Fetch budget đã dùng

- Concurrency: 1 (sequential).
- Rate limit: 300ms/req (~3 req/s).
- Cache: raw JSON per `txid.json`; không refetch nếu file đã có.
- Retry: 3 lần với backoff 2s→5s→10s cho HTTP 429.
- Errors: **0**.

## 7. Rollback

**N/A** — G1 không sửa gì (không migration, không edge, không UI).

## 8. Cần Cha duyệt (chờ trước G2)

1. `BTC_SEMANTIC_SPEC.md` §12 — 5 câu hỏi policy (Father, coinjoin, RC-12, RC-11 idempotency, hd_change_auto re-verify).
2. Sub-phase G2 (viết Rebuild Plan theo spec) có được mở sau khi Cha duyệt spec không?
3. Có mở rộng truth table cho `angelthuha / angelhoangtydo / trogiauco / father` ở G2 không, hay để G3?

## 9. Không làm ở G1 (giữ nguyên cam kết)

- ❌ Không sửa scanner / edge function.
- ❌ Không tạo migration.
- ❌ Không disable thêm aux address.
- ❌ Không flag thêm donation.
- ❌ Không sửa leaderboard / benefactors / UI.
- ❌ Không xử lý data Father.
