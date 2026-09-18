# Swap Verdict — Flow, Gap & Kiến trúc đề xuất

**Ngày**: 2026-07  
**Auditor**: M6A Statistics Audit

---

## 1. Số flow hiện tại

### 1.1 Flow Matrix (từ swap_flow_matrix.csv)

| # | Producer | Loại | DB write | Trạng thái |
|---|---|---|---|---|
| F1 | `SwapTab.tsx::handleSwap()` | FE Direct — Primary | INSERT `swap_transactions` | ✅ Active |
| F2 | `backfill-swap-transactions` Edge | One-time backfill | INSERT `swap_transactions` | 🔴 Dead/không chạy |
| F3 | `swap-quote` Edge | Quote-only proxy | KHÔNG write DB | ✅ Active (read-only) |
| F4 | `record-swap` Edge | Server-side recorder | N/A | ❌ CHƯA TỒN TẠI |

**Tổng flow active**: 1 (F1)  
**Gap kiến trúc**: Không có server-side producer — toàn bộ phụ thuộc FE client insert.

### 1.2 Lifecycle (từ swap_lifecycle.mmd)

```
User → SwapTab
  → [1] GET /swap-quote (0x.org proxy) → price data
  → [2] requiresApproval check → BSC Chain
  → [3] approveToken (nếu cần) → BSC Chain
  → [4] executeSwap via wagmi → BSC Chain → tx_hash
  → [5] INSERT swap_transactions (FE trực tiếp)
  → toast.success()
```

**Vấn đề**: Bước [5] xảy ra ở client — nếu user đóng tab, mất mạng, hoặc FE crash sau [4] → tx_hash thật không được ghi vào DB.

---

## 2. Gap phân tích

| Gap | Mức độ | Mô tả |
|---|---|---|
| **G1: No server-side recorder** | P1 | Swap thành công on-chain nhưng FE crash → không ghi DB |
| **G2: No webhook/event listener** | P1 | Không có cơ chế nào kiểm tra "swap đã thực hiện on-chain nhưng chưa được ghi" |
| **G3: View inclusion unconfirmed** | P0 | `v_unified_transactions` chưa xác nhận có bao gồm `swap_transactions` |
| **G4: No DEX extension** | P2 | Chỉ hỗ trợ 0x.org — không có framework mở rộng cho DEX khác |
| **G5: No Bridge support** | P2 | Cross-chain bridge swap chưa có flow nào |
| **G6: No Limit Order** | P3 | Async swap (limit order) không có producer nào xử lý |
| **G7: Quote not cached** | P2 | Mỗi quote call = 1 external API call, không có cache layer |

---

## 3. Khả năng mở rộng

### 3.1 DEX (Decentralized Exchange)
- **Hiện tại**: Chỉ 0x.org aggregator
- **Gap**: Không có abstraction layer — thêm DEX mới phải sửa `swap-quote` + `SwapTab`
- **Đề xuất**: DEX Provider interface trong `record-swap` edge

### 3.2 Bridge (Cross-chain)
- **Hiện tại**: KHÔNG có flow nào
- **Gap**: BTC↔BNB, ETH↔BNB bridge chưa có producer
- **Đề xuất**: `record-bridge` edge tách biệt, schema `bridge_transactions`

### 3.3 Limit Order (Async Swap)
- **Hiện tại**: KHÔNG có
- **Gap**: Swap thực hiện sau khi điều kiện thị trường thỏa — không có polling/webhook
- **Đề xuất**: `swap_orders` table + cron processor

---

## 4. Kiến trúc `record-swap` đề xuất

### 4.1 Nguyên tắc

> **FE chỉ thực hiện giao dịch on-chain — Server ghi nhận kết quả.**

```
SwapTab
  → [1] GET /swap-quote → price
  → [2-4] Execute on-chain → tx_hash
  → [5] POST /record-swap { tx_hash, from_token, to_token, from_amount, to_amount, dex, chain_id }
         ↓
    record-swap Edge
      → Verify tx_hash on-chain (RPC call)
      → INSERT swap_transactions
      → Return { swap_id, status }
  → [6] UI cập nhật từ response
```

### 4.2 Schema `record-swap` request

```typescript
interface RecordSwapRequest {
  tx_hash: string;           // on-chain tx hash
  chain_id: number;          // 56 = BSC
  from_token: string;        // symbol
  to_token: string;          // symbol
  from_amount: string;       // wei/satoshi string
  to_amount: string;
  from_amount_usd: number;   // từ quote
  to_amount_usd: number;
  dex_provider: 'zerox' | 'pancakeswap' | 'bridge'; // extensible
  quote_id?: string;         // idempotency
}
```

### 4.3 Producer chuẩn (Standard Producer Pattern)

```
Mọi swap type đều implement SwapProducer interface:
  - validate(tx_hash): boolean         -- on-chain verification
  - normalize(): SwapTransactionRow    -- chuẩn hóa về schema
  - idempotency_key(): string          -- tx_hash + chain_id
  - notify(): void                     -- trigger notification nếu cần
```

### 4.4 Lộ trình

| Phase | Action | Priority |
|---|---|---|
| M6B | Tạo `record-swap` edge (basic: BSC + 0x) | P1 |
| M6B | FE SwapTab gọi `/record-swap` thay INSERT trực tiếp | P1 |
| M6C | Thêm DEX provider abstraction | P2 |
| M6D | Bridge flow (`record-bridge` edge) | P2 |
| M6E | Limit order flow | P3 |

---

## 5. Kết luận

> **Kiến trúc swap hiện tại có 1 điểm failure nghiêm trọng**: FE client trực tiếp ghi DB sau khi thực hiện on-chain transaction. Nếu client crash, swap vẫn xảy ra trên blockchain nhưng không có record trong hệ thống.

> **Đề xuất**: Tạo `record-swap` edge function ngay trong M6B như bước đầu tiên của Producer Cleanup. Đây là nền tảng để mở rộng sang DEX/Bridge/Limit Order trong các milestone tiếp theo.
