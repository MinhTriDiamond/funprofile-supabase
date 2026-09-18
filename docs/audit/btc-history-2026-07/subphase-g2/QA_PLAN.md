# G2 · QA_PLAN — QA 7 user + regression rộng

**Spec-only.** G3 impl QA harness.

## 1. Golden set (7 user)
| User | Vai trò | Ưu tiên |
|---|---|---|
| angelutopia | G1 trọng tâm | P0 |
| angelkim | G1 trọng tâm (nặng nhất) | P0 |
| angelthienhanh68 | G1 trọng tâm | P0 |
| angelthuha | G1 read-only | P1 |
| angelhoangtydo | G1 read-only | P1 |
| trogiauco | G1 read-only | P1 |
| father | Treasury, Cha duyệt thủ công | P2 (chạy cuối) |

## 2. Per-user checks (P0 pass rồi mới P1)

### 2.1 Truth table
- Shadow classify vs on-chain phải match 100%.
- `unexplained.csv = 0 rows`.
- `missing_donations.csv` = 0 rows sau backfill.

### 2.2 Before/after diff per user
Bảng:
| Metric | Before | After |
|---|---|---|
| Total BTC donations | | |
| Rows superseded | 0 | N |
| Rows added (missing recovered) | 0 | M |
| Rows moved to review queue | 0 | K |
| `is_external` sai | ? | 0 |
| `chain_family='evm'` với hash BTC | ? | 0 |

### 2.3 UI check thủ công (3 màn)
- **Wallet History** (`/wallet` → tab BTC): tx list đúng, không double, không missing.
- **Public Donation History** (`/@username` → tab Donations): recipient/sender chính xác, không hiện tx exchange.
- **Benefactors board** (`/@username` → tab Benefactors): top donors không có exchange giả mạo.

## 3. Regression suite (chạy trên toàn hệ thống)

| Check | Target |
|---|---|
| RC-10: tx dính Class A KHÔNG sinh donation mới | 0 rows |
| RC-11: duplicate `(tx_hash, vout_index, recipient_address)` | 0 rows |
| RC-12: `chain_family='evm'` cho hash 64hex không `0x` | 0 rows |
| RC-13: mỗi vout thoả rule đều có row semantic | 100% coverage |
| RC-15: `is_external` = XOR ownership | 100% consistent |
| RC-16: coinjoin có row review_queue, KHÔNG donation | 100% |
| RC-17: change output không bị nhận diện recipient | 0 rows |

## 4. Leaderboard sanity (không sửa ở G2/G3, chỉ đo delta)
- So sánh top 20 benefactors trước/sau shadow rebuild.
- Ghi delta vào `leaderboard_delta.csv` để plan G7.
- G7 mới thực sự rebuild leaderboard/benefactors từ SSOT.

## 5. Fetch QA
- 0 fetch error trong `fetch_errors.csv`.
- Cache hit rate > 80% trên lần chạy thứ 2.

## 6. Rollback drill
- Trong QA harness: set flag=false, verify wallet UI quay lại v1 trong <5s.
- Set flag=true trở lại, verify shadow store không mất data.

## 7. Sign-off
- P0 pass → Cha duyệt mở P1.
- P1 pass → Cha duyệt Father (P2).
- Toàn bộ pass → Cha duyệt cutover G6.
- Cutover xong → Cha duyệt G7 (leaderboard rebuild).
