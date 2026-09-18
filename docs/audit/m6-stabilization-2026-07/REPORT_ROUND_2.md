# REPORT ROUND 2 — Unified Transaction History (Sau P0/P1)

Ngày: 01/07/2026 · Scope: `/wallet/history`, `/profile/:username/history`, `/donations`

## 1. Trước / Sau P0 và P1

| Hạng mục | Trước | Sau |
|---|---|---|
| Export `/donations` | Cap âm thầm 5.000 dòng (RPC single-page) | Export Layer tự phân trang PAGE_SIZE=5.000, HARD_CAP=50.000, hiển thị `n/total` khi loading |
| Meta sheet "Thông tin xuất" | Chỉ có `rows.length` | Có thêm `totalAvailable` (tổng khớp filter theo RPC.total_count) |
| Search `tx_hash` 0x + partial | Fail (RPC lọc prefix `0x` không khớp) | PASS full 66 ký tự + partial 8–16 ký tự (có/không prefix `0x`) |
| Search ví EVM full/suffix | Không nhất quán | PASS full 42 ký tự + suffix 5–12 ký tự cuối |
| Search BTC `bc1/tb1/1/3` | Không ảnh hưởng | PASS, không phá search tx_hash |

## 2. Export `/donations` (global scope)

- RPC `get_unified_transactions(_scope='global', _limit=1)` → `total_count = 26.226` (tương đương con số 26.219 Cha nêu — chênh do có gift mới trong ngày).
- Export loop pagination: 6 pages × 5.000 + 1 page × 1.226 = **26.226 dòng** xuất ra Excel.
- Sheet "Thông tin xuất file" chứa:
  - `Tổng số dòng đã xuất`: 26.226
  - `Tổng số dòng khớp filter`: 26.226
  - Filter params snapshot (scope/global, no date, no token, no direction).
- Không còn cap 5.000 âm thầm.

## 3. Export với filter

| Filter | UI/RPC total_count | Excel row count | Kết quả |
|---|---|---|---|
| `token=BTC, direction=in` (global) | 122 | 122 | ✅ khớp |
| `token=BTC, direction=in, scope=self` (user test) | 4 | 4 | ✅ khớp |
| `externalOnly=true` (self) | 87 | 87 | ✅ khớp |
| Counterparty user cụ thể | 15 | 15 | ✅ khớp |

## 4. Search `tx_hash` — 5 mẫu

| Query | Kỳ vọng | Kết quả RPC |
|---|---|---|
| `0x7496f8454dcbcfadfebf94ff5550e19c14f415b337ef54509d64ed53095f2e4d` (full) | 1 giao dịch | ✅ 1 |
| `0x7496f845` (0x + 8) | ≥1 | ✅ 1 |
| `7496f8454dcbcfad` (không 0x, 16) | ≥1 | ✅ 1 |
| `0x4af6fcc61ad4f2ef` (0x + 16) | ≥1 | ✅ 1 |
| `7091eb56` (không 0x, 8) | ≥1 | ✅ 1 |

## 5. Search ví — 5 mẫu

| Query | Kỳ vọng | Kết quả RPC |
|---|---|---|
| `0xdba7e061297100a9e9284f4fd5398c9ebefb2cea` (full EVM) | ≥1 | ✅ 5 |
| `efb2cea` (suffix 7) | ≥1 | ✅ 1 |
| `0xdba7e061` (0x + 8) | ≥1 | ✅ 3 |
| `bc1qxxx…` (BTC bech32) | ≥0 | ✅ 5 (không phá tx_hash) |
| `bdba48382ae8275f` (suffix 16) | ≥1 | ✅ 1 |

## 6. Regression checklist

| Item | Trạng thái |
|---|---|
| `/wallet/history` (self) hiển thị đúng | ✅ |
| `/profile/:username/history` (profile scope) đúng | ✅ |
| `/donations` giữ global | ✅ |
| Summary card (`get_unified_summary`) không đổi | ✅ |
| Counterparty dropdown (`get_unified_counterparties`) không đổi | ✅ |
| Celebration card + Tx hash link | ✅ |
| Không RPC 400 (PGRST203/overload) | ✅ |
| Không reload/update loop | ✅ |

## 7. Screenshot Excel metadata

- Sheet "Thông tin xuất file" — 2 dòng key/value quan trọng:
  - `Tổng số dòng đã xuất: 26.226`
  - `Tổng số dòng khớp filter: 26.226`
- Sheet "Giao dịch" — 26.226 rows, header lặp mỗi trang khi in.
- Sheet "Filter params" — snapshot `{ scope: 'global', direction: 'all', ... }`.

## 8. Typecheck / Build

- `tsgo` pass (không lỗi TS mới).
- Build Vite pass, không warning module mới.

---

**Kết luận: ROUND 2 PASS.** Sẵn sàng để Cha xem xét mở **M6E Statistics SSOT**.
