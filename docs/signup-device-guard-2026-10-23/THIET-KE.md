# THIẾT KẾ — Chốt chặn đăng ký cho thiết bị / ví / email bị gắn cờ

- **Ngày:** 2026-10-23
- **Người làm:** Ái Vân (Angel Muse thi công)
- **Nhánh:** `feat/van-signup-device-guard`
- **Phạm vi:** chỉ luồng đăng ký tài khoản mới. Không khoá tài khoản hiện hữu, không đụng các luồng khác.

---

## 1. Vấn đề

Hệ thống đã có bảng `public.pplp_device_registry` ghi nhận dấu vân tay thiết bị (device fingerprint v3, hàm `getDeviceHash()` ở `src/utils/deviceFingerprint.ts`), và edge function `log-login-ip` tự đặt `is_flagged = true` khi một thiết bị có nhiều tài khoản dùng chung (lý do kiểu “Cùng thiết bị với N tài khoản”). **Nhưng việc gắn cờ không chặn được gì** — cờ chỉ để cảnh báo admin.

Diễn biến sự cố 22–23/10/2026:

| Thời điểm | Sự việc |
|---|---|
| 22/10/2026 | Một thiết bị (device_hash `0a7fa1f0…9499a8`, đã bị gắn cờ “Cùng thiết bị với 32 tài khoản”) sinh 3 tài khoản giả: @angelleminhtri, @angelleminhquan, @angelngocgiau |
| 23/10/2026 | Cả 3 tài khoản bị xoá |
| 23/10 16:41–16:47 | Chính thiết bị đó đăng ký lại 2 tài khoản mới: @lovehubbinhminh (email `fatherunier@gmail.com`, dùng lại ví của Quân `0x57741ff9…ff587c`) và @angelleminhtri (email `unierfather@gmail.com`, dùng lại ví cũ `0xa7932b97…662c6a`) |
| 23/10 tối | Cả 2 tài khoản mới cũng đã bị xoá vĩnh viễn (đã kiểm chứng: không còn trong `profiles` lẫn `auth.users`) |

Kết luận: xoá tài khoản thôi không đủ — phải chặn ngay ở **cửa đăng ký**.

## 2. Khảo sát kiến trúc hiện tại (đã đọc code trên `main`)

Các đường tạo tài khoản mới trong hệ thống:

| Đường đăng ký | Nơi tạo tài khoản | Có điểm chặn phía server không |
|---|---|---|
| Email OTP (đường xảy ra sự cố) | Edge function `sso-otp-verify` gọi `auth.admin.createUser` | Có — cùng chỗ với `signupGate` hiện hữu |
| Ví Web3 | Edge function `sso-web3-auth` gọi `auth.admin.createUser` ở nhánh “ví mới” | Có — cùng chỗ với `signupGate` hiện hữu |
| Mạng xã hội (Google/Facebook…) | Supabase Auth OAuth tạo trực tiếp, profile sinh ra bởi trigger `handle_new_user` | Không có edge function trung gian — xem mục Rủi ro |
| Email + mật khẩu cổ điển | `ClassicEmailLogin` chỉ có `signInWithPassword` (đăng nhập), không phải đường tạo tài khoản | Không áp dụng |

Cơ chế sẵn có được tái sử dụng / bám theo:

- `_shared/signupGate.ts` — tiền lệ “cổng chặn đăng ký”: module dùng chung, gọi ngay trước `createUser`, trả 403 kèm message tiếng Việt, **fail-safe mở** khi DB lỗi. Chốt mới làm đúng mẫu này.
- `blacklisted_wallets` — `sso-web3-auth` đã kiểm tra bảng này ở mọi lần đăng nhập/đăng ký bằng ví. Migration mới bổ sung 2 ví của sự cố vào bảng này.
- `pplp_device_registry` + logic tự gắn cờ trong `log-login-ip` — cờ được đặt khi >2 tài khoản đang hoạt động dùng chung thiết bị. Lưu ý: registry **giữ lại dòng của cả tài khoản đã xoá**, và trên thiết bị bị gắn cờ của sự cố còn có một số tài khoản thật cũ từng đăng nhập chung — đây là lý do chốt chỉ áp cho **đăng ký mới** và ngưỡng chặn đặt cao hơn ngưỡng gắn cờ rất nhiều (xem mục 3).
- Dấu vân tay thiết bị trước đây chỉ được gửi lên **sau khi** đăng nhập thành công (`UnifiedAuthForm` → `log-login-ip`). Muốn chặn ở bước tạo tài khoản, client phải gửi kèm `device_hash` ngay trong yêu cầu xác thực — PR này bổ sung đúng việc đó ở 2 form liên quan.

## 3. Cơ chế chặn đã chọn (phân tầng)

Nguồn sự thật đặt ở **phía cơ sở dữ liệu** — hàm `public.check_signup_block(p_email, p_device_hash, p_wallet)` (migration `20261023130000_signup_device_guard.sql`). Hai edge function tạo tài khoản gọi hàm này qua module dùng chung mới `_shared/signupBlockGuard.ts`, đặt **ngay trước `auth.admin.createUser` và chỉ trong nhánh tạo tài khoản mới** (sau khi đã xác định email/ví chưa thuộc về tài khoản nào hiện hữu).

Thứ tự kiểm tra trong hàm:

- **Tầng 1 — danh sách chặn cứng** (`public.signup_blocklist`, khớp chính xác, còn hiệu lực `is_active = true` và chưa hết hạn): email → ví → thiết bị. Trúng là chặn ngay.
- **Tầng 2 — thiết bị bị gắn cờ vượt ngưỡng:** thiết bị có `is_flagged = true` trong `pplp_device_registry` VÀ một trong hai điều kiện:
  - tổng số tài khoản từng gắn với thiết bị **≥ 10** (thiết bị của sự cố: 32), hoặc
  - **≥ 3 tài khoản được tạo trong 24 giờ** gần nhất trên thiết bị (đúng mẫu tấn công 22/10: 3 tài khoản trong một buổi sáng).

  Ngưỡng gắn cờ hiện nay là >2 tài khoản — chỉ đủ để cảnh báo. Ngưỡng **chặn** đặt cao hơn hẳn (10 tài khoản / 3 tài khoản trong 24h) để gia đình hoặc nhóm nhỏ dùng chung một máy không bị chặn oan; trường hợp cần chặn chính xác một thiết bị cụ thể thì dùng Tầng 1.

- **Ghi log:** mỗi lần chặn, edge function ghi 1 dòng vào `public.signup_block_log` (email đã thử, device_hash, ví, tầng/quy tắc nào đã chặn, nguồn edge function, IP, thời gian). Admin xem lại bằng SQL hoặc qua RLS (chỉ role `admin` đọc được).

Hành vi khi bị chặn: HTTP 403, `error: "signup_blocked"`, message thân thiện **không lộ chi tiết kỹ thuật** (không nói giá trị nào bị chặn, không nói ngưỡng):

> “Không thể tạo tài khoản mới với thông tin này. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ đội hỗ trợ FUN Profile để được xem xét.”

**Fail-safe mở:** nếu hàm kiểm tra lỗi (ví dụ migration chưa chạy, DB chập chờn) thì hệ thống **cho đăng ký qua** và ghi `console.error` — chốt không bao giờ được phép khoá toàn bộ đăng ký vì lỗi hạ tầng. Đánh đổi này giống hệt `signupGate` hiện hữu và được ghi rõ để người vận hành biết: chốt chỉ thực sự có hiệu lực sau khi migration đã chạy (mục 5).

**Dữ liệu hạt giống** (trong migration): thiết bị `0a7fa1f0…9499a8`; ví `0x57741ff9…ff587c`, `0xa7932b97…662c6a`; email `fatherunier@gmail.com`, `unierfather@gmail.com`, `kimnana20091991@gmail.com`, `caothaisongiang@gmail.com`. Hai ví đồng thời được thêm vào `blacklisted_wallets` sẵn có (chỉ thêm nếu chưa có).

## 4. Các file thay đổi trong PR này

| File | Thay đổi |
|---|---|
| `supabase/migrations/20261023130000_signup_device_guard.sql` | MỚI — bảng `signup_blocklist`, `signup_block_log`, hàm `check_signup_block`, RLS, dữ liệu hạt giống |
| `supabase/functions/_shared/signupBlockGuard.ts` | MỚI — module dùng chung: gọi hàm kiểm tra, ghi log khi chặn, trả 403 thân thiện; fail-safe mở |
| `supabase/functions/sso-otp-verify/index.ts` | Nhận thêm `device_hash` từ client; gọi chốt ngay trước `createUser` (chỉ nhánh tài khoản mới) |
| `supabase/functions/sso-web3-auth/index.ts` | Nhận thêm `device_hash`; gọi chốt ở nhánh tạo tài khoản mới bằng ví |
| `src/components/auth/EmailOtpLogin.tsx` | Gửi kèm `device_hash` khi xác thực OTP; hiển thị message thân thiện khi bị chặn |
| `src/lib/walletFlowShared.ts` | Gửi kèm `device_hash` khi xác thực ví; hiển thị message thân thiện khi bị chặn |

## 5. Thứ tự áp dụng lên production (phía bé Trí thực hiện)

> ⚠️ SQL **không** tự chạy từ phía Ái Vân (token chỉ đọc). Các bước dưới đây do phía bé Trí chạy.

1. **Chạy migration** `supabase/migrations/20261023130000_signup_device_guard.sql` trên production DB (Supabase SQL Editor hoặc `supabase db push` theo cách đội đang dùng).
2. **Kiểm chứng hàm** bằng các câu SELECT mẫu ở cuối mục này — kỳ vọng: 3 trường hợp đầu bị chặn, trường hợp cuối không.
3. **Deploy 2 edge function** đã sửa: `sso-otp-verify`, `sso-web3-auth` (bản mới dùng thêm `_shared/signupBlockGuard.ts`).
4. **Merge PR này** → Cloudflare Pages tự deploy frontend mới lên fun.rich (client gửi kèm `device_hash`).
5. **Test thật sau deploy:**
   - Thử đăng ký tài khoản mới bằng email `fatherunier@gmail.com` → phải bị chặn với message thân thiện, và `signup_block_log` có thêm 1 dòng `rule = 'blocklist'`.
   - Thử đăng ký bằng một email sạch trên máy bình thường → đăng ký bình thường.
   - **Đăng nhập lại một tài khoản cũ đang dùng chung thiết bị bị gắn cờ** → vẫn vào được (chốt chỉ chặn tạo mới). Đây là test chống chặn oan quan trọng nhất.
   - Thử tạo tài khoản mới bằng ví `0x57741ff9…ff587c` → bị chặn (tầng `blacklisted_wallets` sẵn có và/hoặc chốt hợp nhất).

Câu SELECT kiểm chứng sau bước 1:

```sql
-- Kỳ vọng: {"blocked": true, "rule": "blocklist", ...}
select public.check_signup_block('fatherunier@gmail.com', null, null);
select public.check_signup_block(null, '0a7fa1f0ccfb86d586775f054a9499a8', null);
select public.check_signup_block(null, null, '0x57741ff9dc2fa47e4a391567712a1cebb3ff587c');
-- Kỳ vọng: {"blocked": false}
select public.check_signup_block('nguoi-dung-sach@example.com', null, null);
-- Xem các lần bị chặn gần nhất:
select * from public.signup_block_log order by created_at desc limit 20;
```

Lưu ý thứ tự: nếu deploy edge function **trước** khi chạy migration, chốt tự fail-open (đăng ký vẫn chạy bình thường, chưa chặn được) — không gây sự cố, nhưng phải chạy migration thì mới có hiệu lực. Thứ tự khuyến nghị vẫn là migration trước như trên.

## 6. Khôi phục / gỡ chặn (rollback)

- **Gỡ chặn một mục cụ thể** (người thật bị chặn oan): tra `signup_block_log` để biết mục nào đã chặn, xác minh với người dùng, rồi:
  ```sql
  update public.signup_blocklist set is_active = false
   where block_type = '<email|wallet|device>' and value = '<giá trị>';
  ```
  (Giữ lại dòng với `is_active = false` thay vì xoá, để còn dấu vết kiểm toán.)
- **Tắt toàn bộ chốt trong lúc khẩn cấp:** `update public.signup_blocklist set is_active = false;` — việc này tắt Tầng 1; Tầng 2 (ngưỡng thiết bị) tắt bằng cách revert 2 edge function về bản trước PR (chốt nằm gọn trong 2 function đó + module `_shared/signupBlockGuard.ts`, revert là hết hiệu lực ngay, không cần đụng DB).
- **Gỡ hẳn phần DB** (chỉ khi đã revert edge function): 
  ```sql
  drop function if exists public.check_signup_block(text, text, text);
  drop table if exists public.signup_block_log;
  drop table if exists public.signup_blocklist;
  -- 2 dòng hạt giống trong blacklisted_wallets xoá tay theo wallet_address nếu cần.
  ```

## 7. Rủi ro còn lại (ghi rõ, không giấu)

1. **Chặn oan người thật dùng chung thiết bị:** thiết bị bị gắn cờ của sự cố có cả tài khoản thật cũ từng đăng nhập chung. Giảm thiểu: chốt chỉ chặn **tạo tài khoản mới**, không đụng đăng nhập; ngưỡng Tầng 2 cao; gỡ chặn từng mục làm được ngay bằng 1 câu UPDATE (mục 6). Nếu cộng đồng có máy dùng chung cho người mới đăng ký, admin nên biết thiết bị đó có thể bị chặn ở Tầng 2 khi vượt ngưỡng — khi đó xử lý bằng cách xác minh người thật và hỗ trợ đăng ký tay.
2. **Dấu vân tay thiết bị có thể trùng hoặc đổi:** các máy giống hệt nhau (cùng dòng iPhone, cùng trình duyệt) có khả năng cho cùng một hash; ngược lại, kẻ tấn công đổi trình duyệt/máy là có hash mới. Chốt này chặn được **tái đăng ký từ chính thiết bị/ví/email đã biết** và làm chậm đáng kể việc đăng ký hàng loạt, nhưng không phải tường tuyệt đối — vẫn cần lớp giám sát (`security_watchlist`, log) như hiện nay.
3. **Đường mạng xã hội (OAuth) chưa có chốt ở bước tạo tài khoản:** tài khoản tạo qua Google/Facebook không đi qua 2 edge function trên. Thiết bị của các tài khoản đó vẫn bị ghi nhận ở lần đăng nhập đầu (`log-login-ip`) và bị gắn cờ như hiện nay, nhưng chưa bị chặn tạo mới. Nếu cần, pha 2: kiểm tra `check_signup_block` cho tài khoản mới tạo qua OAuth ngay ở lần đăng nhập đầu tiên (khi `profiles.created_at` còn mới) — ghi nhận ở đây để đội quyết định, **không** nằm trong phạm vi PR này.
4. **Fail-safe mở:** khi DB lỗi hoặc migration chưa chạy, chốt cho qua. Đây là lựa chọn có chủ đích (ưu tiên không khoá nhầm toàn bộ người dùng mới), đồng nghĩa trong khoảng thời gian đó hệ thống trở lại trạng thái như trước PR — cần đảm bảo bước 1 của mục 5 được thực hiện và kiểm chứng.
5. **Client cũ chưa gửi `device_hash`:** bản app cũ (chưa cập nhật) không gửi kèm dấu vân tay, khi đó chốt vẫn chặn theo email/ví (Tầng 1) nhưng không kiểm tra được thiết bị. Sau khi frontend mới deploy và người dùng cập nhật app, đường thiết bị mới đầy đủ.
