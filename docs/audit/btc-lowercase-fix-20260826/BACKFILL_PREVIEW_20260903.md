# BTC ownership backfill — PREVIEW (dry-run, CHƯA ghi) — 2026-09-03

Nguồn: 30 địa chỉ mismatch (`resolver_user_id IS NULL`) trong cửa sổ quan sát
26/08 17:06 → 02/09 17:06 UTC.

## 1. Địa chỉ aux duy nhất — source = `manual`, KHÔNG backfill lần này

| address | user | source | first_seen_tx | ghi chú |
|---|---|---|---|---|
| `bc1q52js9rlq5ad5qvs2fj5mnn6d69rkqr2epf70ud` | father | **manual** | NULL | Không phải `hd_input_back` (đúng RC-10 không vi phạm), nhưng cũng **không** phải `hd_change_auto`/`hd_cluster`. Đây là dòng admin nhập tay 21/06/2026 (mem `identity/father-btc-wallet`), `first_seen_tx` NULL ⇒ **không có bằng chứng on-chain tự thân**. Chỉ có 2 donation BTC khớp father. ⇒ **TÁCH RIÊNG, chờ Cha xác nhận trực tiếp ví father.** |

Toàn bảng `profile_btc_aux_addresses` có 1.707 dòng, trong đó `manual` = 1 (chính dòng này); 1.706 dòng còn lại là HD auto và **không** nằm trong 30 địa chỉ nghi vấn.

## 2. Cơ chế khai địa chỉ ở `profiles.btc_address` (29 địa chỉ)

- `btc_ownership_challenges`: **0 dòng toàn bảng**, `used_at IS NOT NULL` = 0
  ⇒ luồng ký BIP-322 (`btc-ownership-verify`) **chưa từng được người dùng nào chạy**.
- ⇒ **Không có địa chỉ nào có bằng chứng ký xác thực.** Cả 29 đều là **tự khai qua
  `EditProfile`** (hiện đã bị `BTC_ADDRESS_LOCKED` chặn ghi, `EditProfile.tsx:346-351`).
- Vì không tồn tại nhánh "có ký", việc "ưu tiên nhánh ký trước" là **vô nghiệm**;
  Lovable dùng **bằng chứng thay thế: giao dịch BTC on-chain đã ghi nhận khớp `user_id`**
  (`donations.token_symbol='BTC'` có địa chỉ ở `sender_address`/`recipient_address`
  **và** user là `sender_id`/`recipient_id`).

## 3. Phân tầng theo bằng chứng on-chain

| Tầng | Số địa chỉ | Kết luận |
|---|---|---|
| **A** — ≥ 3 donation BTC khớp user | **26** (đều `profiles.btc_address`) | **Đủ điều kiện backfill an toàn** |
| **B** — 1–2 donation khớp user | 3 main (`camlyd` 2, `phamluong68` 2, `angelbichvan` 1) | Bằng chứng mỏng ⇒ **hoãn**, chờ thêm giao dịch hoặc Cha xác nhận |
| **B-aux** — aux `manual` father, 2 donation | 1 | Hoãn (mục 1) |
| **C** — 0 bằng chứng | 0 | — |

⇒ **Danh sách backfill an toàn: đúng 26 địa chỉ**, KHÔNG phải 30.

## 4. Bảng dry-run (26 dòng sẽ INSERT vào `btc_address_ownership_history`)

`verification_method = 'admin_manual'`, `valid_to = NULL`,
`verified_at = thời điểm donation BTC khớp user đầu tiên` (giữ đúng ngữ nghĩa
sở-hữu-theo-thời-gian, không backdate quá mốc có bằng chứng),
`evidence_ref = 'backfill_20260903: profiles.btc_address + N BTC donations khớp user_id, first_tx YYYY-MM-DD'`.

| # | user | address | donations | verified_at (đề xuất) |
|---|---|---|---|---|
| 1 | angelthanhtien | bc1ptz7r9scz…phtfw | 48 | 2026-04-04 18:21 |
| 2 | angelquan | bc1p7etam62…m3mm | 46 | 2026-04-04 18:09 |
| 3 | angelkim | bc1prndhwz6…dylxu | 40 | 2026-04-03 13:31 |
| 4 | angelkhanhi | bc1qe4nzjar…lxkr | 19 | 2026-04-06 18:14 |
| 5 | leminhtri | bc1qfdx27jq…mepw | 19 | 2026-04-03 04:28 |
| 6 | angelquangvu | bc1q7n89gq0…hhxw | 19 | 2026-04-02 18:26 |
| 7 | angelgiau | bc1q0wmq7ev…7flf | 19 | 2026-04-04 03:00 |
| 8 | father | bc1qgxf7c63…a8sv | 17 | 2026-04-10 19:03 |
| 9 | angel_vinhnguyen | bc1qzlfcxsr…vnq9 | 15 | 2026-04-06 04:49 |
| 10 | angelnguyenhoa | bc1qca964ad…w3l8 | 14 | 2026-04-04 16:21 |
| 11 | angellam | bc1qq3mf47x…4f9c | 13 | 2026-04-04 03:45 |
| 12 | phuongloan | bc1qf9a79pj…5z8e | 11 | 2026-04-06 17:08 |
| 13 | lanchi68 | bc1qaual39w…dqlq | 9 | 2026-04-06 10:48 |
| 14 | tunguyen | bc1qmydvplu…fjuf | 7 | 2026-04-06 17:14 |
| 15 | angelanhnguyet | bc1q25fyhp0…3f5m | 7 | 2026-04-04 06:21 |
| 16 | murphy358 | bc1p48uc3kv…q39f | 7 | 2026-04-06 08:29 |
| 17 | funtreasury | bc1q8t7eumw…4fxq | 7 | 2026-04-03 |
| 18 | angel_thuytram | bc1q6qkyzur…axew | 6 | 2026-04-08 |
| 19 | angelthuongchieu | bc1p6e94sz5…fr4p | 6 | 2026-04-08 |
| 20 | angelthanhthuy | bc1q652xrek…g4wj | 5 | 2026-04-06 |
| 21 | quyentran6868 | bc1qwzvu54z…2lq6 | 5 | 2026-04-06 |
| 22 | hoanghien | bc1qdwxwqux…3mx2 | 5 | 2026-04-11 |
| 23 | angelquynhhoa | bc1qq7cjcc7…eq07 | 5 | 2026-04-06 |
| 24 | angelkimngan | bc1qmtxkkha…9a78 | 4 | 2026-04-04 |
| 25 | angelngoctran | bc1py4es4ga…qerz | 4 | 2026-04-11 |
| 26 | angelthuat | bc1q9kf3er3…zwww | 3 | 2026-04-15 |

Trạng thái hiện tại: `btc_address_ownership_history` = **0 dòng**,
`btc_ownership_snapshot` = **0 dòng** ⇒ INSERT thuần additive, không đụng dòng cũ.

## 5. Câu 4 — 5 call_site "im lặng": đã kiểm chứng bằng log invocation thật

| Edge function | Log trong cửa sổ | Kết luận |
|---|---|---|
| `btc-wallet-audit` | **No logs** | Không có traffic — luồng admin gọi tay |
| `btc-history-repair` | **No logs** | Không có traffic |
| `btc-parser-v2` | **No logs** | Không có traffic |
| `btc-discovery-v2` | **No logs** | Không có traffic |
| `btc-ownership-reverify` | **CÓ invocation** (cron `btc-ownership-reverify-auto-resume`, `*/5 * * * *`, chỉ `booted`/`shutdown`) | **KHÔNG phải lỗi wiring**: cron gọi `action=cron_auto_resume`, nhánh này thoát sớm ở `no_run`/`no_summary` (index.ts:234/239) **trước** mọi `dispatchBtcResolverShadowLog` (:375/:427/:521/:582). Chỉ ghi shadow log khi có run dry-run/enforce thật do admin khởi tạo. |

⇒ "Coverage chưa đủ 7 điểm" là do **thiếu traffic hợp lý**, không phải log bị nuốt.
Muốn phủ 7 điểm phải chủ động chạy 1 dry-run của từng luồng admin trong cửa sổ mới.

## 6. Câu 5 — dedup notification: ĐÃ SỬA (không chờ Phase 3)

- Xoá trùng: 238 → **35 dòng** (7 admin × 5 ngày, đúng 1/ngày/admin).
- `CREATE UNIQUE INDEX uq_notif_btc_shadow_alert_daily ON notifications(user_id, type, ((created_at AT TIME ZONE 'UTC')::date)) WHERE type='btc_shadow_priority_alert'`.
- `fn_btc_shadow_log_priority_notify()`: bỏ `NOT EXISTS`, dùng `ON CONFLICT … DO NOTHING`
  (cùng pattern `swap_failures`/`treasury_flows`) ⇒ atomic, không rò khi nhiều row-trigger
  chạy trong cùng statement.

## 7. Chờ duyệt

Confirm ghi thật 26 dòng ⇒ sau đó mở **cửa sổ quan sát 7 ngày MỚI** (không chồng lấn),
mục tiêu `is_match=false ≤ 1%`, đồng thời chạy tay 1 dry-run cho 4 luồng admin còn im lặng.
