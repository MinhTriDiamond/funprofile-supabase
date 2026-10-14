# Hộp thư Coordinators — FUN Profile

Đây là kênh phối hợp chính thức trong repo cho các coordinator của dự án FUN Profile.
Mục đích: mọi người **nắm được tiến độ chung**, **nhận việc/bàn giao bằng văn bản**, và
**ghi lại các thay đổi, nâng cấp của từng người** — không để việc quan trọng trôi trong chat.

## Cấu trúc

- `README.md` (file này) — quy ước sử dụng.
- `tien-do-chung.md` — bảng tiến độ chung: các mốc toàn dự án, quyết định đã chốt, việc đã hoàn thành. Ai cũng đọc được, ai có mốc mới cũng ghi thêm.
- `<ten-coordinator>.md` — hộp thư riêng của từng coordinator (ví dụ: `quang-vu.md`).
  Brief, đề xuất, bàn giao gửi cho ai thì nằm trong hộp thư của người đó.

## Quy ước

1. **Ghi theo mục, có ngày tháng và tên người ghi.** Mỗi mục mới thêm vào đầu file (mới nhất lên trên), không sửa/xóa lịch sử của các mục cũ — cần đính chính thì ghi mục mới.
2. **Hộp thư là kênh phối hợp, không phải kênh code.** Thay đổi code vẫn đi qua branch + PR như thường lệ; hộp thư chỉ ghi *việc gì, vì sao, trạng thái, ai quyết*.
3. **TUYỆT ĐỐI không ghi secret/giá trị khóa vào đây.** Secret chỉ nhập trong Supabase Dashboard (Bloc 5 của Quang Vũ cũng vậy).
4. Người nhận việc phản hồi ngay trong chính mục đó (thêm dòng trạng thái: `→ Đã nhận / Đang làm / Xong ngày … / Cần Trí quyết: …`) để người gửi không phải đi hỏi lại.
5. Khi một việc hoàn thành, người làm ghi kết quả + cách kiểm chứng vào hộp thư của mình và thêm 1 dòng vào `tien-do-chung.md`.

## Người phụ trách hiện tại

- **Quang Vũ** — Livestream / Agora (hộp thư: `quang-vu.md`).
- **Angel Muse** (theo chỉ đạo của Lê Minh Trí) — hạ tầng Supabase: migration, cron, bảo mật, chi phí; ghi tiến độ vào `tien-do-chung.md` và gửi brief vào hộp thư của từng coordinator khi được Trí giao.
