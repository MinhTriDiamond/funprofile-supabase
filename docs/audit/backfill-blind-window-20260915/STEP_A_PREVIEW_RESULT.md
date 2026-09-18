# BƯỚC A — Kết quả Preview backfill vùng mù (CHƯA ghi tài chính)

Ngày chạy: 15/09/2026 01:35 → 02:10 UTC. Job Preview: `4cb53386-74a2-4463-98fa-16f29b789baf`.
Function: `supabase/functions/scanner-backfill-window/index.ts` (Alchemy Transfers API).
**Chỉ ghi `admin_backfill_jobs` + `admin_backfill_candidates`. Không chạm `donations` /
`transactions` / `wallet_transfers`. Không chạm `scanner_watermarks` của cron sản xuất.**

## 1. Mốc vùng mù (mục 3 — đo từ dòng ghi nhận THÀNH CÔNG cuối cùng)

| Nguồn | Dòng thành công cuối | Block |
|---|---|---|
| `wallet_transfers` (Moralis) | 2026-08-31 12:07:29 UTC | 119.148.670 |
| `donations` external | 2026-09-15 01:28 UTC (đường RPC mới, đang sống) | — |

Lùi thêm **6 giờ an toàn** ⇒ mốc bắt đầu backfill:

- `from_block` = **119.099.687** (2026-08-31 06:00:00 UTC, xác nhận bằng timestamp block thật)
- `to_block` = **121.941.956** (2026-09-15 01:35 UTC)
- Vùng quét: 2.842.269 block ≈ 14,8 ngày chuỗi. Gộp ERC20 + native BNB một lượt (mục 4 đã duyệt).

## 2. Bằng chứng raw JSON (mục 1) — 2 ví thật

Probe: `alchemy-transfers-probe`, span 2.800.000 block, 1 call/lát, `pageKey = null` ở cả 2 ví
(tức 1 call là đủ cho toàn vùng mù, `maxCount` 1.000/trang).

| Ví | Loại | erc20_in | native_in | erc20_out | pageKey |
|---|---|---|---|---|---|
| `0x746b2f4f…605eb6` | nhiều giao dịch (1.129 dòng DB) | 61 | 3 | 49 | null |
| `0x79ea70b2…aabec3` | ví thường (5 donations) | 94 | 1 | 49 | null |

Mẫu raw (ví nhiều giao dịch, lát `erc20_in`):

```json
{"asset":"USDT","blockNum":"0x72070b1","category":"erc20",
 "from":"0x3862e0c387ff897d5e2907d8da442f5d91366037",
 "hash":"0x5dfe7cc98a1b00c6ee9855408885a010ed7e6990623ac9791c54f1c6fafa51af",
 "metadata":{"blockTimestamp":"2026-09-02T16:22:53.000Z"},
 "rawContract":{"address":"0x55d398326f99059ff775485246999027b3197955",
                "decimal":"0x12","value":"0xe8d4a51000"},
 "to":"0x746b2f4f2aa383a1fe7fabce14170f3507605eb6",
 "uniqueId":"0x5dfe7cc9…51af:log:497","value":0.000001}
```

Mẫu raw native BNB (category `external`, `rawContract.address = null`):

```json
{"asset":"BNB","blockNum":"0x73bd3c3","category":"external",
 "from":"0x70e64354b1ab6de8bc3acf32223aee5158eaa966",
 "hash":"0xc067a4850cefdebfd64546e1f03b62d66a398107399fae1e9ab5a9e65e96c82b",
 "metadata":{"blockTimestamp":"2026-09-12T00:53:58.000Z"},
 "rawContract":{"address":null,"decimal":"0x12","value":"0x2bdc545d587500"},
 "to":"0x746b2f4f2aa383a1fe7fabce14170f3507605eb6",
 "uniqueId":"0xc067a485…c82b:external","value":0.0123456789}
```

⚠️ Code chỉ đọc `rawContract.value` (hex → BigInt string). Trường `value` (float, ví dụ
`0.0123456789`) **không được dùng ở bất kỳ đâu**.

## 3. Hạn mức CU (mục 2 + phần bổ sung)

Đơn giá tài liệu Alchemy: `alchemy_getAssetTransfers` = **120 CU/call**.

| Việc | Số call | CU | % của 30M free |
|---|---|---|---|
| 1 lượt full-scan 1.037 ví (đo thật lượt 2) | 1.037 | ~124.440 | 0,41 % |
| Job Preview này (2 lượt, gồm lượt quét lại) | 1.935 | 232.200 | 0,77 % |
| Reconcile định kỳ **2 lần/ngày** × 30 ngày | 62.220 | ~7,5M | **25 %** |
| Reconcile định kỳ 1 lần/ngày × 30 ngày | 31.110 | ~3,7M | 12 % |

Làm rõ con số 10.290 CU trong ảnh Cha gửi: đó là **chỉ 2 lượt probe + vài call đọc block**,
không phải quét 1.037 ví.

**Kết luận:** phát hiện thường xuyên (mỗi 2 phút) vẫn đi `eth_getLogs` free (blxrbdn) — không tốn
CU; Alchemy Transfers dùng cho **đối chiếu định kỳ 2 lần/ngày** ⇒ tổng ~25 % hạn mức free, còn
biên an toàn 75 %. **Không cần mua Moralis/Etherscan.**

## 4. Kết quả đối chiếu Preview (mục 6)

1.037 ví EVM giám sát, **0 ví lỗi** ở lượt 2 (đã thêm thử-lại giãn cách cho 429 CU/s).

| Phân loại | Số dòng | Ý nghĩa |
|---|---|---|
| `already_in_db` | 1.623 | Đã có trong Cloud — sẽ KHÔNG ghi lại |
| `dust_filtered` | 1.314 | Dưới ngưỡng bụi spam — KHÔNG ghi |
| **`external_in`** | **59** | Tiền vào từ ví ngoài — **thiếu thật** |
| **`internal`** | **52** | Chuyển nội bộ giữa 2 ví hệ thống — **thiếu thật** |
| `swap_suspect` | 0 | — |

Tổng cần ghi nếu Cha CONFIRM: **111 dòng**.

Chia theo token (chỉ phần thiếu thật):

| Token | external_in | Tổng external_in | internal | Tổng internal |
|---|---|---|---|---|
| CAMLY | 8 | 312.440.385,579 | 39 | 26.071.988 |
| USDT | 43 | 27.044,84 | 9 | 229 |
| BNB | 8 | 3,2921 | 4 | 0,1228 |

### Giao dịch lớn đáng chú ý

| Người nhận | Token | Số lượng | Block | Hash |
|---|---|---|---|---|
| **funtreasury** | CAMLY | **300.000.000** | 121.376.275 | `0x1f9c7388281d56d12a927e35d27f3af625fd74152f54ff8f9b1ecea1ba35d98a` |
| angelthienhanh68 | CAMLY | 15.000.000 | 120.980.908 | `0xd8d89d35bda0bc40559ce66d9b1862a6d417d45c5b0ea2f0cb991ec33d3f97f2` |
| angellam | BNB | 2,09999 | 121.603.073 | `0x12ba28354c0639bdecc2954851a234cc6a1707185c2e7280e22b6f412a82e712` |
| tranphuong | CAMLY | 3.563.320,28 | 120.437.558 | `0xae10d4ae270be7584c84b76d444193c2cbc944c6c478e4b166c200aea65ac574` |

Lưu ý: giao dịch CAMLY vào `funtreasury` tìm được là **300 triệu**, không phải 84 triệu như Cha
nhắc — cần Cha xác nhận đây có đúng là giao dịch Cha nói tới, hay còn giao dịch khác nằm ngoài
1.037 ví đang giám sát.

## 5. Verify cảnh báo sức khoẻ (mục 5)

Không cần giả lập: watchdog đã bắt **lỗi thật** và gửi cảnh báo cho **7 admin** lúc
`2026-09-15 01:30:09 UTC`, nội dung metadata nguyên văn:

```json
{"kind":"watermark_lag","source":"native",
 "detail":"Watermark tụt 3896 block so với head (ngưỡng 3000).","stalled_minutes":2}
```

Chạy lại lúc 02:12 UTC: `healthy: false`, phát hiện `native` tụt 9.685 block, `dedupe_skipped:
true` (đúng thiết kế chống spam 3 giờ). Cơ chế cảnh báo hoạt động đúng end-to-end.

**Tồn đọng phát sinh:** luồng native BNB của cron đang tụt ~9.700 block (~8 giờ chuỗi) — quét
native theo full block quá chậm. Đề xuất chuyển native sang Alchemy Transfers (category
`external`) trong đợt sau.

## 6. Đang chờ Cha CONFIRM

Ghi **111 dòng** (59 external_in + 52 internal) vào `donations`/`transactions` qua `ingestTransfer`
(idempotent `(tx_hash, user_id)`, địa chỉ lowercase, amount BigInt string, ví ngoài
`is_external = true`, không tạo `gift_celebration`), audit lý do
`scanner_blind_window_backfill_20260915`.
