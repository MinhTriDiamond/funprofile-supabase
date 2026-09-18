# Nợ kỹ thuật — Trigger cascade gây lỗi FK khi xoá tài khoản

Mở hồ sơ: 04/09/2026 · Trạng thái: nguyên nhân gốc đã sửa (trigger `on_friend_removed`), phần rà soát toàn hệ thống còn mở.

## Hiện tượng

Khi xoá một tài khoản có bạn bè (`friendships.status = 'accepted'`), cascade xoá `friendships`
kích hoạt trigger `on_friend_removed` → `create_friend_removed_notification()` chèn
`notifications(type='friend_removed', actor_id = người vừa bị xoá)` → vi phạm
`notifications_actor_id_fkey`, toàn bộ lệnh xoá rollback.

Xảy ra thật trong đợt xoá 92 tài khoản treo Light Law (04/09/2026). Cách xử lý lúc đó là
tạm thời: xoá `friendships` trước rồi dọn 121 notification lỗi phát sinh — **không phải sửa gốc**.

## Sửa gốc (đã làm)

Migration 04/09/2026 — `create_friend_removed_notification()` chỉ chèn notification khi
CẢ HAI phía còn tồn tại trong `public.profiles`:

```sql
IF OLD.status = 'accepted'
   AND EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.friend_id)
   AND EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.user_id)
THEN ... END IF;
```

Nhờ vậy cascade xoá tài khoản không còn sinh notification mồ côi; không cần dọn hậu kỳ.

## Phần còn mở (không gấp, không được quên)

1. Rà soát toàn bộ trigger `AFTER DELETE`/`AFTER UPDATE` có INSERT sang bảng khác có FK tới
   `profiles`/`auth.users` — cùng lớp lỗi có thể tái diễn ở nơi khác
   (ví dụ các trigger notification khác, `_emit_fp_event`, outbox activity).
2. Cân nhắc chuẩn hoá: mọi trigger sinh notification phải guard `EXISTS profiles` cho
   `user_id` và `actor_id`, hoặc `notifications.actor_id` chuyển sang `ON DELETE SET NULL`.
3. Bổ sung 1 test hồi quy: tạo 2 user giả có friendship accepted → xoá 1 user → kỳ vọng
   xoá thành công, không lỗi FK, không notification mồ côi.

## Nguyên tắc kèm theo

Mọi lần xoá tài khoản vẫn theo Preview → Confirm → Write. Khi không thể chạy đúng đường đã
được giao (edge function `mode=execute`), phải DỪNG và báo cáo, không tự đổi đường thực thi.
