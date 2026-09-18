# MỤC 2 — Test `alchemy_getAssetTransfers` (KHÁC `eth_getLogs`)

Ngày đo: 15/09/2026 01:17 UTC. Probe: `supabase/functions/alchemy-transfers-probe` (tạm, verify_jwt=false).
Ví thật: `0xf6dbe280ec7e9262364c41cc6cf90c956b7ed47d` (1.027 dòng trong `transactions`).
Head block lúc đo: 121.940.190.

## Kết quả thô

| # | Call | Span block | HTTP | Thời gian | Kết quả |
|---|---|---|---|---|---|
| 1 | `eth_blockNumber` | — | 200 | 66 ms | `0x744a8de` |
| 2 | `alchemy_getAssetTransfers` category erc20 | **~2.800.000** (toàn vùng mù) | 200 | 372 ms | 5 transfers, `pageKey` null |
| 3 | `alchemy_getAssetTransfers` category erc20 | 500.000 | 200 | 174 ms | 0 transfers |
| 4 | `alchemy_getAssetTransfers` category external (native BNB) | 500.000 | 200 | 147 ms | 0 transfers |
| 5–9 | burst 5 call liên tiếp, span ~2.800.000 | | 200 ×5 | 367/143/324/152/357 ms | 5 transfers mỗi lần, **0 lỗi 429** |

Raw mẫu (call #2, 200 ký tự đầu):

```json
{"jsonrpc":"2.0","id":1,"result":{"transfers":[{"blockNum":"0x71c4abb",
"uniqueId":"0x8a09...23e8:log:341","hash":"0x8a09...23e8",
"from":"0x19a90850cddf49a9e125aea303515f4801655f56",
"to":"0xf6dbe280ec7e9262364c41cc6cf90c956b7ed47d","value":99999.0,
"erc721TokenId":null,"erc1155Metadata":[],"toke...
```

## Kết luận (trả lời đúng câu hỏi gốc)

1. **`alchemy_getAssetTransfers` KHÔNG bị giới hạn 10 block như `eth_getLogs`.** Span 2,8 triệu
   block (toàn bộ vùng mù 31/08 → 15/09) trả 200 trong 372 ms trên **gói free**.
2. **Không dính rate limit** khi bắn 5 call liên tiếp — nghĩa là hạn mức là **CU/tháng**, không
   phải chặn span. Đây là API riêng của Alchemy (indexed), không đi qua đường `eth_getLogs`.
3. Có sẵn `pageKey` để phân trang, `maxCount` 0x3e8 (1.000 dòng/trang).
4. Category `external` bao được **native BNB** — nghĩa là không cần đọc full block nữa.

## Hệ quả cho backfill (đổi hẳn kế hoạch)

| | Kế hoạch cũ (`eth_getLogs` + đọc full block) | Kế hoạch mới (`alchemy_getAssetTransfers`) |
|---|---|---|
| ERC20 | ~6.700 request, 1,5–3 giờ chạy | 1 call/ví (+ phân trang) ≈ **1.100–1.500 call** |
| Native BNB | ~55.800 request, 8–30 giờ chạy | gộp cùng trên, category `external` |
| Tổng thời gian chạy | 10–33 giờ | **~10–20 phút** |

⚠️ Điểm phải giữ: giá trị `value` Alchemy trả về là **số thực (float)** — TUYỆT ĐỐI không dùng.
Phải đọc `rawContract.value` (hex) và quy đổi bằng BigInt string theo đúng luật token math của dự án.

## Việc còn lại
- Xoá `alchemy-transfers-probe` sau khi chốt (giống `alchemy-probe`, `quicknode-probe`).
- Viết lại Bước A của backfill theo đường `alchemy_getAssetTransfers` (chờ Cha chốt mốc đầu vùng mù).
