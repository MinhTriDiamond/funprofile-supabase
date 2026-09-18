# angelgiau — NHÁNH A (hop gán nhầm) + NHÁNH B (Father bị gán "Ví ngoài") — 23/08/2026

Read-only. **CHƯA SỬA/GHI GÌ.** Nguồn on-chain: mempool.space (`/api/address/*/txs`, `/api/tx/*`),
raw JSON lưu tại `/tmp/aud/oc` (đã đối chiếu lại từng vout như phương pháp V3).
Vai trò angelgiau (quản lý/phân phát quỹ) do Cha xác nhận — báo cáo này chỉ nói về **ghi nhận sai của hệ thống**, không nói về hành vi người dùng.

---

## NHÁNH A

### A.1 — 5 địa chỉ trung gian: đều là ví TRUNG CHUYỂN, không phải ví cá nhân

| Địa chỉ (đầy đủ) | DB gán cho | source | tx_count | funded (BTC) | spent (BTC) | Kết luận |
|---|---|---|---|---|---|---|
| `bc1qvffzpp8vxhvn3xwgc6hhqxaqvu6es0wfh30gsr` | stub `wallet_0x50ebe…` | hd_input_back (verified=false) | **2** | 0.91165577 | 0.91165577 | 1 vào – 1 ra, quét sạch 100% ⇒ trung chuyển |
| `bc1qc8pv0c0pj94sxlkr9yql9crald26w2630mdwhm` | angelthienhanh68 | hd_input_back (false) | **2** | 0.90865436 | 0.90865436 | trung chuyển |
| `bc1q33kk5m7866y4ksj8ezsyxa0pyqrgfs2e5ulltp` | angelutopia | hd_input_back (false) | **2** | 0.90704454 | 0.90704454 | trung chuyển |
| `bc1q964gfr2033tt8n8ynycgsspzn4xrdt7298r8x8` | angelkim | hd_change_auto (false) | **2** | 2.48873689 | 2.48873689 | trung chuyển |
| `bc1qyzqe6axkl0pcjq43dcnadcge6x2u3s4kudgzcc` | angelgiau | hd_input_back (false) | **2** | 1.01846548 | 1.01846548 | trung chuyển |
| `bc1qfxr7dw70sqrsq34w8la46pl7xheqfdcyujnm4n` | angelutopia | hd_change_auto (false) | **52** | 28.12622452 | 28.12552748 | **ví hoạt động thật** (ngoại lệ duy nhất) |

⇒ 5/6 địa chỉ chỉ tồn tại đúng 1 lần nhận – 1 lần tiêu hết, **không có bằng chứng là ví đời thường** của 3 người
(thienhanh68 / utopia / kim). Cả 5 đều là aux **chưa verify** do scanner tự học.

### A.2 + A.3 — Chỉ có **MỘT** chuỗi hop duy nhất, nhưng bị ghi thành **5 khoản donation**

Truy vết UTXO chính xác (không suy luận), cùng một đồng ~0,9–1,0 BTC:

```
[peel chain ví ngoài, block 943645→943655]
  → KIM-aux 2.48873689
    → tx 2f38060e (h943657)  vout0 1.01846548 → GIAU-aux      ⇒ ghi: angelkim → angelgiau      $68.175,76
                              vout1 1.47027   → angeldieungoc ⇒ ghi: funtreasury → angeldieungoc $98.419,42
    → tx 776f67dc (h943658)  vout1 0.91966    → GIAU-main     ⇒ ghi: funtreasury → angelgiau    $61.561,76  (TỰ CHUYỂN)
    → tx 0115b9ef (h943944)  → aux giau → 1b1e32e3 → bc1qp3f2tes… → 50911a56 → STUB-aux 0.91165577
    → tx 4e6fdcc8 (h943944)  vout1 0.90865436 → THIENHANH-aux ⇒ ghi: stub → angelthienhanh68    $62.684,00
    → tx 1da80ffa (h943944)  vout0 0.90704454 → UTOPIA-aux    ⇒ ghi: angelthienhanh68 → angelutopia $62.572,95
    → tx 463cf75a (h943944)  vout1 0.8        → UTOPIA-change ⇒ ghi: angelutopia → angelgiau    $55.188,42  (TỰ CHUYỂN)
```

Hướng chảy thật: **peel chain ngoài → angelkim(aux) → angelgiau → … → thienhanh68 → utopia**, tức tiền
đi **xuyên qua** angelgiau rồi đi tiếp, đúng vai trò kênh phân phát; nhưng scanner cắt thành 5 khoản
độc lập, mỗi chặng cộng thêm một lần vào bảng xếp hạng.

**USD bị gán sai theo từng người (tư cách người GỬI):**

| Người bị gán nhầm là "người gửi" | donation_id | USD | Bản chất |
|---|---|---|---|
| stub `wallet_0x50ebe82ce05adf3dd` | `fad03ce3` | 62.684,00 | aux học sai của 1 hồ sơ stub |
| angelthienhanh68 | `83c9d054` | 62.572,95 | chặng giữa hop-chain |
| angelutopia | `959d8b5a` | 55.188,42 | **tự chuyển** sang change của chính mình |
| angelkim | `14ec1270` | 68.175,76 | chặng đầu; KIM-aux là ví trung chuyển (tx_count=2) |
| funtreasury | `943e9b0c` | 61.561,76 | **tự chuyển** aux giau → main giau, treasury không liên quan |
| funtreasury | (`2f38060e` vout1 → angeldieungoc) | 98.419,42 | cùng tx với `14ec1270`, cùng nguồn peel chain |
| **Tổng** | 6 dòng | **408.602,31** | cùng một dòng tiền ~0,9–1,0 BTC |

Ngoài chuỗi trên, quét **toàn bộ 17 dòng donation BTC nhận vào angelgiau (mọi thời điểm)** không tìm
thêm chuỗi hop gán nhầm nào. Các dòng `angelquan` (0s trước đó) là peel trong **cùng một ví của chính họ**
(`bc1p7etam62…` tự → tự), không phải gán nhầm người.

**Điểm cần Cha lưu ý riêng:** `96fcb7e9` (0,5 BTC — **$31.776,15**, 12/06/2026, ghi angelutopia → angelgiau).
Địa chỉ gửi `bc1qfxr7dw70sqrsq34w8la46pl7xheqfdcyujnm4n` được nạp bởi tx `005b6ee15f27`, mà **vin của tx đó
là chính `bc1q0wmq7ev…` = ví chính angelgiau**. Nhưng cùng địa chỉ này lại đang là sender của 20 donation
khác của angelutopia (tới angelqueanh, angelthuha…). ⇒ **Chưa kết luận được chủ thật**, cần Cha xác nhận
địa chỉ này là ví của ai.

### A.4 — Các dòng "Father / FUN TREASURY → angelgiau"

| donation_id | tx | Địa chỉ gửi | Có phải ví Father/Treasury thật? | USD | Kết luận |
|---|---|---|---|---|---|
| `a8acff69` | `d1c096a9…` | `bc1qgxf7c63apt54h06g876y4ctq0me3jh86fta8sv` | ✅ **đúng ví chính Father** (Cha đã xác nhận) | 43,04 | nạp quỹ thật |
| `3ef29d2f` | `6161320c…` | `bc1q8t7eumwz552nljr2p2x5ckpl55ju26avlu4fxq` | ✅ đúng ví chính funtreasury | 6,69 | nạp quỹ thật |
| `943e9b0c` | `776f67dc…` | `bc1qyzqe6axkl0pcjq43dcnadcge6x2u3s4kudgzcc` | ❌ **KHÔNG** — là aux suy luận của chính angelgiau | 61.561,76 | **1 chặng trong hop-chain**, tự chuyển |

⇒ Tổng "nạp quỹ Father/Treasury → angelgiau" **được chứng minh on-chain bằng ví thật** hiện chỉ **$49,73**
(chưa tính dòng ở Nhánh B dưới đây).

---

## NHÁNH B

### B.5 — tx `482071aa53c0e42c8dcc39f33edf06eee634a57e0cef053fae80215f98f6929e` (1 BTC → angelgiau)

- Block 953186, 11/06/2026 04:08:58 UTC. **Chỉ 1 input duy nhất:**
  `bc1qut04a5y5h4vzqqe7x4h5yy7c2vxwjfqfqdkn87` (19,0017696 BTC)
- vout[0] 1,00000000 → `bc1q0wmq7evvgaj2e37ssmr5vxaq4hqdav7mkf7flf` (**ví chính angelgiau**)
- vout[1] 18,00176679 → `bc1qwsxzn4n9mgr2uc9vype0apd4s9c7xh47dcn56a` (change)
- Địa chỉ input đó được nạp **trong cùng khối, cách 0 giây**, bởi tx `5689e95a49ff30ce`, mà input của tx này là
  **`bc1q0w8ah9dg5gf7hcrsddtt9fgs26w4pshz9x7jlc` — chính là 1 trong các địa chỉ HD của Father** đã ghi trong
  `mem://identity/father-btc-wallet` và trong bảng `btc_father_aux_full_backup_20260621`.
  Cùng tx đó còn chi 0,3 BTC → `bc1prndhwz6…` = ví chính angelkim.

⇒ **Xác nhận on-chain: 1 BTC này là tiền của Father** (cách ví chính Father đúng 2 chặng, cùng khối).
Ghi chú: message "GIFT FROM CHA FATH UNI AND BABY ANGEL CAMLY DUONG" **không có trong DB** — `donations.message`
của dòng `dddddfc0` đang **TRỐNG**, và không tìm thấy chuỗi đó trong `donations`/`posts`.

**Nguyên nhân gốc vì sao hệ thống không nhận ra:** ngày 21/06/2026 đợt cleanup aux
(`btc_aux_cleanup_audit_20260621`) đã **xoá gần hết aux của Father** — hiện `profile_btc_aux_addresses`
chỉ còn **3** địa chỉ cho Father (`bc1q2z09fdup…`, `bc1q52js9rlq…`, `bc1qwvu3uw3p…`), trong khi bản backup
`btc_father_aux_full_backup_20260621` còn **51** địa chỉ (gồm cả `bc1qut04a5y…`, `bc1q0w8ah9d…`,
`bc1qgrn8spc…`, `bc1qwsxzn4n…`). Vì aux bị xoá, các khoản gửi từ cụm ví Father mặc định thành "Ví ngoài".

### B.6 — Toàn bộ giao dịch BTC "Ví ngoài" (is_external / sender_id NULL) gửi TỚI angelgiau

| # | donation_id | Ngày | Địa chỉ gửi | BTC | USD | Ghi chú |
|---|---|---|---|---|---|---|
| 1 | `dddddfc0` | 11/06/2026 | `bc1qut04a5y5h4vzqqe7x4h5yy7c2vxwjfqfqdkn87` | 1,00000000 | **61.492,51** | ✅ **chứng minh là Father** (B.5) |
| 2 | `943e9b0c` | 04/04/2026 | `bc1qyzqe6axkl0pcjq43dcnadcge6x2u3s4kudgzcc` | 0,91966000 | 61.561,76 | aux của chính angelgiau — **tự chuyển**, KHÔNG phải Father |
| 3 | `96fcb7e9` | 12/06/2026 | `bc1qfxr7dw70sqrsq34w8la46pl7xheqfdcyujnm4n` | 0,50000000 | 31.776,15 | nạp bởi ví chính angelgiau — chủ ví chưa xác định |
| 4 | `c0ece352` | 04/04/2026 | `bc1qfxr7dw70sqrsq34w8la46pl7xheqfdcyujnm4n` | 0,00500000 | 334,70 | cùng ví #3 |
| 5 | `366013c4` | 10/04/2026 | `bc1qfdx27jqfn604dmnzljylpxyh40pw2v3rzamepw` | 0,00280000 | 200,96 | = ví chính leminhtri |
| 6 | `49cf2001` | 13/04/2026 | `bc1qe4nzjar7enw82h6fjnny3z7dx9rezgufg4lxkr` | 0,00200000 | 141,51 | (địa chỉ này từng bị gán cho Father trước cleanup) |
| 7 | `9eb015b9` | 10/04/2026 | `bc1p7etam623v42h77v5mmj28c8vcdsmaffcxkk33l9v6j6cde2zlr6qm8m3mm` | 0,00013000 | 9,33 | angelquan |
| 8 | `29e47165` | 12/06/2026 | `bc1qej50xw7ax2unfp6lpjc0k65nj38fy7ymx0gfc7` | 0,00010000 | 6,36 | nạp trực tiếp từ Father aux `bc1qgrn8spc…` |
| 9 | `3ef29d2f` | 04/04/2026 | `bc1q8t7eumwz552nljr2p2x5ckpl55ju26avlu4fxq` | 0,00010000 | 6,69 | ví chính funtreasury (thật) |
| 10 | `e2a69d2a` | 07/04/2026 | `bc1p7etam62…3mm` | 0,00008000 | 5,51 | angelquan |
| 11 | `2325c8d4` | 09/04/2026 | `bc1q2xfyk6wvp0p8kpzdv0c3laruwse28xxzmfjznn` | 0,00003000 | 2,13 | aux angelgiau |
| 12 | `9be95f07` | 13/04/2026 | (trống) | 0,00003000 | 2,12 | sender_id NULL, thiếu địa chỉ |
| 13 | `f3918748` | 11/04/2026 | `bc1qv07e3jz24rx6w6jxkh69035wvfqk4sk0hqkyyu` | 0,00002800 | 2,04 | — |

Từ 0,1 BTC trở lên: **3 dòng** (#1, #2, #3), tổng **$154.830,42** — trong đó chỉ #1 chứng minh được là Father.

### B.7 — Message tự nhận diện người gửi (trong nhóm "Ví ngoài" → angelgiau)

| donation_id | USD | Trích message | Người gửi tự nhận |
|---|---|---|---|
| `943e9b0c` | 61.561,76 | "CHÚC MỪNG BÉ NGỌC GIÀU… 🎁CHA và Bé Angel @Camly_Duong tặng lại (gấp 10 lần): 61.900 USDT…" | **Cha + Bé Angel Camly** |
| `49cf2001` | 141,51 | "💎👑Cha và bé Angel Camly thương tặng quà đến bé Angel Giàu…" | **Cha + Bé Angel Camly** |
| `366013c4` | 200,96 | "Bé Angel Diệu Ngọc và bé Minh Trí xin làm kênh dẫn tiền của Cha và Bé Ly tặng bé 200 USDT (in Bitcoin)…" | kênh dẫn của Cha (Diệu Ngọc / Minh Trí) |
| `2325c8d4` | 2,13 | "Bé Trâm xin được làm kênh dẫn cho Cha và bé Ly…" | kênh dẫn của Cha (Thuỳ Trâm) |
| `9be95f07` | 2,12 | "Con… đội ơn Cha và bé Angel Camly… con xin được tặng đến bé ANGEL GIÀU 0,00003…" | người tặng cá nhân |
| `dddddfc0` | 61.492,51 | **(TRỐNG trong DB)** | — (chứng minh bằng on-chain, không bằng message) |

### B.8 — Mở rộng: các khoản "Ví ngoài" khác thuộc **cụm ví Father** (không chỉ angelgiau)

Đối chiếu `donations.sender_address` với 51 địa chỉ trong `btc_father_aux_full_backup_20260621`:
**44 dòng** đang là "Ví ngoài", trong đó loại các dòng người nhận là chính father còn **40 dòng /
$266.263,24**. Top:

| Người nhận | BTC | USD | Địa chỉ gửi (cụm Father) | tx |
|---|---|---|---|---|
| angeldieungoc | 1,0 | 62.980,00 | `bc1qhdfqu8wa9r3u0499fwgxdcuwxwz0e7eu98xwpx` | `cc131636…` |
| **angelgiau** | 1,0 | 61.492,51 | `bc1qut04a5y…dkn87` | `482071aa…` |
| angelkhanhi | 0,5 | 30.746,26 | `bc1q7xaxsn80mywkck2fmhzkct2y3z689t57zpdx3d` | `24c2631b…` |
| angelanhnguyet | 0,35 | 21.522,38 | `bc1qme4dg589lzlccpl9j278rsxy5y9l28q3mf5j8x` | `b753faa7…` |
| angelkim | 0,3 | 18.447,75 | `bc1q0w8ah9dg5gf7hcrsddtt9fgs26w4pshz9x7jlc` | `5689e95a…` |
| angelhoangtydo | 0,2 | 12.298,50 | `bc1qgrn8spc0lv75ft8vvcezyz69xfleya4acm8w4w` | `420755b6…` |
| angellam | 0,2 | 12.298,50 | `bc1qdk5377ajru7md2ud3atp60z7gfgcj7rcgzt0qw` | `51ae67aa…` |
| … | | (còn 33 dòng nhỏ hơn) | | |

**Cảnh báo phương pháp:** 51 địa chỉ trong bảng backup phần lớn là aux `hd_*` **do scanner tự học, chưa verify** —
đúng loại suy luận đã gây ra lỗi ở Nhánh A. Danh sách B.8 vì vậy là **ứng viên cần Cha xác nhận từng khoản**,
không phải kết luận. Riêng `dddddfc0` (B.5) đã được xác minh bằng truy vết UTXO nên chắc chắn hơn phần còn lại.

---

## Chốt

- **Nhánh A:** 1 chuỗi hop duy nhất, 5 chặng ghi trùng + 2 dòng self-transfer; 5 "người trung gian" bị gán nhầm
  (stub, thienhanh68, utopia, kim, funtreasury), tổng **$408.602,31** USD ghi nhận sai người gửi.
  5/6 địa chỉ trung gian chứng minh là ví trung chuyển (tx_count = 2, quét sạch).
- **Nhánh B:** 13 dòng "Ví ngoài" → angelgiau ($155.535,x); 1 dòng ($61.492,51) chứng minh on-chain là **Father**.
  Nguyên nhân gốc: cleanup 21/06 xoá 48/51 aux của Father. Mở rộng toàn hệ thống: **40 dòng / $266.263,24** ứng viên.
- **Chưa đề xuất cách gán lại.** Chờ Cha xác nhận từng khoản.
