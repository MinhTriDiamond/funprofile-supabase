# VIỆC A / B / C — Xác minh on-chain vùng chưa phủ (23/08/2026)

Read-only. **CHƯA GHI GÌ.** Nguồn on-chain: mempool.space `/api/tx/<hash>` (raw JSON lưu tại
`evidence/` cùng thư mục). Phương pháp giống `2f38060e / 57b45147 / df81b101`: so khớp
`amount` (satoshi) + địa chỉ vout với danh sách địa chỉ đã đăng ký (profiles.btc_address +
profile_btc_aux_addresses) của người nhận, và so `vin` với địa chỉ người gửi.

---

## VIỆC A — 4 dòng lớn (~$248.621)

Tất cả 4 tx **tồn tại thật** trên chain và **khớp đúng 1 vout** theo số satoshi. Nhưng khi
đối chiếu chủ sở hữu địa chỉ, cả 4 dòng nằm trong **1 chuỗi hop (hop-chain) cùng khối** —
tức cùng một khoản ~0,9 BTC được ghi nhận nhiều lần.

| # | donation_id | tx | DB ghi | on-chain |
|---|---|---|---|---|
| A1 | `fad03ce3` | `4e6fdcc8…` h943944 | stub `wallet_0x50ebe…` → angelthienhanh68, 0.90865436 ($62.684,00) | vin `bc1qvffzpp8…` (aux **của chính profile stub**, source `hd_input_back`) → **vout[1] 0.90865436 → `bc1qc8pv0c0…` = aux angelthienhanh68** ✔ khớp |
| A2 | `83c9d054` | `1da80ffa…` h943944 | angelthienhanh68 → angelutopia, 0.90704454 ($62.572,95) | vin `bc1qc8pv0c0…` (angelthienhanh68) → **vout[0] 0.90704454 → `bc1q33kk5m7…` = aux angelutopia** ✔ khớp |
| A3 | `959d8b5a` | `463cf75a…` h943944 | angelutopia → **angelgiau**, 0.8 ($55.188,42) | vin `bc1q33kk5m7…` (angelutopia) → vout[1] 0.8 → `bc1qfxr7dw7…` = **aux `hd_change_auto` CỦA CHÍNH angelutopia** ⇒ **KHÔNG phải gửi cho angelgiau, đây là change/self-transfer** ✘ |
| A4 | `14ec1270` | `2f38060e…` h943657 | angelkim → angelgiau, 1.01846548 ($68.175,76) | vin `bc1q964gfr2…` (aux angelkim) → vout[0] 1.01846548 → `bc1qyzqe6ax…` = aux angelgiau (`hd_input_back`) ✔ khớp số + chủ |

### A1 — Cơ chế nào cho phép 1 profile stub "gửi tiền"?
`bc1qvffzpp8vxhvn3xwgc6hhqxaqvu6es0wfh30gsr` **đang được đăng ký làm aux của chính profile
stub** (`source = hd_input_back`, `verified = false`, `classification = D_likely_valid`).
Cơ chế: scanner khi thấy 1 tx chi tiêu (vin) từ 1 địa chỉ chưa biết mà tx đó liên quan tới
ví đã theo dõi, nó **"học" ngược địa chỉ vin đó về chủ ví gần nhất** (`hd_input_back`) —
kể cả khi chủ đó chỉ là hồ sơ stub sinh ra từ 1 địa chỉ EVM (`wallet_0x50ebe…`). Sau khi học
xong, mọi tx tiêu từ địa chỉ ấy được resolve thành "stub gửi tiền". Đây **không phải user thật
gửi**, cũng không phải ai khai sai — 100% do suy luận `hd_input_back` chưa verify.

### A4 — đối chiếu 2 nguồn phát hiện
Đúng như PREVIEW_V3 đã nêu, `14ec1270` là dòng cùng tx `2f38060e…` với dòng
funtreasury→angeldieungoc (vout[1] 1.47027). Bổ chính so với V3: vout[0] **không** đi ra ví
ngoài — nó đi vào aux của angelgiau. Nên `14ec1270` khớp vout thật, nhưng nó là **chân đầu
của chuỗi hop** dẫn tới `943e9b0c` bên dưới.

### A5 — hệ quả: chuỗi hop tự khép kín (phát sinh trong lúc verify)
`943e9b0c` (V4 ghi funtreasury → angelgiau, **$61.561,76**): tx `776f67dc…`, vin
`bc1qyzqe6ax…` (= aux angelgiau, chính là nơi nhận vout[0] của `2f38060e`) → vout[1]
0.91966 → `bc1q0wmq7ev…` = **địa chỉ chính của angelgiau**.
⇒ **Tự chuyển cho chính mình**, sender `funtreasury` là do resolver gán sai.

Chuỗi thực tế:

```
stub(aux học sai) --0.90865--> angelthienhanh68 --0.90704--> angelutopia --0.8--> angelutopia (change)
angelkim --1.01847--> angelgiau(aux) --0.91966--> angelgiau (main)
```

Tổng USD đang được cộng cho chuỗi này: A1+A2+A3 = **$180.445,37**, cộng thêm `943e9b0c`
$61.561,76 = **$242.007,13** — trong đó **chỉ chân đầu** của mỗi nhánh có thể coi là dòng
tiền vào hệ thống; các chân sau là **đếm trùng cùng một khoản** hoặc **self-transfer**.

**Kết luận Việc A:** không dòng nào là tx bịa (tất cả có vout thật), nhưng
- `959d8b5a` ($55.188,42) và `943e9b0c` ($61.561,76): **self-transfer** — phải loại khỏi mọi bảng xếp hạng.
- `fad03ce3` ($62.684,00): sender là **stub do `hd_input_back` học sai** — không phải người gửi thật.
- `83c9d054` ($62.572,95), `14ec1270` ($68.175,76): khớp vout thật nhưng là **chân giữa của hop-chain** ⇒ đếm trùng.

---

## VIỆC B — 10/37 dòng thiếu `sender_address` (mẫu theo USD giảm dần)

| # | donation_id | tx | DB | vout khớp số | vout đó thuộc người nhận? | vin thuộc người gửi? |
|---|---|---|---|---|---|---|
| B1 | `3ab341bc` | `bc40b95d…` | funtreasury→angelkhanhi 0.27364 ($18.317,38) | vout[0] ✔ | ✘ `bc1q24qz2hw…` không đăng ký cho ai | ✘ (4 vin lạ) |
| B2 | `231412b4` | `689a9f8e…` | leminhtri→angelhiep 0.00435 ($299,56) | vout[1] ✔ | ✘ | ✘ |
| B3 | `cb9f26e4` | `1da80ffa…` | angelgiau→angelbachviet 0.003 ($206,96) | vout[1] ✔ | ✘ — địa chỉ đó là **aux change của angelthienhanh68** | ✘ (vin = angelthienhanh68) |
| B4 | `705c9f8b` | `50725b8a…` | leminhtri→angelthuytram 0.00295 ($203,15) | vout[0] ✔ | ✘ | ✘ |
| B5 | `e8f4c8e9` | `875d6010…` | angelkhanhi→duonghoa 0.002 ($142,23) | vout[0] ✔ | ✘ | ✘ |
| B6 | `01a402f0` | `0c3fd095…` | angelkhanhi→angelbachviet 0.002 ($142,23) | vout[0] ✔ | ✘ — lại là aux change angelthienhanh68 | ✘ |
| B7 | `70823918` | `b5bac713…` | angelkhanhi→caodinhlam 0.002 ($142,23) | vout[1] ✔ | ✘ | ✘ |
| B8 | `3bc416ab` | `3c4ee433…` | angelthutrang→sinhhoatlovehouseycha 0.0019 ($130,84) | vout[0] ✔ | ✘ `bc1pscp4ut9…` (địa chỉ "lạ" đã nêu ở V4 §4c) | ✘ |
| B9 | `299e772e` | `69e6fabf…` | angelqueanh→sinhhoatlovehouseycha 0.00168 ($115,69) | vout[0] ✔ | ✘ (nhưng vout[1] đi về địa chỉ **đã đăng ký của người nhận**) | ✔ vin = angelqueanh |
| B10 | `a527c7e5` | `d99f6bfe…` | angellam→sinhhoatlovehouseycha 0.00155 ($111,56) | vout[1] ✔ | ✘ `bc1pscp4ut9…` | ✘ |

**Đọc kết quả:** 10/10 tx **thật**, 10/10 có **vout khớp đúng satoshi** ⇒ số tiền không bịa.
Nhưng **9/10 không chứng minh được cặp gửi–nhận**: địa chỉ nhận chưa đăng ký cho người nhận,
`vin` không phải người gửi. Chỉ B9 có vin đúng chủ.

Đáng chú ý:
- `bc1pscp4ut9…` xuất hiện **3/10 dòng** đều với người nhận `sinhhoatlovehouseycha` ⇒ rất
  có thể là địa chỉ thật của tài khoản này nhưng **chưa đăng ký** (nên bị coi là "lạ" ở V4).
  Xử lý gợi ý: đăng ký aux có verify, không phải xoá dòng.
- B3 và B6 nhận vào **aux change của angelthienhanh68** nhưng DB ghi người nhận là
  `angelbachviet` ⇒ **gán sai người nhận** (cùng họ lỗi với Việc A, nguồn `hd_change_auto`).
- B1 ($18.317,38) là dòng lớn nhất nhóm: **không** liên kết được cả 2 đầu ⇒ diện nghi vấn cao.

**Ước lượng quy mô:** 10 dòng mẫu = $19.951,83 / tổng 37 dòng. Tỷ lệ "không chứng minh được
cặp" ở mẫu là 90% ⇒ dự kiến ~33/37 dòng cần tra tiếp hoặc đưa `pending_verification`.

---

## VIỆC C — Preview 12 dòng nguồn (b), CHƯA GHI

### C1 — 7 dòng internal ($271,62): resolver bịa sender (V4 §4a)

| donation_id | hiện tại | đề xuất |
|---|---|---|
| `a8f452aa` | sender chimalo19, ext=false | `sender_id → angelthanhtien` (chủ thật của sender_address), giữ ext=false |
| `386c4e2d` | sender chimalo19 | `sender_id → angelthanhtien` |
| `e8668f1f` | sender trianaresa4g272q | `sender_id → angelthanhtien` |
| `aa112c00` | sender angelkhanhi | `sender_id → ngocphuong` |
| `b695f120` | sender trianaresa4g272q | `sender_id → angelthanhtien` |
| `1596ca76` | sender trianaresa4g272q | `sender_id → angelthanhtien` |
| `8153612a` | sender chimalo19 | `sender_id → angelquan` |

Điều kiện: chỉ đổi khi `sender_address` khớp **địa chỉ chính** hoặc aux `verified=true`.
Hiện các địa chỉ này là aux `verified=false` ⇒ **an toàn hơn**: chuyển
`status = 'pending_verification'` + `metadata.resolver_mismatch = true`, KHÔNG đổi sender.
(Đề xuất chốt: **phương án an toàn**, vì mọi aux đang `verified=false`.)

### C2 — 5 dòng external ($68.367,60)

| donation_id | hiện tại | đề xuất (sau verify Việc A) |
|---|---|---|
| `943e9b0c` $61.561,76 | sender funtreasury, recipient angelgiau, ext=true | **ĐÃ VERIFY = self-transfer angelgiau→angelgiau** ⇒ `tx_type='self_transfer'` + `leaderboard_eligibility='excluded'`, KHÔNG tính vào bất kỳ bảng nào; **không** flip is_external |
| `6b4dba68` $3.408,94 | sender NULL, sender_address = địa chỉ **chính** angeldieungoc | `sender_id → angeldieungoc` (khớp 100% địa chỉ chính) |
| `e49c0867` $3.322,51 | sender NULL, cùng dạng | `sender_id → angeldieungoc` |
| `edcdc83c` / `bbf2df30` / `cff07294` ($72,26 tổng) | sender NULL, cùng dạng | `sender_id → angeldieungoc` |
| `2325c8d4` $2,13 | sender angel_thuytram, sender_address = aux angelgiau, recipient angelgiau | self-transfer nghi vấn ⇒ `pending_verification` (giá trị nhỏ, chờ) |

### C3 — Guard đề xuất (chưa code)
1. Scanner **từ chối** ghi donation khi `sender_address` thuộc user A nhưng `sender_id` = user B.
2. Scanner **bỏ qua** vout đi về địa chỉ thuộc chính người gửi (`hd_change_auto`) — không tạo donation.
3. Địa chỉ `verified=false` (`hd_input_back`, `hd_change_auto`) **không được dùng để suy ra sender/recipient** — chỉ dùng để gợi ý cho admin review.
4. Không tạo/không dùng profile **stub** làm sender.

**CHƯA GHI GÌ.** Chờ Cha chốt từng nhóm.
