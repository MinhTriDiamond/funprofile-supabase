# ADDENDUM — 3 điểm bổ sung (23/08/2026, READ-ONLY)

Nối tiếp `REPORT.md`. Không điều tra lại phần đã xong.

## 1. Phạm vi 2 con số — KHÁC PHẠM VI, KHÔNG MÂU THUẪN

| Con số | Nguồn | Vai của Cha | Công thức |
|---|---|---|---|
| **$705.918,56** | `get_benefactor_leaderboard(50,0,'all','BTC')` → rank 1 = `father`, 12 tx | **người GỬI** (benefactor) | `SUM(donations.amount_usd)` GROUP BY `sender_id`, chỉ `token_symbol='BTC'`, `status='confirmed'`, `leaderboard_eligibility='internal'`, `is_external=false`, `sender_id<>recipient_id`, `chain_id<>97`, token phải `is_leaderboard_eligible`, loại profile `exclude_from_leaderboard`, `amount_usd>0`, `<= max_single_usd` |
| **$2.116.276,14** | `SELECT count(*), sum(amount_usd) FROM donations WHERE recipient_id = father AND status='confirmed'` → 611 dòng | **người NHẬN** | KHÔNG giới hạn token (BTC+USDT+BNB+CAMLY+FUN), KHÔNG áp `leaderboard_eligibility`, KHÔNG loại `is_external` → gồm cả `external_to_father` (9 dòng BTC = $2.090.972,36) và `external_excluded`. Chỉ lấy `confirmed` (không tính pending/pending_verification). |

Chi tiết $2.116.276,14 theo nhóm:
BTC/external_to_father 9 dòng $2.090.972,36 · USDT/internal 116 $17.411,79 · BNB/internal 23 $3.397,12 · CAMLY/internal 392 $2.426,82 · CAMLY/external_to_father 2 $1.952,80 · USDT/external_to_father 1 $49,99 · BTC/external_excluded 2 $40,59 · BTC/internal 3 $24,67 · FUN/internal 63 (không quy USD).

**Kết luận:** một con số là **BTC gửi đi (leaderboard, đã lọc)**, một con số là **tổng nhận mọi token (thô, gồm ví ngoài)**. Hai phạm vi rời nhau → **không có vấn đề mới**.

## 2. `transactions.to_address` sai được đọc ở đâu

| Nơi | Có đọc bảng `transactions`? | User có NHÌN THẤY số sai? |
|---|---|---|
| `v_unified_transactions` / `_primary` | **KHÔNG** — view chỉ UNION `donations` (out/in) + `wallet_transfers` | Không |
| `get_unified_transactions` | Có, **chỉ trong CTE tìm kiếm** (match `tx_hash/from_address/to_address` → sinh key `transactions\|id`) | **Không** — kết quả cuối lọc `(source_table\|\|'\|'\|\|source_id) = ANY(_keys)`; view không có row nguồn `transactions` nên key này không khớp gì ⇒ không thêm dòng nào |
| `get_unified_counterparties`, `get_unified_transaction_detail` | đọc view, không đọc `transactions` | Không |
| FE lịch sử ví/profile (`WalletHistoryPage`, `ProfileHistoryPage`, `HistoryTab`, `RecentTransactions`) | Không (hook legacy `useTransactionHistory` đã bị xoá khỏi codebase) | Không |
| FE còn đọc `transactions` | `useSendToken.ts` (ghi + đọc tx vừa gửi), `ShadowProbe.tsx` (chỉ `count`), `AllTransactions.tsx` / `list-all-transactions` (**Admin only**), `useAdminBackfill` (Admin) | Chỉ Admin, và là bảng thô |
| RPC/view khác JOIN theo `to_address` | `btc_raw_sat_guard_scan`, `btc_pending_verification_sweep`, `backfill_transactions_from_sources`, `sync_*_to_transactions` — đều là job/guard nội bộ | Không |
| Dashboard admin/treasury | `FinancialTab` đọc `financial_transactions` (bảng khác); `TreasuryPublicPage` đọc `treasury_flows` | Không |

**⚠️ Phát hiện phụ (đây MỚI là nơi user thấy):** cùng bộ 28 hash sai, `wallet_transfers` có **23 dòng gán `user_id = father`** (22 `in` + 1 `out`, tổng 1,66266738 BTC). `wallet_transfers` **NẰM TRONG** `v_unified_transactions` ⇒ 23 dòng này **hiện ra trong lịch sử ví/profile của Cha** dưới nhãn "Ví ngoài". Không ảnh hưởng USD công khai (leaderboard/stats chạy trên `donations`), nhưng ảnh hưởng hiển thị. Đề nghị đưa vào cùng đợt sửa (mục 3, Bước 2).

## 3. PREVIEW sửa 42 dòng — CHƯA GHI GÌ

Dữ liệu đầy đủ: `evidence/preview_42_rows.tsv` (42 `transactions.id` phân biệt).

Tập xác định (deterministic): `transactions` có `lower(to_address)` = ví Cha, `tx_hash NOT LIKE 'btc-manual-%'`, và KHÔNG tồn tại `donations` cùng hash với `recipient_id = father`.

### Bước 1 — `transactions` (42 dòng, 28 hash)
| Nhóm | Số dòng | Hành động đề xuất | Lý do |
|---|---|---|---|
| **A. `user_id = father`** | **26** | **DELETE** | Cha không phải một bên nào của tx (donations cùng hash có recipient là user khác, `recipient_address` khớp vout on-chain). Dòng này là bản sao gán nhầm, không có bản gốc đúng nào để giữ. Tổng "nhận" ảo bị loại: **3,31262316 BTC ≈ $178.571,50** |
| **B. `user_id = recipient thật`** | **16** | **UPDATE `to_address`** = `donations.recipient_address` (vout on-chain thật), giữ nguyên `user_id` | Dòng đúng người, chỉ sai địa chỉ đích (~$178.149,23 giá trị liên quan) |

Không dòng nào bị đổi `amount`, `tx_hash`, `token_symbol`, `created_at`. Không đụng `donations` (đã đúng).

Ví dụ nhóm B: `2e47d06c…` 0.003 BTC → `to_address` sửa `bc1qgxf7c…fta8sv` ⇒ `bc1q47vk6dx3uhxdmj3l0zcfcqekhdu8smpgaquryj` (angelthuha).
Lưu ý 1 hash multi-vout (`2f38060e…`, 2 người nhận: angelgiau + angeldieungoc) — dòng của nó thuộc nhóm A nên chỉ DELETE, không cần chọn vout.

### Bước 2 — `wallet_transfers` (23 dòng, tuỳ Cha duyệt)
DELETE 23 dòng `user_id = father` thuộc 28 hash trên (Cha không phải một bên) ⇒ hết 23 dòng sai trong lịch sử hợp nhất.

### Bước 3 — Audit & xác minh
- Export JSON toàn bộ dòng trước khi ghi vào `docs/audit/father-to-address-20260823/evidence/`.
- Sau khi ghi: đếm lại `to_address = ví Cha` (kỳ vọng còn **15 dòng thật + 1 dòng orphan đã có kết luận riêng**), và đếm lại `v_unified_transactions` phía Cha.
- Không ghi gì tới khi Cha xác nhận từng bước.
