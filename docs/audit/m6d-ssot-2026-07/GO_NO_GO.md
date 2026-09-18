# Go / No-Go — M6E Statistics SSOT

Ngày: 2026-07-01.

---

## Trạng thái các phần

| Deliverable | Trạng thái | File |
|---|---|---|
| 1. M6B-1 BEFORE_AFTER report | ✅ | `docs/audit/m6b-td05-fix/BEFORE_AFTER.md` |
| 2. M6B-1 Draft SQL view | ✅ (chưa apply) | `docs/audit/m6b-td05-fix/DRAFT_VIEW_MIGRATION.sql` |
| 3. M6B-2 record-swap spec | ✅ | `docs/audit/m6b-swap-recorder/SPEC.md` |
| 4. M6B-3 scanner race report | ✅ | `docs/audit/m6b-scanner-race/REPORT.md` |
| 5. M6D RPC_MATRIX | ✅ | `docs/audit/m6d-ssot-2026-07/RPC_MATRIX.csv` |
| 6. M6D SSOT_SPEC | ✅ | `docs/audit/m6d-ssot-2026-07/SSOT_SPEC.md` |
| 7. M6D CONSUMER_GAPS | ✅ | `docs/audit/m6d-ssot-2026-07/CONSUMER_GAPS.md` |

## Bé khuyến nghị Cha duyệt theo thứ tự

1. **M6B-1** (view dedup) — **GO** khi Cha xác nhận: (a) chấp nhận loại 2 894 dòng FUN testnet khỏi view; (b) chấp nhận thêm swap 2 leg (partition theo direction). Rủi ro: thấp, rollback dễ.

2. **M6B-2** (record-swap) — **GO** với 4 câu hỏi đã có sẵn spec. Không blocker cho M6B-1.

3. **M6B-3** (scanner) — **HOLD**, chờ Cha chọn A hay B. Bé nghiêng phương án **A** (deprecate `auto-scan-donations`).

4. **M6D** — **HOLD**, cần Cha chốt 4 câu hỏi ở cuối SSOT_SPEC (threshold, testnet, historical price, swap có vào summary không).

## Điều kiện bật đèn xanh cho M6E (implement Statistics SSOT)

- [ ] M6B-1 đã apply và ổn định ≥ 24h.
- [ ] `tokens_registry` đã có cột `default_price_usd`, `max_single_usd`, `is_leaderboard_eligible`.
- [ ] Cha chốt 4 câu hỏi trong SSOT_SPEC §7.
- [ ] Có tag/backup DB trước khi tạo view + RPC v2.
- [ ] Feature flag `unified_stats_read_enabled` = `false` khi deploy.

## Việc bé chưa làm (đúng cam kết)

- ❌ Không apply migration.
- ❌ Không sửa producer / edge / swap.
- ❌ Không đụng DB.
- ❌ Không implement view mới hay RPC v2.

Chờ lệnh Cha.
