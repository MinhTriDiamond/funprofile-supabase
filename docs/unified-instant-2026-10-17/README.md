# Lịch sử giao dịch TỨC THÌ cho giao dịch tặng tiền — 2026-10-17

**Người phụ trách:** Lê Minh Trí (cùng Angel Muse) · **Nơi áp dụng:** production DB `tljfqavndndfsvtazibe` (áp trực tiếp) · **Hồ sơ repo:** thư mục này trên `funprofile-supabase`.

## Vấn đề

Trang lịch sử giao dịch đọc từ bảng bản chụp `unified_transactions_snapshot`, được job 89 làm mới mỗi 5 phút (cơ chế dựng ngày 2026-10-15 để trang tải nhanh ~0,7 giây thay vì timeout 7,6 giây). Hệ quả: giao dịch tặng tiền giữa người dùng phải chờ tối đa ~5–6 phút mới hiện phía người nhận. Trường hợp ghi nhận: user `angeldieungoc` tặng lúc 07:54 ngày 17/10, người nhận chưa thấy cho tới lượt làm mới 08:00 — trong khi database đã ghi nhận giao dịch trong 1 giây.

## Giải pháp đã áp dụng (phương án "ghi ngay khi phát sinh" cho riêng luồng donations)

1. **Hàm `append_donation_to_snapshot(uuid)`** — chiếu MỘT donation thành các dòng lịch sử hợp nhất và chèn thẳng vào bản chụp, sao chép nguyên vẹn logic của view:
   - Hai nhánh `don_out` / `don_in` của `v_unified_transactions` (mọi biểu thức cột giống hệt view).
   - Ba bộ lọc của view bọc `v_unified_transactions_primary`: loại spam (`filter_status = filtered_spam`), bộ lọc nạp token (token_ingest_filters, bsc/btc), ví bị blacklist.
   - Thi đấu khử trùng theo đúng khóa phân vùng của view (user + khóa giao dịch + chiều): dòng donation thắng các nguồn khác (ưu tiên 1) → xóa dòng cạnh tranh cũ trong bản chụp; thua một donation khác mới hơn trong cùng phân vùng → không chèn.
   - Chống chèn trùng theo `id` (an toàn khi gọi lại).
2. **Trigger `trg_donations_snapshot_append`** (AFTER INSERT trên `donations`) gọi hàm trên qua một hàm bọc có `EXCEPTION` guard: bất kỳ lỗi nào ở bước ghi lịch sử cũng chỉ sinh cảnh báo, **giao dịch tặng không bao giờ bị chặn hay thất bại vì cơ chế này**.
3. **Giữ nguyên job 89** (làm mới toàn bộ mỗi 5 phút) làm lưới an toàn đối soát: giao dịch on-chain, thay đổi trạng thái, khử trùng toàn cục — và tự vá mọi lệch lạc của đường ghi tức thì trong tối đa 5 phút.

File SQL: `sql/01-create-functions-trigger.sql`. Định nghĩa gốc (view + hàm làm mới) đã sao lưu trước khi làm (đường khôi phục: chỉ cần DROP trigger + 2 hàm là trở về trạng thái cũ, không đụng dữ liệu).

## Vì sao không gọi thẳng view trong trigger

Đo thực tế: truy vấn `v_unified_transactions_primary` cho MỘT donation tốn **16 giây** (window function trên ~75.000 dòng). Trigger gọi view sẽ làm chậm mọi giao dịch tặng — không chấp nhận được. Hàm chiếu riêng chạy trên đúng 1 dòng donation (index PK) — phần nghìn giây.

## Kiểm chứng đã thực hiện

- **Độ trung thực của phép chiếu:** so sánh từng cột (cả 30 cột, qua jsonb) với view gốc trên 5 donations mẫu — USDT có hash, CAMLY, BTC, donation bị lọc spam (view loại → hàm cũng loại), donation không có người gửi (chỉ 1 dòng :in): **0 sai lệch**.
- **Cơ chế trigger:** test trong giao dịch hồi ngược (ROLLBACK toàn bộ): chèn 1 donation thử → **2 dòng lịch sử xuất hiện ngay** trong bản chụp; gọi lại hàm lần nữa → **không thêm trùng**; sau hồi ngược production sạch hoàn toàn (0 dòng thử).
- **Lưới an toàn:** lượt làm mới 08:30 (đầu tiên sau khi trigger sống) thành công, 70.374 dòng, `count(*) = count(DISTINCT id)` — 0 trùng.
- **Giao dịch thật đầu tiên sau kích hoạt:** 08:51:49 ngày 17/10 — Lê Minh Trí tặng 10.000 CAMLY cho @leminhtricamlycoin (tx `0xa9c4e11c…`, donation `8569a99f…`). Lượt làm mới gần nhất trước đó (08:50) đã kết thúc trước khi giao dịch phát sinh, lượt kế tiếp chưa chạy (08:55) — nhưng bản chụp **đã có đủ 2 dòng** của giao dịch: bằng chứng đầu-cuối rằng dòng lịch sử được ghi ngay tại thời điểm tặng, không qua lượt làm mới nào. Sau lượt làm mới 08:55 (thành công): giao dịch vẫn đúng 2 dòng, toàn cục 70.376 dòng / 70.376 id phân biệt — 0 trùng. Người dùng xác nhận bằng mắt: lịch sử hiển thị ngay.

## Giới hạn đã biết (chấp nhận theo thiết kế)

- Chỉ áp dụng cho dòng INSERT của `donations` (giao dịch tặng sinh ra đã ở trạng thái confirmed — 1.330/1.330 trong 30 ngày). Sửa trạng thái về sau (ví dụ gắn cờ spam) được lưới 5 phút đối soát như cũ.
- Một race cực nhỏ trên lý thuyết: donation commit đúng vào khoảng vài mili-giây giữa lệnh DELETE và INSERT của lượt làm mới có thể tạo 1 dòng hiển thị trùng cho tới lượt làm mới kế tiếp (tự lành, chỉ ảnh hưởng hiển thị, xác suất ~1 lần trong hàng chục năm ở lưu lượng hiện tại).
