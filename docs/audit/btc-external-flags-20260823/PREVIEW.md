# PREVIEW — 23/08/2026 (READ-ONLY, CHƯA GHI GÌ)

Nối tiếp `father-to-address-20260823` + `btc-manual-cleanup-20260822`.

## VIỆC 1 — RC4: gate `verified=true` ở 4 nguồn còn lại

| Nguồn | Có đọc `profile_btc_aux_addresses`? | Gate `verified=true` | Kết luận |
|---|---|---|---|
| `auto-scan-donations` | KHÔNG (0 match) | n/a | Không thể sinh dòng sai qua aux; BTC được uỷ quyền cho `scan-btc-transactions` (piggyback HTTP) — nguồn này đã có gate |
| `fast-scan-donations` | KHÔNG | n/a | Chỉ EVM/BTCB (ERC-20), không đụng BTC native |
| `moralis-webhook` | KHÔNG | n/a | Chỉ EVM |
| `scan-my-incoming` | KHÔNG | n/a | Piggyback `scan-btc-transactions` như trên |

Tổng: toàn bộ **7 nguồn** đọc bảng aux hiện tại:
`scan-btc-transactions` ✅ gate, `btc-history-repair` ✅ gate, `wallet-reconciliation-cron` ✅ gate (commit `ebc11eee6`, 21/06/2026), `btc-ownership-reverify` (chính là hàm cấp `verified`), `usePublicDonationHistory` (FE) ✅ gate, `useWatchedWallets` (FE, chỉ ví của chính user) — an toàn.

### 1 phát hiện mới cần CTO đánh giá (KHÔNG tự vá)
`supabase/functions/btc-wallet-audit/index.ts` dòng 133–137 đọc **toàn bộ** aux **không** lọc `verified`:
```ts
const { data: allAux } = await admin
  .from("profile_btc_aux_addresses").select("user_id, address");
for (const a of allAux || []) internalBtc.set(norm(a.address), a.user_id);
```
Hàm này **có ghi** (backfill `donations.sender_id`, xoá `wallet_transfers`, sửa `posts.gift_celebration`) ⇒ đúng cơ chế đã tạo 49 dòng sai ở nhánh father-to-address.
Giảm nhẹ: **admin-only** (`user_roles`), **không có cron** nào gọi (đối chiếu `docs/ops/cron-jobs-inventory.md`) ⇒ rủi ro ngủ, chỉ bùng khi admin bấm chạy. Hiện có 1.706 aux `verified=false` / 1 `verified=true`.

## VIỆC 2 — 12 dòng CHẶN 1

### Bước 1: quét trùng đăng ký toàn hệ thống — SẠCH
| Địa chỉ | Số profile khai | Aux trùng |
|---|---|---|
| `bc1qrq0v066…dn48j` (angeldieungoc) | 1 | 0 |
| `bc1q47vk6dx…quryj` (angelthuha) | 1 | 0 |
| `bc1qq3mf47x…4f9c` (angellam) | 1 | 0 |
| `bc1q9kf3er3…zwww` (angelthuat) | 1 | 0 |
| `bc1p7etam62…m3mm` (angelquan, taproot) | 1 | 0 |

Không có ca trùng kiểu `angelloan`/`lovehubtoasang`. CHẶN 1 giải toả hoàn toàn.

### Bước 2: Preview 12 dòng (chưa ghi)
| Chủ thật | Dòng | USD | `is_external` | `leaderboard_eligibility` | `sender_id` | `post_id` |
|---|---|---|---|---|---|---|
| angeldieungoc | 5 | 6.803,71 | t → f | external_excluded → internal | NULL → owner | NULL |
| angelquan | 2 | 202,70 | t → f | → internal | NULL → owner | NULL |
| angellam | 2 | 38,35 | t → f | → internal | NULL → owner | NULL |
| angelthuat | 2 | 10,04 | t → f | → internal | NULL → owner | NULL |
| angelthuha | 1 | 28,78 | t → f | → internal | NULL → owner | NULL |
| **Tổng** | **12** | **7.083,58** | | | | |

Điểm bắt buộc trong lệnh ghi (phát hiện mới): trigger `set_donation_leaderboard_eligibility` **return sớm nếu `leaderboard_eligibility` đã NOT NULL** ⇒ flip riêng `is_external` **không** đổi eligibility. Lệnh ghi phải set `leaderboard_eligibility = NULL` (để trigger tự tính) hoặc gán `'internal'` tường minh.

**gift_celebration:** cả 12 dòng `post_id IS NULL` và **0 post** nào có `metadata.tx_hash` khớp 12 hash. Theo policy v2 (ví ngoài CŨNG được celebrate) thì không có post nào phải "đổi loại"; đề xuất **giữ nguyên, không tạo post mới** (post bù cho giao dịch tháng 2–4/2026 sẽ làm nhiễu feed). Cần Cha chốt.

## VIỆC 3 — 249 dòng `is_external` sai (mô phỏng bằng chính RPC)

Cách làm: `psql` (role hiện tại) **không có quyền UPDATE `donations`** nên không thể BEGIN/ROLLBACK. Thay vào đó dùng **bản sao nguyên văn thân RPC** `get_benefactor_leaderboard` (lấy từ `pg_get_functiondef`) trong hàm `pg_temp` chỉ-đọc, thay `donations` bằng CTE mô phỏng. **Kiểm chứng:** chạy bản sao với `flip=false` cho kết quả **khớp 100%, 15/15 dòng** với RPC thật ⇒ mô phỏng đáng tin.

### Baseline (RPC thật, BTC, all-time)
father 705.918,56 ✓ · angelutopia 77.164,71 ✓ · angelkim 68.239,34 ✓ · **angelthienhanh68 69.704,62** (trước 69.751,16 — lệch **−46,54** = 3 dòng `btc-manual` 5,84 + 20,21 + 20,49 đã chuyển `pending_verification` hôm 22/08; **giải thích được, không phải bug mới**). angelkim **không đổi** sau đợt dọn 42+23 dòng (đúng như cam kết: chỉ đụng `transactions`/`wallet_transfers`).

### funtreasury trong 249 dòng
**15 dòng / 242.966,31 USD** (73% giá trị của cả nhóm).

### Kịch bản B — flip 249 dòng, funtreasury GIỮ trên BXH (theo memory hiện hành)
| # | User | USD | Tx |
|---|---|---|---|
| 1 | father | 705.918,56 | 12 |
| 2 | **funtreasury** | **261.283,69** | 16 |
| 3 | angelutopia | 114.188,42 | 29 |
| 4 | angelkim | 81.332,66 | 22 |
| 5 | angelthienhanh68 | 69.974,74 | 11 |
| 6 | angelthanhtien | 26.255,52 | 39 |
| 7 | angelthuha | 5.558,95 | 22 |
| 8 | angelanhnguyet | 4.524,39 | 2 |
| 9 | leminhtri | 2.857,42 | 20 |
| 10 | sinhhoatlovehouseycha | 2.120,43 | 3 |

### Kịch bản C — flip 249 dòng, funtreasury BỊ LOẠI
| # | User | USD | Tx |
|---|---|---|---|
| 1 | father | 705.918,56 | 12 |
| 2 | angelutopia | 114.188,42 | 29 |
| 3 | angelkim | 81.332,66 | 22 |
| 4 | angelthienhanh68 | 69.874,15 | 10 |
| 5 | angelthanhtien | 26.255,52 | 39 |
| 6 | angelthuha | 5.558,95 | 22 |
| 7 | angelanhnguyet | 4.524,39 | 2 |
| 8 | leminhtri | 2.857,42 | 20 |
| 9 | sinhhoatlovehouseycha | 2.120,43 | 3 |
| 10 | angelgiau | 1.542,14 | 18 |

(Chênh angelthienhanh68/angelgiau giữa B và C là các donation **gửi tới** funtreasury bị loại theo filter 2 chiều.)

### Stub wallet
`wallet_0x50ebe82ce05adf3dd` có `exclude_from_leaderboard = true`; quét 500 dòng đầu sau flip: **0 dòng** `wallet_0x%`. Đúng như thiết kế.

**CHƯA GHI GÌ.** Cần Cha chốt: (a) duyệt 12 dòng Việc 2 (kèm quyết định post), (b) chọn kịch bản B hay C cho 249 dòng, (c) mức khẩn cho `btc-wallet-audit`.
