# G2 · BTC Semantic Rebuild Plan (spec-only)

**Ngày:** 2026-07-03 · **Trạng thái:** SPEC-ONLY, không code / không migration / không UI / không DB.

## 1. Mục tiêu
Xây lại tầng semantic BTC theo `BTC_SEMANTIC_SPEC.md` (G1) để Wallet / History / Benefactors / Treasury cùng đọc **một nguồn đúng duy nhất** `v_btc_history`. Không patch nhỏ nữa.

## 2. Non-goals (G2 KHÔNG làm)
- ❌ Không viết code parser v2.
- ❌ Không tạo migration.
- ❌ Không sửa view / UI / leaderboard / benefactors.
- ❌ Không disable thêm aux, không đụng data Father.
- ❌ Không mở G3 tự động — chờ Cha duyệt G2.

## 3. Nguyên tắc bất di (Cha đã chốt)
1. **Dual-write + shadow diff → cutover.** Không rebuild in-place.
2. **`v_btc_history` là SSOT.** Sau cutover, KHÔNG consumer nào đọc trực tiếp `donations` / `wallet_transfers` / `transactions` cho BTC.
3. **Parser v2 không học aux trong runtime.** Discovery tách sang job riêng có review queue.
4. **Coinjoin KHÔNG sinh donation.** Đưa `btc_review_queue` reason `coinjoin_multi_owner`.
5. **Father / treasury KHÔNG auto-learn aux.** Toàn bộ aux Father vào manual review; treasury flow phải có tag `treasury_flow`.
6. **Feature flag rollback tức thì** (`system_config.scan_btc_v2_enabled`).
7. **Soft-supersede.** Row cũ giữ nguyên, chỉ thêm `integrity_status` / `superseded_by`.
8. **AI auto-suggest verdict, quyết định cuối là Cha / admin.** Không auto-apply.

## 4. Timeline (spec-level, chưa cam kết ngày)
| Giai đoạn | Mục tiêu |
|---|---|
| **G3** | Migration schema mới (bảng shadow + cột phụ), feature flag OFF, không đụng data |
| **G4** | Deploy parser v2 dark-launch, dual-write vào `btc_tx_semantic` |
| **G5** | Historical fetch + shadow classify + `btc_rebuild_diff.csv` |
| **G6** | Cutover view `v_btc_history` sau khi Cha duyệt diff |
| **G7** | Rebuild leaderboard / benefactors từ SSOT mới |

## 5. RC-code → giải pháp trong rebuild
| RC | Trigger cũ | Giải pháp G3+ |
|---|---|---|
| RC-10 | `hd_input_back` học ví exchange | Freeze vĩnh viễn; discovery v2 chỉ học từ change-output có guard |
| RC-11 | Idempotency chỉ `tx_hash` | Key mới `(tx_hash, vout_index, recipient_address)` + backfill `vout_index` |
| RC-12 | `chain_family='evm'` cho hash BTC | Ép chain theo pattern hash + evidence on-chain; migration vá SAU khi parser mới có spec |
| RC-13 | Break sớm khi tìm 1 vout | Parser v2 iterate mọi vout, ghi per-vout |
| RC-15 | `is_external` chỉ check custodial | Dùng ownership resolver full 3 tầng (custodial → profiles → snapshot) |
| RC-16 | Coinjoin bị attribute sender | Guard `|SenderUsers|>1` → review queue |
| RC-17 | Change output nhận diện là recipient | Rule `is_change` per-vout §4 spec |

## 6. Risk register
| Risk | Mitigation |
|---|---|
| Fetch budget vượt 10k tx | Dừng, báo Cha duyệt tiếp (policy Cha chốt) |
| Parser v2 sai edge-case chưa thấy trong 3 user G1 | Dark-launch dual-write, so diff trước cutover |
| Legacy row thiếu vout_index không suy được | Tag `legacy_no_vout`, không cưỡng ép, dashboard biết |
| View cutover phá downstream (SDK, connector, edge fn) | Grep consumer list ở G3, migrate từng consumer trước cutover |
| Rollback không kịp | Feature flag DB, revert view trong 1 migration đảo chiều đã prepare |

## 7. Deliverables G2 (7 file)
1. `REBUILD_PLAN.md` (file này) — tài liệu chủ
2. `SCHEMA_PLAN.md` — schema mới cần gì
3. `PARSER_SPEC.md` — parser v2 `scan-btc-transactions-v2`
4. `DISCOVERY_SPEC.md` — job học aux mới thay `hd_input_back`
5. `HISTORICAL_REBUILD_PLAN.md` — replay 100% BTC lịch sử
6. `QA_PLAN.md` — QA 7 user + smoke rộng
7. `ROLLBACK_PLAN.md` — kịch bản rollback

## 8. QA scope (7 user)
G2 spec ghi đủ 7: `angelutopia`, `angelkim`, `angelthienhanh68`, `angelthuha`, `angelhoangtydo`, `trogiauco`, `father`.
G3 implementation ưu tiên **3 user trọng tâm G1 trước**, sau đó mở rộng 4 user còn lại.
