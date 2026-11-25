# Sửa tải video tối ưu bị ngắt — 25/11/2026

## Bằng chứng và phạm vi

Chrome native download video public 110.324.802 byte bị hủy giữa chừng ở cả anchor cùng tab và tab mới. Fetch trực tiếp tải đủ; tải native tệp nhỏ hoạt động. Worker tail được lọc theo Referer của phiên chẩn đoán xác nhận GET download có outcome `exceededCpu`. Hồ sơ riêng chỉ giữ trạng thái, số byte và loại lỗi, không lưu cookie/permit.

Gateway đang chuyển từng chunk R2 qua callback JavaScript đếm byte rồi mới qua FixedLengthStream. Bản sửa nối trực tiếp R2 vào FixedLengthStream native trên Workers; native vẫn kiểm tra đủ/thiếu/thừa byte và Content-Length. Fallback đếm byte chỉ dùng trên runtime không có FixedLengthStream.

Không đổi quyền truy cập, permit 5 phút, xác minh quyền mỗi request, Range, bucket private, cron hay chính sách giữ nguồn 24 giờ. Không thay đổi gói/CPU limit.

## Kiểm chứng trước triển khai

- Regression test thất bại trước sửa (1 JS transform), đạt sau sửa (0).
- Vitest offline: 105 file đạt, 708 test đạt, 53 bỏ qua; không chạy live test tài chính.
- Typecheck tsgo, app build và Worker dry-run đạt.
- workerd thật: GET/206 có Content-Length và body đúng; body thiếu/thừa bị từ chối.

## Triển khai và khôi phục

Worker: `funprofile-post-video-media`; config `workers/post-video-media/wrangler.jsonc`. Triển khai sau cổng Preview và merge PR. Giữ nguyên binding/secrets/routes/cron.

Phiên bản trước sửa: `cac49a22-2349-4918-bf95-22888eb8f02b`; source nằm ở main `ebf1b57`. Khôi phục gateway nếu cần bằng `bunx wrangler rollback cac49a22-2349-4918-bf95-22888eb8f02b --config workers/post-video-media/wrangler.jsonc`, sau đó kiểm quyền và tải lại. Không thay đổi dữ liệu video.

Kết quả production sẽ bổ sung sau kiểm chứng native download đủ tệp.
