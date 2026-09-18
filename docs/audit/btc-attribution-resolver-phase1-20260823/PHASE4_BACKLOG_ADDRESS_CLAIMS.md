# Phase 4 — BACKLOG: xác minh on-chain 44 địa chỉ BTC khai lần đầu 11–12/06/2026

**Trạng thái:** BACKLOG — **chưa làm ngay**. Chỉ thực thi khi Phase 4 (backfill/attribution) được CTO mở gate.
**Nguồn:** truy vấn read-only `profiles_wallet_audit` (mục 1.2 của `HANDOFF.md`), chạy 23/08/2026.
**Liên quan:** `../btc-external-flags-20260823/ANGELKIM_CLAIM_V6.md`, `HANDOFF.md`.

## 1. Vì sao có backlog này

Vụ angelkim cho thấy: **lời khai địa chỉ (`profiles.btc_address`) không phải bằng chứng sở hữu**.
Địa chỉ `bc1prndhwz6…ylxu` được khai lúc 11/06/2026 23:45 nhưng đã bị gán cho các giao dịch từ
03/04/2026 (nghịch lý thời gian), và lịch sử on-chain của chính địa chỉ đó mang đặc điểm ví
vận hành/peel-chain, không phải ví cá nhân. Chính chủ sau đó xác nhận phần lớn giao dịch
**không có thật**.

Toàn bộ 44 địa chỉ dưới đây được khai trong **cùng một đợt onboarding 11–12/06/2026** (cùng cơ
chế `postgrest`, `old_value` rỗng = khai lần đầu). Vì vậy **cả đợt phải chịu cùng mức kiểm
chứng như angelkim**, không được mặc định tin lời khai.

## 2. Phương pháp bắt buộc áp cho từng người (đúng như đã dùng cho angelkim)

Với mỗi địa chỉ trong bảng, trước khi dùng nó để gán bất kỳ donation/transaction nào:

1. **Tra lịch sử on-chain của chính địa chỉ đó (không phải aux)** — mempool.space/Blockstream:
   toàn bộ tx, thời điểm tx đầu tiên, tổng nạp vốn thật.
2. **So mốc thời gian:** có tx nào TRƯỚC `changed_at` (thời điểm khai) không?
   - Có ⇒ **nghịch lý thời gian**, cùng dạng angelkim ⇒ vào diện xem xét, không tự tin lời khai.
   - Không ⇒ điểm cộng cho giả thiết "ví cá nhân thật mới tạo".
3. **Phân loại đặc tính ví:**
   - *Ví vận hành / peel-chain*: nhận 1 lần rồi tiêu gần sạch, chuỗi hop liên tiếp, số tx lớn
     bất thường, xuất hiện chung cụm với các địa chỉ trung chuyển đã biết trong audit trước.
   - *Ví cá nhân thật*: số dư giữ lại, tần suất thấp, không nằm trong peel-chain.
4. **Chứng minh sở hữu phía INPUT** cho mọi dòng gán cho user đó — khớp `vin` thật.
   **Khớp vout là KHÔNG ĐỦ** (bài học bác bỏ kết luận "sạch" của `05a78ade`).
5. **Đối chiếu aux:** kiểm tra `profile_btc_aux_addresses` của user — mọi dòng
   `verified = false` (đặc biệt nguồn `hd_input_back` / `hd_change_auto` / `hd_cluster`)
   **không được dùng làm căn cứ suy luận chủ**.
6. Kết luận 1 trong 3: `owner_confirmed` / `unproven` (→ `pending_verification`) /
   `operational_noise` (→ loại khỏi donations).

## 3. Danh sách đầy đủ 44 user

| # | audit id | username | changed_at (UTC) | btc_address khai lần đầu |
|---|---|---|---|---|
| 1 | 4791 | angelhoangtydo | 2026-06-11 14:33:49 | bc1qej50xw7ax2unfp6lpjc0k65nj38fy7ymx0gfc7 |
| 2 | 4795 | angelthanhtinh | 2026-06-11 14:34:46 | bc1q049nxzlpdh59dzmnvdyj4wndwxtma543jz9h4w |
| 3 | 4796 | angelgiau | 2026-06-11 14:35:10 | bc1q0wmq7evvgaj2e37ssmr5vxaq4hqdav7mkf7flf |
| 4 | 4797 | angelthuha | 2026-06-11 14:35:51 | bc1q47vk6dx3uhxdmj3l0zcfcqekhdu8smpgaquryj |
| 5 | 4801 | angelbachviet | 2026-06-11 14:45:41 | bc1qhc2cspnep2j9gv5cscylhwpgwagdnk9x9tjlml |
| 6 | 4802 | tunguyen | 2026-06-11 14:59:40 | bc1qmydvpluyne72na7gfwjhkgf57xg8y8glp5fjuf |
| 7 | 4803 | nguyenthu688 | 2026-06-11 15:00:22 | bc1qr5ehesycw0uyuyrgf8pesgfsnmu5kzyzs95fwe |
| 8 | 4804 | phuongloan | 2026-06-11 15:01:46 | bc1qf9a79pj3ka98jccltrtcurkdmuk0ppppvx5z8e |
| 9 | 4806 | thuydinh6886 | 2026-06-11 15:33:40 | bc1qred6ah2cf5nw3scqumv762nax4u7pk0pceu3xc |
| 10 | 4807 | ngocson | 2026-06-11 15:45:54 | bc1qnxn4cvz06zrylgrsuhgxc2dv9gxsu8t0rq04ul |
| 11 | 4808 | angelkimngan | 2026-06-11 15:51:41 | bc1qmtxkkha6x6vnt7ul3aqv5hr6v8nrs323zv9a78 |
| 12 | 4809 | angelkhanhi | 2026-06-11 16:22:19 | bc1qe4nzjar7enw82h6fjnny3z7dx9rezgufg4lxkr |
| 13 | 4810 | angelanhnguyet | 2026-06-11 16:38:57 | bc1q25fyhp0gpz6c0680ysp6hej387z0k5ynne3f5m |
| 14 | 4811 | susu | 2026-06-11 16:50:32 | bc1qg4zy8h7lmu2qt3a7ptm32plt5v6tvn069fdksq |
| 15 | 4812 | angellam | 2026-06-11 16:57:14 | bc1qq3mf47xuq3x77pmyqma90ugdawcyfqr2xg4f9c |
| 16 | 4813 | angelhoaian | 2026-06-11 17:16:21 | bc1qwf7m5sq8yr9zgm8n6ftnzzyzajuesru6245j27 |
| 17 | 4814 | chimalo19 | 2026-06-11 18:59:10 | bc1qse7var2kjs5574zwl9c8z9wlukup5hywg68qvd |
| 18 | 4815 | hoanghien | 2026-06-11 19:53:07 | bc1qdwxwquxuyysgtwy024ne8767qlrjdnj4p53mx2 |
| 19 | 4816 | **angelkim** (ĐÃ điều tra — V6) | 2026-06-11 23:45:02 | bc1prndhwz6nq3v9slnuqxyhk5lhpt9p7dk9zfelyrlqjs2vvrt6wetsxdylxu |
| 20 | 4817 | angelaivan | 2026-06-12 00:15:47 | bc1qwulmdekmhnvdakzey7skv0qextexxuswlvcmxg |
| 21 | 4818 | angelthutrang | 2026-06-12 00:50:03 | bc1qkh8fpt90ls5l9cue2pn2m3uq59z08hw804h882 |
| 22 | 4819 | kieuphias | 2026-06-12 01:07:00 | bc1qcme97v4ay24p8r5kl7lj2k3d938luf6h437qzz |
| 23 | 4820 | maihuong413 | 2026-06-12 03:33:47 | bc1qp84gkya8neyza40zdezu2u5y92j09nlzc6st4r |
| 24 | 4821 | angeltotam | 2026-06-12 03:34:50 | bc1qnz458m5uczepa9egwtxsa6a04nfppay4mury2j |
| 25 | 4822 | nhuxuyen | 2026-06-12 04:11:19 | bc1qugl30qqrdhqx26h6wtd2z9xmmcwm4tvu07xfdm |
| 26 | 4823 | baokim86 | 2026-06-12 04:15:29 | bc1q4uap02yxlltm8765dpeddqwkf7m9qp6v3s87pd |
| 27 | 4824 | angeldieungoc | 2026-06-12 04:39:27 | bc1qrq0v066l2nkp7mh4lmza2szmpfkawfx4kdn48j |
| 28 | 4825 | leminhtri | 2026-06-12 04:41:20 | bc1qfdx27jqfn604dmnzljylpxyh40pw2v3rzamepw |
| 29 | 4826 | luctranvan | 2026-06-12 06:15:53 | bc1qnuf5wqsuat7dj87gdq9axuqftw9r4dm78cwv3k |
| 30 | 4827 | phamluong68 | 2026-06-12 06:18:05 | bc1q5h442ydg72lsyjezwthml3xx86hag2pz7janl6 |
| 31 | 4828 | angeltriduc | 2026-06-12 06:53:42 | bc1qdks2qjm2pz68ynpyfgk2edy7ls6m4hpn9449uv |
| 32 | 4829 | angelthanhtien | 2026-06-12 06:54:36 | bc1ptz7r9sczegjvt2xxjq7eudgwwzy7f5m2q6lf5tfa7fytzqaflu9s9phtfw |
| 33 | 4830 | angelquangvu | 2026-06-12 07:01:19 | bc1q7n89gq0w6rw042ran7pqqyq5ggtgxer942hhxw |
| 34 | 4831 | angelngoctran | 2026-06-12 07:01:19 | bc1py4es4ga0nykjfdxjud96c95l2qzhn7szvrruuv0605wf8aqzwmssr3qerz |
| 35 | 4832 | angelquan | 2026-06-12 07:08:10 | bc1p7etam623v42h77v5mmj28c8vcdsmaffcxkk33l9v6j6cde2zlr6qm8m3mm |
| 36 | 4833 | angel_thuytram | 2026-06-12 07:09:46 | bc1q6qkyzur2secy560g2j3xccmgf3f3le30ltaxew |
| 37 | 4834 | khanhvy | 2026-06-12 07:25:29 | bc1pt4txgp4q40jg9ufasa9k2u3qrm30skswfx8rqz65dtd64y8c3yfskw8csh |
| 38 | 4835 | angelhoanghuong | 2026-06-12 07:26:34 | bc1qdcyjgvktvamqvf00nhjnyvwfevevfszx6ll9nr |
| 39 | 4836 | angelthuongchieu | 2026-06-12 07:27:43 | bc1p6e94sz52vsrfxxfvqjqrjp2jhwstgz04uw6pk9227jnsrzg444nqatfr4p |
| 40 | 4837 | angelthuhuyen | 2026-06-12 07:39:32 | bc1q773lphweajgzuv8l9lcvdz7k8jnm4drztr97da |
| 41 | 4864 | murphy358 | 2026-06-12 08:13:34 | bc1p48uc3kvvkhgnv2dg82qva44rceqp8ldt490mcq25ef2et36x6w0qykq39f |
| 42 | 4865 | manhquybmt | 2026-06-12 09:07:38 | bc1q89ydr5gvcmxdyemer57d2yemmp6rh38mz3mmag |
| 43 | 4866 | tuyetmai | 2026-06-12 09:49:28 | bc1qn7gcdkg3sxj4w5r0h2clfdgfmfzfdqkxvhg84f |
| 44 | 4868 | huyhuongphat | 2026-06-12 12:15:22 | bc1p9y2tr7le9xt6wlamv4hh75tkq786qjcdkf7nxngunwep4lz22zlq9r5245 |

> Ghi chú số lượng: đợt này có **44 bản ghi khai lần đầu** trong 11–12/06/2026 (trước đó ước
> "45"; con số chính xác theo `profiles_wallet_audit` là 44, angelkim là #19 và **đã** điều tra).
> Không có user nào khác ngoài angelkim khai trong khung 23:30–23:59 UTC 11/06 — câu hỏi bảo mật
> đó đã đóng.

## 4. Ưu tiên khi mở Phase 4

1. Nhóm đã có phát hiện lệch chủ trong audit trước: `angelgiau`, `angelthanhtien`,
   `angeldieungoc`, `leminhtri`, `angelquan`, `chimalo19`, `angelthutrang`, `phuongloan`.
2. Nhóm có donation BTC giá trị USD lớn.
3. Phần còn lại theo thứ tự thời gian.

## 5. Gate

Không ghi/sửa `donations`, `transactions`, `wallet_transfers`, `profiles` từ backlog này.
Mọi kết luận phải có evidence on-chain cố định (txid + vin/vout index) lưu cùng thư mục audit.
