# SSO hardening — 2026-10-15 (đợt vá trước khi mở SSO cho LoveHUB)

Nguồn: audit read-only cụm sso-* (kèm kiểm chứng DB đích) trước khi xây cầu Chung Một Nhà FUN-ID.
Cả 6 function đã deploy lên project đích qua Management API (đều lên version 70, ACTIVE) và kiểm chứng hành vi trên hệ thật.

## Đã vá
- **C1 — sso-verify tôn trọng revocation:** nhánh JWT nay bắt buộc khớp một dòng đang sống trong `cross_platform_tokens` theo đúng access_token được trình (kèm client_id khi token có claim đó) và `is_revoked=false`; không khớp → 401. Trước đây JWT đã thu hồi vẫn verify tới khi hết hạn.
- **C2 — JWT gắn client:** `_shared/jwt.ts` thêm claim `client_id` + `aud` khi cấp token (sso-token/sso-refresh/sso-register đều truyền client_id). sso-verify lấy client binding từ chính dòng token đó — hết cảnh lọc `platform_user_data` theo "dòng token mới nhất của user" (rò chéo platform).
- **C3 — client_secret bắt buộc ở sso-token:** client có secret thì PHẢI gửi secret đúng, kể cả khi có code_verifier (trước đây verifier thay thế được secret → code rò là đổi được token). PKCE vẫn kiểm khi code có challenge.
- **C4 — sso-register:** (a) scope lọc theo `allowed_scopes` của client, rỗng → 400 invalid_scope, kiểm TRƯỚC khi tạo user; (b) email đã tồn tại → 409 `user_exists`, KHÔNG cấp token nữa (trước đây chỉ cần secret của bất kỳ client active nào + email là lấy được token của tài khoản có sẵn); user có sẵn đi luồng authorize để tự chứng minh sở hữu; (c) bỏ tự động set `law_of_light_accepted=true` — việc chấp nhận Luật Ánh Sáng phải là hành động của chính user.
- **T1 — clientAuth bcrypt-only:** gỡ fallback plaintext; client không có secret trong DB → xác thực thất bại (trước trả true). Đã kiểm chứng DB: cả 4 client hiện tại đều bcrypt ($2/60 ký tự) nên không luồng thật nào gãy.
- **T2 — dùng code nguyên tử:** sso-token claim code bằng update kèm điều kiện `is_used=false` + kiểm số dòng — hai request song song cùng code không cùng lọt.
- **T3 — cấm PKCE plain:** sso-authorize từ chối code_challenge_method khác S256; sso-token verifyPKCE chỉ còn S256; gỡ hàm "simplified" trả true vô điều kiện ở authorize.
- **T6 — sso-refresh yêu cầu client_secret** với client confidential (SDK chính thức luôn gửi); **sso-revoke** trả thông điệp thống nhất, không lộ token có tồn tại hay không.
- **Th1/Th2/Th3:** sso-token chỉ trả email khi scope có `email`; sso-authorize trả 400 invalid_scope thay vì cấp code với scope rỗng; fallback origin đăng nhập đổi sang https://fun.rich (kiểm chứng thêm: env FUN_PROFILE_ORIGIN trên production vốn đã là fun.rich).

## Kiểm chứng trên hệ thật (sau deploy)
9 kiểm tra âm tính đều đúng kỳ vọng: sso-token thiếu secret → 401 "client_secret is required"; secret sai → 401; sso-refresh thiếu secret → 401; sso-verify không header/token rác → 401; sso-register secret sai → 401; authorize PKCE plain → 400; authorize S256 chưa đăng nhập → 302 về https://fun.rich/auth; revoke token không tồn tại → 200 thông điệp thống nhất.
Đường dương (đăng nhập thật xuyên platform) cần một lượt đăng nhập thật của platform để xác nhận cuối — tại thời điểm vá, 0 access token đang sống và 6 phiên còn refresh được trong DB; các phiên đó sẽ đi qua luồng refresh mới (SDK luôn gửi secret) ở lần làm mới kế tiếp.

## Chưa làm trong đợt này (theo thứ tự cứng hóa tiếp theo)
- C5: lưu hash cho refresh/access token trong cross_platform_tokens (đợt riêng, kèm chuyển đổi dữ liệu).
- T4: tách khóa ký SSO riêng / RS256 + JWKS (platform tự verify, hết phụ thuộc sso-verify + hết rủi ro rotate service key).
- T7: rate limit cho sso-verify ở tầng gateway.
- Bắt buộc PKCE ngay tại authorize (hiện enforce đầy đủ ở token endpoint: secret bắt buộc + verifier bắt buộc khi có challenge — chặn được đường khai thác mà không gãy client cũ).

Mã nguồn: các commit "SSO hardening 2026-10-15" trên main (8 file: _shared/jwt.ts, _shared/clientAuth.ts, sso-authorize, sso-token, sso-verify, sso-refresh, sso-register, sso-revoke).

## Bổ sung cùng ngày (sau kiểm chứng authorize của lovehub_client)
- Đăng ký `lovehub_client` trong oauth_clients (redirect https://lovehub.fun/auth/callback; scopes profile/email/wallet/rewards/platform_data) với client_secret RỖNG có chủ đích. Kiểm chứng cho thấy khi đó sso-token/sso-refresh bỏ qua bước kiểm secret (vì điều kiện cũ chỉ kiểm khi client có secret) → đã siết thành kiểm VÔ ĐIỀU KIỆN: verifyClientSecret với secret lưu rỗng luôn thất bại, client chưa được cấp secret thật thì fail-closed 401 ở cả token và refresh (deploy v71, kiểm chứng sống đạt). Secret thật (bcrypt) sẽ được đặt vào ngày nối cùng Trí.
- SDK @fun-ecosystem/sso-sdk lên 1.1.1: API_BASE_URL chuyển từ project tiền-migration (bhtsnervqiwchluwuxki) về project đích fun.rich (tljfqavndndfsvtazibe) ở cả hai nơi lưu mã nguồn (sdk-package/ trong repo này + repo sso-sdk riêng); constants + package.json đã read-back kiểm chứng.
