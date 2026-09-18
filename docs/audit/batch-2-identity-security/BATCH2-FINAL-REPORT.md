# Batch 2 — BÁO CÁO CUỐI (chốt sổ 2026-08-16)

## 0. Việc 1 — `get_all_claim_history()`: RÀ VÀ GIỮ NGUYÊN

Cha chốt **phương án (a)**: giữ công khai, khớp nguyên tắc "công khai = đã hoàn tất"
(ví + số CAMLY đã rút là dữ liệu đã hoàn tất, dùng cho Bảng Vinh Danh công khai).

- **Không thay đổi code, không thay đổi ACL.** Hàm vẫn cho `anon` gọi.
- Ghi nhận chính thức tại `.lovable/memory/policy/public-claim-history-intentional.md`
  và trong security memory ⇒ scanner/agent các đợt sau **không được coi đây là lỗ hổng**.

---

## 1. Việc 2 — Đối chiếu ví cho `claim-reward` (nợ P2) — XONG

### Thiết kế
Không chặn cứng. Nếu ví yêu cầu rút **khác** `profiles.public_wallet_address`
(hoặc profile chưa có ví hợp lệ để đối chiếu):

1. Edge ghi `console.warn` + insert `pplp_fraud_signals` (`CLAIM_WALLET_MISMATCH`, severity 2).
2. `audit_logs.details` của `CLAIM_REQUEST` thêm `registered_wallet` + `wallet_match`
   (`match | mismatch | no_registered_wallet`).
3. UI admin (`RewardApprovalTab` → tab "Lệnh Claim chờ duyệt") hiện badge đỏ
   **"Ví khác với ví đăng ký"** + dòng ví đăng ký để admin đối chiếu bằng mắt.

Đây là **lớp phòng thủ bổ sung**, không thay bước admin duyệt.

### Raw evidence — code
`supabase/functions/claim-reward/walletMatch.ts` (module thuần, dùng chung logic với FE):

```ts
export function compareClaimWallet(requestedWallet, registeredWallet): WalletMatchResult {
  const requested = (requestedWallet ?? '').trim().toLowerCase();
  const regRaw = (registeredWallet ?? '').trim();
  const registered = EVM_RE.test(regRaw) ? regRaw.toLowerCase() : null;
  if (!registered) return { matches: false, unknownRegistered: true, registered: null, requested, flag: 'no_registered_wallet' };
  const matches = registered === requested;
  return { matches, unknownRegistered: false, registered, requested, flag: matches ? 'match' : 'mismatch' };
}
```

`supabase/functions/claim-reward/index.ts` (bước 7b-bis, sau khi validate ví profile):

```ts
const walletMatch = compareClaimWallet(wallet_address, profile.public_wallet_address);
if (!walletMatch.matches) {
  console.warn(`[claim-reward] wallet ${walletMatch.flag} for user ${userId}: ...`);
  await supabaseAdmin.from('pplp_fraud_signals').insert({
    actor_id: userId, signal_type: 'CLAIM_WALLET_MISMATCH', severity: 2,
    details: { requested_wallet: ..., registered_wallet: ..., flag: walletMatch.flag },
    source: 'claim-reward',
  });
}
// ... audit_logs.details: { ..., registered_wallet, wallet_match: walletMatch.flag }
```

FE: `src/lib/claimWalletMismatch.ts` (`isClaimWalletMismatch`) + badge trong
`src/components/admin/RewardApprovalTab.tsx`; `loadPendingClaims()` bổ sung
`public_wallet_address` vào select profiles.

### Raw evidence — test
`src/__tests__/claim-wallet-mismatch-guard.test.ts` — **9/9 pass**, gồm cả 2 trường hợp
Cha yêu cầu (khớp / không khớp), khớp-khác-hoa-thường, thiếu ví đăng ký, và test
đồng nhất kết luận giữa FE và edge.

---

## 2. Việc 3 — Hoàn tất Mục 4 (P2 còn lại) — XONG

### 2.1 `record-swap`
`supabase/functions/record-swap/validateSwapInput.ts` (mới), thay toàn bộ
`Number(body.from_amount)` cũ:

- `tx_hash`: `^0x[0-9a-f]{64}$` sau lowercase.
- `chain_id`: chỉ 56 / 97, phải là integer.
- symbol: `^[A-Z0-9]{2,12}$`, không được trùng nhau.
- **Số lượng: BigInt string-based** theo decimals từng token (`FUN/USDT/BNB` 18,
  `CAMLY` 3, mặc định 18); chặn ký hiệu khoa học, NaN/Infinity, ≤ 0, quá decimals,
  vượt trần 1e12 token.
- USD: ≤ 2 số thập phân, không âm, ≤ 1e9.
- `dex_provider` ≤ 32 ký tự, `quote_id` ≤ 64 ký tự (validate + báo 400 thay vì `slice()` âm thầm).

**Đề xuất xử lý "USD client tự khai" — CHỜ CTO DUYỆT, chưa code:**
Hiện `from_amount_usd`/`to_amount_usd` vẫn do client gửi và được lưu nguyên. Ba phương án:

| PA | Nội dung | Ưu / nhược |
|---|---|---|
| **A (đề xuất)** | Bỏ hoàn toàn USD từ client; server tự tra `token_price_history` tại `block_timestamp` của tx (đúng pattern đã dùng cho `donations`), thiếu giá ⇒ ghi `NULL` + hàng chờ backfill | Đúng chuẩn nguồn giá duy nhất, khớp chính sách "bỏ fallback hardcode"; cần sửa logic + backfill dữ liệu cũ |
| B | Giữ USD client nhưng **đối soát**: lệch > 5% so với `token_price_history` ⇒ ghi `usd_source='client_unverified'` + fraud signal | Ít thay đổi, vẫn có cờ; dữ liệu vẫn có thể sai trong ngưỡng 5% |
| C | Giữ nguyên (chỉ validate input như đã làm) | Rẻ nhất; USD vẫn không đáng tin cho báo cáo tài chính |

Đợt này Lovable **chỉ làm phần validate input** (không đổi logic USD) đúng phạm vi được duyệt.

### 2.2 `identity-dispute-submit`
`validateDisputeInput.ts`: whitelist 5 `dispute_type`; `target_ref` bắt buộc,
≤ 128 ký tự, **phải là UUID** với `sbt_revoke`/`sbt_freeze`; `reason` 20–2000 ký tự;
`evidence` phải là object, ≤ 20 khoá, ≤ 8000 byte JSON; chặn body không phải object.

### 2.3 `identity-dispute-resolve`
`validateResolveInput.ts`: `dispute_id` **UUID chuẩn** (regex version/variant),
`decision` whitelist `accepted|rejected` (phân biệt hoa/thường),
`resolution_note` phải là chuỗi ≤ 2000 ký tự.

### Raw evidence — test
```
✓ src/__tests__/record-swap-input-guard.test.ts (18 tests)
✓ src/__tests__/claim-reward-input-guard.test.ts (21 tests)
✓ src/__tests__/claim-wallet-mismatch-guard.test.ts (9 tests)
✓ src/__tests__/identity-dispute-input-guard.test.ts (12 tests)
Test Files 4 passed (4) · Tests 60 passed (60)
```

---

## 3. Danh sách ĐÃ ĐÓNG trong Batch 2

| Nhóm | Nội dung | Bằng chứng |
|---|---|---|
| 2.1 RLS/GRANT | 265 bảng public: RLS bật đủ, GRANT khớp policy | `2.1-rls-grant-report.md` |
| 2.2/2.3 SECDEF | Audit 239 function `SECURITY DEFINER`, phân loại A/B | `2.2-2.3-role-secdef-report.md` |
| REVOKE nhóm B | 15 + 63 + 28 + 18 function bị thu hồi quyền `PUBLIC/anon/authenticated` | `2.3-containment-d8-d9.md`, `2.4-2.6-and-f3-report.md`, `2.3-muc2-muc3-report.md` |
| Đ8 | `recalculate_user_financial` guard theo actor thật | `2.3-containment-d8-d9.md` |
| Đ9 | `check_login_method` chuyển sang edge function có rate-limit | `check-login-method-containment.test.ts` |
| A2(c) | `log_security_action` dùng `auth.uid()` thay tham số client | `log-security-action-guard.test.ts` |
| A1 | 5 + 3 + 25 function admin-only đã guard; đóng toàn bộ A1 (trừ 3 overload attester hoãn) | `2.3-a1-batch3-report.md` |
| A3 | Vá `get_user_mint_stats(text)` (P1) + `get_user_directory_totals()` (P2) | `2.6-a2-a3-deep-verify-report.md` |
| Việc 2 (directory) | Tách `get_user_directory_summary` (23 cột công khai) / `get_user_directory_admin` (28 cột) | `user-directory-split-guard.test.ts` |
| F3 | `pplp_v2_review_queue` chỉ admin được INSERT | `2.4-2.6-and-f3-report.md` |
| Mục 4 | Validate `claim-reward` (P1), `record-swap`, `identity-dispute-submit/resolve` (P2) | 60 test pass ở trên |
| Tài chính | `run_financial_reconciliation`: admin thật + `p_dry_run` default true + rate-limit 5 phút | `run-financial-reconciliation-guard.test.ts` |
| BXH | Loại ví stub 2 chiều khỏi 3 RPC leaderboard | `leaderboard-exclude-guard.test.ts` |
| Chính sách | Đối soát tài chính chỉ người thật; minh bạch F1; `get_all_claim_history` công khai có chủ đích | memory `policy/*` |

## 4. Backlog — ĐÃ XẾP LỊCH SAU, KHÔNG phải bỏ sót

| # | Việc | Mức | Điều kiện / lịch |
|---|---|---|---|
| 1 | 3 overload attester (`get_attester_dashboard_stats`, `get_attester_mint_requests` ×2) | P2 | Hoãn theo quyết định trước; cần chuẩn hoá `public_wallet_address` cho 11 ví (hiện 2/11) rồi siết `is_gov_attester(auth.uid())` |
| 2 | Cơ chế `wallet_writer` tag | P2 | Cần 3 điều kiện tiên quyết (`2.5-muc5-...`) + **≥ 7 ngày audit-only** với `is_allowed ≥ 99%` trước khi bật strict |
| 3 | Thiết kế `delete-user-account` (xác nhận + soft delete + grace period) | P1 thiết kế | Xếp lịch bàn riêng, **chưa có ngày cụ thể**; hiện trạng đã tài liệu hoá `2.7-...` |
| 4 | `_shared/httpAuth.ts` chỉ **13,1%** adoption trong edge functions | P2 (nợ kiến trúc) | Không khẩn; migrate dần khi chạm từng function |
| 5 | `.env` chưa vào `.gitignore` | P3 | Chỉ chứa key publishable/URL (không có secret), xử lý khi dọn repo |
| 6 | `scheduled-reconciliation` không có cron gọi | P3 | Ghi nợ từ Việc 1; đối soát tự động hiện KHÔNG chạy định kỳ |
| 7 | USD client tự khai ở `record-swap` | P2 | Chờ CTO chọn PA A/B/C ở §2.1 |

**Kết luận:** Batch 2 đóng ở mức triển khai; 7 hạng mục trên là backlog có chủ đích, đã ghi ngày và điều kiện mở lại.
