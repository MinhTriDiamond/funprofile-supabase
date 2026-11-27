# Đối soát xóa nguồn 3,40 GB — 27/11/2026

Kiểm tra chỉ đọc đúng job canary `02e100d1-e568-4ab0-a178-33a5ee791c46`; không gọi tick/retry/probe, không xóa thêm, không thay flags hoặc dữ liệu.

- Nguồn R2 `fun-rich-media`: 3.399.337.725byte, receipt có đủ size/bucket. Bắt đầu xóa 13:29:19,244577 và ghi nhận xóa xong **13:29:20,857812 ngày26/11/2026, Asia/Kuala_Lumpur**, sau mốc đủ24h là13:28:33,042681 khoảng48giây. source_cleanup_error=NULL.
- Runtime chỉ finish source_deleted_at sau khi HEAD origin R2 trả404; kiểm tra hiện tại đọc receipt database và source-dry-run, không có credential S3 riêng để làm một HEAD origin độc lập. Không coi sourceVerified=false một mình là bằng chứng404; kết luận dựa trên receipt+luồng finish đã kiểm chứng. CDN có thể còn cache sau khi origin xóa.
- Bản MP4 tối ưu110.367.516byte (110,37MB thập phân) còn ở R2 private, attachment trỏ đúng output, HEAD200/cùngsize, Range206/32byte đầu cóftyp. Source-dry-run xác nhận sourceDeleted=true, currentPublication/outputVerified=true, referenced=false.
- VOD Stream tạm có stream_deleted_at14:05:18,98 ngày25/11/2026. Không giữ bản nguồn3,40GB trong pipeline hiện hành. Không có backup toàn tệp trong lần kiểm tra này.

Số liệu hiện tại: receipt.json. Trạng thái “chưa xóa” trong hồ sơ25/11 là kết quả kiểm tra trước hạn, đã được đối soát lại tại đây; không sửa ngược lịch sử. Tác vụ không thay runtime và không cần rollback dữ liệu; hồ sơ có thể revert qua PR.
