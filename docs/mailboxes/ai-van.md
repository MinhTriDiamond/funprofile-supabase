# Hộp thư điều phối - Angel Ái Vân

Hộp thư của Angel Ái Vân (FUN Profile username: angelaivan) trong đội Coordinator FUN Profile. Mọi bàn giao, tiến độ và hồi âm của dự án bạn phụ trách được ghi tại đây theo quy trình trong docs/quy-trinh-lam-viec-coordinator.md. Tuyệt đối không ghi bí mật (token, mật khẩu) vào hộp thư này.

## Mục 1 - 2026-10-22 - Bàn giao dự án: Luồng xác thực giao dịch tặng quà (vá gốc bảo mật)

Viết bởi Angel Muse của bé Minh Trí, chuyển lời của bé Trí tới bạn Ái Vân và Angel Muse của bạn.

**Lời của bé Trí:** Trí bàn giao dự án này cho bạn Ái Vân phụ trách thực hiện cùng Angel Muse của bạn. Bước 1 của quy trình (thông báo vào nhóm Telegram Coordinator) Trí đã gửi xong ngày 22/10/2026. Từ đây, bạn là người phụ trách chính của dự án; Angel Muse của Trí giữ vai trò hỗ trợ và kiểm chứng khi bạn cần.

**Bối cảnh:** Sáng 22/10/2026, một nhóm tài khoản lạ đã lợi dụng lỗ hổng ở bảng donations (client tự khai mọi trường, kể cả trạng thái confirmed và amount_usd) để chèn 40 giao dịch tặng quà giả, làm Honor Board hiển thị vượt thực tế khoảng 999.075 USD. Phần khẩn cấp đã xử lý xong trong ngày: dữ liệu giả đã cô lập và gỡ bỏ, 15 tài khoản liên quan đã bị khóa, vá nóng bằng trigger guard đã áp dụng cho các bảng tài chính client ghi được, watchlist giám sát đã chạy hằng giờ, và một vòng audit toàn bộ bảng client ghi được đã hoàn tất. Hồ sơ đầy đủ nằm trong thư mục docs/security-incident-2026-10-22/ của repo này (README + các file SQL 01-09).

**Phần việc bàn giao - vá gốc theo đúng thiết kế đã ghi trong hồ sơ sự cố:**

1. Phía database: mở rộng guard để client không còn tự đặt trạng thái confirmed và không tự khai amount_usd; giao dịch do client tạo ra bắt đầu ở trạng thái chưa xác thực.
2. Phía edge functions quét (fast-scan, auto-scan): đối chiếu tx_hash và địa chỉ ví trên chuỗi; khi khớp, phía server mới chuyển giao dịch sang confirmed và tự tính amount_usd; quá thời hạn mà không khớp thì chuyển rejected và gắn cờ integrity.
3. Phía frontend: hiển thị nhãn trạng thái "đang xác thực" cho giao dịch đang chờ; các bảng xếp hạng và thống kê chỉ tính giao dịch đã confirmed.

**Cách làm an toàn bắt buộc:**

- Chạy giai đoạn shadow 1 tuần trước: hệ thống mới chỉ ghi nhận và đối chiếu thử, không chặn và không đổi trạng thái thật; chỉ enforce sau khi shadow cho kết quả sạch.
- Mọi guard mới phải kiểm chứng ngược với traffic thật ít nhất 30 ngày và đạt 0 false positive trước khi áp dụng, như cách vòng vá nóng ngày 22/10 đã làm.
- Mọi thay đổi trên database production phải ghi rõ thay đổi nằm ở đâu (production DB hay repo + commit), có sao lưu trước và có đường lui; không xóa dữ liệu khi chưa có bản sao.
- Không dùng token hay tài khoản của người khác; mỗi người làm bằng tài khoản và token của chính mình.

**Quy trình:** làm đủ 7 bước trong docs/quy-trinh-lam-viec-coordinator.md. Nhánh làm việc: feat/tri-donation-verification-flow (tên đã thông báo với nhóm ở bước 1). Ghi tiến độ vào hộp thư này và cập nhật bảng docs/mailboxes/tien-do-chung.md. Preview phải có trước khi mở PR và phải kiểm bằng dữ liệu thật hiển thị được, không chỉ kiểm tra code.

**Điều kiện bắt đầu:** bạn xác nhận đã kết nối được Supabase project tljfqavndndfsvtazibe bằng token của chính bạn (theo tin hướng dẫn Trí đã gửi ngày 21/10/2026) và test đọc OK. Nếu còn thiếu quyền ở đâu (ví dụ Cloudflare để xem preview, hay quyền ghi cần thiết cho dự án), cứ ghi rõ vào hộp thư này, Trí sẽ cấp thêm; đừng để việc đứng yên mà không ghi lại.

Đội ơn bạn đã nhận phần việc quan trọng này cho nhà mình. Có điều gì chưa rõ, bạn và Angel Muse của bạn cứ ghi vào hộp thư này, Angel Muse của Trí sẽ hồi âm tại đây.

- Angel Muse của bé Minh Trí, 2026-10-22
