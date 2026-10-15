# Đặc tả: Đồng bộ Agora production và webhook Cloud Recording

**Ngày:** 2026-10-15
**Project Supabase production:** `tljfqavndndfsvtazibe`
**Trạng thái:** Chờ Cha rà soát đặc tả; chưa thực hiện thay đổi production.

## Bối cảnh đã xác minh

- Production đang dùng bộ Agora App ID/Certificate và Customer ID/Secret lưu trong Supabase Secrets.
- Hai project đang thấy trong Agora Console (`Default Project` và `fun`) có App ID khác với `AGORA_APP_ID` production.
- `AGORA_CLOUD_RECORDING_WEBHOOK_SECRET` chưa có trong production; function `agora-cloud-recording-webhook` chưa deploy.
- Mã webhook mới đang có trong workspace nhưng chưa deploy. Callback có chữ ký hợp lệ nhưng không ghép được với session hiện có hiện trả 503; Agora health check yêu cầu phản hồi thành công nhanh.
- Workspace đang có thay đổi livestream chưa commit và nhánh local đang chậm hơn `origin/main` 14 commit. Những thay đổi đó phải được giữ nguyên và đối chiếu trước khi triển khai.

Các kết luận trên dựa trên workspace/CLI và màn hình Agora đã kiểm tra; không suy ra giá trị secret hay nội dung log production.

## Mục tiêu

1. Thiết lập cấu hình Agora rõ ràng, đúng mục đích cho production RTC/Cloud Recording và REST API.
2. Nhận callback Cloud Recording có xác thực chữ ký, chống xử lý lặp, không để callback hợp lệ nhưng chưa liên kết session làm Agora health check thất bại.
3. Triển khai an toàn, xác minh bằng health check và một phiên recording thử nghiệm; giữ khả năng quay lại cấu hình cũ cho tới khi xác nhận thành công.

## Ngoài phạm vi

- Không đổi cron cadence, chạy Stage B, dọn/xóa dữ liệu hoặc Cloudflare inputs.
- Không thu hồi credential cũ trong cùng đợt triển khai.
- Không thay đổi schema ngoài migration idempotency webhook đã có trong workspace, sau khi xác minh nội dung và trạng thái production.
- Không đưa App ID, Certificate, Customer Secret, webhook Signing Secret, token hay URL có chữ ký vào source control, log hoặc chat.

## Phân biệt credential

| Secret trong Supabase | Công dụng | Nguồn cấu hình |
|---|---|---|
| `AGORA_APP_ID` | Nhận diện ứng dụng RTC và Cloud Recording | Project Agora production đã chọn |
| `AGORA_APP_CERTIFICATE` | Ký token RTC nếu bật App Certificate | Cùng project với App ID; bật primary certificate |
| `AGORA_CUSTOMER_ID` | HTTP Basic auth cho Agora REST API | Credential REST cấp account |
| `AGORA_CUSTOMER_SECRET` | HTTP Basic auth cho Agora REST API | Cùng cặp với Customer ID |
| `AGORA_CLOUD_RECORDING_WEBHOOK_SECRET` | Xác minh chữ ký callback | Signing Secret riêng do cấu hình webhook tạo/cấp |

Không dùng lẫn Customer Secret với App Certificate hoặc Webhook Signing Secret. Thay cặp Customer ID/Secret có thể ảnh hưởng mọi tích hợp Agora REST dùng chung cặp đó; cần xác định phạm vi sử dụng trước khi thay production.

## Thiết kế và rollout

### 1. Chốt đích Agora

Trong Agora Console đã đăng nhập, xác định/khởi tạo project dành cho production và chế độ xác thực phù hợp với code hiện tại. Ghi nhận App ID và certificate chỉ trực tiếp vào nơi nhập secret được bảo vệ; không chụp/đưa giá trị lên chat. Xác minh project này có cấu hình Cloud Recording cần thiết. Cặp Customer ID/Secret mới chỉ tạo nếu đã kiểm tra tác động tới tích hợp REST dùng chung.

### 2. Sửa và kiểm tra webhook trước health check

- Xác minh HMAC/signature, timestamp/replay protections và payload schema theo giao thức Agora đang dùng.
- Callback hợp lệ, xử lý được nhưng chưa tìm thấy session: ghi receipt idempotent, đánh dấu unmatched/pending để đối soát rồi trả HTTP 200 JSON trong giới hạn 10 giây; không tạo session/post giả.
- Lỗi DB hoặc lỗi ghi receipt: trả lỗi retriable để Agora có thể gửi lại; receipt và việc xử lý phải idempotent.
- Event `session_exit` (11) và `uploaded` (31) chỉ là tín hiệu đánh thức xử lý. Event `uploaded` không được xem là bằng chứng URL media công khai phát được; giữ bước xác minh media trước khi công bố replay.
- Chỉ log event ID, correlation/session ID đã lọc, outcome và thời lượng; không log body đầy đủ, chữ ký hay credential.

### 3. Cấu hình webhook và secret

Tạo webhook trên đúng project Agora, trỏ tới URL Edge Function production `agora-cloud-recording-webhook`; chỉ đăng ký event cần thiết trước mắt (11 và 31). Lưu Signing Secret vào Supabase production dưới tên `AGORA_CLOUD_RECORDING_WEBHOOK_SECRET`. Không gửi secret qua chat/commit. Chạy health check tổng hợp của Agora và xác nhận response 2xx.

### 4. Phát hành có kiểm soát

- Reconcile branch với `origin/main` trước khi đóng gói; bảo toàn mọi thay đổi hiện hữu và không force-push/reset.
- Chạy test liên quan, typecheck khả dụng, kiểm tra diff; review migration idempotency và xác minh trạng thái migration trước khi áp dụng.
- Deploy webhook và chỉ migration cần thiết cho receipt idempotency. Không deploy các cron cadence migration trong đợt này.
- Thay App ID/Certificate và Customer ID/Secret chỉ sau khi dependency audit xác định chính xác project/cặp nào được dùng. Không thu hồi bộ cũ ngay; xác minh RTC token, Cloud Recording REST call và một phiên ghi hình thử trước.

## Tiêu chí chấp nhận

1. Health check Agora nhận 2xx JSON trong 10 giây.
2. Chữ ký sai bị từ chối; không làm lộ payload/secret trong response hoặc log.
3. Callback hợp lệ nhưng unmatched được ghi nhận đúng một lần và phản hồi thành công; có thể đối soát sau khi session xuất hiện.
4. Lỗi DB được retry an toàn; gửi lặp event không tạo receipt/post/replay trùng.
5. Một recording test đi qua `session_exit` và `uploaded`; replay chỉ được công bố sau khi kiểm tra media thành công.
6. App ID/certificate và Customer credential được kiểm tra riêng theo đúng luồng sử dụng; old credentials chưa bị thu hồi trước khi có xác nhận.

## Rủi ro và quay lui

- Thay App ID/Certificate sai project có thể làm token RTC hoặc Cloud Recording thất bại. Giữ bộ cũ được ghi nhận trong secret manager và chỉ chuyển sau khi có kế hoạch quay lại; không chép secret vào tài liệu.
- Xoay Customer ID/Secret cấp account có thể ảnh hưởng tích hợp REST khác. Nếu chưa biết phạm vi, chỉ cấu hình webhook secret và dùng bộ REST hiện tại trong giai đoạn xác minh.
- Nếu health check hoặc E2E thất bại: tắt webhook mới hoặc khôi phục endpoint/config cũ; giữ cron/recovery hiện có, không xóa receipt hay recording. Khôi phục cặp secret trước đó từ secret manager, không từ git/chat.
- Việc rollback migration chỉ thực hiện theo migration rollback đã review; không xóa bảng/receipt có dữ liệu.

## Giới hạn hiện tại

Chưa xác minh được từ Agora Console production nào tương ứng với App ID production hiện tại; cũng chưa kiểm kê đầy đủ mọi nơi đang sử dụng Customer ID/Secret. Vì vậy chưa đủ bằng chứng để thay credentials production. Đặc tả này cho phép chuẩn bị và kiểm chứng, nhưng bước xoay App ID/certificate/Customer credentials phụ thuộc vào đối chiếu project và dependency audit.
