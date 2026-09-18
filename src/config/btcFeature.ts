/**
 * BTC feature freeze — quyết định 03/09/2026 (Cha duyệt).
 *
 * `BTC_NEW_TX_DISABLED = true` ⇒ ĐÓNG mọi luồng TẠO giao dịch BTC mới
 * (chọn mạng BTC, chọn token BTC native, dialog gửi BTC).
 *
 * KHÔNG ảnh hưởng lịch sử BTC cũ: mọi giao dịch đã ghi vẫn hiển thị công khai
 * đầy đủ theo chính sách 31/08/2026. Không ẩn/xoá bất kỳ dòng nào.
 *
 * Mở lại: đổi cờ này về `false` (cần Cha yêu cầu chủ động) + bỏ guard tương ứng
 * trong `record-donation` / `manual-create-donation`.
 */
export const BTC_NEW_TX_DISABLED = true;

export const BTC_MAINTENANCE_MESSAGE = 'Tính năng đang bảo trì';

export const BTC_MAINTENANCE_DETAIL =
  'Tính năng gửi/tặng BTC đang bảo trì. Lịch sử giao dịch BTC cũ vẫn xem được đầy đủ.';
