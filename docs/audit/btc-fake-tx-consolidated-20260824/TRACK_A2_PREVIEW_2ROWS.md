# TRACK A2 — PREVIEW ẨN ĐÚNG 2 DÒNG (chưa ghi dữ liệu)

Ngày: 24/08/2026 · Quyết định của Cha: ẩn khỏi BXH công khai đúng 2 dòng dưới đây. 30 dòng còn lại trong danh sách 35 dòng (`REMAINING_35_INTERNAL_ROWS.md`) **giữ nguyên**, không hành động.

## 1. Hai dòng trong phạm vi (RAW từ DB)

```
id | sender | recipient | amount | amount_usd | tx_hash | vout_index | created_at | status | is_external | leaderboard_eligibility
5e701589-9ec7-47bb-a36c-5103334308c4 | angelutopia | angelqueanh | 0.0993 | 7046.85 | 96ece9fb49297189724282440a096dad02395da37e2d90485d23163f56077c0d |  | 2026-03-14 06:40:35+00 | confirmed | f | internal
094927b8-f50d-44ed-97d0-52864b752ac7 | angelthienhanh68 | angelutopia | 0.09807989 | 7039.27 | 5c19bcc27894d1b60c0540236aebb1be972e7a689f318b2c4ff12c15ca9f352e |  | 2026-04-10 12:56:07+00 | confirmed | f | internal
```

Tổng ẩn: **$14.086,12** (0,19737989 BTC).

## 2. Light Score / mint — RAW

```sql
SELECT count(*) FROM light_actions
WHERE reference_id IN ('5e701589-9ec7-47bb-a36c-5103334308c4','094927b8-f50d-44ed-97d0-52864b752ac7');
-- count = 0
```
⇒ **0 dòng** `light_actions` ⇒ không ảnh hưởng Light Score, FUN mint hay reward (giống các lần trước).

## 3. Câu lệnh sẽ chạy sau khi duyệt

```sql
UPDATE donations
SET leaderboard_eligibility = 'external_excluded'
WHERE id IN ('5e701589-9ec7-47bb-a36c-5103334308c4','094927b8-f50d-44ed-97d0-52864b752ac7')
  AND leaderboard_eligibility = 'internal';
-- kỳ vọng: UPDATE 2
```
Không đổi `status`, `amount`, `amount_usd`, `tx_hash`, `is_external` ⇒ không xoá dữ liệu, lịch sử giao dịch cá nhân + audit trail giữ nguyên. Rollback: đặt lại `internal` cho đúng 2 id trên.

## 4. Mô phỏng BXH TRƯỚC → SAU

### 4.1 Benefactor (người GỬI) — token BTC
| user | TRƯỚC | trừ | SAU |
|---|---|---|---|
| angelutopia | #3 · $9.339,82 | −7.046,85 | **#3 · $2.292,97** |
| angelthienhanh68 | #4 · $7.059,97 | −7.039,27 | **#22 · $20,70** (rơi khỏi top 15) |
| angelqueanh | #12 · $200,47 | 0 | **#11 · $200,47** |

Top 15 BTC (gửi) SAU: father 705.918,56 · funtreasury 18.317,38 · angelutopia 2.292,97 · sinhhoatlovehouseycha 2.120,43 · angelthuha 943,17 · leminhtri 671,57 · ngocphuong 578,41 · angelkhanhi 549,05 · angelgiau 353,82 · angelhiep 262,93 · angelqueanh 200,47 · angelhoangtydo 173,16 · angellam 172,72 · chimalo19 142,56 · angelthutrang 133,00.
Người mới vào top 15 BTC: **angelthutrang $133,00** (thay chỗ angelthienhanh68).

### 4.2 Benefactor tổng đa token (trang `fun.rich/benefactors`)
| user | TRƯỚC | trừ | SAU |
|---|---|---|---|
| angelutopia | #10 · $10.438,28 | −7.046,85 | **#20 · $3.391,43** |
| angelthienhanh68 | #13 · $8.579,51 | −7.039,27 | **~#35 · $1.540,24** |
| angelqueanh | #27 · $2.419,86 | 0 (chỉ là người nhận) | **#26 · $2.419,86** |
| father / funtreasury / angeldieungoc / angelthanhtien / leminhtri / angelgiau / angelkhanhi / angelthutrang / angelkim | #1–#9 | 0 | không đổi |

Top 15 tổng SAU: father 752.539,42 · funtreasury 189.042,76 · angeldieungoc 37.407,77 · angelthanhtien 32.174,64 · leminhtri 30.728,99 · angelgiau 26.091,87 · angelkhanhi 22.338,51 · angelthutrang 14.688,21 · angelkim 13.619,62 · angelhoangtydo 9.823,03 · angelanhnguyet 9.099,49 · angelthuha 7.422,20 · angellam 6.677,42 · **angelquangvu 5.615,91 (mới)** · **angelaivan 5.465,00 (mới)**.

### 4.3 Recipient (người NHẬN) — token BTC
| user | TRƯỚC | trừ | SAU |
|---|---|---|---|
| angelqueanh | #6 · $8.298,19 | −7.046,85 | **#6 · $1.251,34** |
| angelutopia | #7 · $8.102,89 | −7.039,27 | **#7 · $1.063,62** |
| leminhtri · angeldieungoc · camlyd · angelkhanhi · angelthutrang | #1–#5 | 0 | không đổi |
| angelthienhanh68 | #11 · $597,80 | 0 | **#11 · $597,80** |

## 5. Trạng thái
**CHƯA GHI.** Chờ Cha/CTO duyệt để chạy UPDATE 2 dòng và báo lại số dòng thực tế + query xác nhận rank sau khi ghi.
