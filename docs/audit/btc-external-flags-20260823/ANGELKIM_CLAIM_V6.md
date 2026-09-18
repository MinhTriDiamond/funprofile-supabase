# ANGELKIM — Điều tra theo lời khai chính chủ (23/08/2026)

READ-ONLY. Không sửa/ghi bất kỳ dữ liệu nào.

Lời khai: toàn bộ giao dịch trong 3 ảnh (trừ +0,0002 BTC từ @phuongloan) **không có thật**,
bao gồm `05a78ade…2935` (angelkim → Thu Trang) mà Việc A từng kết luận "SẠCH".

## VIỆC 1 — Địa chỉ BTC của angelkim

- `profiles.btc_address` = `bc1prndhwz6nq3v9slnuqxyhk5lhpt9p7dk9zfelyrlqjs2vvrt6wetsxdylxu`
- Audit `profiles_wallet_audit` id 4816: set **11/06/2026 23:45:02 UTC**, `old_value` RỖNG,
  `application_name = postgrest`, `db_session_user = authenticator` ⇒ **do phía client tự nhập**
  (không phải tiến trình tự động). Không có bản ghi đổi btc_address nào khác.
- **Nghịch lý thời gian:** mọi donation/transaction BTC của angelkim từ **03/04 → 11/06** đã gắn
  địa chỉ này *trước khi* nó tồn tại trong profile ⇒ toàn bộ phần đó là **backfill hồi tố** do
  scanner/backfill gán, không phải ghi nhận tại thời điểm giao dịch.
- Lịch sử on-chain của CHÍNH địa chỉ (mempool.space): 59 tx, funded 4,689 BTC, hiện còn ~0,2399 BTC.
  - Sinh ra **03/04/2026** (nhận 10.000 sat từ `bc1qmkrhhgjc5f5hes9qswg8n8ud2gu8rpezy382jz`).
  - Được nạp vốn thật **04/04/2026: 0,1284 BTC** từ `bc1qq20jykpvd78a0wm3nj3tjql36fwx2xj9jl4rtc`
    (DB đang gán là **funtreasury**).
  - Sau đó là **peel-chain liên tục**: mỗi tx tiêu 1 UTXO → 1 output nhỏ (4.500–147.000 sat) cho
    đúng các địa chỉ user FUN Profile (thutrang, hoaian, phuongloan, hoanghien, phucnguyen82…) +
    1 output change quay về chính nó; xen kẽ vài lần rút **0,01–0,08 BTC** ra địa chỉ legacy
    `14XyQE1LXQKqqh7q…`, `14HLupsBnbdm7g…`, `18vQNaUJnS59e…`, `18kzy2pJ3o9p2…`.
  - **Kết luận:** KHÔNG có dấu vết ví cá nhân đời thường (không lương định kỳ, không chi tiêu
    ngoài hệ sinh thái). Đây là ví **được nạp từ treasury/Father rồi phân phát nội bộ + rút ra
    địa chỉ legacy** — mẫu ví vận hành, không phải ví riêng của một người dùng thường. Không
    xung đột với lời khai "không phải giao dịch của tôi": địa chỉ được khai vào profile 11/06,
    trong khi ví đã hoạt động từ 03/04 bởi bên khác.
- Địa chỉ này không xuất hiện ở profile hay aux của bất kỳ user nào khác.

## VIỆC 2 — 3 giao dịch tới `bc1prn…ylxu` trong ảnh

| tx | thời điểm | vin (1 input duy nhất) | vout |
|---|---|---|---|
| `f54fb07e…8504` | 02/07 04:13 | 0,30000000 BTC **từ chính `bc1prnd…ylxu`** (nguồn: `5689e95a`) | 0,03 → `14XyQE1LXQKqqh7q…` ; **0,26999565 → chính `bc1prnd…ylxu`** |
| `dbc7134f…5371` | 06/07 16:59 | 0,26999565 từ chính nó (nguồn: `f54fb07e`) | 0,0009999 → `bc1qpp7ff0f…` (camlyd) ; 0,26898439 về chính nó |
| `cb327f4e…d2da` | 10/07 08:08 | 0,26898439 từ chính nó | 0,02 → `14XyQE1…` ; **0,24898004 về chính nó** |
| `c2e882d5…8698` | 06/08 02:23 | 0,24898004 từ chính nó | 0,02 → `14XyQE1…` ; **0,22897569 về chính nó** |

**Kết luận Việc 2:** 3 dòng trong ảnh KHÔNG độc lập — cùng **một peel-chain nối tiếp**, và số
tiền DB ghi là "angelkim gửi −0,229 / −0,249 / −0,270 BTC tới `bc1prn…ylxu`" chính là
**output tiền thối (change) quay về chính địa chỉ đó**. Đúng như lời khai: **không phải giao
dịch có thật**, mà là nhiễu kỹ thuật `X → chính X`. Bảng `transactions` xác nhận:
`from_address = to_address = bc1prnd…ylxu` cho cả 3 dòng.

`bc1prn…ylxu` **không dừng lại**: mỗi lần nhận change lại tiêu tiếp, và phần "chi thật" mỗi
chặng đều đi về **`14XyQE1LXQKqqh7qjHzJDhKvUFkC6St3mR`** (0,02–0,03 BTC/lần, ngoài hệ thống)
⇒ đây là điểm trung chuyển, không phải điểm dừng cuối.

## VIỆC 3 — tx `5689e95a…a50a` (+0,3 BTC "Ví ngoài")

Xác nhận: **1 tx nhiều output của cụm ví Father**, khối 953186, 11/06/2026 04:08 UTC.

- IN: 19,30177265 BTC từ **`bc1q0w8ah9dg5gf7hcrsddtt9fgs26w4pshz9x7jlc`** (HD của Father, nguồn `9962c8a5`).
- OUT 0: **0,30000000 BTC → `bc1prnd…ylxu`** → DB: donation `a9dfae54` sender NULL / `is_external=true`, recipient **angelkim**, $18.447,75.
- OUT 1: **19,0017696 BTC → `bc1qut04a5y5h4vzqqe7x4h5yy7c2vxwjfqfqdkn87`** (change của Father) → DB không có dòng nào cho output này; nhưng chính UTXO này **1 phút sau** tài trợ `482071aa…6929` (1 BTC → **angelgiau**, đang hiện "Ví ngoài").

⇒ Đúng giả thuyết của Cha: một tx của Father, 1 output rơi vào địa chỉ angelkim khai, output
còn lại dẫn tiếp sang chuỗi angelgiau. Tiền là **của Father**, không phải angelkim gửi/nhận
theo ý chí. 0,3 BTC này sau đó bị peel tiếp thành đúng chuỗi ở Việc 2.

Bổ sung: `351ff062` (11/06 03:30) có input **địa chỉ chính của Father** + 20,0 BTC từ
`bc1qc9mq2lz…`, output 45.000 sat vào `bc1prnd…ylxu` → DB ghi "father → angelkim $27,67".

## VIỆC 4 — Toàn bộ donations BTC liên quan angelkim

48 dòng / **$116.491,86**. Phân loại theo độ tin cậy địa chỉ:

| Chiều | Địa chỉ dùng để khớp | Số dòng | USD | BTC |
|---|---|---|---|---|
| GỬI | `main` (bc1prnd…ylxu) | 16 | 551,17 | 0,00792429 |
| GỬI | **aux auto-learn (chưa verify)** | 6 | **80.781,49** | 1,21466355 |
| NHẬN | `main` | 24 | 34.477,47 | 0,52081789 |
| NHẬN | `recipient_address` NULL | 2 | 681,73 | 0,00952165 |

6 dòng GỬI dựa trên aux tự học — **toàn bộ không đủ căn cứ**:

| donation | ngày | BTC | USD | tới | sender_address (aux `hd_input_back`, verified=false) |
|---|---|---|---|---|---|
| `14ec1270` | 04/04 | 1,01846548 | 68.175,76 | angelgiau | `bc1q964gfr2033tt8n8ynycgsspzn4xrdt7298r8x8` |
| `5f0ff7ab` | 11/06 | 0,15091506 | 9.280,15 | angelthutrang | `bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h` |
| `f62ab620` | 15/04 | 0,04046801 | 3.001,96 | angelthutrang | `bc1qm34lsc…` |
| `c0cbbb38` | 04/06 | 0,003435 | 219,92 | angelquynhhoa | `bc1qm34lsc…` |
| `a85a6718` | 17/04 | 0,00135 | 101,45 | angelquangvu | `bc1q0dypn0k…` |
| `e56c90ff` | 17/04 | 0,00003 | 2,25 | angelthanhtien | `bc1qtuwlj3rn…` |

### Bác bỏ kết luận "SẠCH" của Việc A cho `05a78ade`

tx `05a78ade…2935`: 1 input **`bc1qm34lsc…`** giá trị **40,13721216 BTC**, 13 output, change
**38,79601966 BTC** quay về chính `bc1qm34lsc…`. Một ví giữ ~40 BTC, phát 13 output/lần —
không thể là ví của angelkim. Việc A chỉ khớp **vout (số tiền + địa chỉ người nhận)** nên báo
"sạch", **chưa từng chứng minh quyền sở hữu phía input**. Lời khai chính chủ + kích thước ví
⇒ kết luận cũ **không còn hiệu lực**; phương pháp "khớp vout" phải bị coi là **không đủ**.

### Gốc rễ quy mô

`profile_btc_aux_addresses` của angelkim có **546 địa chỉ**, 100% auto-learn ngày 11/06/2026
(515 `hd_change_auto` + 31 `hd_input_back`), **0 địa chỉ verified**, gồm cả địa chỉ legacy
`1Km2r1Dt…`, `356vgCfy…`, `3G4m3Tyb…` (không thuộc cùng ví HD nào). Đây là nguồn sinh ra mọi
gán sai lớn của angelkim và các chuỗi hop đã tìm ở V4/V5.

## Đề xuất hướng (chưa thực thi, chờ Cha chốt)

1. Coi `bc1prnd…ylxu` là **địa chỉ chưa xác thực chủ** — tạm khoá khỏi mọi kết luận sở hữu, hỏi lại angelkim ai đưa địa chỉ này.
2. 546 aux của angelkim: **vô hiệu toàn bộ** (không dùng để resolve), không cần xoá — chỉ hạ tin cậy.
3. 3 dòng change `X → chính X` (`c2e882d5`, `cb327f4e`, `f54fb07e`) + `dbc7134f`: chuyển sang bảng lưu vết kỹ thuật, **ẩn khỏi mọi lịch sử** (đồng bộ với đề xuất V5).
4. 6 dòng GỬI dựa aux ($80.781,49) + 24 dòng NHẬN qua địa chỉ chưa xác thực chủ: đưa về `pending_verification`, cờ `owner_unverified`.
5. Sửa phương pháp thẩm định: bắt buộc **2 điều kiện** (khớp vout *và* chứng minh input thuộc ví đã verify của người gửi) mới được coi là giao dịch thật.
