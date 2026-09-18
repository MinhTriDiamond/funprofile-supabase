# Scanner RPC + Watermark v1 — Thiết kế (chờ CTO duyệt, CHƯA code)

Mục tiêu: chuyển nguồn quét on-chain chính từ Moralis (quota 40k/ngày, đã cạn 2 lần) sang
**JSON-RPC công khai BSC + watermark theo block**, để (a) không phụ thuộc quota, (b) luôn biết
chính xác đã quét tới block nào ⇒ không còn "không biết có sót hay không".

## 1. Nguyên nhân phải làm (evidence 18/08/2026)

- `moralis_api_usage`: 39.079 call / limit 40.000 trong ngày 18/08, `last_source` = `fast-scan-donations`.
- Tốc độ tiêu thụ ≈ 2.500 call/giờ, khớp với **cron thường ngày**, không phải deep-scan
  (deep-scan hôm nay chạy bằng RPC công khai, không gọi Moralis):
  - `auto-scan-donations` (cron 5'): 288 lần/ngày × 50 ví × 3 call (2 trang ERC20 + 1 trang native)
    = **tối đa 43.200 call/ngày** — một mình vượt quota.
  - `fast-scan-donations` (cron 3'): 480 lần/ngày × 4 token-chain × 2 trang = **tối đa 3.840 call/ngày**.
- Khi key đã cạn, `moralisFetch` fallback qua cả 3 key ⇒ **1 call logic = 3 HTTP call**, counter phình nhanh.

Kết luận: tối ưu tham số chỉ trì hoãn được vài ngày. Phải đổi nguồn chính.

## 2. Schema

```sql
CREATE TABLE public.scanner_watermarks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id      integer NOT NULL,                 -- 56 = BSC
  source        text    NOT NULL,                 -- 'erc20' | 'native'
  token_address text,                             -- NULL với native
  last_block    bigint  NOT NULL DEFAULT 0,
  head_block    bigint  NOT NULL DEFAULT 0,       -- head lúc quét gần nhất (đo độ trễ)
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, source, coalesce(token_address, ''))
);
-- GRANT SELECT TO authenticated (admin UI đọc qua RPC), GRANT ALL TO service_role
-- RLS: chỉ admin đọc, chỉ service_role ghi.

CREATE TABLE public.scanner_block_gaps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id   integer NOT NULL,
  block      bigint  NOT NULL,
  reason     text    NOT NULL,   -- 'null_from_node' | 'rpc_error'
  retries    integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, block)
);
```

`scanner_block_gaps` là **bắt buộc**: đợt 18/08 node công khai trả `null` cho 18% block.
Không được đẩy `last_block` qua block chưa đọc được — block null phải nằm trong hàng chờ retry
tới khi đọc thành công.

## 3. Luồng chạy (edge `scanner-rpc-tick`, cron mỗi 2 phút)

1. `eth_blockNumber` → `head`. Tính `safe_head = head - 15` (tránh reorg).
2. Với mỗi dòng watermark:
   - `from = last_block + 1`, `to = min(from + CHUNK - 1, safe_head)`; `CHUNK = 2.000` block cho
     `eth_getLogs`, `CHUNK = 200` cho native (phải đọc full block).
   - ERC20: 1 call `eth_getLogs` / token / chunk, topic0 = `Transfer`, lọc `topics[2]` (to) theo
     danh sách ví hệ thống nếu ≤ 4.000 địa chỉ, ngược lại lọc phía Deno.
   - Native: `eth_getBlockByNumber(full=true)` batch 20 block/HTTP request (JSON-RPC batch).
3. Block trả `null`/lỗi ⇒ ghi `scanner_block_gaps`, **không** tính vào watermark; watermark chỉ
   nhảy tới block liên tục cuối cùng đã đọc thành công.
4. Ghi `donations`/`transactions` bằng cùng logic hiện có (tách sang `_shared/ingestTransfer.ts`
   để dùng chung với Moralis path), idempotent theo `(tx_hash, user_id)`.
5. Cuối mỗi tick: retry tối đa 200 dòng `scanner_block_gaps` chưa resolve.

## 4. Rotation & sức khoẻ endpoint

- Danh sách 9 endpoint đã kiểm chứng 18/08: `bsc-dataseed.bnbchain.org`, `bsc-rpc.publicnode.com`,
  `1rpc.io/bnb`, `bsc.meowrpc.com`, `bsc.blockrazor.xyz`, `bsc.rpc.blxrbdn.com`,
  `bsc-dataseed1.defibit.io`, `bsc-dataseed2.defibit.io`, `bsc.48.club`.
- Round-robin + đếm lỗi trong bộ nhớ tick; endpoint lỗi ≥ 3 lần bị loại khỏi tick đó.
- Không có endpoint nào phản hồi ⇒ trả `provider_unavailable` (giữ đúng Silent Failure Guard),
  notify admin dedupe 6h. **Không bao giờ** diễn giải thành "không có giao dịch mới".

## 5. Vai trò Moralis sau khi lên

- Moralis hạ xuống **nguồn đối chiếu**: 1 lần/giờ, chỉ quét ví có hoạt động 24h gần nhất
  ⇒ ước tính < 1.500 call/ngày (≤ 4% quota).
- `fast-scan-donations` cron 3' → 15'; `auto-scan-donations` cron 5' → 30' (hoặc tắt sau 7 ngày
  chạy song song không lệch).
- Chuẩn nghiệm thu chuyển đổi: 7 ngày liên tục `scanner_rpc` không sót dòng nào so với Moralis
  đối chiếu, và `scanner_block_gaps` chưa resolve = 0.

## 6. Admin UI (tab Treasury/Scanner)

- Bảng watermark: token, `last_block`, `head_block`, độ trễ (block + phút), cập nhật lúc.
- Số block gap chưa resolve + nút retry ngay.
- Cảnh báo đỏ khi độ trễ > 3.000 block (~2,5 giờ) hoặc gap chưa resolve > 500.

## 7. Thứ tự triển khai đề xuất

1. Migration 2 bảng + RPC `scanner_watermark_advance` (service_role).
2. `_shared/rpcClient.ts` (rotation + batch) và `_shared/ingestTransfer.ts` (tách logic ghi).
3. Edge `scanner-rpc-tick` + cron 2', chạy **dry-run 24h** (chỉ log, không ghi).
4. Bật ghi, chạy song song Moralis 7 ngày, so lệch hằng ngày.
5. Hạ Moralis xuống nguồn đối chiếu + cập nhật memory.
