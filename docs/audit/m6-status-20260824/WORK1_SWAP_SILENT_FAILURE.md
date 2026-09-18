# Việc #1 — Silent failure của `record-swap` (AUDIT ONLY, chưa code)

Ngày: 2026-08-24 · Phạm vi: chỉ quan sát, không đổi nghiệp vụ swap.

## 1. Các nhánh đang "nuốt" lỗi

### 1.1 Frontend — `src/components/wallet/SwapTab.tsx`

| Dòng | Nhánh | Hành vi hiện tại |
|---|---|---|
| 209–211 | `swapErr || swapData.error` → `throw` | ném vào catch bên dưới |
| **212–229** | `catch (recordErr)` sau khi tx đã thành công on-chain | **`console.warn` duy nhất** (dòng 213) + push vào `localStorage['pendingSwapRecords']` (giữ tối đa 20, dòng 226 bỏ qua lỗi quota) + toast "sẽ đồng bộ trong vài phút" |

```ts
212  } catch (recordErr) {
213    console.warn('[SwapTab] record-swap thất bại, sẽ đồng bộ lại sau:', recordErr);
...
226    } catch { /* ignore quota */ }
227    toast.warning('Giao dịch swap đã thành công on-chain, hệ thống sẽ đồng bộ lịch sử trong vài phút.');
```

Không có consumer nào đọc lại `pendingSwapRecords` (grep toàn repo chỉ thấy 1 chỗ ghi) ⇒ hàng đợi retry **chết**, không ai đồng bộ.

### 1.2 Edge — `supabase/functions/record-swap/index.ts`

| Dòng | Nhánh | Hành vi |
|---|---|---|
| 38–42 | `catch` khi `req.json()` lỗi | trả 400 `invalid_body`, **không log** |
| 99–102 | `catch` Moralis outage | chỉ set `verifyReason`, **không log** |
| 104–110 | `!verified` + non-transient | trả 400 `invalid_tx`, **không log** |
| 133–145 | `insertErr` khác 23505 | `throw` lên catch ngoài |
| **147–166** | audit_logs insert | `.then(() => {}, () => {})` — **swallow tuyệt đối**, lỗi ghi audit biến mất |
| 169–172 | catch ngoài cùng | trả JSON error cho client, **không persist** |

⇒ Mọi nhánh thất bại (invalid_tx, moralis, insert error, audit fail) **không để lại dấu vết bền nào**.

## 2. Quy mô lịch sử

**KHÔNG THỂ XÁC ĐỊNH QUY MÔ LỊCH SỬ.**

Bằng chứng:
- `supabase--edge_function_logs('record-swap')` → *No logs found*.
- `function_edge_logs` filter `request.url like '%record-swap%'` → `[]` (retention đã hết).
- `swap_transactions`: **46 dòng, 100% `verified_by='client-legacy'`, `created_at` từ 2026-02-17 → 2026-06-30**. 30 ngày gần nhất: **0 dòng**.
- `audit_logs where action='record_swap'`: **0 dòng** ⇒ edge `record-swap` chưa từng insert thành công dòng nào.

Hai giả thuyết không phân biệt được bằng dữ liệu hiện có: (a) không có swap nào từ 30/06, hoặc (b) mọi swap đều fail ở `record-swap`. Không suy diễn thêm.

## 3. Phương án ghi log bền — bảng ứng viên đã có

| Bảng có sẵn | Phù hợp? | Ghi chú |
|---|---|---|
| `swap_price_validation_log` | ⚠️ Một phần | Đã gắn với swap nhưng schema chuyên biệt cho đối chiếu giá (side/verdict/diff_pct), yêu cầu `swap_id` — mà case fail lại **không có** swap row |
| `audit_logs` | ⚠️ Một phần | Đang dùng cho success path; semantics "admin action", không có cột `sqlstate`/`stage`; ghi vào đây trộn lẫn audit hành vi với lỗi kỹ thuật |
| `signup_failure_log` | ✅ Mẫu chuẩn | Schema `source / sqlstate / error_message / context jsonb / occurred_at` — đúng khuôn cần cho swap failure |
| `token_price_fetch_failures` | ✅ Mẫu notify | Có `attempts / first_failed_at / last_failed_at / notified_at` — mẫu chống spam notify |
| `external_tx_filter_log`, `reconciliation_logs`, `provider_request_log` | ❌ | Ngữ nghĩa khác (filter/reconcile/provider HTTP) |

**Ba lựa chọn để CTO chọn:**
- **A. Bảng mới `swap_failures`** theo đúng khuôn `signup_failure_log` + cột dedup của `token_price_fetch_failures` (`tx_hash, chain_id, user_id, stage, reason, http_status, error_message, context jsonb, attempts, first_failed_at, last_failed_at, notified_at`). Ưu: query/alert sạch, unique `(tx_hash, chain_id, stage)` chống trùng. Nhược: thêm 1 bảng.
- **B. Tái dùng `audit_logs`** với `action='record_swap_failed'`. Ưu: 0 migration. Nhược: không có dedup/attempts, trộn lẫn với audit hành vi admin, khó alert.
- **C. Mở rộng `swap_price_validation_log`** cho phép `swap_id NULL` + verdict `record_failed`. Ưu: gom hết "vấn đề swap" 1 chỗ. Nhược: bóp méo semantics bảng validation giá; phải nới NOT NULL.

Lovable **không tự chọn**. Cả 3 đều log-only, không đụng logic swap.

## 4. Kênh notify admin — ưu/nhược

| Kênh | Ưu | Nhược |
|---|---|---|
| **In-app notification FUN.RICH** (pattern `epoch_reset_info`) | Hạ tầng có sẵn (`notifications` + `notificationService`), admin thấy ngay trong app, 0 chi phí ngoài | Phải thêm type vào CHECK constraint; dễ spam nếu 1 lỗi hệ thống lặp → cần cột `notified_at` + throttle (vd tối đa 1 noti/giờ) |
| **Email admin qua `sendBrandedEmail`** | Ra ngoài app, đọc được khi không online; đã có `email_delivery_logs` | Chậm, dễ vào spam, tốn quota Resend, không thích hợp lỗi tần suất cao |
| **Banner trong Admin panel** (pattern `BacklogStatusBanner`) | Pull-based, không spam, thấy tổng quan số lỗi 24h | Chỉ thấy khi admin mở panel — không có tính chủ động |
| **Chỉ bảng log, không notify (silent-but-persisted)** | Đơn giản nhất, 0 rủi ro ồn | Không ai biết nếu không chủ động query |

Đề xuất trung dung để CTO cân nhắc: **bảng log + banner admin + in-app noti có throttle theo `notified_at`** (đúng mẫu `token_price_fetch_failures`).

## 5. Cam kết phạm vi

Không chặn, không rollback, không đổi verdict swap. Chỉ thêm 1 lần ghi log + 1 kênh cảnh báo. Chờ CTO duyệt phương án (3.A/B/C + kênh mục 4) mới code.
