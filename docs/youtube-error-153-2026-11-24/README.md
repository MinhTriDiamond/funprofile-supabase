# Khắc phục YouTube Error 153 trên feed — 2026-11-24

Cha đã xác nhận gửi Telegram trước khi bắt đầu. Nhánh `fix/quangvu-youtube-error-153`. Phạm vi: `LinkPreviewCard` và kiểm thử hồi quy; không thay backend, DB, cache hay headers toàn site.

## Nguyên nhân và thay đổi

Iframe trong thẻ link đặt `referrerPolicy="no-referrer"`, khiến request sang YouTube không có HTTP Referer. Tài liệu chính thức yêu cầu header này để nhận diện trang nhúng và khuyến nghị `strict-origin-when-cross-origin`: https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity .

Bản sửa nhận diện hostname chính xác youtube.com / youtube-nocookie.com (có hoặc không www), đường dẫn /embed/, rồi cho gửi origin-only Referer. Không gửi đường dẫn bài viết hay query của trang cha. Provider khác giữ no-referrer; các link mở tab ngoài giữ noopener noreferrer. Không thay URL/video ID, metadata hay nội dung bài viết.

## Kiểm chứng

- RED: 4/7 test thất bại trước sửa, đúng do policy no-referrer trên bốn host YouTube.
- GREEN: 7/7 test mới đạt; toàn nhóm feed 35/35 test (6 file) đạt. Typecheck `bunx --package @typescript/native-preview tsgo --noEmit` exit0.
- Chromium kiểm thử riêng render component thật, chỉ mock dữ liệu hook; trước sửa request iframe YouTube không có Referer, sau sửa gửi đúng origin của trang fixture và bỏ toàn bộ path/query. Vimeo không gửi Referer cả trước/sau. Báo cáo browser-before.json và browser-after.json.
- Iframe YouTube thực với video PdNMiq0X2BI đã hiển thị đúng tiêu đề/thumbnail, không còn màn configuration error ở bước khởi tạo. Đã bấm đúng nút Phát video trong player thực và chờ video.currentTime > 0, paused=false: đạt. Báo cáo actual-playback.json. Đây là kiểm thử component/player riêng với dữ liệu metadata mock, chưa phải thao tác trên phiên đăng nhập feed của Cha.
- Review độc lập: không Critical/Important; nhận diện provider khác bằng substring và màu hardcode là code có sẵn, không mở rộng sửa trong PR này.

## Khôi phục

Nếu có regression, revert PR qua nhánh + Preview theo quy trình dự án. Không có migration hoặc thay đổi production backend cần phục hồi.

## PR và tin Telegram hoàn tất

PR: https://github.com/MinhTriDiamond/funprofile-supabase/pull/73 . Hồ sơ đi cùng bản sửa qua Cloudflare Pages Preview trước merge.

Tin để Cha copy sau khi PR merge:

> Quang Vũ · Đã merge PR #73 khắc phục YouTube Error153 trong feed. Iframe YouTube/youtube-nocookie gửi origin Referer để player nhận diện trang nhúng, vẫn bỏ đường dẫn/query của bài viết; các nền tảng khác giữ chính sách cũ. 35/35 kiểm thử feed và tsgo đạt, review không có lỗi quan trọng. Đã kiểm chứng request browser trước/sau và bấm phát thành công đúng video trong ảnh. Bản sửa giúp các bài chia sẻ YouTube xem video nhúng lại, không đổi nội dung bài/DB/backend. PR: https://github.com/MinhTriDiamond/funprofile-supabase/pull/73 .
