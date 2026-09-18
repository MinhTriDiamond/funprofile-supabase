# Vá 2 lỗ hổng bảo mật — 16/09/2026 (LỆNH 15/09)

## 1. angel_ai_client.client_secret plaintext → bcrypt

### 1.1 Phát hiện TRƯỚC khi đổi (bắt buộc theo lệnh)

Cơ chế xác thực secret KHÔNG đồng nhất giữa các edge function:

| Edge function | Cơ chế cũ | Rủi ro khi hash |
|---|---|---|
| `sso-token` | `bcrypt.compare` | An toàn; nhưng client plaintext (angel_ai) **không thể** xác thực được ⇒ luồng này của Angel AI vốn đã không dùng secret (chỉ PKCE) |
| `sso-register` | `client.client_secret !== client_secret` (so chuỗi thô) | **GÃY** nếu hash |
| `sso-merge-request` | `.eq('client_secret', client_secret)` (so chuỗi thô trong SQL) | **GÃY** nếu hash |
| `sso-merge-approve`, `sso-resend-webhook` | dùng `client_secret` làm khoá HMAC webhook | Đổi giá trị ⇒ signature đổi. `angel_ai_client.webhook_url = NULL` ⇒ **không ảnh hưởng** |

⇒ Không thể hash "âm thầm". Bắt buộc vá hash-compare trước.

### 1.2 Đã vá

- Thêm `supabase/functions/_shared/clientAuth.ts`: `verifyClientSecret(stored, provided)`
  - `stored` bắt đầu `$2` ⇒ `bcrypt.compare`
  - còn lại (plaintext legacy) ⇒ so sánh **thời gian hằng**
- Áp dụng cho `sso-token`, `sso-register`, `sso-merge-request` (đã deploy trước khi chạy migration).
- Bên gọi vẫn gửi secret **thô** như cũ ⇒ tích hợp không gãy.

### 1.3 Migration hash

```sql
UPDATE public.oauth_clients
SET client_secret = extensions.crypt(client_secret, extensions.gen_salt('bf', 10)),
    updated_at = now()
WHERE client_secret IS NOT NULL AND client_secret NOT LIKE '$2%';
```

Không log, không audit giá trị secret cũ ở bất kỳ đâu.

### 1.4 Raw trước / sau

TRƯỚC:
```
angel_ai_client   | is_bcrypt: false | pfx: e089 | len: 64
fun_farm_client   | is_bcrypt: true  | pfx: $2a$ | len: 60
fun_planet_client | is_bcrypt: true  | pfx: $2a$ | len: 60
fun_play_client   | is_bcrypt: true  | pfx: $2a$ | len: 60
```

SAU:
```
angel_ai_client   | is_bcrypt: true | pfx: $2a$ | len: 60
fun_farm_client   | is_bcrypt: true | pfx: $2a$ | len: 60
fun_planet_client | is_bcrypt: true | pfx: $2a$ | len: 60
fun_play_client   | is_bcrypt: true | pfx: $2a$ | len: 60
```

### 1.5 Kiểm chứng tương thích bcrypt (pgcrypto ↔ bcryptjs)

Hash pgcrypto `$2a$10$ari1NZ...yYzQG` của chuỗi `fun_probe_secret_123`:
```
bcryptjs compare (đúng)  : true
bcryptjs compare (sai)   : false
```

### 1.6 Rotate secret mới — ĐANG CHỜ CHA

Chưa rotate. Rotate cần bàn giao secret mới cho đội Angel AI qua kênh an toàn
(secret cũ đã hash, không còn đọc lại được). Chờ Cha ra lệnh + chỉ định kênh nhận.

## 2. Redirect localhost trong OAuth production

Đã xoá toàn bộ entry `localhost` / `127.0.0.1` khỏi `oauth_clients.redirect_uris`.

TRƯỚC:
```
fun_farm_client   : farm.fun.rich/auth/callback, http://localhost:3000/auth/callback, funfarm.life/..., onhznjyccagjoefavbaq.lovableproject.com/...
fun_play_client   : play.fun.rich/auth/callback, http://localhost:3001/auth/callback
fun_planet_client : planet.fun.rich/auth/callback, http://localhost:3002/auth/callback
angel_ai_client   : angel.fun.rich/..., angel999.lovable.app/...   (không có localhost)
```

SAU:
```
fun_farm_client   : farm.fun.rich/auth/callback, funfarm.life/auth/callback, onhznjyccagjoefavbaq.lovableproject.com/auth/callback
fun_play_client   : play.fun.rich/auth/callback
fun_planet_client : planet.fun.rich/auth/callback
angel_ai_client   : angel.fun.rich/auth/callback, angel999.lovable.app/auth/callback
```

Verify live `sso-authorize`:
```
redirect_uri=http://localhost:3000/auth/callback  → 400 {"error":"invalid_request","error_description":"redirect_uri not registered"}
redirect_uri=https://farm.fun.rich/auth/callback  → 302 (luồng đăng nhập bình thường)
```

Lưu ý: đăng nhập Google/Apple/Microsoft đi qua lớp auth của Lovable Cloud và dùng
`window.location.origin`, không đọc `oauth_clients` ⇒ không bị ảnh hưởng. Danh sách
URL cho phép của lớp auth không nằm trong quyền công cụ của bé; nếu Cha muốn soát
sạch localhost ở đó thì cần thao tác trong phần cấu hình đăng nhập của Cloud.

## 3. Gác lại

"11 cron mới chưa giải thích" — tạm gác, kiểm kê lại trên hạ tầng mới sau migrate.
