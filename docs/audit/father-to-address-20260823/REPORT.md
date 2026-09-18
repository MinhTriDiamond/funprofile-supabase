# READ-ONLY — to_address = ví Cha nhưng không khớp on-chain (23/08/2026)

Ví gốc Cha xác nhận: `bc1qgxf7c63apt54h06g876y4ctq0me3jh86fta8sv`

## Tập đang xét
`transactions` có `lower(to_address)` = ví Cha: **58 dòng / 39 tx_hash** (04/04/2026 → 11/06/2026).
On-chain (mempool.space, toàn bộ lịch sử): **20 tx**, trong đó **13 lần NHẬN**.

## Bước 0 — loại trừ trùng việc đã xử lý hôm nay
- `btc-manual-%`: **1 dòng** = chính dòng orphan `92b63665-…` (btc-manual-1775881266455) → đã có kết luận riêng.
- 16 dòng btc-manual của donations (merge/pending_verification) không nằm trong tập này (khác bảng).

## Nhóm kết quả
| Nhóm | Số dòng | Hash | Ghi chú |
|---|---|---|---|
| (a) trùng việc đã xử lý | 1 | 1 | orphan `92b63665…` |
| Khớp on-chain thật | 15 | 10 | thuộc 13 lần nhận thật |
| (c) đếm trùng multi-vout | **0** | 0 | không hash nào của nhóm nghi trùng với 13 tx thật |
| (b) do đợt aux-sai 11/06 & 21/06 | 0 theo created_at (xem cảnh báo) | | |
| (d) chưa giải thích được | **42** | **28** | 3,31262316 BTC |

13/13 tx nhận thật đều có dòng DB (10 hash trong tập to_address=Cha; 3 hash `91683fc8…`, `e5f5be72…`, `24469437…` có dòng nhưng to_address là địa chỉ khác) → **không mất giao dịch thật**.

## Bản chất nhóm (d)
28 hash đều là **tx Bitcoin thật, tồn tại on-chain, mỗi tx 2 vout, KHÔNG có vout nào trả về ví Cha hay aux của Cha**.
Đối chiếu `donations` cùng hash: **người nhận trong donations là ĐÚNG** (angelthutrang, angeldieungoc, angelthuha, angelthuhuyen, angelanhnguyet…) với `recipient_address` đúng on-chain.
⇒ Sai sót nằm **chỉ ở `transactions.to_address` (và user_id phía nhận bị gán thêm cho Cha)**, không phải tiền ảo, không phải donation bịa.

## Truy nguồn ghi (mục 3)
`transactions` không có cột provenance. Bằng chứng gián tiếp:
- 34 dòng `wallet_transfers` phía Cha cùng bộ hash có `chain_family='btc'` (giá trị legacy) và `classifier_version = NULL`. Trong toàn bộ codebase **chỉ `wallet-reconciliation-cron` ghi `chain_family: "btc"`** → nhánh này khớp họ sự cố aux-sai (cron resolve chủ ví qua `profile_btc_aux_addresses`).
- **Cảnh báo timing:** cả `transactions.created_at` và `wallet_transfers.created_at` đều bị **backdate về block_time**, nên KHÔNG dùng được để xác định thời điểm ghi. Vì vậy câu hỏi "% nhóm (c) rơi vào khung 11/06 09:00/13–15:00/20:00 và 21/06" **không trả lời được bằng created_at** (0% theo mặt chữ, nhưng vô nghĩa về mặt bằng chứng).
- `profiles_wallet_audit` chỉ bắt đầu ghi từ 06/2026 → không có log đổi ví tháng 4.

## Ảnh hưởng USD
- Các con số công khai dựa trên `donations` **không bị ảnh hưởng** (donations gán đúng người nhận): $0.
- Nếu bất kỳ chỗ nào tính từ `transactions`/unified history theo `to_address`, nhóm (d) sẽ thổi phồng phía "nhận" của Cha thêm **3,31262316 BTC ≈ $178.571,50** (giá tại thời điểm donation).
- Tổng donations Cha nhận (confirmed): 611 dòng / $2.116.276,14 (BTC: 14 dòng / $2.091.037,62 — gồm 22 BTC ngày 11/06).
