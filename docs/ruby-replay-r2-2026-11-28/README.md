# Recording Ruby–Đại Huỳnh chưa chuyển R2 — 28/11/2026

Đã xác nhận Telegram; nhánh `fix/quangvu-ruby-replay-r2`.

## Nguyên nhân đã đối chiếu

- Stream UID `4a574ce41a29381867c59842c8f7f38c`, input `165f93ddeee3ec027722e1b173b113e4`,56:21 (3.381,37giây),720p,ready,requireSignedURLs=false; tạo07:36:47UTC vàready08:33:23UTC.
- Config `e0d48bc5-c7a6-4909-9e48-e7c6d935eef6` thuộc `32276998-38c9-4e5c-a26c-72f85a2033d0` (angelhuynhtydo),persistent,active.
- Phiên `cb0324ed-dc67-42ab-b562-139a9ff3e54f` tạo07:10:33UTC, kết thúcmanual07:21:57UTC,go_live_clicked_at/source_connected_at/post_id/live_post_id/replay_post_id đềuNULL. Recording bắt đầu sau khi phiên này đã kết thúc. Không có post hoặc replay ngày28/11 của chủ; không có tham chiếu canonical tới UID.
- Archive hiện hữu dành cho replay của phiên đã publish, nên không nhận recording này. Không phải giới hạn4giờ và không được nới matching để gắn vào phiên cũ hoặc tự tạo bài công khai.

## Phục hồi trong phạm vi

Công cụ `archive-unpublished-stream-recording` mặc định khóa khi không có capability. Quyền tạm chỉ một config/UID,tokenSHA256,hạn dùng,maxBytes; owner lấy từ config DB. Xác minh source thuộc đúnginput,ready,public,không active và chưa thuộc session/replay. ExportMP4 dưới4giờ, copy multipart16MB server-side theo byte range/ETag cố định, resumable receipts ở snapshot operator. Không xuất APIkeys.

Sau khi full-decode và hash toàn bộ bản R2 khớp nguồn, mới ghi `creator_library` đúng owner,post_id/live_session_id/live_replay_id/posted_atNULL. Thư viện có RLS owner hiện hữu; object giữ access model public như nguồn Stream ban đầu, không đổi privacy hoặc đăng lên feed. Không sửa phiên đã kết thúc. Sau cùng mới dùng cleanup giới hạn đúngUID: source vẫnready/đúnginput,không tham chiếu canonical/feed,library và signedHEAD/R2MP4 được xác minh. Không xóa liveinput/key hoặc ngắt phiên khác.

Đây là công cụ vận hành cho recording chưa được publish; không thêm cron quét/chuyển mọi nguồn tài khoản. Muốn công khai lên feed vẫn cần hành động đăng bài của chủ.

## Snapshot và rollback

Raw DB snapshot/metadata/media/logs/capability tạm nằm ngoài Git trong `.local-backups/ruby-replay-r2-2026-11-28/`. Capability gỡ sau tác vụ; endpoint trở lại401. Không có migration, không đổi chính sách thời lượng hoặc pipeline tối ưu video feed/webcam. Nếu chuyển thất bại, giữ Stream, abort đúng multipart chưa complete. Nếu object complete, giữ để đối soát, không overwrite. Nếu đã dọn Stream, giữ R2 đã xác minh; không khôi phục URL UID đã xóa. Có thể import MP4 backup thành UID mới nếu thật sự cần; không tự đăng bài mới.

Kết quả/receipt production sẽ bổ sung sau kiểm chứng.
