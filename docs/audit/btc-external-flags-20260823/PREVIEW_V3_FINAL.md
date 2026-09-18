# PREVIEW V3 — FINAL (23/08/2026, CHƯA GHI GÌ)

Thay thế PREVIEW_V2_FILTERED.md. Kết luận V2 (loại 23 dòng) **SAI** — đã verify riêng từng dòng bằng on-chain.

Bằng chứng thô: `evidence/onchain_verify_23_tx.txt`, `evidence/onchain_raw_23_tx.json`, `evidence/dup_tx_groups.txt`.

---

## 1. Giải trình mâu thuẫn sender (Việc 1)

Không phải đọc nhầm. **Mỗi tx_hash có NHIỀU dòng donations khác nhau.**

`57b45147b31c7038…` — on-chain: 1 vin ví ngoài `bc1qr5ehesy…`, 2 vout (0.000028 → angelthanhtien; 0.00001395 → EXT)

| id | sender → recipient | amount | usd | is_external | recipient_address | Khớp on-chain |
|---|---|---|---|---|---|---|
| `57ad20eb` | nguyenthu688 → angelthanhtien | 0.00002800 | 2,04 | **true** | `bc1ptz7r9scz…` | ✅ = vout[0] |
| `c8635840` | angelutopia → trianaresa4g272q | 0.000028 | 2,04 | false | (rỗng) | ❌ không có vout |
| `2aa03db5` | angelutopia → chimalo19 | 0.000028 | 2,04 | false | (rỗng) | ❌ không có vout |

`df81b101d831d97c…` — on-chain: 2 vout (0.0028 → angelthanhtien; 0.02658513 → EXT)

| id | sender → recipient | amount | usd | is_external | Khớp on-chain |
|---|---|---|---|---|---|
| `f5456ff2` | leminhtri → angelthanhtien | 0.00280000 | 201,53 | **true** | ✅ = vout[0], recipient_address khớp |
| `7e841763` | angelutopia → chimalo19 | 0.0028 | 201,53 | false | ❌ |
| `c00778c8` | angelutopia → trianaresa4g272q | 0.0028 | 201,53 | false | ❌ |

**Đảo ngược kết luận đầu buổi:** dòng `is_external=true` (có `recipient_address` khớp vout thật) mới là **dòng THẬT**;
dòng `is_external=false` của angelutopia (recipient_address rỗng, recipient không xuất hiện trong vout) mới là **dòng thừa**
— và các dòng thừa này **đang được tính vào leaderboard**.

## 2. Verify riêng 21 dòng "thuộc nhóm tx trùng" (Việc 2)

Tất cả 21/21 dòng đều khớp **đúng 1 vout thật** theo cả `amount` và `recipient_address`:

| tx | dòng flip | amount | vout khớp | KL |
|---|---|---|---|---|
| `2f38060e…` | funtreasury → angeldieungoc **98.419,42 USD** | 1.47027000 | vout[1] `bc1qrq0v066…` = angeldieungoc, đúng 1.47027000 | ✅ SẠCH |
| `4e6fdcc8…` | angelgiau → angelquynhhoa | 0.003 | vout[0] angelquynhhoa | ✅ |
| `9da49e2a…` | leminhtri → angelquangvu | 0.0028 | vout[1] angelquangvu | ✅ |
| `be7ac972…` | leminhtri → angelaivan | 0.0028 | vout[0] angelaivan | ✅ |
| `df81b101…` | leminhtri → angelthanhtien | 0.0028 | vout[0] angelthanhtien | ✅ |
| `5eff4551…` | angelthanhtien → murphy358 | 0.001 | vout[0] murphy358 | ✅ |
| `a197b1d2…` | angelthanhtien → murphy358 | 0.001 | vout[0] murphy358 | ✅ |
| `b6165632…` | angelthanhtien → kieuphias | 0.0008 | vout[0] kieuphias | ✅ |
| `175bd4aa…` | leminhtri → angelquynhhoa | 0.0007 | vout[0] angelquynhhoa | ✅ |
| `a5c0a4c4…` | angelthuha → leminhtri | 0.00043 | vout[1] leminhtri | ✅ |
| `03491101…` | angelaivan → murphy358 | 0.0003 | vout[1] murphy358 | ✅ |
| `3e0304e8…` | angelthanhtien → lanchi68 | 0.0002 | vout[0] lanchi68 | ✅ |
| `c258bb42…` | angelthanhtien → susu | 0.0001 | vout[0] susu | ✅ |
| `f5725bd1…` | angellam → angelnguyenhoa | 0.000079 | vout[1] angelnguyenhoa | ✅ |
| `b0b8709f…` | angelhoangtydo → angel_vinhnguyen | 0.000045 | vout[0] angel_vinhnguyen | ✅ |
| `a783a642…` | angelhoangtydo → murphy358 | 0.00003 | vout[1] murphy358 | ✅ |
| `57b45147…` | nguyenthu688 → angelthanhtien | 0.000028 | vout[0] angelthanhtien | ✅ |
| `191e6eb5…` | angelutopia → angelaivan | 0.000027 | vout[0] angelaivan | ✅ |
| `6ffabbf4…` | nguyenthu688 → father | 0.000027 | vout[0] `bc1qgxf7c63…` = father | ✅ |
| `ebb8759d…` | angellam → angelanhnguyet | 0.000014 | vout[0] angelanhnguyet | ✅ |
| `43ac9df3…` | angelquan → murphy358 | 0.00001 | vout[0] murphy358 | ✅ |

Dòng thừa trong các nhóm này **luôn là dòng còn lại** (`recipient_address` rỗng, hoặc `sender_id IS NULL` →
stub `wallet_0x50ebe…`, hoặc recipient không nằm trong vout nào).

## 3. Verify riêng 2 dòng hop-chain (Việc 3)

| tx | dòng flip | DB amount | on-chain | KL |
|---|---|---|---|---|
| `05a78ade…` (13 vout) | angelkim → angelthutrang, 9.280,15 USD | 0.15091506 | vout[11] `bc1qkh8fpt9…` = angelthutrang, **đúng 0.15091506** | ✅ SẠCH |
| `d01485d0…` (24 vout) | angelkim → angelquynhhoa, 219,92 USD | 0.00343500 | vout[5] `bc1qq7cjcc7…` = angelquynhhoa, **đúng 0.003435** | ✅ SẠCH |

Cả 2 dòng chỉ ghi **đúng phần vout thuộc recipient**, không gộp cả tx. Không sai lệch.

## 4. Danh sách flip cuối cùng

Không loại dòng nào. **249 dòng / 333.219,21 USD** — quay lại đúng tập ban đầu.

Đề xuất ghi (chờ duyệt): `is_external=false`, `leaderboard_eligibility='internal'` cho 249 dòng.

## 5. Mô phỏng lại (logic RPC thật, read-only, khớp baseline 100%)

### Kịch bản B — giữ funtreasury
| # | User | USD | Tx |
|---|---|---|---|
| 1 | father | 705.918,56 | 12 |
| 2 | funtreasury | 261.283,69 | 16 |
| 3 | angelutopia | 114.188,42 | 29 |
| 4 | angelkim | 81.332,66 | 22 |
| 5 | angelthienhanh68 | 69.974,74 | 11 |
| 6 | angelthanhtien | 26.255,52 | 39 |
| 7 | angelthuha | 5.558,95 | 22 |
| 8 | angelanhnguyet | 4.524,39 | 2 |
| 9 | leminhtri | 2.857,42 | 20 |
| 10 | sinhhoatlovehouseycha | 2.120,43 | 3 |
| 11 | angelgiau | 1.609,08 | 19 |
| 12 | angelquan | 1.037,09 | 39 |

### Kịch bản C — loại funtreasury 2 chiều
| # | User | USD | Tx |
|---|---|---|---|
| 1 | father | 705.918,56 | 12 |
| 2 | angelutopia | 114.188,42 | 29 |
| 3 | angelkim | 81.332,66 | 22 |
| 4 | angelthienhanh68 | 69.874,15 | 10 |
| 5 | angelthanhtien | 26.255,52 | 39 |
| 6 | angelthuha | 5.558,95 | 22 |
| 7 | angelanhnguyet | 4.524,39 | 2 |
| 8 | leminhtri | 2.857,42 | 20 |
| 9 | sinhhoatlovehouseycha | 2.120,43 | 3 |
| 10 | angelgiau | 1.542,14 | 18 |
| 11 | angelquan | 1.037,09 | 39 |
| 12 | angelkhanhi | 1.028,71 | 9 |

Stub `wallet_0x50ebe82ce05adf3dd`: 0 dòng ở cả B và C.

## 6. Việc phát sinh (hồ sơ riêng, KHÔNG nằm trong flip)

Các dòng thừa `is_external=false` đang **được tính** vào leaderboard hiện tại (đặc biệt angelutopia,
trianaresa4g272q, chimalo19, angelkhanhi, angelthienhanh68). Cần một vòng audit riêng để xoá/đánh dấu:
xem `evidence/dup_tx_groups.txt` (42 nhóm) + `evidence/onchain_verify_23_tx.txt`.

**CHƯA GHI GÌ.** Chờ CTO chốt B hoặc C rồi Lovable soạn lệnh ghi cho 249 dòng.
