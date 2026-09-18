# PREVIEW V2 — 249 dòng ĐÃ LỌC đếm trùng / hop-chain (23/08/2026, CHƯA GHI GÌ)

Việc 3 đã **DỪNG** theo chỉ đạo. Tài liệu này chỉ tính lại số, không có lệnh ghi.

## 1. Đối chiếu với 42 nhóm tx_hash trùng (88 dòng, báo cáo 20/08)

Định nghĩa tập 249 = `donations` BTC `status='confirmed'` AND `is_external=true` AND `sender_id IS NOT NULL`
(246 dòng `external_excluded` + 3 dòng `external_to_father`).

- **21/249 dòng** nằm trong các nhóm `tx_hash` có >1 dòng (thuộc 42 nhóm/88 dòng) — **99.569,42 USD**.
- Trong đó **3 dòng** đúng bằng nhóm "3/13 trùng thật" đã liệt kê ở mục B báo cáo đầu:
  | tx | sender → recipient | USD |
  |---|---|---|
  | `191e6eb58f4e60c7…` | angelutopia → angelaivan | 1,97 |
  | `57b45147b31c7038…` | nguyenthu688 → angelthanhtien | 2,04 |
  | `df81b101d831d97c…` | leminhtri → angelthanhtien | 201,53 |
- Dòng nặng nhất trong 21: `2f38060e1ff43938…` funtreasury → angeldieungoc **98.419,42 USD** (nhóm 2 dòng).

## 2. Đối chiếu với 14 tx hop-chain

- **2/249 dòng** thuộc tx hop-chain:
  | tx | sender → recipient | USD | ghi chú |
  |---|---|---|---|
  | `05a78ade04d044c9…` | angelkim → angelthutrang | 9.280,15 | 3 vout (angelkim, angelthutrang), DB 1 dòng |
  | `d01485d0e5102ed0…` | angelkim → angelquynhhoa | 219,92 | 4 vout (angelkim, angelquynhhoa), DB 1 dòng |
- `6bd3f1f5065a1dc1…` (36 vout của angelkim) **không** nằm trong 249 vì `sender_id IS NULL`.

## 3. Quyết định lọc (bảo thủ)

Loại **23 dòng / 109.069,49 USD** khỏi danh sách flip:
- 21 dòng thuộc nhóm tx trùng (bao gồm 3 dòng trùng thật),
- 2 dòng hop-chain (cần bóc theo vout, chưa có `vout_index`).

**Danh sách flip mới: 226 dòng / 224.149,72 USD.**

23 dòng bị loại **giữ nguyên** `is_external=true` và chuyển sang hồ sơ "cần bóc vout / xác minh trùng"
trước khi xét lại từng dòng.

## 4. Mô phỏng lại bằng đúng logic RPC thật

Kiểm chứng: chạy bản mô phỏng với flip = ∅ cho **khớp 100% 12/12 dòng** với `get_benefactor_leaderboard(12,0,'all','BTC')`.

### Kịch bản B (flip 226 dòng, giữ funtreasury)
| # | User | USD | Tx | So với PREVIEW v1 |
|---|---|---|---|---|
| 1 | father | 705.918,56 | 12 | = |
| 2 | funtreasury | 162.864,27 | 15 | −98.419,42 |
| 3 | angelutopia | 114.186,45 | 29 | −1,97 |
| 4 | angelkim | 71.832,59 | 20 | −9.500,07 |
| 5 | angelthienhanh68 | 69.974,74 | 11 | = |
| 6 | angelthanhtien | 26.035,01 | 34 | −220,51 |
| 7 | angelthuha | 5.530,17 | 21 | −28,78 |
| 8 | angelanhnguyet | 4.524,39 | 2 | = |
| 9 | leminhtri | 2.202,45 | 16 | −654,97 |
| 10 | sinhhoatlovehouseycha | 2.120,43 | 3 | = |
| 11 | angelgiau | 1.402,12 | 18 | — |
| 12 | angelquan | 1.036,36 | 38 | — |

### Kịch bản C (flip 226 dòng, loại funtreasury 2 chiều)
| # | User | USD | Tx |
|---|---|---|---|
| 1 | father | 705.918,56 | 12 |
| 2 | angelutopia | 114.186,45 | 29 |
| 3 | angelkim | 71.832,59 | 20 |
| 4 | angelthienhanh68 | 69.874,15 | 10 |
| 5 | angelthanhtien | 26.035,01 | 34 |
| 6 | angelthuha | 5.530,17 | 21 |
| 7 | angelanhnguyet | 4.524,39 | 2 |
| 8 | leminhtri | 2.202,45 | 16 |
| 9 | sinhhoatlovehouseycha | 2.120,43 | 3 |
| 10 | angelgiau | 1.335,18 | 17 |
| 11 | angelquan | 1.036,36 | 38 |
| 12 | angelkhanhi | 1.028,71 | 9 |

Stub `wallet_0x50ebe82ce05adf3dd`: **0 dòng** xuất hiện ở cả B và C (đúng thiết kế `exclude_from_leaderboard`).

## 5. Giải trình: vì sao mô phỏng lần trước không tự loại đếm trùng

Đây là **thiếu sót ở bước chuẩn bị Preview**, không phải lỗi RPC:

1. Tập 249 dòng được dựng **chỉ theo cờ** (`is_external=true` + `sender_id NOT NULL`) — một truy vấn thuần metadata, không join với kết quả kiểm toán on-chain của ngày 20/08.
2. Danh sách 42 nhóm/88 dòng trùng và 14 tx hop-chain **chưa từng được ghi vào `docs/`** (chỉ nằm trong báo cáo hội thoại) ⇒ không có nguồn dữ liệu nào để bước dựng Preview tự đối chiếu.
3. `get_benefactor_leaderboard` **không có** cơ chế chống trùng theo vout: `donations.vout_index` NULL ở toàn bộ các dòng liên quan, và RPC chỉ `COUNT(DISTINCT tx_hash)` cho số giao dịch nhưng `SUM(amount_usd)` cho tiền ⇒ 2 dòng cùng hash vẫn cộng tiền 2 lần. RPC chạy đúng đặc tả của nó; đặc tả mới là chỗ thiếu.
4. Hệ quả: mô phỏng v1 đã flip cả 23 dòng nghi vấn, làm phồng funtreasury +98.419,42 và angelkim +9.500,07.

**Hành động đề xuất tiếp theo (chưa làm):** ghi 42 nhóm trùng + 14 tx hop-chain thành file evidence cố định trong `docs/audit/` để mọi Preview sau bắt buộc join vào, và bổ sung `vout_index` + unique key `(tx_hash, vout_index)` cho BTC donations.

**CHƯA GHI GÌ.** Chờ CTO xác nhận số mới trước khi soạn lệnh ghi cho 226 dòng.
