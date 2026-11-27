# Bố cục ảnh trong bài đăng — 27/11/2026

Nhánh chỉ ảnh trước đây dùng ô vuông/row-span và LazyImage object-cover, cùng preset post-grid crop400x400. Vì vậy ảnh bị cắt ở cả CDN và CSS. Nhánh chỉ ảnh mới dùng preset post (scale-down, không crop) và object-contain. Không sửa LazyImage mặc định cho các avatar/thumbnail khác.

- Một ảnh giữ tỉ lệ tải được, giới hạn khung0,65–2; ảnh cực dài vẫn chứa trọn trong khung bằng contain.
- Hai ảnh chia đôi; ba ảnh: một lớn trên, hai bằng nhau dưới. Bốn ảnh2x2; năm trở lên: hai trên/ba dưới, badge+N mở gallery. Giữ nguyên thứ tự, xem được toàn bộ ảnh qua gallery. Khác tỉ lệ ô có nền đệm để giữ nội dung.
- LazyImage chuyển tiếp onLoad sau handler nội bộ để đo tỉ lệ mà không bỏ trạng thái loaded/skeleton. Các callsite khác giữ hành vi mặc định.
- Nhóm video và mixed không đổi. Không sửa dữ liệu/URL gốc, backend hoặc pipeline.

Kiểm chứng: Chrome component thật với ảnh mô phỏng ngang/dọc/vuông/panorama;18case (1/2/3/4/5/8 ảnh ×390/768/1440px), không overflow/trống cuối, mọi img contain và loaded; gallery mở ảnh5 rồi ảnh6 đúng thứ tự. 727test offline đạt/53skip/109file, tsgo đạt, build26,72s đạt. Sync cascade cấu hình read-only trả401 có sẵn, fallback constants hiện tại; cascade-consistency5test đạt. Không sửa grants. Self-review tác giả, không review độc lập.

Ảnh kiểm thử mô phỏng: [desktop](desktop.png), [mobile](mobile.png). Số liệu: browser-proof.json.

Phát hành qua PR và Preview đúng commit. Rollback bằng PR revert thay đổi UI; không có dữ liệu cần phục hồi.
