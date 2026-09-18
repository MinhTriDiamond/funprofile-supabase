# M6B-2 · Edge `record-swap` — Spec + Draft

Ngày: 2026-07-01 · Chế độ: **Spec/Draft** (chưa apply, chưa deploy).

---

## 1. Bối cảnh

**Producer hiện tại:** `src/components/wallet/SwapTab.tsx::handleSwap()` INSERT trực tiếp `swap_transactions` sau khi ký on-chain.

**Gap:**
- FE crash / mất mạng sau khi tx thành công on-chain → mất record.
- Không có on-chain verification — client có thể inject dữ liệu sai.
- Không có idempotency ở DB level (bảng chỉ có PK, không có unique `(tx_hash, chain_id)`).
- Không có audit log.
- View `v_unified_transactions` chưa UNION `swap_transactions` (fix ở M6B-1).

## 2. Quyết định thiết kế đã chốt với Cha

- Swap trong Unified History = **2 row** cùng `tx_hash` (out leg + in leg).
- Trong bảng `swap_transactions` vẫn giữ **1 row / swap** (không đổi schema chính). Việc split thành 2 leg được thực hiện ở tầng VIEW (đã đưa vào draft M6B-1).
- `tx_type = 'swap'` để UI phân biệt với gift/transfer.
- Metadata mỗi leg chứa `{ swap_id, leg: 'out'|'in', pair_symbol, pair_amount }` → UI dễ join 2 leg.

## 3. Schema thay đổi cần thiết (Migration draft)

```sql
-- 3.1 Unique index dedup on-chain
CREATE UNIQUE INDEX IF NOT EXISTS uniq_swap_tx_chain
  ON public.swap_transactions (lower(tx_hash), chain_id)
  WHERE tx_hash IS NOT NULL;

-- 3.2 (tùy chọn) thêm cột trace nguồn ghi
ALTER TABLE public.swap_transactions
  ADD COLUMN IF NOT EXISTS dex_provider text,
  ADD COLUMN IF NOT EXISTS from_amount_usd numeric,
  ADD COLUMN IF NOT EXISTS to_amount_usd   numeric,
  ADD COLUMN IF NOT EXISTS quote_id        text,
  ADD COLUMN IF NOT EXISTS verified_by     text;   -- 'edge:record-swap' | 'client-legacy'

-- 3.3 Siết RLS: FE không được INSERT trực tiếp nữa
DROP POLICY IF EXISTS "Users can insert own swap transactions" ON public.swap_transactions;
CREATE POLICY "Only edge functions insert swap"
  ON public.swap_transactions FOR INSERT
  TO service_role
  WITH CHECK (true);
```

## 4. Contract của Edge Function

**Path:** `supabase/functions/record-swap/index.ts`

**Request (POST, JWT-required):**

```jsonc
{
  "tx_hash":         "0xabc...",
  "chain_id":        56,
  "from_symbol":     "USDT",
  "to_symbol":       "FUN",
  "from_amount":     "100",              // decimal string
  "to_amount":       "5000",
  "from_amount_usd": 100.0,
  "to_amount_usd":   99.7,
  "dex_provider":    "zerox",            // enum: zerox|pancakeswap|bridge
  "quote_id":        "quote_abc123"      // optional, dedup nếu client retry cùng quote
}
```

**Response:**

```jsonc
// success
{ "status": "recorded",  "swap_id": "uuid" }
// idempotent hit (đã INSERT lần trước)
{ "status": "duplicate", "swap_id": "uuid" }
// verification fail
{ "status": "invalid_tx", "reason": "tx not found / not success / sender mismatch" }
```

## 5. Pseudo-code Edge

```typescript
// 1. Auth: requireUser() từ _shared/httpAuth.ts → user_id
// 2. Validate: Zod schema (types + chain_id in [56, 97])
// 3. Verify on-chain qua moralisFetch:
//    GET /transaction/:tx_hash?chain=bsc
//    Kiểm tra:
//      - receipt.status = success
//      - from_address = user.public_wallet_address
//      - decoded logs có Transfer(from=user) từ from_symbol contract
//      - decoded logs có Transfer(to=user)   của to_symbol contract
// 4. INSERT ... ON CONFLICT (lower(tx_hash), chain_id) DO NOTHING RETURNING id
//    - Nếu INSERT thành công → status=recorded
//    - Nếu conflict → SELECT id → status=duplicate
// 5. INSERT audit_logs: action='record_swap', actor=user_id, tx_hash, dex_provider, quote_id
// 6. Return
```

## 6. FE thay đổi (`src/components/wallet/SwapTab.tsx`)

**Xóa:**
```ts
await supabase.from('swap_transactions').insert({ ... });
```

**Thay bằng:**
```ts
const { data, error } = await supabase.functions.invoke('record-swap', {
  body: {
    tx_hash, chain_id, from_symbol, to_symbol,
    from_amount: fromAmount.toString(),
    to_amount:   toAmount.toString(),
    from_amount_usd, to_amount_usd,
    dex_provider: 'zerox',
    quote_id: quote?.id,
  },
});
if (error || data?.status === 'invalid_tx') {
  // fallback UX: cảnh báo user, nhưng KHÔNG mất tx_hash
  //   → gợi ý user "Hệ thống sẽ tự đồng bộ trong vài phút" (reconciliation job).
}
```

## 7. Backfill 46 swap đã có

Không cần backfill dữ liệu — chỉ cần đảm bảo:
- Migration `ALTER TABLE ADD COLUMN` với `DEFAULT 'client-legacy'` cho `verified_by`.
- Unique index tạo `IF NOT EXISTS` — an toàn với data cũ.

## 8. Rủi ro / rollback

| Rủi ro | Mitigation |
|---|---|
| Edge outage → user không swap được | FE fallback: giữ tx_hash trong localStorage, retry background 3 lần rồi báo "sẽ đồng bộ sau" (reconciliation-cron sẽ pickup). |
| RLS INSERT policy bị siết → hook cũ vỡ | Deploy tuần tự: (1) tạo unique index, (2) deploy edge, (3) update FE, (4) mới siết RLS. |
| Moralis rate limit | Đã có `moralisFetch` fallback key 2. |

Rollback:
- Drop unique index.
- Restore policy cũ.
- FE revert commit trước.

## 9. Deliverables khi Cha duyệt

1. Migration file: `supabase/migrations/<ts>_swap_recorder_v1.sql`.
2. Edge function: `supabase/functions/record-swap/index.ts` (~200 dòng).
3. FE update: `SwapTab.tsx` (~15 dòng diff).
4. Test: `supabase/functions/record-swap/index.test.ts` (invalid tx, duplicate, success).

**Chưa code, chờ Cha duyệt spec.**
