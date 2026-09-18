# TRACK A — PREVIEW (chưa ghi dữ liệu)
Ngày: 24/08/2026 · Phạm vi: 4 tài khoản có xác nhận chính chủ (angelkim, angelutopia, angelthienhanh68, angelqueanh) trong 18 TX BTC tại `docs/audit/btc-fake-tx-consolidated-20260824/REPORT.md`.

## 0. TRẠNG THÁI TRACK A CHO angelkim (giao ở phiên trước)

**CHƯA THỰC THI.** Bằng chứng RAW:

```
-- profiles
username  | exclude_from_leaderboard
angelkim  | f

-- donation nghi vấn của angelkim trong 18 TX (2f38060e)
id=14ec1270-6c50-457a-a268-3ff8af4fb4f3 | angelkim → angelgiau | 1.01846548 BTC
status=confirmed | is_external=f | leaderboard_eligibility=internal

-- BXH Benefactor BTC hiện tại (get_benefactor_leaderboard(12,0,'all','BTC'))
rank 4 | angelkim | 68,239.34 USD | 2 tx
```

⇒ angelkim **hiện VẪN hiển thị công khai** trên BXH, gồm cả khoản 68.175,76 USD nghi vấn. Không có migration/doc nào ghi nhận Track A đã chạy.

## 1. CƠ CHẾ ẨN (vì sao cần Preview)

BXH lọc theo `donations.leaderboard_eligibility = 'internal'`. Chỉ có 3 giá trị đang dùng: `internal` (29.655), `external_excluded` (2.410), `external_to_father` (12). **Không có cờ display-only riêng** ⇒ ẩn = UPDATE cột dữ liệu `leaderboard_eligibility` → **cần Cha/CTO duyệt trước khi ghi**.

Đề xuất ghi: `leaderboard_eligibility = 'external_excluded'` (giữ nguyên `status='confirmed'`, `amount`, `tx_hash`, `is_external`) ⇒ **không xoá dữ liệu**, lịch sử giao dịch cá nhân vẫn thấy, chỉ mất khỏi BXH công khai.
Phương án thay thế (KHÔNG chọn): `profiles.exclude_from_leaderboard = true` — ẩn toàn bộ người đó, vượt phạm vi.

## 2. DANH SÁCH 23 DÒNG SẼ ẨN (tổng 262.618,53 USD)

| donation_id | tx | sender | recipient | BTC | USD |
|---|---|---|---|---|---|
| 14ec1270-6c50-457a-a268-3ff8af4fb4f3 | 2f38060e | angelkim | angelgiau | 1.01846548 | 68.175,76 |
| fad03ce3-eab5-44a1-81a4-4b55854c257c | 4e6fdcc8 | wallet_0x50ebe82ce05adf3dd | angelthienhanh68 | 0.90865436 | 62.684,00 |
| 83c9d054-14c0-4b59-bf1b-7c8b37da6766 | 1da80ffa | angelthienhanh68 | angelutopia | 0.90704454 | 62.572,95 |
| 959d8b5a-3477-4213-8b0a-80b2ffd60c44 | 463cf75a | angelutopia | angelgiau | 0.8 | 55.188,42 |
| 7190ca81-c9ff-4e3d-9437-d49573849e90 | d8cd6542 | angelutopia | angelqueanh | 0.0396207 | 2.730,17 |
| 24ac9cdd-c9ac-47f4-b973-e35c30b6adaf | 758888fd | angelutopia | angelqueanh | 0.02979 | 2.111,90 |
| f066ed18-3af7-4807-b057-f861e68bdc61 | 65baf7ad | angelutopia | angelqueanh | 0.02979 | 2.051,47 |
| f1afff8f-e952-4f4b-b288-88dc90563631 | 86e1e74d | angelutopia | angelqueanh | 0.02979 | 2.050,71 |
| b7e2e35e-0bcf-4411-a1f2-ca29f3788f25 | 551e9c36 | angelutopia | angelqueanh | 0.01986 | 1.355,08 |
| 19ed7d35-14e8-4dfa-b78a-f4efe45ac597 | bcc09bc7 | angelutopia | angelqueanh | 0.01986 | 1.310,17 |
| 72475b22-02e3-4442-b261-ff87f0d49398 | 7e3ea3fc | angelutopia | angelqueanh | 0.014895 | 938,50 |
| 31315ef3-1bde-4997-bb47-a6f5627ed20f | f2e05082 | angelthuha | angelqueanh | 0.00993 | 668,00 |
| d3785bcf-45a3-418b-878e-e48410b6f383 | 87ad275e | angelthuha | angelqueanh | 0.004965 | 351,98 |
| 74f3d5e4-6ca2-4dd6-a60b-b5629a9b29a2 | 07be998a | angelthuha | angelqueanh | 0.001986 | 135,22 |
| 806c675d-3705-4b93-913d-554beca402fc | aba62fc3 | angelthuha | angelqueanh | 0.001986 | 134,03 |
| ad317615-14bf-48f1-9112-0a2ccd2fa649 | 37793f0f | angelthienhanh68 | angelqueanh | 0.00098258 | 71,70 |
| e75f83d5-adc9-4b9f-bbfd-780f0d15d79a | d8cd6542 | angelutopia | angelthuha | 0.0002793 | 19,25 |
| e0e8e17a-19f1-4407-aea5-1d02b32b9b29 | 758888fd | angelutopia | angelthuha | 0.00021 | 14,89 |
| a5608e3f-f00a-4f31-a232-ca4b1bd46f56 | 86e1e74d | angelutopia | angelthuha | 0.00021 | 14,46 |
| 1b96eaa7-3e4b-464f-9a08-051fd493bd00 | 65baf7ad | angelutopia | angelthuha | 0.00021 | 14,46 |
| dec27006-9905-4dfa-8bcc-f4cc99ec99e9 | 551e9c36 | angelutopia | angelthuha | 0.00014 | 9,55 |
| 473dfa38-d091-48ac-8177-5620c2f3e293 | bcc09bc7 | angelutopia | angelthuha | 0.00014 | 9,24 |
| c5aa186d-1eb4-4ddb-9267-986dd91f7f95 | 7e3ea3fc | angelutopia | angelthuha | 0.000105 | 6,62 |

### Dòng CỐ Ý KHÔNG đụng (giữ nguyên)
| dòng | lý do |
|---|---|
| bbf2df30 + 6b4dba68 (tx **0b38d223** = TX#13, angeldieungoc) | Lệnh Cha: không ẩn. (Ghi chú: 2 dòng này vốn đã `external_excluded` ⇒ không xuất hiện trên BXH sẵn) |
| cb9f26e4 (1da80ffa, angelgiau → angelbachviet 0.003) | Không thuộc 4 người trong phạm vi |
| f70f678a (2f38060e, funtreasury → angeldieungoc 1,47027) | Đã `external_excluded`; ngoài phạm vi 4 người |
| 96fcb7e9 (40f8c056 utopia→giau 0,5) · b888ef98 (4e6fdcc8 giau→quynhhoa) · 05ec797d (4e6fdcc8 → stub) | Đã `external_excluded` ⇒ đã ẩn khỏi BXH, không cần ghi thêm |
| TX CAMLY #bc823961 (1.868.000 CAMLY) | Ngoài phạm vi remediation BTC |

## 3. MÔ PHỎNG BXH SAU KHI ẨN

### Benefactor (người GỬI, token BTC)
| user | hiện tại | trừ | sau |
|---|---|---|---|
| angelutopia | 77.164,71 (#2) | −67.824,89 (15 dòng) | **9.339,82** |
| angelthienhanh68 | 69.704,62 (#3) | −62.644,65 (2 dòng) | **7.059,97** |
| angelkim | 68.239,34 (#4) | −68.175,76 (1 dòng) | **63,58** |
| angelthuha | 2.232,40 (#6) | −1.289,23 (4 dòng) | **943,17** |
| wallet_0x50ebe82ce05adf3dd (stub) | không hiển thị | −62.684,00 | không đổi (đã `exclude_from_leaderboard`) |
| father / funtreasury / leminhtri … | không đổi | 0 | không đổi |

⇒ father giữ #1 (705.918,56). Top sau ẩn: father → funtreasury 18.317,38 → angelutopia 9.339,82 → angelthienhanh68 7.059,97 → sinhhoatlovehouseycha 2.120,43.

### Recipient (người NHẬN, token BTC)
| user | hiện tại | trừ | sau |
|---|---|---|---|
| angelgiau | 123.407,22 (#3) | −123.364,18 (2 dòng) | **43,04** |
| angelutopia | 70.675,84 (#4) | −62.572,95 (1 dòng) | **8.102,89** |
| angelqueanh | 22.207,12 (#6) | −13.908,93 (12 dòng) | **8.298,19** |
| angelthuha | (ngoài top 12) | −88,47 (7 dòng) | giảm 88,47 |
| angelthienhanh68 | 597,80 (#12) | 0 | **597,80** — dòng 62.684,00 vốn đã bị loại vì sender là stub `exclude_from_leaderboard` |
| leminhtri 316.179,25 · angeldieungoc 307.511,76 · camlyd 63.649,68 | không đổi | 0 | không đổi |

### Tác dụng phụ đã kiểm tra
- `light_actions` theo 23 donation_id: **0 dòng** ⇒ không ảnh hưởng Light Score / FUN mint / reward.
- Không thay đổi `status`, `amount`, `amount_usd`, `tx_hash`, `is_external` ⇒ báo cáo tài chính, lịch sử giao dịch cá nhân và audit trail giữ nguyên.

## 4. CÂU LỆNH SẼ CHẠY (chỉ chạy sau khi Cha duyệt)

```sql
UPDATE donations
SET leaderboard_eligibility = 'external_excluded'
WHERE id IN (23 uuid ở Mục 2)
  AND leaderboard_eligibility = 'internal';
-- kỳ vọng: UPDATE 23
```
Rollback: đặt lại `leaderboard_eligibility='internal'` cho đúng 23 id trên.
