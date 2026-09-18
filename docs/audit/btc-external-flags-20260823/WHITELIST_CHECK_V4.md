# VIỆC 4 — Đối chiếu "danh sách trắng" 6 user có khả năng sở hữu nhiều BTC (23/08/2026)

Read-only. **CHƯA GHI GÌ.** Chạy song song, độc lập Việc 1-3.

## 1. Địa chỉ RAW của 6 user (profiles.btc_address)

| username | user_id | btc_address |
|---|---|---|
| father | `4466cccf-6287-4a19-9b19-c2bd4d763f47` | `bc1qgxf7c63apt54h06g876y4ctq0me3jh86fta8sv` ✅ **khớp đúng địa chỉ Cha đã xác nhận** |
| funtreasury | `733a0ca6-91e2-4513-a1a0-ce34fea484f8` | `bc1q8t7eumwz552nljr2p2x5ckpl55ju26avlu4fxq` |
| leminhtri | `70640edc-337f-4e89-bd7e-9501bd79ec9f` | `bc1qfdx27jqfn604dmnzljylpxyh40pw2v3rzamepw` |
| angeldieungoc | `edb32940-ead0-4c24-a514-cf781d35414e` | `bc1qrq0v066l2nkp7mh4lmza2szmpfkawfx4kdn48j` |
| angelthanhtien | `80c0a487-ad1d-44b7-9081-b31769b9bec4` | `bc1ptz7r9sczegjvt2xxjq7eudgwwzy7f5m2q6lf5tfa7fytzqaflu9s9phtfw` (taproot) |
| angelgiau | `ce344e2f-76fb-4ea6-bccb-68c9c1765b80` | `bc1q0wmq7evvgaj2e37ssmr5vxaq4hqdav7mkf7flf` |

Aux đã học: father 3 địa chỉ, angelgiau 11 địa chỉ; 4 user còn lại 0 aux.

## 2-3. Quét trùng địa chỉ toàn hệ thống (case-sensitive, không normalize)

- `profiles.btc_address` của user khác trùng 1 trong 6 địa chỉ chính: **0 dòng**
- `profile_btc_aux_addresses` của user khác trùng 1 trong 6 địa chỉ chính: **0 dòng**
- Trùng với **aux** của nhóm 6 (father/angelgiau): **0 dòng**

⇒ **Không có user nào khai trùng địa chỉ nhóm 6.** Mục 3 (user tự khai sai) = **rỗng**. Nguồn (a) bị loại.

## 4. Resolver gán SAI — nguồn (b)

Định nghĩa: donation BTC `confirmed` mà `sender_address` (địa chỉ vin ghi trong DB) **thuộc về user X** (theo profiles + aux) nhưng DB đang gán `sender_id` = user khác.

### 4a. Nhóm internal (`is_external=false`), sender NGOÀI nhóm 6 — **7 dòng**

| donation_id | tx_hash | amount BTC | USD | sender_id hiện tại (SAI) | chủ thật của sender_address | recipient |
|---|---|---|---|---|---|---|
| `a8f452aa-5990-4e01-80f2-25da64f43e9b` | `5eff4551…` | 0.001 | 72,97 | chimalo19 | **angelthanhtien** | angelkhanhi |
| `386c4e2d-6222-4629-8d34-da9e2109332d` | `a197b1d2…` | 0.001 | 68,86 | chimalo19 | **angelthanhtien** | angelkhanhi |
| `e8668f1f-c5da-476a-889c-1c0a1a161ab5` | `b6165632…` | 0.0008 | 56,89 | trianaresa4g272q | **angelthanhtien** | angelutopia |
| `aa112c00-5949-47fb-854c-4fbc5b516ea3` | `8291bf77…` | 0.0007 | 50,38 | angelkhanhi | ngocphuong (ngoài nhóm 6) | thuongnguyen_gialai |
| `b695f120-40a8-4d94-972d-8bcfb1672939` | `3e0304e8…` | 0.0002 | 14,59 | trianaresa4g272q | **angelthanhtien** | angelutopia |
| `1596ca76-88b1-4f53-bbd2-76712ef73a12` | `c258bb42…` | 0.0001 | 7,20 | trianaresa4g272q | **angelthanhtien** | angelthanhthuy |
| `8153612a-7ad0-4cb5-a6a3-c51c4f9e8e17` | `43ac9df3…` | 0.00001 | 0,73 | chimalo19 | angelquan (ngoài nhóm 6) | angelkhanhi |

Tổng: **271,62 USD** — quy mô tiền nhỏ, nhưng **khớp chính xác** nhóm "dòng thừa" đã phát hiện ở
PREVIEW_V3 (chimalo19 / trianaresa4g272q / angelutopia). Đây là bằng chứng độc lập thứ hai
rằng các dòng `is_external=false` này là **dòng resolver bịa sender**, và chúng **đang được tính vào leaderboard**.

### 4b. Nhóm còn lại (đang `is_external=true`), sender_address thuộc nhóm 6 nhưng sender_id khác/NULL — **5 dòng**

| donation_id | tx_hash | amount | USD | sender_id hiện tại | chủ thật của sender_address | recipient |
|---|---|---|---|---|---|---|
| `943e9b0c-e6ea-4150-b4d6-88a35ab52389` | `776f67dc…` | 0.91966 | **61.561,76** | funtreasury | angelgiau (aux `bc1qyzqe6ax…`) | angelgiau |
| `6b4dba68-268e-49eb-86f3-674c44123f65` | `0b38d223…` | 0.05051066 | 3.408,94 | NULL | angeldieungoc | angelqueanh |
| `e49c0867-00b6-4022-9528-ba5a273970f1` | `d65d54e8…` | 0.04965 | 3.322,51 | NULL | angeldieungoc | angelqueanh |
| `edcdc83c…` / `bbf2df30…` / `cff07294…` | `c586eecb…`, `0b38d223…`, `d65d54e8…` | 0.00035 ×3 | 72,26 | NULL | angeldieungoc | angelthuha |
| `2325c8d4-2c58-427b-983d-afa6fd751afa` | `90dea148…` | 0.00003 | 2,13 | angel_thuytram | angelgiau (aux `bc1q2xfyk6w…`) | angelgiau |

Lưu ý dòng `943e9b0c` (61.561,76 USD): `sender_address` là **aux của angelgiau** nhưng DB gán sender
= funtreasury, recipient cũng = angelgiau → nghi là **change-to-self của angelgiau bị resolver gán sai
sender**, không phải donation funtreasury→angelgiau. Cần verify on-chain riêng trước khi kết luận.

### 4c. Chưa kiểm được bằng địa chỉ

Trong 99 dòng internal BTC của user ngoài nhóm 6: 54 dòng `sender_address` khớp đúng chủ,
7 dòng sai (4a), **37 dòng `sender_address` rỗng/NULL**, 1 dòng địa chỉ lạ không thuộc user nào
(`23bbad88` sinhhoatlovehouseycha 853,40 USD, `bc1pscp4ut9…`). 37 dòng rỗng **không thể xác thực
bằng phương pháp này** — cần tra on-chain từng tx.

### 4d. Sàng theo tiêu chí "khả năng sở hữu nhiều BTC" (tổng gửi > 500 USD, ngoài nhóm 6)

| db_sender | dòng | USD | ext_rows |
|---|---|---|---|
| angelutopia | 42 | 115.476,75 | 12 |
| angelkim | 22 | 81.332,66 | 20 |
| angelthienhanh68 | 11 | 69.974,74 | 7 |
| wallet_0x50ebe82ce05adf3dd (stub) | 2 | 62.686,36 | 1 |
| angelthuha | 23 | 5.558,95 | 11 |
| angelanhnguyet | 2 | 4.524,39 | 2 |
| sinhhoatlovehouseycha | 3 | 2.120,43 | 0 |
| angelquan | 39 | 1.037,09 | 38 |
| angelkhanhi | 9 | 1.028,71 | 4 |
| ngocphuong | 1 | 578,41 | 0 |

4 dòng internal nặng nhất của nhóm này (`14ec1270` angelkim 68.175,76; `fad03ce3` stub 62.684,00;
`83c9d054` angelthienhanh68 62.572,95; `959d8b5a` angelutopia 55.188,42 — tất cả 04-06/04/2026)
đều có `sender_address` **đã đăng ký aux đúng cho chính user đó**, nên phương pháp địa chỉ **không**
bắt được. Nhưng theo tiêu chí danh sách trắng của Cha, 4 dòng này (≈248.621 USD) **thuộc diện nghi
vấn cao nhất** và cần tra on-chain vout riêng — chú ý `14ec1270` chính là dòng đã xác định là **dòng
thừa** của tx `2f38060e…` ở PREVIEW_V3.

## 5. Phân loại nguồn sai

| Nguồn | Kết luận |
|---|---|
| (a) user tự khai địa chỉ trùng/sai | **0 dòng** — sạch tuyệt đối |
| (b) resolver hệ thống gán nhầm | **12 dòng** (7 internal + 5 external), 271,62 USD internal + 68.367,60 USD external |
| (c) không xác thực được bằng địa chỉ | 37 dòng thiếu `sender_address` + 1 địa chỉ lạ + 4 dòng lớn 04/2026 nghi vấn theo whitelist |

## 6. Hướng xử lý đề xuất (chưa thực thi)

1. 7 dòng 4a: **không** giữ `is_external=false` — chuyển `pending_verification` hoặc gán lại đúng chủ thật (angelthanhtien/ngocphuong/angelquan) sau khi tra vout.
2. Dòng `943e9b0c` (61.561,76 USD): tra on-chain `776f67dc…`; nếu là change-to-self của angelgiau ⇒ loại khỏi mọi bảng xếp hạng.
3. 3 dòng angeldieungoc `sender_id IS NULL`: gán `sender_id = angeldieungoc` (địa chỉ chính khớp 100%).
4. 4 dòng lớn 04/2026 + 37 dòng thiếu địa chỉ: đưa vào hồ sơ tra on-chain riêng.
5. Bổ sung guard scanner: từ chối ghi donation khi `sender_address` thuộc user A nhưng `sender_id` = user B.

**CHƯA GHI GÌ.** Chờ Cha đánh giá quy mô rồi quyết hướng.
