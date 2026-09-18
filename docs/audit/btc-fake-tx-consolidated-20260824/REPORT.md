# ĐIỀU TRA KHẨN TỔNG HỢP (P0) — 19 TX nghi không có thật
Ngày: 24/08/2026 — CHỈ ĐỌC, không sửa/xoá dữ liệu.
Nguồn on-chain: mempool.space/api/tx/<txid> (RAW JSON lưu tại `evidence/`).

## 0. Địa chỉ BTC KHAI BÁO (profiles.btc_address)

| user | btc_address khai báo |
|---|---|
| angelkim | bc1prndhwz6nq3v9slnuqxyhk5lhpt9p7dk9zfelyrlqjs2vvrt6wetsxdylxu |
| angelutopia | bc1q7naf7a0943kwd8hkxsc5h8ps430ve5ga5jn9q4 |
| angelgiau | bc1q0wmq7evvgaj2e37ssmr5vxaq4hqdav7mkf7flf |
| angelthienhanh68 | bc1p5fcq2k4fgwqpr8glz3s522sqlgqghycwwr0h8h6kmtccf4w2a4wqm3zjru |
| angelqueanh | bc1qqtj6rs85ep4e23h002mgaau9q7cx64n0gcskr2 |
| angelthuha | bc1q47vk6dx3uhxdmj3l0zcfcqekhdu8smpgaquryj |
| angeldieungoc | bc1qrq0v066l2nkp7mh4lmza2szmpfkawfx4kdn48j |
| father | bc1qgxf7c63apt54h06g876y4ctq0me3jh86fta8sv |
| funtreasury | bc1q8t7eumwz552nljr2p2x5ckpl55ju26avlu4fxq |

## A. KẾT QUẢ ON-CHAIN 18 TX BTC

18/18 txid **TỒN TẠI THẬT** trên mainnet (HTTP 200, confirmed). Nhưng **địa chỉ vin/vout không khớp địa chỉ khai báo** của bên gửi/nhận mà hệ thống đang gán, trừ 3 ngoại lệ (angeldieungoc, angelgiau, angelquynhhoa).

### Nhóm 1 — angelgiau nhận
| # | txid | VIN thật | VOUT thật | DB gán | Khớp khai báo? |
|---|---|---|---|---|---|
| 1 | 2f38060e | bc1q964gfr…8r8x8 (aux angelkim, unverified) | v0 bc1qyzqe6ax…gzcc 1,01846548 (aux angelgiau, unverified); v1 bc1qrq0v0…n48j 1,47027 (angeldieungoc khai báo) | angelkim → angelgiau 1,01846548 | **KHÔNG** (cả 2 đầu là aux tự học) |
| 2 | 463cf75a | bc1q33kk5m7…lltp (aux angelutopia, unverified) | v0 bc1q4d4g0py…k2cq 0,10704313 (aux angelutopia); v1 bc1qfxr7dw7…nm4n 0,8 (aux angelutopia) | angelutopia → angelgiau 0,8 | **KHÔNG** — cả input và output 0,8 đều là aux của CHÍNH angelutopia ⇒ 0,8 BTC là **change/self-transfer**, không có output nào tới địa chỉ angelgiau |
| 3 | 40f8c056 | bc1qfxr7dw7…nm4n 1,0 (aux angelutopia) | v0 **bc1q0wmq7ev…f7flf 0,5 = địa chỉ khai báo angelgiau**; v1 change 0,49999154 về chính vin | angelutopia → angelgiau 0,5 | Đầu NHẬN khớp thật; đầu GỬI chỉ dựa aux unverified |

### Nhóm 2 — angelthienhanh68
| # | txid | VIN thật | VOUT thật | DB gán | Nhận xét |
|---|---|---|---|---|---|
| 4 | 1da80ffa | bc1qc8pv0c0…dwhm 0,90865436 (aux angelthienhanh68, `hd_input_back`) + bc1qsw8f4as…e0kc 0,00139227 (aux angelhoangtydo) | v0 bc1q33kk5m7…lltp 0,90704454 (aux angelutopia); v1 bc1qtaml28p…hry6 0,003 (aux angelthienhanh68) | angelthienhanh68 → angelutopia 0,90704454 | **KHÔNG có địa chỉ khai báo nào** ở 2 đầu. angelthienhanh68 khai địa chỉ taproot `bc1p5fcq…`, không xuất hiện |
| 5 | 4e6fdcc8 | bc1qvffzpp8…0gsr 0,91165577 (aux của stub `wallet_0x50ebe82ce05adf3dd`) | v0 bc1qq7cjcc7…eq07 0,003 = khai báo angelquynhhoa; v1 bc1qc8pv0c0…dwhm 0,90865436 (aux angelthienhanh68) | stub → angelthienhanh68 0,90865436 | 0,90865436 là **output quay về chuỗi peel**, không tới địa chỉ khai báo của angelthienhanh68 |

Chuỗi 4e6fdcc8 → 1da80ffa → 463cf75a nằm **cùng block 943944 / 943657**: cùng một UTXO ~0,9 BTC bị đếm 3 lần dưới 3 tên khác nhau (peel-chain).

### Nhóm 3 — angelqueanh nhận (13 TX BTC)
**Địa chỉ khai báo của angelqueanh (`bc1qqtj6rs8…skr2`) KHÔNG xuất hiện trong bất kỳ TX nào.**
Tất cả 13 khoản "angelqueanh nhận" đều vào **vout0 = `bc1q5wnpn4k99wc587maaaa6eqnx27g4r6mduxg2s5`** — địa chỉ aux `hd_change_auto`, `verified=false`, tạo 11/06/2026 09:25.

| # | txid | VIN thật (nguồn) | vout0 → aux queanh | vout2 → aux angelthuha | change về vin |
|---|---|---|---|---|---|
| 7 | 65baf7ad | bc1qfxr7dw7…nm4n 0,8 | 0,02979 | bc1qmn6sgw0…dnjn 0,00021 | 0,76999651 |
| 8 | 37793f0f | bc1qtaml28p…hry6 0,003 (aux thienhanh68) | 0,00098258 | (bc1p46ee… 0,00000867) | bc1qer0fgum…tgxn 0,00200602 |
| 9 | 07be998a | bc1qc5t37ax…dsqy 0,01695917 (aux angelthuha) | 0,001986 | bc1qmn6sgw0…dnjn 0,000014 | 0,01495568 |
| 10 | bcc09bc7 | bc1qfxr7dw7…nm4n 0,40503733 | 0,01986 | bc1q02z4nqg…jv94 0,00014 | 0,38503384 |
| 11 | 87ad275e | bc1qc5t37ax…dsqy 0,02696828 | 0,004965 | 0,000035 | 0,02196479 |
| 12 | 758888fd | bc1qfxr7dw7…nm4n 0,43504082 | 0,02979 | 0,00021 | 0,40503733 |
| 13 | 0b38d223 | **bc1qrq0v066…n48j 0,1 = địa chỉ khai báo angeldieungoc** | 0,05051066 | 0,00035606 | 0,04912979 về chính angeldieungoc |
| 14 | 7e3ea3fc | bc1qfxr7dw7…nm4n 0,57005129 | 0,014895 | 0,000105 | 0,5550478 |
| 15 | 86e1e74d | bc1qfxr7dw7…nm4n 0,63995827 | 0,02979 | 0,00021 | 0,60995478 |
| 16 | d8cd6542 | bc1qfxr7dw7…nm4n 0,60995478 | 0,0396207 | 0,0002793 | 0,57005129 |
| 17 | aba62fc3 | bc1qc5t37ax…dsqy 0,03897526 | 0,001986 | 0,000014 | 0,03697177 |
| 18 | f2e05082 | bc1qc5t37ax…dsqy 0,03697177 | 0,00993 | 0,00007 | 0,02696828 |
| 19 | 551e9c36 | bc1qfxr7dw7…nm4n 0,38503384 | 0,01986 | 0,00014 | 0,36503035 |

Chuỗi change nối liền nhau, xác nhận **1 ví peel-chain duy nhất** `bc1qfxr7dw7…nm4n` chạy liên tục:
0,63995827 → 0,60995478 → 0,57005129 → 0,5550478 … → 0,43504082 → 0,40503733 → 0,38503384 → 0,36503035; và ví thứ hai `bc1qc5t37ax…dsqy`: 0,03897526 → 0,03697177 → 0,02696828 → 0,02196479 → 0,01695917 → 0,01495568.

### TX #6 (CAMLY, BSC)
Hash Cha cung cấp bị rút gọn (`f3668472…4363b4f4`) và **không tồn tại trong `transactions` cũng như `donations`** (0 dòng khớp prefix `f3668472`). Không thể verify trên BSC khi thiếu hash đủ 66 ký tự. **Cần Cha gửi hash đầy đủ.**

## B. TX #13 — angeldieungoc (không mặc định nghi ngờ)
VIN = `bc1qrq0v066l2nkp7mh4lmza2szmpfkawfx4kdn48j` — **đúng địa chỉ khai báo của angeldieungoc**, change 0,04912979 quay về chính địa chỉ đó ⇒ **đầu GỬI là thật, do chính chủ chi tiêu UTXO**. Vấn đề duy nhất: đầu NHẬN (vout0 0,05051066) vào aux unverified của angelqueanh, không phải địa chỉ khai báo của angelqueanh ⇒ **người gửi thật, người nhận chưa xác minh**.

## C. Pattern số tiền lặp lại
- 0,02979 BTC ở #7 (block 944019), #12 (941972), #15 (936577): **3 UTXO nguồn khác nhau, 3 block khác nhau, mỗi lần đều rút từ change kế trước của cùng ví peel-chain** ⇒ **không phải dữ liệu nhân bản**; là 3 lần chi tiêu thật riêng biệt, cùng mệnh giá.
- 0,01986 BTC ở #10 (942945) và #19 (943181): tương tự, 2 UTXO riêng, change nối tiếp (0,40503733 → 0,38503384 → 0,36503035) ⇒ **thật, riêng biệt**.
- Kết luận C: **số tiền lặp không phải lỗi trùng dữ liệu**; lỗi nằm ở **quy gán chủ sở hữu** (ví peel-chain bị auto-learn gán cho angelutopia/angelthuha/angelqueanh).
- 2 mốc 12/03 và 14/02 trong Excel Utopia chưa có txid ⇒ **cần Utopia bổ sung hash**, chưa thể verify.

## D. Đối chiếu các danh sách đã biết (18 TX BTC → 30 dòng `donations`)
```
tong_dong=30 | is_external=true: 6 | is_external=false: 24
lien_quan_aux_unverified (sender_address hoặc recipient_address ∈ aux verified=false): 27
dong_lien_quan_angelkim: 1
```
- **27/30 dòng (90%)** dựa trên địa chỉ aux **auto-learn chưa xác minh** ⇒ thuộc đúng lớp rủi ro "195 dòng auto-learn vòng tròn" đã nêu ở `UTXO_RETRACE_V5_NOISE.md`.
- **6 dòng** đang `is_external=true` (nằm trong nhóm 249 dòng chờ flip): 2f38060e (funtreasury↔angeldieungoc 1,47027), 40f8c056 (0,5), 0b38d223 (2 dòng), 4e6fdcc8 (2 dòng).
- **1 dòng** trùng nhóm 48 dòng angelkim đã biết (2f38060e — angelkim → angelgiau 1,01846548).
- **~23 dòng là PHÁT HIỆN MỚI**, chưa nằm trong 48 dòng angelkim; toàn bộ cụm angelqueanh/angelthuha là mới.
- Ngoài ra `transactions` có **51 dòng** cho cùng 18 txid (nhân bản 2–4 dòng/tx do ghi cả 2 phía + hop), xác nhận lại hiện tượng đếm trùng.

## E. Backlog Phase 4 (44 user khai địa chỉ 11–12/06/2026)
| đối tượng | trong backlog 44? |
|---|---|
| angelthuha | **CÓ** — #4, claim 11/06/2026 14:35:51, `bc1q47vk6dx3uhxdmj3l0zcfcqekhdu8smpgaquryj` |
| angeldieungoc (`bc1qrq0v066…n48j`) | **CÓ** — #27, claim 12/06/2026 04:39:27 |
| angelgiau | **CÓ** — #3, claim 11/06/2026 14:35:10 |
| angelkim | **CÓ** — #19 (đã điều tra V6) |
| **angelqueanh** | **KHÔNG có trong 44** ⇒ **PHÁT HIỆN MỚI, cần thêm vào backlog** (7 aux unverified, địa chỉ khai báo không xuất hiện on-chain lần nào) |
| **angelthienhanh68** | **KHÔNG có trong 44** ⇒ **PHÁT HIỆN MỚI, cần thêm vào backlog** (42 aux unverified, địa chỉ taproot khai báo không xuất hiện on-chain) |
| **angelutopia** | **KHÔNG có trong 44** ⇒ mới (34 aux unverified, ví peel-chain `bc1qfxr7dw7…nm4n` bị gán cho user này) |

Số aux **verified=false** hiện có: angelkim 546, angelthuha 340, angelthienhanh68 42, angelutopia 34, angelgiau 11, angelqueanh 7.

## F. Đã tính vào FUN/CAMLY mint hay reward chưa?
Truy vấn `light_actions` theo `reference_id ∈ (30 donation id)`: **0 dòng**.
⇒ **KHÔNG có Light Score / FUN mint / reward nào được cấp từ 18 TX BTC này.** Không phát sinh nợ mint cần thu hồi.
(TX #6 CAMLY chưa verify được vì thiếu hash đầy đủ.)

## Tóm tắt trạng thái
- 18/18 txid BTC **có thật on-chain**; **không có TX bịa hash**.
- Sai lệch nằm ở **quy gán chủ sở hữu**: 27/30 dòng dựa trên aux `hd_change_auto`/`hd_input_back` chưa xác minh.
- Ít nhất **3 khoản là self-transfer/change nội bộ** bị ghi thành chuyển tiền giữa 2 người: #2 (0,8), #4 (0,90704454), #5 (0,90865436).
- **2 khoản có đầu thật xác minh được**: #3 (nhận đúng địa chỉ angelgiau), #13 (gửi đúng địa chỉ angeldieungoc).
- Chưa sửa/xoá gì. Chờ lệnh Cha cho bước remediation.
