# Android: tiền đã chuyển nhưng không hiện card gift — 2026-11-13

Người làm: Quang Vũ cùng Angel Muse. Nhánh `fix/quangvu-android-gift-card`.

## Giao dịch người dùng xác nhận

TX: `0x0e47286f240e22b9006cf5f58b6a3ea12d6e33022c1e0d753a6443efd03e5ad4`, chain BSC 56.

- Receipt JSON-RPC công khai: status `0x1`, block `0x7f049d3`, timestamp **2026-11-12T15:59:05Z**.
- Transfer CAMLY contract `0x0910320181889fefde0bb1ca63962b0a8882e413` từ `0x7e12ce3a5e95ce580b647a1a3f5700266f471ec8` tới `0x8b73415e530163df2e1ec4d45a641858a4af4bfb`.
- Log Transfer raw amount `200000000`, decimals=3 theo token registry repo ⇒ `200000` CAMLY. Đọc số nguyên bằng BigInt, không float.
- Recipient ví trùng profile amosmuhwezi (`5812ad63-2fc7-4858-9cea-264a7d151ce6`). Người gửi trong ảnh là angelquangvu (`1c98a6eb-b939-43ab-aa6a-96a50b7b559f`); lưu ý ví public/external hiện tại của profile đã khác ví gửi trên receipt, không tự đổi liên kết ví.
- SELECT production theo đúng TX: **không có transactions, donations hoặc posts**. User xác nhận thiếu cả modal chúc mừng và bài gift trên feed.
- Bản 200000 CAMLY cũ ngày 11/11 (`0x2f31...9dce`) đã có donation/post, KHÔNG phải lần lỗi này.

## Lỗi tái hiện được trong code

1. `useSendToken` dùng Promise.race timeout ký 45s (mobile WalletConnect) hoặc 75s (injected/desktop). Timeout không hủy yêu cầu trong ví; nếu ví trả hash muộn, caller đã nhận null ⇒ không chạy tạo card hay record-donation.
2. Dialog có watchdog 90s và nút “Huỷ” chỉ reset UI, không hủy request trong ví. Đường này có thể mở gửi lần hai khi request cũ chưa trả kết quả.
3. Effect sync dialog phụ thuộc toàn object giftTx, update/finishSuccess luôn tạo object mới dù payload giống nhau ⇒ lặp render. Receipt poll xác nhận success còn có thể bị stale broadcasted từ dialog ghi lùi.
4. Pending donation chỉ được lưu sau khi chờ receipt và lấy session, để hở khoảng Android suspend/unmount trước ghi DB.

Đã chứng minh các nhánh trên bằng test thất bại trước sửa. Chưa có log thiết bị của lần lỗi, nên không khẳng định duy nhất nhánh nào thực sự đã xảy ra trên máy người dùng.

## Bản sửa

- Mobile giữ promise ký tới khi ví trả hash/reject thật; ngưỡng chậm chỉ nhắc người dùng, không bỏ phản hồi. Desktop vẫn giữ chính sách timeout cũ.
- Khóa send in-flight, reset không mở khóa request ký đang chờ; recheck guard30s sau lookup async để chặn hai click chạy song song. Nút Huỷ khi EVM signing hướng dẫn huỷ trong app ví, không báo đã hủy khi chưa có phản hồi.
- Context update/finish idempotent, không ghi lùi success bởi broadcasted/timeout cũ.
- Lưu pending snapshot ngay khi có hash, trước card/receipt, dùng chuỗi amount nguyên vẹn; lỗi storage không chặn card.
- Không sửa backend/schema, không gửi tiền, không thay duplicate-send guard30s hoặc chính sách ví ngoài. `usePendingDonationRecovery` chỉ di chuyển type sang helper dùng chung.

## Kiểm chứng

- 13 test mới đạt: ví trả hash100s, reset/resend bị chặn, rejection thật mở khóa, delayed lookup B không tạo signer lần2, ngưỡng chậm và dọn timer, effect context hội tụ, success không bị lùi, pending amount giữ nguyên và storage lỗi không throw.
- `tsgo --noEmit`: exit0. `git diff --check`: đạt.
- Full suite: 507 đạt / 30 skip / 22 fail; lỗi thuộc nhóm live REST không resolve Supabase trong sandbox và file giá render đã có từ trước. Không coi toàn suite là pass.
- Chưa test chuyển tiền thật trên Android; không tạo giao dịch tiền để thử.

## Giao dịch cũ cần khôi phục riêng

Bản frontend chỉ bảo vệ lần gửi sau, không tự tìm lại hash đã bị mất ở phiên cũ. Chưa thay dữ liệu production. Cần ghi nhận lại **TX đã thành công**, không gửi tiền lần nữa, ưu tiên đường `record-donation` có auth/idempotency (cặp tx_hash + recipient_id). Kiểm tra lại donation/posts trước khi chạy để tránh trùng, lưu snapshot truy vấn trước/sau. Không giả lập ký hoặc sửa ví profile.

Thông tin chuẩn bị cho endpoint (chưa gọi): sender_id `1c98a6eb-b939-43ab-aa6a-96a50b7b559f`, recipient_id `5812ad63-2fc7-4858-9cea-264a7d151ce6`, amount `200000`, token_symbol CAMLY, token_address như trên, chain_id56, tx_hash như trên; message theo ảnh “Cảm ơn bạn rất nhiều! 🙏”, theme celebration, sound rich-1. Phải dùng phiên đăng nhập sender/admin được phép; không thu thập token qua chat.

## Preview và rollback

Chỉ frontend: Cloudflare Pages Preview kiểm tra modal/progress UI bằng test giả lập, không yêu cầu user chuyển thêm tiền. Sau Preview đạt mới merge; không deploy Edge Function. Rollback bằng PR revert. Snapshot pending vẫn dùng đúng key/schema cũ nên bản trước tiếp tục đọc được.


## PR và Preview bản code

PR #56: https://github.com/MinhTriDiamond/funprofile-supabase/pull/56. Cloudflare check commit 380bb82: SUCCESS. Preview: https://c3858e09.funprofile-supabase.pages.dev. Chưa merge hoặc sửa dữ liệu production.


## ĐÃ KHÔI PHỤC PRODUCTION — 2026-11-13 (cập nhật sau các mục chờ ở trên)

Cha đã đồng ý khôi phục đúng TX. Đã reverify receipt bằng viem decodeEventLog/formatUnits; giữ nguyên ví profile dù ví hiện tại khác địa chỉ gửi. Backup trước thao tác: `/private/tmp/android-gift-debug/before-recovery-all.json` (donations/posts/transactions/snapshot đều 0), receipt proof tại cùng thư mục.

Endpoint record-donation cần app session sender/admin mà môi trường hiện không có. Đã khôi phục bằng SQL quản trị có scope một TX, advisory lock, kiểm tra chưa tồn tại và profile, transaction nguyên tử; không hạ bảo vệ hoặc đổi schema/trigger. Đã thử toàn bộ bằng ROLLBACK và qua assert trước khi chạy COMMIT. Script: `recover-one-confirmed-tx.sql`; script rollback **chưa chạy**: `rollback-one-recovery.sql`.

Kết quả đã commit:
- Donation `da0c3856-8c02-404a-ac2f-4d44bec72206`, confirmed, 200000 CAMLY, đúng thời gian block `2026-11-12T15:59:05Z`, lời nhắn như ảnh.
- Gift post công khai `0082e117-2559-40c4-8c77-2822f3ba66b7`, linked donation.post_id, moderation approved.
- Trigger hiện hành tạo 2 transactions và 2 snapshot rows (gửi/nhận). Không chèn raw transactions bằng tay, không cần quét/refresh toàn hệ thống.
- API công khai `get_unified_transactions` scope profile nhận được chính TX mới; `get_unified_transaction_detail` trả dữ liệu Card, đúng sender/recipient, theme/sound và confirmed. Public REST post trả HTTP200 và đúng gift_amount/tx_hash.
- Summary amosmuhwezi: số giao dịch nhận **2 → 3**; CAMLY **1 lần / 200000 → 2 lần / 400000**; BNB giữ 1 lần / 0.002. Bằng chứng rút gọn: `recovery-evidence.json`.

Không gửi tiền mới, không phát/mint thưởng thủ công (light_score_earned=0 theo quy ước backfill), không tạo thông báo/chat bổ sung. Đã xác minh API đọc lịch sử/Card và bài gift; thử UI browser automation không hoạt động do lỗi công cụ, chưa có xác nhận mở Card trực tiếp từ người dùng. Tải lại trang lịch sử (cache query tối đa30s) để xem kết quả trên production hoặc Preview cùng backend.

Bản vá frontend phòng lỗi mới vẫn ở PR #56, chưa merge; không nhầm việc khôi phục dữ liệu lần này với phát hành bản vá.


## ĐÃ MERGE VÀ DEPLOY FRONTEND — 2026-11-13

Theo yêu cầu “CHA MERGE VÀ DEPLOY GIÚP CON NHÉ”, PR #56 đã merge squash `987d35dff6c4215f0a3367319fb9a4e827ec797e` sau Cloudflare Preview head 0908c20 SUCCESS (https://14cda4b9.funprofile-supabase.pages.dev).

Cloudflare Pages production commit 987d35d: **SUCCESS**; deployment https://2a5434ea.funprofile-supabase.pages.dev. Đã đọc trực tiếp asset từ https://fun.rich (không chỉ kiểm tra dashboard):
- Entry mới `/assets/index-GiwMzvpS.js`.
- `/assets/useSendToken-nm_RwVlo.js` có marker “Ví vẫn đang xử lý” / “Yêu cầu trước vẫn đang chờ ví phản hồi” của bản vá.
- Dialog mới `/assets/UnifiedGiftSendDialog-CkIGt6qW.js`.

Trước deploy, fun.rich còn entry index-DTFlLdN4 / useSendToken-BgUoS30k và không có marker. Sau deploy marker có thật trên asset production, chứng minh frontend mới đã lên. Không deploy Edge Function, không đổi secret/cron/schema. Nhánh code PR #56 đã xóa sau merge; giao dịch đã khôi phục ở mục trước vẫn giữ nguyên. Chưa tạo khoản chuyển tiền mới để test thực tế Android.
