# Kiểm toán giao dịch Bitcoin + quyết định đóng băng số liệu — 2026-10-15

## Quyết định của Trí (chốt 2026-10-15)

**Số liệu Bitcoin từ ngày 2026-10-15 trở về trước là ĐÓNG: giữ nguyên như hiện tại, không xác minh lại, không điều chỉnh nữa.** Các chuyển động BTC trong quá khứ là việc của Cha; việc hệ thống ghi tên thành viên lên một số giao dịch là lỗi gán danh tính của hệ thống tạm thời, và cộng đồng liên quan đã rõ việc này. Việc cần làm thuộc về tương lai: xây hệ thống giao dịch Bitcoin chuẩn (đã nằm trong lộ trình sau migrate từ trước) với xác thực quyền sở hữu địa chỉ bằng chữ ký mật mã trước khi ghi tên người.

## Tóm tắt kiểm toán (đã hoàn tất, làm nền cho quyết định)

- Kiểm chứng toàn bộ 549 bản ghi BTC (503 giao dịch on-chain) qua 3 vòng: đối chiếu blockchain (mempool.space/blockstream), phân tầng sổ địa chỉ, gom cụm ví theo đồng chi tiêu, truy vết địa chỉ chưa đăng ký. Kết quả lưu ở 3 bảng nội bộ: `btc_verification_audit_20261015`, `btc_verification_audit_r2_20261015`, `btc_verification_audit_r3_20261015` (RLS bật, không cấp quyền anon/authenticated).
- Kết luận kỹ thuật: giao dịch trên chuỗi là thật nhưng cơ chế gán danh tính của hệ thống tạm thời không đáng tin — sổ địa chỉ phụ `profile_btc_aux_addresses` gần như toàn suy đoán máy (nguồn hd_change_auto/hd_input_back, gắn hàng loạt ngày 2026-06-11, chỉ 1/1.659 dòng được xác thực); một giao dịch bị tách thành nhiều bản ghi theo từng đầu ra; phát hiện 39 vụ tự chuyển cùng cụm ví, các chuỗi bóc vỏ bị dán nhãn thành nhiều cặp thành viên.
- Số liệu hiển thị KHÔNG thay đổi trong suốt quá trình kiểm toán, theo đúng quyết định giữ nguyên của Trí.
- Máy quét BTC gần như ngừng ghi mới từ 2026-07-09 (tháng 7/2026 chỉ 3 bản ghi) nên việc đóng băng không tạo áp lực phát sinh.

## Việc tương lai (lộ trình, chưa khởi công)

Hệ thống Bitcoin chuẩn: (1) xác thực chủ địa chỉ bằng chữ ký BIP-322/BIP-137 hoặc gửi thử lượng nhỏ trước khi bất kỳ địa chỉ nào được ghi tên người; (2) giao dịch quét từ chuỗi chỉ ghi theo địa chỉ nếu chưa xác thực; (3) gom cụm hành vi chỉ dùng nội bộ để gắn cờ kiểm duyệt, không dùng để ghi tên. Khung hỗ trợ đã có sẵn trong hệ thống: `btc_ownership_challenges`, `btc_address_ownership_history`, `btc_ownership_snapshot`.
