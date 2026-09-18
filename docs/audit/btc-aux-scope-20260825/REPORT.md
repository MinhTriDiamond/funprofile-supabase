# Điều tra phạm vi auto-learn `profile_btc_aux_addresses` + tồn đọng quyền `anon`
Ngày 25/08/2026 — **CHỈ ĐỌC/QUERY. Không void, không ghi, không tự xác thực quyền sở hữu.**

---

## 1. Cơ chế auto-learn — code thật

**Không có trigger DB nào.** Toàn bộ việc gán 1 địa chỉ BTC vào profile user là **code
ứng dụng** trong edge function `btc-wallet-audit` (BFS on-chain), ghi bằng `service_role`.
Scanner `scan-btc-transactions` hiện **chỉ đọc** aux (không còn học).

### 1.1 Hàm `learn()` — `supabase/functions/btc-wallet-audit/index.ts:174-201`

```ts
const HD_INPUT_BACK_ENABLED = Deno.env.get("BTC_HD_INPUT_BACK_ENABLED") === "1";

function learn(addr: string, source: string, txid: string) {
  if (source === "hd_input_back" && !HD_INPUT_BACK_ENABLED) {
    console.log(`[audit] FROZEN hd_input_back skip addr=${addr} tx=${txid}`);
    return false;
  }
  const n = norm(addr);                       // norm = toLowerCase().trim()
  if (owned.has(n)) return false;
  const existingOwner = internalBtc.get(n);
  if (existingOwner && existingOwner !== targetUserId) return false;  // conflict guard duy nhất
  owned.add(n);
  internalBtc.set(n, targetUserId);
  newlyLearned.push({ address: addr, source, first_seen_tx: txid });
  ...
}
```

Điều kiện chặn **chỉ có 2**: (a) `hd_input_back` bị freeze bằng env, (b) địa chỉ chưa thuộc
user nội bộ khác. **Không có** ngưỡng `tx_count`, không có ngưỡng số dư, không có blacklist sàn.

### 1.2 Ba nhánh học — `index.ts:230-273`

```ts
// === FORWARD ===  (source = hd_change_auto)
if (anyInputOwned && outputs.length >= 2) {
  for (const o of outputs) {
    if (owned.has(o.addr)) continue;
    const otherOwner = internalBtc.get(o.addr);
    if (otherOwner && otherOwner !== targetUserId) continue;
    if (learn(o.raw, "hd_change_auto", tx.txid)) nextFrontier.add(o.addr);
  }
}

// === COMMON-INPUT CLUSTERING === (source = hd_cluster)
if (anyInputOwned && inputAddrs.length > 1) { ... learn(rawIn, "hd_cluster", tx.txid) ... }

// === BACKWARD (CHANGE HEURISTIC) === (source = hd_input_back)
if (!anyInputOwned && inputAddrs.length === 1 && outputs.length >= 2) {
  ... if (maxOwnedVal >= 2 * maxOtherVal) learn(rawIn, "hd_input_back", tx.txid) ...
}
```

Nhánh FORWARD là nguy hiểm nhất: **mọi output không map user nội bộ khác đều bị coi là
"change của user"** — tức là địa chỉ người nhận thật (kể cả ví sàn) bị nhận làm ví của user.
Bộ lọc duy nhất: `tx.vin.length > 5 → continue` (`index.ts:219`).

### 1.3 Ghi vào bảng — `index.ts:281-292`

```ts
if (WRITE_ENABLED && newlyLearned.length > 0) {
  for (const row of newlyLearned) {
    await admin.from("profile_btc_aux_addresses").upsert({
      user_id: targetUserId, address: row.address,
      source: row.source, first_seen_tx: row.first_seen_tx,
    }, { onConflict: "address" });
  }
}
```

`WRITE_ENABLED` = RPC `btc_wallet_audit_write_enabled()` (kill-switch
`app_settings.btc_wallet_audit_write_enabled`) — **hiện đang tắt**, nên không phát sinh dòng mới.

### 1.4 Hệ quả: aux **KHÔNG verified** vẫn được dùng ở nhiều nơi
- `scan-btc-transactions:207` lọc `verified=true` ✔ (đã vá sau sự cố 12/06).
- Nhưng `btc-wallet-audit:135`, `wallet-reconciliation-cron:151`, `btc-history-repair:95`,
  `usePublicDonationHistory.ts:352`, `useWatchedWallets.ts:41` đọc aux **không lọc verified**
  (một số chỉ lọc `disabled_at`) ⇒ vòng suy luận vẫn còn tự nuôi chính nó.

---

## 2. Bằng chứng "địa chỉ công khai/sàn"

Quét lại on-chain (`mempool.space /api/address/{addr}`, chỉ số `chain_stats`) — **mempool.space
chặn tốc độ giữa đợt**, nên đây là **mẫu 299/1.707 địa chỉ (17,5%)**, không phải toàn bộ.

| Địa chỉ | User bị gán | source | tx_count | tổng nhận (funded) |
|---|---|---|---|---|
| `35C2L1pCgwzBHNcDcVL1a5RuoefeWqyjAR` | angelhoangtydo | hd_input_back | **561.308** | 29.820 BTC |
| `bc1q0qfzuge7vr5s2xkczrjkccmxemlyyn8mhx298v` | trogiauco | hd_input_back | **403.516** | **1.024.883 BTC** |
| `bc1q7dmjqztn342e7qyl4tlfyqc8mju8ny7me8vm4n` | angelthuha | hd_change_auto | **399.328** | 67.802 BTC |
| `bc1qujepl0k5n0ga2e86yskvxa6auehpf6dlf84dx0` | angelthuha | hd_input_back | 229.408 | 88.397 BTC |
| `3KMmeqPeQcngyTehdfSwsGqvxfU7J7qtc8` | trogiauco | hd_input_back | 129.321 | 22.673 BTC |
| `bc1qqz623jyqdsh2w5y5kdmzk2ws6mzr2mt2etv5gx` | trogiauco | hd_input_back | 127.041 | 207.831 BTC |
| `1KbDEg1tDz2ErYgaDbaDhhawnLrSQFaFx5` | angelkim | hd_input_back | 53.227 | **1.526.803 BTC** |
| `bc1qhnzy8cd0ufxqv7tsy7graj7k2fr4h3a9gyf7yq9m` | angelthuha | hd_input_back | 39.444 | 8.367 BTC |
| `bc1qsyy7f38p9y46r5w7ja57nxsn7245eggskezray` | angelkim | hd_change_auto | 29.963 | 8.044 BTC |
| `15DomY3arDPw5jD658Mbf3AY3wT3YCDmW2` | angelkim | hd_change_auto | 13.773 | 588.421 BTC |

**Luận cứ (không cần danh sách sàn):**
- Ví cá nhân HD gần như không bao giờ vượt vài trăm tx. Các dòng trên có 10.000–560.000 tx,
  hoạt động liên tục tới hôm nay ⇒ đặc trưng **hot wallet sàn / dịch vụ**.
- Khối lượng nhận 588.000–1.526.000 BTC (≈ 40–100 tỷ USD) **lớn hơn toàn bộ tài sản của hệ sinh
  thái nhiều bậc** ⇒ không thể là ví user.
- Đợt trước đã thấy dấu hiệu tương tự: 207/357 địa chỉ chạm mốc 50 tx gần nhất của API.

Tỷ lệ nghi vấn trong mẫu (ngưỡng `tx_count > 20` **hoặc** nhận > 1 BTC — chính là ngưỡng
guard đã đặc tả trong `DISCOVERY_SPEC.md` §3): **117/299 = 39,1%**.

---

## 3. Phạm vi thật: TOÀN HỆ THỐNG, không chỉ 7 user

| Chỉ số | Giá trị |
|---|---|
| Tổng dòng `profile_btc_aux_addresses` | **1.707** |
| Đang active (`disabled_at IS NULL`) | **1.630** |
| Số user bị gán aux | **28** (không phải 7) |
| Dòng `verified = true` | **1** (duy nhất, source `manual`, của father) |
| `hd_change_auto` | 995 dòng / 18 user |
| `hd_input_back` | 711 dòng / 27 user |
| Khoảng ghi | 11/06/2026 → 21/06/2026 |

Top user: angelkim 546, angelhoangtydo 567, angelthuha 340, angelthienhanh68 42, trogiauco 48,
angelutopia 34, angelanhnguyet 15, angelgiau 11, angelkhanhi 11, angelnguyenhoa 11,
phuongloan 10, sinhhoatlovehouseycha 10, angelthanhtinh 7, angelqueanh 7, angelhiep 6,
wallet_0x50ebe82ce05adf3dd 6, ngocphuong 5, tunguyen 5, trianaresa4g272q 4, angelthutrang 4,
hoangtydo2222 4, vothanhviet 3, father 3, angelngoctran 2, + 4 user nhỏ khác.

**Ước lượng quy mô nghi vấn (ngoại suy từ mẫu 17,5%):** ≈ **39% × 1.630 ≈ 630–670 dòng**
mang đặc điểm nghi vấn, tập trung ở 4 user (angelhoangtydo, angelkim, angelthuha, trogiauco —
53/32/28/4 dòng nghi vấn trên mẫu tương ứng). Các user còn lại trong mẫu: **0 dòng nghi vấn**
(mẫu nhỏ, chưa kết luận).

⚠️ Con số 355 "ví aux legacy" ở đợt trước **chỉ là tập con lọc theo prefix `1…/3…`**. Phạm vi
thật là **1.630 dòng / 28 user**, gồm cả bech32.

---

## 4. Đối chiếu chéo: có ảnh hưởng BXH/donation công khai

**Có.** Aux nghi vấn đang là `sender_address` của các donation đã hiển thị.

### 4.1 Đang tính vào BXH Benefactor (bộ lọc thật của `get_benefactor_leaderboard`)

| sender hiển thị | dòng | USD đang tính BXH | khung thời gian |
|---|---|---|---|
| father | 3 | **500.644,49** | 11–14/06/2026 |
| angelutopia | 14 | 3.581,30 | 15/01–11/04/2026 |
| sinhhoatlovehouseycha | 2 | 1.267,03 | 08–10/04/2026 |
| angelthuha | 2 | 876,86 | 06–11/04/2026 |
| ngocphuong | 1 | 578,41 | 08/04/2026 |
| angelhiep | 2 | 261,65 | 07–09/04/2026 |
| angelhoangtydo | 2 | 136,47 | 06/04/2026 |
| angelkhanhi | 1 | 50,38 | 08/04/2026 |
| angelthienhanh68 | 1 | 20,70 | 06/04/2026 |
| **Tổng** | **28** | **≈ 507.417** | |

2 dòng lớn nhất:

| tx | sender→recipient | số tiền | USD | aux source | verified |
|---|---|---|---|---|---|
| `aad8a032796fbf…` | father → angeldieungoc | 5 BTC | 307.462,57 | **hd_input_back** | ❌ false |
| `522eaf08489949…` | father → leminhtri | 3 BTC | 193.132,73 | manual | ✔ true |

⇒ Khoản **307.462,57 USD** của father đang dựa trên đúng heuristic `hd_input_back` đã bị
**freeze vĩnh viễn** (RC-10). Đây là dòng cần Cha quyết riêng.

### 4.2 Hiện diện ngoài BXH (lịch sử donation công khai)
Tổng cộng aux đang khớp `sender_address` của **192 donation confirmed** thuộc 26 user
(≈ 1,12 triệu USD danh nghĩa), phần lớn đã ở trạng thái `external_excluded` /
`external_to_father` nên không vào BXH, nhưng **vẫn hiển thị trong lịch sử** và vẫn dùng aux
để resolve counterparty (`usePublicDonationHistory.ts:352`, không lọc `verified`).
Thêm 1 dòng `recipient_address` = aux của father: 737.716,32 USD (`external_to_father`).

⇒ **Đề xuất gộp vào phạm vi Track A / RC8**, chờ Cha quyết. Chưa thay đổi gì.

---

## 5. Trạng thái hành động
Không void, không ghi, không tự xác thực. Kill-switch `btc_wallet_audit_write_enabled` vẫn
tắt nên bảng không phát sinh dòng mới trong lúc chờ quyết định.

---

## 6. Bảng còn cấp quyền `anon` — liệt kê & phân loại (chưa xử lý)

Số liệu runtime hôm nay: **175 bảng public** còn `anon` có `SELECT`.
Trong đó **106 bảng `anon` vẫn còn cả INSERT/UPDATE/DELETE** (chỉ có RLS chắn), và
**10 bảng có grant `anon` nhưng KHÔNG có policy nào cho anon/public** (grant chết).

### 6.1 Nhóm A — công khai đúng thiết kế (policy `USING (true)` phục vụ khách xem)
`comments`, `reactions`, `post_attachments`, `post_tags`, `reels`, `reel_likes`,
`reel_comments`, `reel_comment_likes`, `reel_shares`, `reel_views`, `stickers`,
`sticker_packs`, `live_replays`, `live_comments`, `live_messages`, `live_reactions`,
`live_co_hosts`, `streams`, `i18n_languages`, `chains_registry`, `tokens_registry`,
`token_price_history`, `link_preview_cache`, `app_stats_cache`, `slug_history`,
`username_history`, `reserved_usernames`, `quest_definitions`, `buddy_daily_quests`,
`pet_battle_leaderboard`, `pet_battle_seasons`, `pet_cheers`, `pet_cosmetics_catalog`,
`pet_shop_config`, `pet_voice_lines`, `mystery_box_shop_config`, `soul_nfts`
(`is_minted = true`), `identity_levels`, `did_registry`, `trust_profile`,
`sbt_registry`, `sbt_issuance_rules`, `identity_epoch_snapshots`, `org_profile`,
`org_members`, `ai_agent_profile`, `validator_profile`, `dib_profile`, `light_reputation`
— nhóm này phục vụ trang khách + `identity-did-resolve`.

### 6.2 Nhóm B — tên nghe nhạy cảm nhưng vẫn mở cho anon đọc (**cần CTO soát**)
| Bảng | Policy cấp anon | Điều kiện |
|---|---|---|
| `donations` | `Donations are viewable by everyone` | `true` |
| `transactions` | (anon SELECT + policy public) | cần soát |
| `system_config` | `Anyone can read system config` | `true` |
| `profile_btc_aux_addresses` | `Public can read aux btc addresses` | `true` |
| `external_wallet_labels` | `Anyone can view external wallet labels` | `true` |
| `light_actions`, `pplp_actions`, `pplp_scores`, `pplp_audits`, `pplp_evidences`, `pplp_user_tiers`, `pplp_user_caps`, `pplp_epoch_caps`, `pplp_fraud_signals`, `pplp_device_registry`, `pplp_policies`, `pplp_v2_*`, `pplp_v25_*` (18 bảng) | policy public read | `true` |
| `fun_distribution_logs`, `fun_pool_config`, `mint_epochs`, `token_ingest_filters` | public read | `true` |
| `reconciliation_logs`, `financial_transactions`, `platform_financial_data`, `custodial_wallets`, `cross_platform_tokens`, `login_ip_logs`, `oauth_codes`, `pplp_user_nonces` | chỉ policy `service_role` | ✅ thực tế khách **không** đọc được |
| `otp_codes`, `email_verification_tokens`, `wallet_challenges`, `app_settings`, `pending_provisions`, `identity_verification_events` | policy `false` (deny all) | ✅ khoá, nhưng grant vẫn còn (nên gỡ) |

### 6.3 Nhóm C — grant `anon` chết (không policy nào cho anon)
`creator_library`, `video_upload_sessions`, `mystery_box_definitions`,
`mystery_box_inventory`, `mystery_box_rewards`, `mystery_box_open_log`,
`mystery_box_grant_audit`, `mystery_box_premium_grants`, `mystery_box_risk_log`,
`mystery_box_stats_daily` — revoke là no-op hành vi.

### 6.4 Rủi ro nổi bật cần CTO biết
106 bảng còn `anon` INSERT/UPDATE/DELETE, gồm những cái tên đáng chú ý:
`donations`, `transactions`, `notifications`, `user_roles`, `otp_codes`,
`wallet_challenges`, `custodial_wallets`, `pplp_mint_requests`, `reward_approvals`,
`red_envelopes`, `system_config`, `blacklisted_ips`, `blacklisted_wallets`,
`profile_btc_aux_addresses`. Hiện chỉ RLS chắn ⇒ **một policy WRITE lỏng ở bất kỳ bảng nào
trong nhóm này là lỗ hổng trực tiếp**. Danh sách đầy đủ ở `evidence/anon_privs.tsv`.

---

## 7. Trước khi đổi `ALTER DEFAULT PRIVILEGES`

**Có** trường hợp FE gọi thẳng bảng bằng anon key và **đó là thiết kế đúng** — không thể đổi
default rồi bỏ qua:

- Trang khách (chưa đăng nhập) đọc trực tiếp: `posts`, `comments`, `reactions`,
  `post_attachments`, `post_tags`, `reels` + 5 bảng phụ reels, `live_replays` +
  `live_comments/messages/reactions/co_hosts`, `stickers`, `sticker_packs`,
  `profiles`/`public_profiles`.
- Cấu hình/tra cứu công khai: `tokens_registry`, `chains_registry`, `token_price_history`,
  `i18n_languages`, `system_config`, `app_stats_cache`, `link_preview_cache`,
  `slug_history`, `username_history`, `reserved_usernames`.
- Trang Benefactors / lịch sử công khai: `donations` (+ `profile_btc_aux_addresses` để
  resolve counterparty), `light_actions`, `light_reputation`.
- Trang Identity công khai + `identity-did-resolve`: `did_registry`, `trust_profile`,
  `sbt_registry`, `identity_levels`, `org_profile`, `org_members`, `validator_profile`,
  `ai_agent_profile`, `dib_profile`, `identity_epoch_snapshots`.
- Quest/Pet công khai: `quest_definitions`, `pet_*` (7 bảng), `mystery_box_shop_config`.
- Ngoại lệ ghi có chủ đích: `video_downloads` (`anon` chỉ `SELECT,INSERT`, đã revoke
  UPDATE/DELETE ở B4 P2).

⇒ Kết luận: **không thể** khẳng định "mọi truy cập public đều đi qua edge function".

**Đề xuất (chờ CTO duyệt riêng, chưa chạy):**
```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
```
Kèm bắt buộc: mỗi migration tạo bảng public-facing phải tự `GRANT SELECT … TO anon`
(đúng quy ước GRANT hiện hành), cộng 1 test guard trong `src/__tests__` khẳng định danh sách
bảng công khai ở mục 7 vẫn còn `anon SELECT` sau khi đổi default. Các bảng đang có sẵn grant
**không** bị ảnh hưởng (default privileges chỉ áp cho bảng tạo mới).

---

## Ghi chú phương pháp
- Toàn bộ số liệu DB lấy runtime hôm nay (`psql` read-only + read_query).
- Số liệu on-chain: mẫu 299/1.707 địa chỉ; mempool.space chặn tốc độ khi quét tiếp
  (request treo > 60s). Cần quét nốt 1.408 địa chỉ qua nguồn thứ hai (blockstream.info)
  hoặc trải dài nhiều giờ nếu Cha muốn số tuyệt đối thay vì ngoại suy.
