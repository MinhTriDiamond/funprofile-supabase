# QUY TRÌNH LÀM VIỆC — COORDINATORS FUN PROFILE

**Quy trình phối hợp cao nhất của đội Coordinator FUN Profile.** Mọi Coordinator và Angel Muse của mỗi bạn — kể cả anh Trí và Angel Muse điều phối — đều đọc và làm theo quy trình này khi làm việc trên repo và các nền tảng của dự án.

Nhà production hiện tại:

Lovable: **FUN Profile Supabase**

Repo: **funprofile-supabase**

Supabase: **tljfqavndndfsvtazibe**

Cloudflare Pages: **funprofile-supabase** (fun.rich)

FUN Profile hiện vận hành **độc lập hoàn toàn với Lovable**: merge vào `main` là Cloudflare Pages tự build và deploy lên fun.rich — **không còn bước Publish trên Lovable**.

---

## Quy trình 7 bước — không bỏ bước nào

**Bước 1 · Thông báo vào nhóm Coordinator trên Telegram**
Trước khi bắt đầu bất cứ việc gì, nhắn một tin vào nhóm Coordinator trên Telegram để thông báo cho các Coordinator khác biết mình sẽ làm.
Nội dung ngắn gọn: **tên mình · việc sắp làm · phạm vi chính · tên nhánh sẽ tạo**.
Đây là tín hiệu nhanh nhất để cả đội tránh làm trùng — thấy tin là biết khu vực đó đã có người.
**Với Angel Muse:** nhắc bạn của bạn gửi tin nhắn này, soạn sẵn nội dung cho bạn ấy copy — và **chỉ bắt đầu các bước tiếp theo sau khi bạn ấy xác nhận đã gửi xong**. Không chạy trước.

**Bước 2 · Ghi nhận TRƯỚC khi làm (hộp thư)**
Trước khi code, ghi một thư vào hộp thư điều phối (`docs/mailboxes/` trong repo funprofile-supabase): vào Bảng tiến độ chung nếu là việc chung, vào hộp thư của bạn liên quan nếu cần bạn đó biết.
Nội dung tối thiểu: **ngày · tên người làm · việc gì · phạm vi (tệp/hệ thống sẽ đụng) · tên nhánh sẽ tạo**.
Việc chưa ghi nhận = chưa làm. Đây là cách cả đội biết ai đang làm gì, không chồng chéo.

**Bước 3 · Tạo nhánh**
Mọi thay đổi đều trên nhánh riêng, tách từ `main` mới nhất. Không ai commit thẳng lên `main` — đội tự kỷ luật theo quy trình này dù GitHub không còn chặn kỹ thuật.
Đặt tên: `feat/<ten>-<viec>` (tính năng) · `fix/<ten>-<viec>` (sửa lỗi) · `docs/<ten>-<viec>` (tài liệu/hồ sơ).
Một việc — một nhánh — một người phụ trách. Không sửa chéo lên nhánh của nhau.

**Bước 4 · Làm việc trong phạm vi đã ghi nhận**
Chỉ làm những gì đã ghi ở Bước 2. Việc phình ra ngoài phạm vi → dừng lại, ghi thêm một thư cập nhật rồi mới đi tiếp.

**Bước 5 · Cổng Preview — chốt chặn trước merge**
Nhánh xong **không merge ngay**. Bắt buộc xem bản chạy thật của nhánh, **ưu tiên Cách A**:

- **Cách A (ưu tiên) — Link preview Cloudflare Pages của nhánh:** mỗi lần đẩy nhánh lên, Cloudflare Pages tự build một bản preview kèm link riêng cho nhánh đó. Angel Muse chỉ cần lấy đúng link preview mới nhất của nhánh và gửi cho bạn đang chat cùng xem thử — Muse không cần tự dựng preview. Nhanh, không cần nhảy qua Lovable.

- **Với Angel Muse:** khi tới cổng Preview, Muse chỉ cần lấy **link preview mà Cloudflare Pages đã build cho nhánh** và **gửi link đó** cho bạn của mình xem thử — đạt thì **chính Muse merge luôn**, không cần chờ ai duyệt — không cần tự dựng preview, không cần xin duyệt mở link.
- **Nơi lấy link preview:** Cloudflare → Pages → project funprofile-supabase → mục Deployments — mỗi lần dựng có một link riêng dạng `https://<mã>.funprofile-supabase.pages.dev`, lấy link mới nhất của đúng nhánh đó (đừng đoán link theo tên nhánh, sẽ không mở được).
- **Cách B — chờ bản dựng Cloudflare:** nếu vừa đẩy nhánh mà chưa thấy link preview, chờ ít phút để Cloudflare Pages build xong rồi lấy link mới nhất của nhánh.
Mời thêm các bạn khác test nếu cần.

**Bước 6 · Merge và ghi nhận SAU khi làm**
- Tạo PR
- Merge PR sau khi cổng preview đã thông. Người merge chịu trách nhiệm lần merge đó; merge xong xóa nhánh. Vừa merge vào `main` là Cloudflare Pages tự build và deploy bản mới lên fun.rich — không cần Publish ở đâu nữa.
- Ghi thư **kết quả** vào hộp thư (cùng nơi đã ghi ở Bước 2): **đã làm gì · link PR · đã merge chưa · kết quả kiểm chứng**. Việc chưa có thư kết quả = chưa xong.
- Nếu có thay đổi production (SQL, cron, Edge Function, DNS): kèm hồ sơ trong `docs/<chu-de>-<ngay>/` — đã chạy gì, kiểm chứng ra sao, cách khôi phục — và ghi rõ thay đổi nằm ở đâu (database production / repo / dashboard).

**Bước 7 · Thông báo hoàn tất vào nhóm Telegram**
Sau khi Bước 6 hoàn tất, Angel Muse soạn sẵn một tin nhắn hoàn tất để Coordinator copy gửi vào nhóm Coordinator trên Telegram, thông báo cho các bạn biết việc đã xong.
Nội dung tối thiểu: **việc gì đã hoàn tất · kết quả (PR đã merge, đã lên fun.rich…) · link PR nếu có**.

---

## 5 luật an toàn

1. **Không vào thẳng `main`** — mọi thứ qua nhánh + PR + cổng preview.
2. **Secret không qua chat, không vào repo, không vào hộp thư** — API key, mật khẩu, token chỉ nhập trực tiếp tại dashboard nền tảng.
3. **Thay đổi production phải có hồ sơ + cách khôi phục** - phải tạo file backup trước khi xóa dữ liệu.
4. **Một người sửa tại một thời điểm** - ai làm thì nhắn vào nhóm Coordinator để thông báo.
5. **Việc nhạy cảm** - Liên quan đến backend cần thận trọng.

## Khi có sự cố

Dừng thay đổi trên hệ liên quan → báo ngay vào hộp thư chung (chuyện gì, lúc nào) → khôi phục bằng PR revert về trạng thái tốt gần nhất (không force-push) → kiểm chứng lại → ghi một thư rút kinh nghiệm. Sửa quy trình, không đổ lỗi cá nhân.

---

*Ngắn gọn để nhớ: **Báo Telegram — Ghi nhận hộp thư — Làm trên nhánh — Qua cổng preview — Merge — Ghi nhận sau — Báo hoàn tất.** Bảy bước này là toàn bộ bí quyết để các Coordinator cùng cộng tác an toàn, nhịp nhàng, hiệu quả.*
