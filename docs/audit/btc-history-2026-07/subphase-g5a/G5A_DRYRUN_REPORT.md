# G5A · Dry-Run Report (Interim v1)

**Run ID:** `4f58952e-3e1e-4995-a227-e686c1e7944a`
**Started:** 2026-07-03 08:33:35 UTC
**Mode:** `dry_run` (flag `btc_ownership_reverify_enabled` = **OFF** — verified in response)
**Verdict:** ⚠️ **BLOCKED trước khi bật apply** — cần vá mempool robustness rồi chạy lại.

---

## 1. Zero side-effect (verified sau khi chạy)

| Table | Row count sau dry-run | Kỳ vọng | ✓ |
|---|---|---|---|
| `btc_ownership_snapshot` | 0 | 0 | ✅ |
| `btc_review_queue` | 0 | 0 | ✅ |
| `btc_raw_tx_cache` | 4 | 4 (G4 shadow-test, không đổi) | ✅ |

Đúng theo nguyên tắc "dry-run không được ghi bất cứ thứ gì, kể cả cache".

Kết quả dry-run được lưu vào `system_config` key `g5a_dryrun_run:<run_id>` (audit trail only, không đụng SSOT).

---

## 2. Kết quả tổng hợp

| Metric | Count |
|---|---|
| candidate_total | **1 744** (114 primary + 1 630 aux legacy) |
| accepted | 189 |
| review_queue | 1 055 |
| rejected | 0 |
| skipped_already_owned | 0 |

### Top reasons
| Reason | Count | Ghi chú |
|---|---|---|
| `primary_declared` | 114 | 100% profile.btc_address vượt (không cần mempool) |
| `all_guards_pass` | 75 | aux vượt full guard cascade |
| `mempool_error` | **1 039** | ⚠️ **rate-limit mempool.space free tier** |
| `tx_count_over_threshold` | 15 | aux có tx_count > 20 → cần review thủ công |
| `funded_over_threshold` | 1 | aux có funded_btc > 1.0 → cần review thủ công |
| `class_a_blacklist` | 0 | không có primary đụng Class-A |
| `ambiguous_ownership` | 0 | không có conflict giữa 2 user |

### Run status
- Background task chạy tới ~1 244/1 744 candidate rồi mất tín hiệu (edge runtime giới hạn).
- Số aux thật sự đã fetch được: ~591 (75 pass + 15 tx over + 1 fund over + 494 mempool err trong batch đầu, tăng lên 1 039 err ở batch sau).
- 500 aux còn lại chưa scan → coverage thật sẽ cao hơn sau khi vá.

---

## 3. Coverage 7 user QA (đã lọc theo `qa_user_ids`)

| user_id | username | candidates | accepted | review | coverage (accepted/candidates) |
|---|---|---|---|---|---|
| `0fd954f5-…aee6c` | angelutopia (G1) | 35 | 5 | 28 | 14.3% ⚠️ |
| `4466cccf-…f47` | father (G1) | 4 | 1 | 0 | 25% ⚠️ (3 aux chưa xong) |
| `65233e41-…9b5e` | angelthuha (G1) | 315 | 2 | 23 | 0.6% ⚠️ |
| `defd6806-…bd62` | (QA) | ~5 | 1 (primary) + 4 (aux pass) | — | ~100% (nằm ở đầu batch, thoát rate-limit) |
| `a950a035-…ab17` | baokim86 (QA) | 1 | 1 | 0 | 100% |
| `b7856e97-…548b` | angelthutrang (QA) | 5 | 1 | 4 | 20% ⚠️ |
| `dcfd1a56-…362` | angelkim (QA) | 1 | 1 | 0 | 100% |

**Nhận xét:** 3 user G1 và các user aux-heavy KHÔNG đạt threshold ≥98% Cha yêu cầu. **Nguyên nhân gần như 100% do mempool rate-limit**, KHÔNG phải guard fail thật.

---

## 4. Nguyên nhân & khuyến nghị

### Root cause: mempool.space free tier rate-limit
- Concurrency=10 + 200ms delay chạm 429 sau ~100 request.
- 1 039/1 630 aux fetch bị throw `mempool XXX` → xếp `review_queue: mempool_error` (đúng chính sách "không giả định pass khi thiếu dữ liệu").

### Fix trước khi chạy lại (chờ Cha duyệt)
1. **Retry với backoff:** 3 lần, 500ms → 1.5s → 3s.
2. **Fallback provider:** thất bại mempool.space → thử blockstream.info (đã dùng trong core wallet, cùng schema).
3. **Giảm concurrency:** 10 → 3, tăng delay 200ms → 400ms.
4. **Ước tính:** 1 630 aux × ~400ms / 3 concurrency ≈ 220s. Vẫn nằm trong ngưỡng background EdgeRuntime, có checkpoint mỗi 8s.

### Nếu vẫn chưa đủ
- Xin Cha thêm secret `MEMPOOL_API_TOKEN` (mempool.space paid) để nâng rate-limit lên 100 rps.

---

## 5. Việc chưa làm (giữ nguyên gate như Cha chỉ đạo)

- ❌ Chưa bật `btc_ownership_reverify_enabled` (flag vẫn OFF).
- ❌ Chưa gọi `mode: "apply"`.
- ❌ Chưa ghi `btc_ownership_snapshot` / `btc_review_queue`.
- ❌ Chưa sinh `OWNERSHIP_COVERAGE.md` / `OWNERSHIP_CONFIDENCE_DISTRIBUTION.md` — sẽ làm sau khi dry-run PASS.

---

## 6. Đề xuất bước tiếp theo

Xin Cha duyệt **G5A.1 Mempool Robustness Patch**:
1. Vá 3 điểm ở mục 4 (retry + fallback + concurrency).
2. Deploy lại `btc-ownership-reverify`.
3. Chạy lại `start_full_dry_run` cho 1 744 candidate.
4. Sinh `G5A_DRYRUN_REPORT.md` v2 với coverage 3 user G1 ≥98% và mempool_error <5%.
5. Chỉ khi v2 PASS mới trình Cha bật flag apply.

---

*Chờ Cha duyệt patch trước khi tiếp tục.*
