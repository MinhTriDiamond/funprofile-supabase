# V5 — Truy vết lại chuỗi $408.602,31 theo quy tắc nghiệp vụ mới (READ-ONLY)

Ngày: 2026-08-23. **Không sửa/ghi bất kỳ dữ liệu nào.**

Quy tắc nghiệp vụ Cha xác nhận:
- (a) Father/Treasury → angelgiau: khoản LỚN (nạp quỹ) — hợp lệ.
- (b) angelgiau → người khác (nhỏ hơn), hoặc người khác → angelgiau (nhỏ, quà thường) — hợp lệ.
- **KHÔNG tồn tại** angelgiau tự chuyển cho chính mình.

---

## 1. Xác minh lại 959d8b5a và 943e9b0c — không phải "self-transfer", cũng không phải change-output cùng tx

### 959d8b5a ($55.188,42 — DB: angelutopia → angelgiau, 0,8 BTC)
tx `463cf75a…e600`, block 943944.
- vin[0] = `bc1q33kk5m7866y4ksj8ezsyxa0pyqrgfs2e5ulltp` — aux **angelutopia** (`hd_input_back`, **chưa verify**)
- vout[0] = `bc1q4d4g0py3f5pw63vqxkltu7txad22xm5admk2cq` 0,10704313 — aux **angelutopia** (`hd_input_back`, chưa verify)
- vout[1] = `bc1qfxr7dw70sqrsq34w8la46pl7xheqfdcyujnm4n` 0,8 — aux **angelutopia** (`hd_change_auto`, chưa verify)

⇒ **Cả input và cả 2 output đều được DB gán cho angelutopia.** Đây là 1 giao dịch peel/thối tiền nội bộ trong CÙNG 1 tx. `recipient_id = angelgiau` là do resolver gán bừa (cột `recipient_address` **NULL**). Không có bất kỳ giá trị nào thực sự đi tới angelgiau. → Nhiễu kỹ thuật 100%.

### 943e9b0c ($61.561,76 — DB: funtreasury → angelgiau, 0,91966 BTC)
tx `776f67dc…0095`, block 943658 — **là tx riêng biệt**, không phải change-output cùng tx.
- vin[0] = `bc1qyzqe6axkl0pcjq43dcnadcge6x2u3s4kudgzcc` 1,01846548 (nhận từ vout[0] của `2f38060e`) — địa chỉ này bị đăng ký làm aux **angelgiau** (`hd_input_back`, chưa verify) **chỉ vì** scanner thấy nó gửi tiền vào ví chính angelgiau ⇒ suy luận vòng tròn.
- vout[0] = `bc1qjr4nh9l6tlf5ranhaspwnst9tv7s3eav004h3c` 0,09880407 (aux `hd_change_auto` của angelgiau — cũng auto-learn)
- vout[1] = `bc1q0wmq7evvgaj2e37ssmr5vxaq4hqdav7mkf7flf` **0,91966 = ví CHÍNH angelgiau**

⇒ Giá trị **thực sự có đi vào ví chính angelgiau**: đây là 1 khoản NHẬN THẬT. Nhưng nhãn `sender = funtreasury` **sai** (địa chỉ vin không hề thuộc treasury; treasury MAIN là `bc1q8t7eumwz552nljr2p2x5ckpl55ju26avlu4fxq`). Không phải self-transfer, cũng không phải change: là **inbound từ cụm ví lạ chưa xác định**.

---

## 2. Truy vết ĐIỂM XUẤT PHÁT THẬT và ĐIỂM ĐẾN CUỐI CÙNG

### Chuỗi 1 (04/04/2026, block 943654→943658)
```
bc40b95d (4 input: 2 dust 1.354 + 1 dust 1.353 + 3,5334 BTC từ bc1qnshazgq…)
  → b770dae7 → 8b26d409 → a0707fdd  (3 chặng peel qua địa chỉ vô danh)
  → 2f38060e   vout0 1,01846548 → bc1qyzqe6ax…   [ghi thành 14ec1270  kim→giau  $68.175,76]
               vout1 1,47027    → angeldieungoc MAIN [ghi thành f70f678a treasury→dieungoc $98.419,42]
  → 776f67dc   vout1 0,91966    → angelgiau MAIN     [ghi thành 943e9b0c treasury→giau $61.561,76]
```
- **Điểm xuất phát thật:** `bc40b95d` — 1 giao dịch **gom dust** (2 output dust 1.353/1.354 sat) từ `bc1qnshazgqff2r8m23sn9x2t0rzyw9zsnmn4xyxv9`. **KHÔNG phải Father, KHÔNG phải Treasury.**
- **Điểm đến cuối thật:** ví chính `angeldieungoc` (1,47027) và ví chính `angelgiau` (0,91966).
- ⇒ 2 khoản NHẬN là thật, nhưng **người gửi là cụm ví ngoài chưa xác định**. Dòng `14ec1270` ($68k) chỉ là **chặng trung gian** (1,01846548 chưa bao giờ dừng lại ở giau — nó bị tiêu tiếp sau 7 phút) ⇒ **nhiễu, đếm trùng**.

### Chuỗi 2 (06/04/2026, block 943944) — PHÁT HIỆN QUYẾT ĐỊNH
Truy ngược tới cùng cho thấy chuỗi 2 **chính là đồng tiền của chuỗi 1 bị angelgiau tiêu ra ngoài**:
```
angelgiau MAIN bc1q0wmq7ev…  chi 0,91966 BTC  (tx 0115b9ef, block 943944)
  → bc1qqn2wgq2… → 1b1e32e3 → bc1qp3f2tes… → 50911a56   (peel qua địa chỉ vô danh)
  → 4e6fdcc8  vout1 0,90865436 → bc1qc8pv0c0…  [ghi fad03ce3 stub→thienhanh68 $62.684,00]
  → 1da80ffa        0,90704454 → bc1q33kk5m7…  [ghi 83c9d054 thienhanh68→utopia $62.572,95]
  → 463cf75a  vout1 0,8        → bc1qfxr7dw7…  [ghi 959d8b5a utopia→giau      $55.188,42]
  → (0,8 dừng tại bc1qfxr7dw7 — ví hoạt động thật 52 tx, KHÔNG phải ví user nào được xác nhận)
```
- **Điểm xuất phát thật: ví CHÍNH angelgiau** (giau chi tiền ra ngoài).
- **Điểm đến cuối thật:** `bc1qfxr7dw70sqrsq34w8la46pl7xheqfdcyujnm4n` — ví ngoài đang hoạt động (52 tx, luồng 28,1 BTC), có dấu hiệu ví dịch vụ/sàn. **Không phải angelutopia** (utopia MAIN là `bc1q7naf7a0943kwd8hkxsc5h8ps430ve5ga5jn9q4`).
- ⇒ **Toàn bộ 3 dòng `fad03ce3`, `83c9d054`, `959d8b5a` ($180.345,37) là chặng peel của MỘT lệnh chi ra ngoài duy nhất của angelgiau.** Không có donation nào giữa stub/thienhanh68/utopia/giau. Nhiễu kỹ thuật 100%, đúng như quy tắc mới đã tiên đoán (không thể có "utopia → giau" khoản $55k, và không thể có "giau tự chuyển").

### Kết luận 6 khoản

| # | donation | Nhãn DB hiện tại | USD | Bản chất thật |
|---|---|---|---|---|
| 1 | `14ec1270` | angelkim → angelgiau | 68.175,76 | **Nhiễu** — chặng trung gian chuỗi 1 |
| 2 | `f70f678a` (2f38060e vout1) | funtreasury → angeldieungoc | 98.419,42 | **Nhận thật** vào dieungoc, nhưng **sender sai** (ví ngoài lạ) |
| 3 | `943e9b0c` | funtreasury → angelgiau | 61.561,76 | **Nhận thật** vào giau, nhưng **sender sai** (ví ngoài lạ) |
| 4 | `fad03ce3` | stub wallet_0x50ebe… → thienhanh68 | 62.684,00 | **Nhiễu** — chặng peel chuỗi 2 |
| 5 | `83c9d054` | thienhanh68 → angelutopia | 62.572,95 | **Nhiễu** — chặng peel chuỗi 2 |
| 6 | `959d8b5a` | angelutopia → angelgiau | 55.188,42 | **Nhiễu** — chặng peel chuỗi 2, input+output cùng 1 cụm |
| | | | **408.602,31** | **4 dòng nhiễu ($248.621,13) + 2 dòng nhận thật sai người gửi ($159.981,18)** |

Ngoài ra chuỗi 2 tiết lộ 1 sự kiện thật **chưa được ghi**: angelgiau **chi ra ngoài 0,91966 BTC** (06/04) — không có dòng donation nào phản ánh (đúng, vì không phải quà tặng cho user nội bộ).

---

## 3. Đề xuất hướng xử lý (CHƯA GHI)

**Nhóm N (nhiễu kỹ thuật) — 4 dòng, $248.621,13:** `14ec1270`, `fad03ce3`, `83c9d054`, `959d8b5a`.
- **Không** đổi `is_external`, **không** dùng nhãn `self_transfer` (nhãn này ngụ ý hành vi có chủ đích — sai bản chất).
- Đề xuất: **KHÔNG xoá vật lý**. Chuyển sang bảng kỹ thuật riêng `btc_technical_noise` (schema mirror `donations` + `noise_reason`, `chain_id`, `evidence_json`, `moved_by`, `moved_at`), rồi DELETE khỏi `donations` trong cùng transaction; đồng thời xoá bản ghi `transactions`/`wallet_transfers` tương ứng.
- Lý do chọn bảng riêng thay vì xoá hẳn: giữ khả năng đối chiếu on-chain và phục hồi nếu Cha đổi quyết định; bảng RLS admin-only, **không hiển thị ở bất kỳ đâu** (không leaderboard, không lịch sử, không Light Score).
- Kèm theo: thu hồi Light Score/FUN đã cộng (nếu có) cho 4 dòng — cần kiểm tra riêng trước khi ghi.

**Nhóm R (nhận thật, sai người gửi) — 2 dòng, $159.981,18:** `f70f678a`, `943e9b0c`.
- Giữ trong `donations`, đặt `is_external = true`, `sender_id = NULL`, `sender_address` = địa chỉ vin thật, thêm `verification_note = 'external_unknown_sender'`.
- **Không** gán cho funtreasury/kim (không có bằng chứng).

**Guard cần thêm cho scanner (chống tái phát):**
1. **Cấm auto-learn aux từ phía input** (`hd_input_back`): địa chỉ gửi tiền vào ví user KHÔNG được suy ra là aux của user đó — đây chính là gốc của cả 2 chuỗi.
2. Bỏ qua output quay về bất kỳ địa chỉ đã thuộc cụm input (change/peel) — không tạo donation.
3. Bắt buộc `recipient_address` NOT NULL cho donation BTC; thiếu địa chỉ ⇒ `pending_verification` (37 dòng cũ đang thiếu → SQL không thể tự phát hiện X→X, đây là lỗ hổng phát hiện).
4. Chặn "hop-chain": nếu output của tx bị tiêu tiếp trong ≤ N block bởi cùng cụm, chỉ ghi khoản dừng lại cuối cùng.

---

## 4. Rà lại toàn bộ phát hiện trước theo quy tắc mới

Quét toàn bảng `donations` (BTC):

| Kiểm tra | Số dòng | USD |
|---|---|---|
| `sender_id = recipient_id` (X→X lộ rõ trong DB) | **0** | — |
| `recipient_address` là aux của chính sender | **0** | — |
| **`sender_address` là aux auto-learn CHƯA verify** | **195** | **926.334,59** |
| trong đó **`sender_id` khác chủ aux** (resolver mismatch) | **58** | **245.298,22** |

⇒ Hai chỉ số đầu bằng 0 **không có nghĩa là sạch** — vì 37 dòng thiếu `recipient_address` và các aux auto-learn làm sai lệch chủ sở hữu, X→X chỉ lộ ra khi đối chiếu on-chain (như `959d8b5a`). **Cột trụ tin cậy hiện tại là 195 dòng / $926k dựa trên aux chưa verify — phải coi là KHÔNG TIN CẬY cho tới khi verify từng địa chỉ.**

**Nhánh B (40 dòng "cụm Father", $266.263,24):** cụm này được dựng từ chính cơ chế aux auto-learn `hd_input_back` — cùng loại bằng chứng vừa bị chứng minh sai ở chuỗi 1. Đề xuất **hạ toàn bộ 40 dòng khỏi danh sách tin cậy**, chỉ giữ lại dòng nào Cha xác nhận bằng nội dung message hoặc bằng liên kết UTXO trực tiếp tới ví chính Father:
- `dddddfc0` (1 BTC → angelgiau, $61.492,51): input `bc1qut04a5y…kn87` được nạp **cùng khối, 0 giây trước** bởi tx `5689e95a…` có input là `bc1q0w8ah9dg5gf7hcrsddtt9fgs26w4pshz9x7jlc` (địa chỉ HD Father). **Khớp mẫu (a) Father → giau khoản lớn** ⇒ ứng viên MẠNH, chờ Cha chốt.
- `96fcb7e9` (0,5 BTC → angelgiau, $31.776,15): người gửi `bc1qfxr7dw7…` **chính là ví ngoài nhận 0,8 BTC ở cuối chuỗi 2**, đang bị gán `sender_id = angelutopia` qua aux chưa verify. ⇒ **loại angelutopia khỏi nhãn người gửi**; là inbound từ ví ngoài chưa xác định.
- 38 dòng còn lại: giữ nguyên `is_external = true`, sender NULL; **không** flip theo cụm aux.

**Kết luận về kế hoạch flip 249 dòng (PREVIEW_V3_FINAL):** đề nghị **tạm dừng**. V3 xác minh đúng số tiền và vout, nhưng **không kiểm tra được quyền sở hữu địa chỉ** — mà đây chính là điểm hỏng. Cần verify chủ sở hữu địa chỉ trước khi flip bất kỳ dòng nào.
