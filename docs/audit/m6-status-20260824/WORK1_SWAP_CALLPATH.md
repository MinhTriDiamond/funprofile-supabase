# Việc #1 — câu hỏi chặn: FE gọi edge hay ghi thẳng client? (AUDIT ONLY)

Ngày: 2026-08-24. Chỉ đọc/query.

## 1. Luồng production ghi qua đâu

`src/components/wallet/SwapTab.tsx` (dòng ~195–211) — FE **gọi edge `record-swap`**, KHÔNG insert client-side:

```ts
const { data: swapData, error: swapErr } = await supabase.functions.invoke('record-swap', {
  body: { tx_hash: hash, chain_id: SWAP_CONFIG.CHAIN_ID, from_symbol: quote.fromSymbol, ... },
});
if (swapErr || (swapData as any)?.error) throw swapErr ?? new Error((swapData as any)?.error);
```

`grep -rn "swap_transactions" src` ⇒ chỉ xuất hiện trong `types.ts` (auto-gen) và 1 comment ở
`src/lib/swapPriceValidation.ts`. **Không có bất kỳ `.from('swap_transactions').insert()` nào ở FE.**

SwapTab đang LIVE: `WalletCenterContainer.tsx:34` import, `:780` render trong Dialog mở bằng `onSwap`.

## 2. Bằng chứng invoke thật

- `swap_transactions`: 46 dòng, **100% `verified_by = 'client-legacy'`** — và `client-legacy` là
  **DEFAULT của cột** (`column_default = 'client-legacy'::text`), tức các dòng này do
  `backfill-swap-transactions` (không set `verified_by`) ghi, không phải do edge.
- Edge `record-swap` set `verified_by: 'edge:record-swap' | 'edge:pending-verify'` (index.ts:127).
  Số dòng có 2 giá trị này: **0**.
- `audit_logs where action='record_swap'`: **0**.
- `swap_price_validation_log` (trigger AFTER INSERT trên swap_transactions): **0 dòng**.
- `function_edge_logs`: cửa sổ retention thực tế chỉ ~600 giây (min→max timestamp cách nhau
  ~10 phút) ⇒ **không thể truy lịch sử invoke**.
- Mốc thời gian: `record-swap/index.ts` + SwapTab commit **2026-07-01**; dòng
  `swap_transactions` cuối cùng **2026-06-30 09:00Z** ⇒ từ khi edge tồn tại tới nay **chưa có
  bất kỳ dòng swap nào**, kể cả legacy.

## 3. Kết luận nhánh

Không phải (b). Gần (a) nhưng chính xác hơn: **đường ghi đúng đã được nối (FE→edge), nhưng
KHÔNG có bằng chứng nào cho thấy edge từng chạy thành công 1 lần, và không có swap nào từ
30/06/2026**. Hai giả thuyết vẫn không phân biệt được bằng dữ liệu còn lại: (i) không ai swap
từ 01/07, hoặc (ii) có swap nhưng 100% fail ở edge. Không suy diễn.

⇒ Đề xuất hạ mức: **không phải "rò rỉ mỗi ngày"**. Việc cần làm là **quan sát tiến** (log bền
+ badge) để 1 lần swap tiếp theo cho biết ngay (i) hay (ii), thay vì P0 chữa cháy.
