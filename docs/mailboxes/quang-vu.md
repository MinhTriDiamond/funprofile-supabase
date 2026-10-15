# Hộp thư của Quang Vũ — Livestream / Agora

> Việc mới nhất nằm ở trên cùng. Vũ phản hồi trạng thái ngay dưới mỗi mục nhé.

---

## Mục 1 — 2026-10-15 · Từ Lê Minh Trí (qua Angel Muse)
### Đề xuất: chuyển Livestream từ "quét mỗi phút" sang "sự kiện chủ động" + vòng quét an toàn 5 phút

**Vấn đề (số liệu đo thật trên hệ thống, 15/10/2026):**

- Mảng Livestream có **19 cron jobs**, chạy tổng cộng **17.844 lượt/ngày = 71,5% tổng lượt chạy của toàn hệ thống**; trong đó **11 job chạy mỗi phút**.
- Nhu cầu thật 30 ngày qua: **205 phiên webcam (~7 phiên/ngày)** và chỉ **9 phiên RTMP/OBS** → **hơn 99% lượt quét là "chạy không"** (không có phiên nào để xử lý).
- Log Ingestion của toàn project đang ở **45% hạn mức 20 GB** và Supabase sắp bắt đầu tính tiền riêng cho mục này — mảng Livestream là nguồn sinh log lớn nhất cần xử lý.

**Phương án đề xuất (không chỉ giảm log — còn nâng cấp trải nghiệm):**

1. **Chuyển sang event-driven cho 3 nhóm việc:**
   - Nhóm chờ file ghi hình (poll-status, mp4-poll, readiness, ghép replay…): dùng **webhook sự kiện của Agora Cloud Recording** — file sẵn sàng là Agora gọi về ngay, hàm chỉ thức dậy khi có tin thật.
   - Nhóm bắt đầu/kết thúc phiên: **app gọi thẳng hàm chốt phiên** khi host bấm kết thúc (app là nơi biết sớm nhất).
   - Nhóm thay đổi trạng thái nội bộ: dùng **DB trigger / outbox** (mẫu hình hệ thống đã có sẵn) để hàm xử lý chạy ngay theo sự kiện.
2. **Giữ đúng 1 vòng quét an toàn hợp nhất, mỗi 5 phút** (288 lượt/ngày thay cho ~15.800 lượt của dàn mỗi phút), với điều kiện vòng quét này **chạy trọn chuỗi xử lý** cho mọi mục còn pending — đây là lưới an toàn cho trường hợp app của người dùng sập giữa chừng không kịp báo tin (loại sự kiện không bao giờ tự báo được).
3. **Luật cứng dọn "mồ côi":** bất kỳ phiên/replay nào dở dang quá **24–48 giờ** đều bị ép về trạng thái kết thúc và ghi log lý do. Lý do: hiện có khoảng **40 phiên + 40 replay đang kẹt ở trạng thái dở dang từ 3.600–4.000 giờ (~5 tháng)** mà dàn quét hiện tại cũng không dọn được — chúng rơi vào kẽ hở máy trạng thái, không job nào "sở hữu". Đổi sang event-driven cũng không tự hết nếu thiếu luật này.
4. **Bảo mật webhook (bắt buộc):** endpoint webhook của Agora là cửa công khai → phải **xác thực chữ ký/secret của Agora** (sẽ thêm 1 secret vào nhóm Bloc 5 của Vũ), khóa endpoint như các hàm đã vá ngày 14/10. Webhook có thể gửi trùng/lệch thứ tự → xử lý theo **idempotency**; các hàm hiện tại vốn đọc trạng thái thật từ database mỗi lần chạy nên tái sử dụng làm hàm xử lý sự kiện là an toàn, và vì chúng nhận tham số `limit` nên giờ cao điểm vẫn xử lý theo lô được, phần tràn để vòng quét vét.

**Đã kiểm chứng từ code gốc (Angel Muse đọc trực tiếp trên GitHub, 15/10/2026):**

Điểm từng bị bỏ ngỏ — "hai watchdog nhạy thời gian phán quyết theo mốc thời gian hay đếm lượt quét?" — nay đã khẳng định chắc chắn:

- `live-rtmp-grace-watchdog`: **mọi nhánh đều phán quyết theo mốc thời gian** — `last_disconnected_at` quá hạn ân hạn; `last_source_seen_at` quá 2× ân hạn; `started_at` quá trần 4 giờ / quá ngưỡng stale-null 30 phút — cộng thêm **re-verify bằng Cloudflare API ngay trước khi kết thúc phiên** (soft-fail thì bỏ qua, chờ nhịp sau). **Không tồn tại bộ đếm lượt quét nào.**
- `live-duration-watchdog`: tương tự — phán quyết bằng `started_at` + trần thời lượng và `last_host_heartbeat_at`, hoàn toàn theo mốc thời gian.
- **Kết luận:** gộp hai watchdog (và cả dàn Live) về vòng quét 5 phút **chỉ làm tăng độ trễ phát hiện tối đa 5 phút, không thay đổi ngữ nghĩa, không kết thúc nhầm phiên**. Riêng trần thời lượng: phiên vượt trần có thể ghi hình Agora thêm tối đa ~5 phút — chi phí không đáng kể.
- Một lưu ý nhỏ nhờ Vũ xác nhận: trong `live-duration-watchdog`, comment ghi ngưỡng mất heartbeat là "8 phút (16 nhịp 30s)" nhưng code thực tế đang dùng `threshold_seconds = 60`. Đây là chủ đích hay lệch giữa tài liệu và code? (Với nhịp quét 5 phút, phiên mất heartbeat bị đóng trễ tối đa ~5 phút, và xác suất đóng nhầm khi host chỉ đơ/tab đóng thoáng qua còn *giảm* đi so với nhịp 1 phút.)

**Lợi ích kỳ vọng:**

- Lượt chạy mảng Livestream giảm từ **17.844 → dưới ~1.500 lượt/ngày (giảm >90%)**; log toàn project giảm tương ứng, tạo dư địa lớn trước khi Log Ingestion bị tính tiền.
- **Replay xuất hiện sau vài giây** (webhook báo ngay) thay vì chờ tới lượt quét kế tiếp (tối đa 60 giây) — trải nghiệm người dùng tốt hơn hiện tại.
- Sạch hẳn tồn đọng "mồ côi" ~5 tháng.
- Mọi thay đổi đều **quay lui được trong vài giây** bằng cách bật lại cron cũ.

**Lộ trình an toàn 3 giai đoạn:**

1. Gắn webhook chạy **song song** với dàn quét hiện tại vài ngày để đo đối chứng.
2. Rút dàn mỗi phút về **vòng quét hợp nhất 5 phút**.
3. Ổn định rồi mới gỡ hẳn các job thừa.

**Ranh giới phối hợp:** mảng Livestream do Vũ phụ trách (đang làm Agora) — đây là đề xuất của Trí, **Vũ quyết định nhịp và thời điểm** theo tiến độ của mình. Angel Muse sẵn sàng hỗ trợ đo lường/kiểm chứng từng giai đoạn khi Vũ cần.

→ Trạng thái: **Chờ Vũ phản hồi.**


## Thư #2 — 15/10/2026 (Angel Muse, thay lời cảm ơn của Trí)
Trí vừa báo tin vui: bé Vũ đã làm xong phần Livestream rồi. Cảm ơn Vũ thật nhiều — phần việc khó và nặng nhất đã qua. Angel Muse cũng chia sẻ thêm để Vũ yên tâm: phần vá bảo mật cho hai view lịch sử giao dịch hợp nhất — vốn được xếp hàng chờ phía sau phần Livestream của Vũ — nay đã hoàn thành trong ngày, không ảnh hưởng gì tới phần Vũ vừa làm. Đề xuất kiến trúc sự kiện hoá ở Thư #1 vẫn giữ nguyên giá trị cho chặng tối ưu log tiếp theo khi Vũ thấy phù hợp. Chúc Vũ nhiều sức khoẻ và niềm vui!
