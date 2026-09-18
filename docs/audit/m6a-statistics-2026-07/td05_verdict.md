# TD-05 Verdict — Bảng `transactions`: Projection hay Independent?

**Ngày**: 2026-07  
**Auditor**: M6A Statistics Audit  
**Severity ban đầu**: P0

---

## 1. Câu hỏi cần trả lời

> `transactions` là **projection thuần** (view/derived) của `donations` + `wallet_transfers` + `swap_transactions`,  
> hay là bảng có **row độc lập** không tồn tại ở bảng nào khác?

---

## 2. Evidence — Producers ghi vào `transactions`

| # | Producer | File | Dòng | Loại giao dịch | Có trong `donations`? | Có trong `wallet_transfers`? | Có trong `swap_transactions`? |
|---|---|---|---|---|---|---|---|
| P1 | `wallet-reconciliation-cron` | `supabase/functions/wallet-reconciliation-cron/index.ts` | 196–209 | On-chain BTC reconciliation | ❌ Không | ❌ Không | ❌ Không |
| P2 | `wallet-reconciliation-cron` | `supabase/functions/wallet-reconciliation-cron/index.ts` | 295–301 | On-chain USDT (BEP-20) reconciliation | ❌ Không | ❌ Không | ❌ Không |
| P3 | `wallet-reconciliation-cron` | `supabase/functions/wallet-reconciliation-cron/index.ts` | ~310 | On-chain BNB reconciliation | ❌ Không | ❌ Không | ❌ Không |
| P4 | `approve-claim` | `supabase/functions/approve-claim/index.ts` | 256–284 | CAMLY claim reward | ❌ Không | ❌ Không | ❌ Không |

**Idempotency**: check-before-insert dựa vào `tx_hash + user_id + from + to` (non-atomic) tại `wallet-reconciliation-cron/index.ts:70–79`.  
⚠️ Race condition tiềm ẩn — xem TD-10.

---

## 3. Kết luận

> **`transactions` KHÔNG phải projection thuần.**

Bảng này chứa **ít nhất 4 loại row độc lập** không có đối ứng trong `donations`, `wallet_transfers`, hay `swap_transactions`:

1. BTC on-chain reconciliation (chain_id=BTC)
2. USDT BEP-20 on-chain reconciliation (chain_id=56)
3. BNB on-chain reconciliation (chain_id=56)
4. CAMLY claim reward (metadata.type=claim_reward)

`v_unified_transactions` (nếu tồn tại) có thể bỏ sót toàn bộ 4 loại này nếu chỉ JOIN với `donations ∪ wallet_transfers ∪ swap_transactions`.

---

## 4. Gap chưa xác nhận (cần DB access)

| Gap | Lý do chưa xác nhận |
|---|---|
| Số lượng row thực tế theo từng loại | Audit chỉ có code-read access, không có SELECT trực tiếp vào DB |
| `v_unified_transactions` có bao gồm `transactions` hay không | SQL của view chưa đọc được từ migration files |
| % row `transactions` bị bỏ sót trong unified view | Cần JOIN query trực tiếp |

---

## 5. Đề xuất hành động

### 5.1 Severity

| Điều kiện | Severity |
|---|---|
| `v_unified_transactions` **không** bao gồm `transactions` (reconciliation/claim) | ✅ Giữ **P0** — user history thiếu giao dịch thực |
| `v_unified_transactions` **có** bao gồm (bằng cách nào đó) | Hạ xuống **P1** — data đúng nhưng kiến trúc không rõ ràng |

**Khuyến nghị hiện tại**: Giữ **P0** cho đến khi xác nhận được SQL của view.

### 5.2 Hành động cho `v_unified_transactions`

```sql
-- Đảm bảo view bao gồm tất cả source:
-- UNION 1: donations
-- UNION 2: wallet_transfers  
-- UNION 3: swap_transactions
-- UNION 4: transactions WHERE category IN ('reconciliation_btc','reconciliation_bep20_usdt','reconciliation_bnb','claim_reward')
```

1. **[DB Admin] Xác nhận SQL view** `v_unified_transactions` / `v_unified_transactions_primary`
2. **[M6B] Thêm UNION branch** cho `transactions` nếu chưa có
3. **[M6B] Đổi tên** `transactions` → `on_chain_transactions` để tránh nhầm với "unified transactions"
4. **[M6B] Fix idempotency**: atomic upsert thay check-before-insert (TD-10)
5. **[M6D] Kiểm tra** WalletHistory, ProfileHistory có hiển thị claim_reward không

---

## 6. Tóm tắt cho Product

> Khi user nhận CAMLY từ claim reward hoặc hệ thống ghi nhận BTC/USDT/BNB on-chain — các giao dịch này **có thể không xuất hiện** trong lịch sử giao dịch thống nhất (WalletHistory / TransactionHistoryPage). Đây là lỗ hổng **hiển thị dữ liệu người dùng** — cần ưu tiên xác nhận và vá trong M6B.
