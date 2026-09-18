# Moralis vs Etherscan — báo cáo 15/09/2026 (read-only, không ghi bảng nào)

## MỤC 0 (ưu tiên) — Moralis trial ĐÃ HẾT VÀ ĐANG GÂY MÙ ON-CHAIN THẬT

### Bằng chứng thô

Log `fast-scan-donations` (15/09/2026 00:03:01Z):

```
ERROR [moralisFetch] provider error 401 @ https://deep-index.moralis.io/api/v2.2/erc20/0x55d398326f99059ff775485246999027b3197955/transfers:
{"message":"Your Moralis Free usage is paused. Upgrade to a paid plan to resume usage..."}
WARNING [moralisFetch] circuit-breaker: key …tQO-pk tạm ngừng tới 2026-09-16T00:00:00.000Z (status 401)
WARNING [moralisFetch] key #0 trả về 401, fallback sang key #1
WARNING [moralisFetch] circuit-breaker: key …N1PbBQ tạm ngừng tới ... (status 401)
WARNING [moralisFetch] circuit-breaker: key …2QsFvw tạm ngừng tới ... (status 401)
```

Log `auto-scan-donations` (15/09/2026 00:00–00:02Z):

```
ERROR [moralisFetch] fail-fast: tất cả key Moralis đang tạm ngừng, không gọi HTTP   (× 40+ dòng)
ERROR [auto-scan-donations] PROVIDER UNAVAILABLE — 20 lỗi Moralis, kết quả quét KHÔNG đầy đủ
INFO  Auto-scan complete: 0 EVM + 0 BTC new transfers, next cursor: 50
```

⇒ CẢ 3 key Moralis (`MORALIS_API_KEY`, `_2`, `_3`) đều 401. Không phải hết quota ngày — là **Free plan bị pause**, hết hạn trial.

### Thiệt hại thật (raw)

```
wallet_transfers   → dòng mới nhất: 2026-08-31 12:07:29+00   (15 ngày không có dòng nào)
donations external → dòng mới nhất: 2026-09-03 05:04:16+00   (12 ngày không có dòng nào)
transactions       → 2026-09-14 23:44:59  (vẫn chạy: đây là giao dịch nội bộ do app tự ghi, không phải scanner)
```

donations `is_external` theo ngày: 01/09 = 1 · 02/09 = 5 · 03/09 = 4 · **04/09 → 14/09 = 0 mỗi ngày**.

⇒ Hệ thống **mù hoàn toàn với tiền nạp từ ví ngoài từ 03–04/09/2026**. Quà tặng trong app vẫn ghi bình thường (148–345 dòng/ngày) vì đường đó không đi qua Moralis.

### Phần vẫn còn sống

`fast-scan-donations` có nhánh RPC watermark (scanner-rpc-watermark v1) vẫn khoẻ:
`scanner_tick_log` 15/09 00:04 → `ok:true`, `mode:compare_only_phase1`, `wallets_tracked:1037`, `rpc_healthy:9`, `watermark_advanced:true`, `missing_in_db:0`.
Nhưng nhánh này đang ở chế độ **compare_only** (chỉ đối chiếu, không ghi), nên không bù được phần Moralis chết.

### Lỗ hổng cảnh báo — cần vá

```sql
select count(*) from notifications where type='moralis_quota_alert';  -- 0
```

Moralis chết 12 ngày mà **admin không nhận được 1 thông báo nào**. Đường `flushMoralisQuotaAlerts` không được gọi ở nhánh 401 "usage paused" (khác nhánh quota %). Đây là nợ kỹ thuật riêng: mù dữ liệu + mù cảnh báo cùng lúc.

### Việc gấp

1. Nạp gói Moralis trả phí (hoặc bật nhánh RPC watermark sang chế độ ghi).
2. Sau khi có key sống: backfill từ 2026-08-31 tới hiện tại cho `wallet_transfers` + external donations.
3. Vá cảnh báo 401 "usage paused".

---

## MỤC 1–5 — CHẶN, KHÔNG THỂ CHẠY SO SÁNH THẬT

Lệnh yêu cầu **gọi cả 2 API cho cùng tập tx_hash và dán raw JSON**. Bé dừng và báo cáo trước thay vì mô tả chung chung, vì cả hai đầu đều không gọi được:

### Etherscan — verify live, đúng như CTO đã xác nhận

```
GET https://api.etherscan.io/v2/api?chainid=56&module=proxy&action=eth_getTransactionByHash&txhash=0xa7274c...8401
{"status":"0","message":"NOTOK","result":"Free API access is not supported for this chain. Please upgrade your api plan for full chain coverage. https://etherscan.io/apis"}

GET .../v2/api?chainid=56&module=account&action=tokentx&address=0xa4967d...da5d&page=1&offset=5&sort=desc
{"status":"0","message":"NOTOK","result":"Free API access is not supported for this chain. Please upgrade your api plan for full chain coverage."}
```

- BSC (56) chặn ở tầng API, không chỉ ở tài liệu. Free tier **không gọi được 1 endpoint nào** cho BSC.
- Project **không có secret `ETHERSCAN_API_KEY`** (đã kiểm 57 secret hiện có) ⇒ không có gì để thử.

### Moralis — cũng không gọi được lúc này

Cả 3 key 401 (mục 0). Không thể lấy raw JSON phía Moralis để đặt cạnh nhau.

⇒ **Bảng so sánh field-by-field thật + raw JSON internal transaction chỉ làm được sau khi có 1 key Moralis sống và 1 key Etherscan Lite.** Bé không viết bảng suy đoán từ tài liệu để tránh CTO đối chiếu trên số giả.

### Tập mẫu đã chọn sẵn (chạy được ngay khi có key)

Từ `donations` 14 ngày gần nhất:

| # | tx_hash | token | chain_id | loại |
|---|---|---|---|---|
| 1 | 0xa7274cac3364fa454016d997a06103469ef38396bc675eba609d54c297498401 | CAMLY | 56 | BEP20 transfer |
| 2 | 0x10bc4780ea317fa1aa33021b0d0c77bb2ffa45295491b3fd1d484909a1208357 | CAMLY | 56 | BEP20 transfer |
| 3 | 0xd32fecaceef9c9358cab08db9e2d93f73824e15bae00ab235a5aafc57af2092d | FUN | 97 | testnet — Etherscan cũng paid-only |

Còn thiếu: 2–3 tx contract-call/internal (pet-shop, mystery-box) — bé sẽ trích thêm từ `pet_shop_orders` / mystery box khi chạy vòng so sánh thật.

---

## CHI PHÍ — tính lại sau khi sửa sai $0

| Phương án | Chi phí/tháng | Ghi chú |
|---|---|---|
| Chỉ Moralis trả phí | Moralis Pro (~$199) | đủ dùng theo đánh giá 05/09 (~100k CU/lần full-scan ≈ 4% hạn mức) |
| Chỉ Etherscan | Lite $49 | mất cursor không giới hạn; giới hạn 10.000 kết quả/địa chỉ theo tài liệu — rủi ro cho ví treasury |
| Song song cả 2 (đối chiếu chéo) | ~$248 | **không phải $199 + $0** như nêu sai trước đó |

Khuyến nghị của bé: trả tiền Moralis trước để cắt mù on-chain ngay hôm nay; quyết Etherscan Lite sau, khi đã có số so sánh thật.
