# INDEX — M6A Statistics Audit (2026-07)

**Phạm vi**: 3 audit chuyên đề — TD-05, Swap, Statistics  
**Auditor**: M6A Statistics Audit  
**Ngày**: 2026-07

---

## Audit 1 — TD-05: Bảng `transactions` (Projection hay Independent?)

**Kết luận**: `transactions` KHÔNG phải projection thuần — chứa 4 loại row độc lập (BTC/USDT/BNB reconciliation + CAMLY claim) không có trong `donations`, `wallet_transfers`, `swap_transactions`. Gap P0 nếu `v_unified_transactions` bỏ sót 4 loại này.

### Verdict
| File | Mô tả |
|---|---|
| [`td05_verdict.md`](td05_verdict.md) | Phân tích đầy đủ, evidence producers, gap, đề xuất hành động |

### Evidence
| File | Nội dung | Evidence key |
|---|---|---|
| [`evidence/td05_transactions_classification.csv`](evidence/td05_transactions_classification.csv) | Phân loại 4 category tx (BTC/USDT/BNB reconciliation + claim_reward) | rows 2–7 |
| [`evidence/td05_orphan_samples.csv`](evidence/td05_orphan_samples.csv) | 4 producers ghi vào `transactions`; idempotency gap TD-10 | rows 2–8 |

---

## Audit 2 — Swap: Flow, Gap & Kiến trúc

**Kết luận**: Chỉ có 1 active producer (FE client INSERT trực tiếp). Không có server-side recorder — nếu FE crash sau on-chain swap, record bị mất (G1 P1). `v_unified_transactions` chưa xác nhận có bao gồm `swap_transactions` (G3 P0).

### Verdict
| File | Mô tả |
|---|---|
| [`swap_verdict.md`](swap_verdict.md) | Flow matrix, gap analysis, kiến trúc `record-swap` đề xuất, lộ trình M6B→M6E |

### Evidence
| File | Nội dung | Evidence key |
|---|---|---|
| [`evidence/swap_flow_matrix.csv`](evidence/swap_flow_matrix.csv) | 6 producer/consumer; F1 active, F2 dead, F4 missing | rows 2–7 |
| [`evidence/swap_lifecycle.mmd`](evidence/swap_lifecycle.mmd) | Lifecycle diagram: 5 bước User→Chain→DB; bước [5] FE trực tiếp INSERT | full file |

---

## Audit 3 — Statistics: Inventory, Pricing, Ranking, SSOT

**Kết luận**: 23 surfaces, 9 duplicate groups, 9 USD pricing sources, 13 ranking implementations — không có SSOT thống nhất. 4 surfaces chưa xác nhận (Treasury, Export PDF, Notification). 4 surfaces hạng D/F cần refactor ưu tiên.

### Report
| File | Mô tả |
|---|---|
| [`STATISTICS_REPORT.md`](STATISTICS_REPORT.md) | Báo cáo tổng tiếng Việt: Inventory, USD Pricing, Ranking, DUP-01→09, Dependency Graph, SSOT Matrix, kiến trúc SSOT đề xuất, M6D/M6E roadmap, Go/No-Go |

### Evidence
| File | Nội dung | Evidence key |
|---|---|---|
| [`evidence/statistics_inventory.csv`](evidence/statistics_inventory.csv) | 23 statistics surfaces, file:line, calc_type, input_source, duplicate_group_id | rows 2–24 |
| [`evidence/usd_pricing_sources.csv`](evidence/usd_pricing_sources.csv) | 9 nguồn/cơ chế giá USD; FALLBACK hardcode, priceMap override, server vs client mismatch | rows 2–10 |
| [`evidence/ranking_implementations.csv`](evidence/ranking_implementations.csv) | 13 ranking implementations; DUP-07 (same RPC 2 query key); Honor Board 2 calls | rows 2–14 |
| [`evidence/statistics_duplicate_groups.csv`](evidence/statistics_duplicate_groups.csv) | DUP-01→09: tên nhóm, implementations, SSOT đề xuất, effort | rows 2–10 |
| [`evidence/statistics_dependency_graph.mmd`](evidence/statistics_dependency_graph.mmd) | Dependency graph: Producers → Aggregators → Consumers; TX gap (dashed); HOOK1/2 bypass | full file |
| [`evidence/statistics_ssot_matrix.csv`](evidence/statistics_ssot_matrix.csv) | 20 surfaces × 4 cột (count/sum/usd/rank); phân phối A/B/C/D/F | rows 2–21 |

---

## Tóm tắt Cross-Audit

| Issue | Audit | Severity | M6B Action | M6D/M6E Action |
|---|---|---|---|---|
| `transactions` bỏ sót trong unified view | TD-05 | **P0** | Thêm UNION nhánh 4 vào `v_unified_transactions` | M6D-01 xác nhận SQL view |
| Idempotency non-atomic (race condition) | TD-05 | P1 (TD-10) | Atomic upsert `wallet-reconciliation-cron:70–79` | — |
| Swap FE direct INSERT (no server recorder) | Swap | **P1** | Tạo `record-swap` edge function | — |
| `v_unified_transactions` chưa xác nhận có swap | Swap | **P0** | Xác nhận SQL view | M6D-01 |
| 9 USD pricing sources không nhất quán | Statistics | P1 | — | M6E-12 unify server-side pricing |
| DUP-01: 3 implementations token SUM | Statistics | P2 | — | M6E-04/05 migrate hooks |
| DUP-04: claim reduce 3 lần client-side | Statistics | P2 | — | M6E-06 remove client reduces |
| Treasury/Export PDF/Notification chưa có evidence | Statistics | P2 | — | M6D-03/04/05 audit |

---

## Milestone Order

```
M6A (Done) ──→ M6B (Producer Cleanup)  ─┐
              → M6D (Statistics Deep)   ─┴──→ M6E (SSOT Implement) ──→ Stable
```

Xem chi tiết lý do thứ tự tại [`STATISTICS_REPORT.md#phần-10`](STATISTICS_REPORT.md).
