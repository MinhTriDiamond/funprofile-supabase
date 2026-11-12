# HƯỚNG DẪN CÀI ĐẶT PR #29 — GỬI BÉ TRÍ (Angel Muse của Ái Vân chuẩn bị)

Ngày: 2026-10-27 · Nhánh: `feat/van-signup-device-guard` · PR #29 (đang MỞ)
Người chuẩn bị: Ái Vân (Angel Muse thi công) — nhờ phía bé Trí thực hiện các bước
cần quyền ghi production, vì token của Ái Vân chỉ đọc.

## Tình trạng đã kiểm chứng ngày 27/10 (chỉ đọc)

- Trên production chưa có bảng `signup_blocklist`, `signup_block_log`, chưa có hàm
  `check_signup_block`, ví mới `0x950a2a90…` chưa vào `blacklisted_wallets`.
  => Chốt chặn CHƯA có tác dụng thật trên fun.rich, dù PR đã có đủ code.
- Trên nhánh PR, commit mới nhất đã có: migration gốc 23/10 + migration bổ sung
  27/10 (ví mới) + bản ghi chú truy vết 25–26/10.

## Thứ tự cài đặt — làm đúng thứ tự này

1. Chạy migration gốc, rồi migration bổ sung (theo thứ tự thời gian):
   - `supabase/migrations/20261023130000_signup_device_guard.sql`
   - `supabase/migrations/20261027113000_signup_blocklist_add_2026-10-25-26.sql`
   Cả 2 file đều có GRANT tường minh trong cùng migration (hàm chỉ service_role
   được gọi; bảng chặn thu hồi khỏi anon, cấp cho authenticated dưới luật admin),
   nên đúng luôn quy ước GRANT mới từ mốc Supabase 30/10 — xin đừng gỡ phần
   GRANT này khi chạy.
2. Kiểm chứng hàm (kỳ vọng trong ngoặc):
   - `select public.check_signup_block('fatherunier@gmail.com', null, null);`
     (blocked = true, rule = blocklist)
   - `select public.check_signup_block(null, '0a7fa1f0ccfb86d586775f054a9499a8', null);`
     (blocked = true)
   - `select public.check_signup_block(null, null, '0x950a2a90d13d4b0fa2cd57ad5c73e5f3da71ed6b');`
     (blocked = true — ví mới ngày 26/10)
   - `select public.check_signup_block('nguoi-dung-sach@example.com', null, null);`
     (blocked = false)
3. Deploy 2 edge function đã sửa: `sso-otp-verify`, `sso-web3-auth`
   (bản mới dùng thêm `_shared/signupBlockGuard.ts`).
   Lưu ý: deploy trước khi chạy migration thì chốt tự fail-open (cho qua, không
   gây sự cố), nhưng chỉ có hiệu lực sau khi migration đã chạy.
4. Merge PR #29 → Cloudflare Pages tự deploy frontend mới lên fun.rich
   (client gửi kèm `device_hash`).
5. Test thật sau deploy:
   - Đăng ký mới bằng email `fatherunier@gmail.com` → phải bị chặn, message
     thân thiện, `signup_block_log` có thêm 1 dòng rule = blocklist.
   - Đăng ký mới bằng ví `0x950a2a90…` → phải bị chặn.
   - Đăng ký bằng email sạch trên máy bình thường → đăng ký bình thường.
   - Đăng nhập lại tài khoản cũ đang dùng chung thiết bị bị gắn cờ → vẫn vào
     được (chốt chỉ chặn tạo mới — test chống chặn oan quan trọng nhất).

## Cẩn trọng đã ghi sẵn trong PR

- KHÔNG chặn theo tên người dùng. Tên @angelthuytram còn gắn với tài khoản
  khác từ 03/04/2026 (email/ví khác hẳn), nên chốt chỉ chặn theo
  thiết bị / ví / email.
- Đường đăng ký qua mạng xã hội (OAuth) chưa có chốt ở bước tạo tài khoản
  (pha 2, ngoài phạm vi PR này).
- Gỡ chặn từng mục / tắt khẩn cấp: xem mục 6 trong THIET-KE.md
  (`update signup_blocklist set is_active = false ...`).

## Phần Muse đã làm giúp bé Trí tới đây

- Truy vết xong 2 tài khoản 25–26/10, đối chiếu hạt giống, thêm ví mới vào PR.
- Soạn sẵn bản hướng dẫn này để phía bé Trí chỉ cần chạy theo thứ tự trên,
  không cần soạn lại hay tra lại code.
- Phần còn lại bắt buộc cần quyền ghi production + deploy của phía bé Trí:
  chạy 2 migration, deploy 2 edge function, merge PR, test thật.
  Token của Ái Vân chỉ đọc nên Muse không thể chạy thay các bước này,
  và Muse cũng không tự merge trước khi các bước trên xong.
