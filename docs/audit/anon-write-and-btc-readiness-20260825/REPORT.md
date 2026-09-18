# Báo cáo 25/08/2026 — Anon-write P0 + BTC readiness + BSC #2/#3

## PHẦN 1 — 13 bảng anon-write rủi ro cao

### 1.1 Nguồn quyền
GRANT cấp **trực tiếp cho role `anon`** (không phải qua PUBLIC): cả 13 bảng đều có
`SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER`. RLS **bật** trên cả 13,
`relforcerowsecurity=false` (không ảnh hưởng vì anon không phải owner).

### 1.2 Policy WRITE (nguyên văn, rút gọn định dạng)

| Bảng | Policy WRITE |
|---|---|
| donations | INSERT `CHECK (auth.uid() = sender_id)`; UPDATE `USING (auth.uid()=sender_id OR auth.uid()=recipient_id)` |
| user_roles | INSERT `CHECK(false)`; UPDATE `USING(false)`; DELETE `USING(false)` |
| custodial_wallets | INSERT `CHECK(false)` |
| otp_codes | **không có policy WRITE nào** ⇒ deny-all |
| wallet_challenges | ALL `USING(false)` |
| pplp_mint_requests | INSERT `CHECK(auth.role()='service_role')`; UPDATE: attester (authenticated) / admin / service_role |
| reward_approvals | INSERT `CHECK(has_role(auth.uid(),'admin'))` |
| profile_btc_aux_addresses | ALL `TO service_role USING(true) CHECK(true)` |
| blacklisted_ips | ALL `USING(EXISTS(user_roles… role='admin'))` |
| blacklisted_wallets | INSERT/DELETE `has_role(auth.uid(),'admin')` |
| notifications | INSERT `CHECK(false)`; UPDATE `auth.uid()=user_id` |
| red_envelopes | INSERT `CHECK(auth.uid()=creator_id AND is_conversation_participant(...))` |
| system_config | ALL `TO service_role USING(true) CHECK(true)` |

### 1.3 Gọi THẬT bằng anon key (PostgREST)

- **INSERT 13/13 → chặn.** 11 bảng trả `42501 new row violates row-level security policy`.
  2 bảng (`pplp_mint_requests`, `notifications`) trả `PGRST204` do bé đoán sai tên cột —
  đã kiểm tra lại: policy INSERT của 2 bảng này là `CHECK(false)` / `service_role` ⇒ vẫn chặn.
- **UPDATE 13/13 → chặn.** Test 2 vòng: (a) khoá không tồn tại, (b) **khoá của dòng có thật**,
  PATCH idempotent (đặt cột = chính giá trị hiện tại) → tất cả trả `200 []` = **0 dòng khớp
  USING**, không có dòng nào được sửa.
- **DELETE** mẫu (donations/user_roles/notifications) → `204`, 0 dòng bị xoá.

⇒ **Không bảng nào lọt.** Không phát sinh P0 khẩn.

### 1.4 Đã REVOKE (migration 25/08)
`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER … FROM anon` trên đủ 13 bảng.
Verify sau migration: cả 13 → `INSERT/UPDATE/DELETE = false,false,false`. **SELECT giữ nguyên**,
`authenticated`/`service_role` không đổi.

### 1.5 Bảng anon-write còn lại: **101** (không phải 93 — con số cũ đếm thiếu)

**Nhóm NHẠY CẢM (ưu tiên đợt sau, 41):**
`profiles`, `transactions`, `wallet_transfers`, `swap_transactions`, `financial_transactions`,
`platform_financial_data`, `platform_user_data`, `custodial`-liên quan: `wallet_custom_tokens`,
`external_wallet_labels`, `external_wallet_inclusion_overrides`, `token_ingest_filters`,
`tokens_registry`, `token_price_history`, `reconciliation_logs`, `fun_distribution_logs`,
`fun_pool_config`, `mint_epochs`, `reward_adjustments`, `red_envelope_claims`,
`oauth_clients`, `oauth_codes`, `cross_platform_tokens`, `email_verification_tokens`,
`pending_provisions`, `login_ip_logs`, `audit_logs`, `account_merge_requests`,
`did_registry`, `identity_links`, `identity_guardians`, `identity_disputes`,
`identity_recovery_log`, `identity_verification_events`, `identity_events`,
`trust_profile`, `dib_profile`, `sbt_registry`, `sbt_issuance_rules`, `soul_nfts`,
`validator_profile`, `org_members`.

**Nhóm ÍT NHẠY CẢM / cấu hình-tham số (60):** toàn bộ `pplp_*` (33 bảng gồm `pplp_v25_*`,
`pplp_v2_*`, `pplp_actions/audits/scores/policies/caps/tiers/evidences/fraud_signals/
device_registry/user_nonces/epoch_caps/action_caps`), `light_actions`, `light_reputation`,
`quest_definitions`, `quest_streaks`, `quest_user_progress`, `buddy_*` (4),
`connector_*` (4), `attestation_log`, `identity_levels`, `identity_epoch_snapshots`,
`ai_agent_profile`, `org_profile`, `chains_registry`, `i18n_languages`, `app_settings`,
`app_stats_cache`, `search_logs`, `slug_history`, `username_history`, `reserved_usernames`,
`link_preview_cache`, `friendships`, `video_downloads`, `external_tx_filter_log`,
`donations_spam_backup_20260705`.

Chưa verify runtime nhóm này theo đúng yêu cầu.

---

## PHẦN 2 — BTC

### 2.1 (Điểm 5) ❌ **CHƯA SẠCH — chưa đủ điều kiện gỡ chặn Phase 3**

Quét lại toàn repo, còn **6 file** lowercase **vô điều kiện** địa chỉ BTC (làm hỏng
checksum legacy `1…`/`3…`):

| File | Dòng |
|---|---|
| `supabase/functions/scan-btc-transactions/index.ts` | 33 (`norm()`) |
| `supabase/functions/btc-wallet-audit/index.ts` | 34 (`norm()`) |
| `supabase/functions/btc-history-repair/index.ts` | 35 (`lower()`) + 90,91,100,110,151,156,203 |
| `supabase/functions/btc-parser-v2/resolver.ts` | 19,34,56,77,99,103 |
| `supabase/functions/btc-parser-v2/classifier.ts` | 18 |
| `supabase/functions/btc-discovery-v2/index.ts` 61 + `guards.ts` 18,48 | |
| `supabase/functions/btc-ownership-reverify/index.ts` | 69,91,114,134,136,152 |
| `supabase/functions/_shared/btcProviderManager.ts` | 81,158 |
| `src/components/donations/gift-dialog/BtcWalletPanel.tsx` | 30 |

Đúng rule chỉ có 2 nơi: `btc-ownership-verify/index.ts:64` và `src/lib/btc/btcOwnershipResolver.ts:26`.

**Giảm nhẹ:** không có cron BTC nào đang chạy, và 5 cờ đều `false`
(`btc_discovery_v2_enabled`, `btc_history_ssot_enabled`, `scan_btc_v2_enabled`,
`btc_shadow_write_enabled`, `btc_ownership_reverify_enabled`) ⇒ code sai đang **ngủ**,
không hỏng thêm dữ liệu. Nhưng bật Phase 3 sẽ đánh thức chính các đường này.

### 2.2 🚨 Phát hiện chặn cứng: **Phase 1 + Phase 2 chưa từng chạy trên DB**

- `public.resolve_btc_owner` — **không tồn tại**
- `public.btc_normalize_address` — **không tồn tại**
- `public.btc_resolver_shadow_log` — **không tồn tại**

Hai file migration `20260823124512_…sql` và `20260824011216_…sql` **có trong repo nhưng chưa
được apply**. Các test hiện tại chỉ là *offline snapshot đọc file .sql*, nên xanh mà không
chứng minh gì về DB thật.

⇒ (Điểm 7) **Đồng hồ shadow-log 31/08 là ảo**: không có bảng ⇒ 0 dòng log ⇒ sẽ không có
divergence report. Cần apply 2 migration rồi mới bắt đầu đếm 7 ngày quan sát lại từ đầu.
(`tx_shadow_diffs` tồn tại nhưng cũng **0 dòng**.)

### 2.3 (Điểm 6) Phạm vi Phase 3 — luồng cần chuyển sang `resolve_btc_owner`

**A. Ghi giao dịch MỚI (bắt buộc, đường nóng):**
1. `record-donation` — gán `sender_id`/`recipient_id` khi user bấm xác nhận.
2. `scan-btc-transactions` — scanner BTC chính (`norm()` sai).
3. `btc-parser-v2/resolver.ts` — lõi attribution v2, 6 chỗ lowercase sai.
4. `wallet-reconciliation-cron` — đã vá lowercase, còn dùng map địa chỉ→user tự dựng.
5. `manual-create-donation` — đường admin nhập tay.

**B. Backfill/sửa lịch sử (chạy lại sau khi A đúng):**
`btc-history-repair`, `btc-discovery-v2`, `btc-wallet-audit`, `recover-donations-from-chain`,
`backfill-tx-donations`, `backfill-donations`, `backfill-outgoing-donations`,
`backfill-donations-to-transactions`.

**C. Không đụng:** `auto-scan-donations`, `fast-scan-donations`, `scan-treasury-*`,
`scan-my-incoming`, `scan-wallet-recover` (EVM-only).

**Thứ tự đề xuất:** apply 2 migration → vá 6 file lowercase → bật shadow-write 7 ngày →
đọc divergence → mới wiring nhóm A.

---

## PHẦN 3 — BSC

### 3.1 Việc #2 — đo gap M6B không timeout

**Nguyên nhân timeout:** query gap hiện tại quét toàn bộ `v_unified_transactions`
(**67.000 dòng**, hợp từ 4 bảng: donations 62.368 / wallet_transfers 3.423 /
transactions 1.117 / swap_transactions 92) và join on-chain trong 1 lượt.

**Cách đo mới (đề xuất, chưa code):** chia lô theo **(token_symbol × tháng)**.
Phân bố thực tế cho thấy lô lớn nhất là `CAMLY 2026-04 = 14.152` dòng, các lô còn lại
đều < 6.000; đa số < 2.000:

| Tháng | CAMLY | USDT | BNB | FUN | BTC |
|---|---|---|---|---|---|
| 2026-08 | 1.749 | 1.136 | 242 | 364 | 5 |
| 2026-07 | 1.963 | 1.353 | 500 | 284 | 13 |
| 2026-06 | 3.821 | 1.380 | 1.076 | 419 | 180 |
| 2026-05 | 5.558 | 866 | 1.575 | 1.586 | 136 |
| 2026-04 | 14.152 | 2.898 | 932 | 1.375* | — |

Thiết kế: bảng `m6b_gap_scan_batches(token_symbol, month, status, rows_scanned,
gap_found, last_error, updated_at)`; edge function xử lý **1 lô/lần**, có `job_leases`
single-flight; lô > 8.000 dòng tự cắt đôi theo nửa tháng. Kết quả cộng dồn ⇒ ra quy mô
gap thật (thay cho con số whitelist 295 vs báo cáo gốc 29 — hai con số này đo trên
2 tập khác nhau nên không so sánh được).

### 3.2 Việc #3 — Export Excel sai số liệu **ngay lúc này**

Xác nhận: `src/utils/export/*` không hề tham chiếu `v_unified_transactions`
(grep 0 kết quả); consumer (`DonationHistoryAdminTab`, `ClaimHistoryModal`,
`HistoryTab`, `WalletTransactionHistory`, `TransactionExportMenu`) nhận rows từ hook đọc
thẳng `donations` / `reward_claims`.

**Sai số cụ thể đang xảy ra:**

| Chỉ số | Export hiện tại (donations) | Đúng (v_unified_transactions) | Lệch |
|---|---|---|---|
| Tổng bản ghi | 32.202 dòng | 67.000 dòng | **−34.798** |
| Chân giao dịch từ donations | 32.202 | 62.368 (2 chân gửi/nhận) | thiếu chân đối ứng |
| Chuyển ví (`wallet_transfers`) | 0 | 3.423 | **mất trắng** |
| Giao dịch on-chain (`transactions`) | 0 | 1.117 | **mất trắng** |
| Swap (`swap_transactions`) | 0 | 92 | **mất trắng** |

⇒ Một file export "lịch sử giao dịch" của user hiện **bỏ sót 4.632 chuyển động** ngoài
donations, và chỉ hiện 1 chân thay vì 2 chân của mỗi khoản quà.

**Fix đề xuất (chưa code):** thêm hook `useUnifiedTransactionsExport` đọc
`v_unified_transactions` (lọc `user_id`, `occurred_at`), map qua `mapRows.ts` với cột
`source_table`/`direction`/`counterparty_user_id`; giữ `maskPii` + `export_audit_logs`
như hiện tại. Không đổi UI.
