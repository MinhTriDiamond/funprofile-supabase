# 📘 FUN Profile — Hướng dẫn sử dụng toàn diện

> Tài liệu này mô tả **tất cả tính năng** của hệ sinh thái FUN Profile (Light Economy) và **cách sử dụng** chi tiết. Dùng được cho 2 mục đích:
> 1. **Người dùng** đọc để tự học cách dùng app.
> 2. **Angel AI Knowledge Base** — nạp file này vào để Angel AI trả lời mọi câu hỏi của user.
>
> Ngôn ngữ: tiếng Việt có dấu. Phiên bản: 1.0 — 15/06/2026.

---

## Mục lục

1. [Giới thiệu FUN Profile](#1-giới-thiệu-fun-profile)
2. [Bắt đầu nhanh — Đăng ký & Đăng nhập](#2-bắt-đầu-nhanh)
3. [Hồ sơ & Identity (DID, Trust Score, SBT)](#3-hồ-sơ--identity)
4. [Ví đa chuỗi (EVM + Bitcoin)](#4-ví-đa-chuỗi)
5. [Đăng bài (Post / Feed)](#5-đăng-bài-feed)
6. [Reels — Video ngắn](#6-reels)
7. [Live Stream](#7-live-stream)
8. [Chat & Gọi điện](#8-chat--gọi-điện)
9. [Tặng quà (Donations / Gifts)](#9-tặng-quà)
10. [PPLP v2.5 — Engine Light Score](#10-pplp-v25--engine-light-score)
11. [FUN Money & Mint](#11-fun-money--mint)
12. [CAMLY — Phần thưởng tương tác](#12-camly)
13. [Pet Lumi & Game](#13-pet-lumi--game)
14. [Mystery Box](#14-mystery-box)
15. [Connector — First On-chain Giver](#15-connector)
16. [Lịch sử giao dịch & Báo cáo](#16-lịch-sử-giao-dịch)
17. [Thông báo (Notifications)](#17-thông-báo)
18. [Tìm kiếm & Khám phá](#18-tìm-kiếm--khám-phá)
19. [Cài đặt & Bảo mật](#19-cài-đặt--bảo-mật)
20. [FAQ — Câu hỏi thường gặp](#20-faq)
21. [Cheat Sheet — Bảng tra cứu nhanh](#21-cheat-sheet)
22. [Bảng "Lệnh nhanh" cho Angel AI](#22-bảng-lệnh-nhanh-cho-angel-ai)

---

## 1. Giới thiệu FUN Profile

**FUN Profile** là mạng xã hội + ví đa chuỗi + nền kinh tế ánh sáng (Light Economy) lấy chữa lành làm trung tâm. Mọi hành động tích cực (Sám Hối, Biết Ơn, Phụng Sự, Giúp Đỡ, Trao Tặng) đều được ghi nhận thành **Light Score**, quy đổi thành **FUN Money** và **CAMLY** thật trên blockchain BSC.

### Các thành phần chính

| Lớp | Tên | Vai trò |
|-----|-----|---------|
| Identity | **DID + Trust Score** | Định danh phi tập trung L0–L4 |
| Score | **PPLP v2.5 (Light Score)** | Đo "ánh sáng" mỗi hành động |
| Money | **FUN Money (BSC)** | Token thưởng chính, uncapped + SoftCeiling 20M/tháng |
| Engagement | **CAMLY (BSC)** | Token tương tác, 1.000 CAMLY/reaction |
| Social | Post / Reels / Live / Chat | Tương tác & lan tỏa |
| Game | **Lumi Pet, Mystery Box** | Chữa lành thông qua chơi |
| Network | **Connector** | Khuyến khích "Người Trao Đầu Tiên" |

### URL chính
- Web: `https://funprofile.lovable.app`
- Preview: `https://id-preview--<id>.lovable.app`

---

## 2. Bắt đầu nhanh

### 2.1 Đăng ký tài khoản
Có **2 cách**:

**A. Email + Mật khẩu** (mặc định)
1. Vào `/auth` → tab **Đăng ký**.
2. Nhập email + mật khẩu (≥8 ký tự).
3. Mở email, bấm link xác minh → tài khoản chuyển sang trạng thái **active**.

**B. Wallet-first** (đăng nhập bằng ví)
1. Bấm **Kết nối ví** (MetaMask / Trust Wallet / WalletConnect).
2. Ký challenge (TTL 5 phút).
3. Tài khoản tạo ở trạng thái **limited** — xem được nhưng chưa đăng bài / chat được. Cần xác minh email sau để mở khoá.

### 2.2 Trạng thái tài khoản
| Trạng thái | Xem | Đăng bài | Chat | Tích luỹ thưởng | Rút thưởng |
|---|---|---|---|---|---|
| `guest` (chưa login) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `limited` (chưa verify email) | ✅ | ❌ | ❌ | ✅ | ❌ |
| `active` (verified) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `banned` | ✅ (chỉ read) | ❌ | ❌ | ❌ | ❌ |

### 2.3 Sumsub KYC (tuỳ chọn, mở khoá tính năng cao cấp)
- Vào `/identity` → tab **Trust** → nút **Xác minh danh tính**.
- Hệ thống dùng Sumsub WebSDK (sandbox/production tự động).
- Sau khi pass: TC (Trust Coefficient) tăng, mở khoá mint cao hơn, gửi BTC, v.v.

---

## 3. Hồ sơ & Identity

Trang chính: `/identity` (6 tab) + `/profile` (hồ sơ công khai).

### 3.1 DID (Decentralized Identifier)
- Mỗi user có 1 DID dạng `did:fun:UUID`.
- 5 cấp **L0 → L4** auto-promote theo TC + SBT + Guardian:
  - **L0** — vừa tạo
  - **L1** — có email verified
  - **L2** — TC ≥ 0.80 + 1 attestation
  - **L3** — TC ≥ 0.90 + Guardian ≥ 2
  - **L4** — Validator/Founder
- **KHÔNG auto-demote** — chỉ admin downgrade qua Dispute.

### 3.2 Trust Score (TC) — công thức
```
TC = (0.30·VS + 0.25·BS + 0.15·SS + 0.20·OS + 0.10·HS) × RF
```
- **VS** — Verification (KYC, email, phone)
- **BS** — Behavior (lịch sử hành vi sạch)
- **SS** — Social (giao tiếp, friend)
- **OS** — On-chain (tx history, ví)
- **HS** — History (thâm niên)
- **RF** — Risk Factor (× 0–1, sybil/spam giảm)

Tab "**Tăng Trust**" trong `/identity/onboarding` hiện 5 subscore + **TrustBoostMissions** + nút "Tính lại Trust".

### 3.3 SBT (Soulbound Token)
6 nhóm SBT **không chuyển nhượng**:
1. Identity (KYC, email, phone)
2. Achievement (mốc Light Score)
3. Contribution (đóng góp cộng đồng)
4. Participation (sự kiện, Zoom, Love House)
5. Reputation (được vinh danh)
6. Validator (chứng nhận xác thực)

Bấm SBT bất kỳ → **SBTEvidenceDialog** hiện metadata + `evidence_hash` + URL bằng chứng.

### 3.4 Guardian & Recovery
- Mời ≥2 người làm **Guardian** để khôi phục tài khoản khi mất ví/mật khẩu.
- 4 cơ chế recovery: `primary` / `wallet` / `guardian≥2` / `governance`.

### 3.5 Onboarding Trust Wizard
`/identity/onboarding` — 5 bước:
1. **Identity** (xác minh)
2. **Guardian** (mời người thân)
3. **Attestation** (xin chứng nhận)
4. **Tăng Trust** (làm missions)
5. **Finish**

### 3.6 Entities (Tab nâng cao)
Đăng ký 3 loại pháp nhân:
- `did:fun:org:UUID` — Tổ chức (4 vai trò: owner/admin/member/observer)
- `did:fun:validator:UUID` — Validator (có stake + slash)
- `did:fun:ai:UUID` — AI agent (cần operator ≥ L2)

### 3.7 DID Resolver (W3C chuẩn)
URL công khai:
```
https://<supabase>.functions.supabase.co/identity-did-resolve?did=did:fun:xxx
```
Trả về DID Document chuẩn W3C + `funExtension` (trust / sbts / links).

---

## 4. Ví đa chuỗi

Trang: `/wallet` (5 tab: Tổng quan / Gửi-Nhận / Lịch sử / FUN Money / Tokens).

### 4.1 Token được hỗ trợ
| Symbol | Chain | Decimals | Loại |
|---|---|---|---|
| **BNB** | BSC (56) | 18 | Native |
| **ETH** | Ethereum (1) | 18 | Native |
| **POL** | Polygon (137) | 18 | Native |
| **BTC** | Bitcoin native | 8 | Native |
| **USDT** | BSC | 18 | ERC20 |
| **BTCB** | BSC | 18 | ERC20 |
| **FUN** | BSC `0x39A1...0CD6` | 18 | ERC20 |
| **CAMLY** | BSC `0x0910...e413` | 3 | ERC20 |

### 4.2 Ví Custodial vs External
- **Custodial Wallet** — FUN tạo cho bạn (lưu trong `custodial_wallets`), tự ký được.
- **External Wallet** — bạn link bằng chữ ký MetaMask/Trust. Có thể link **nhiều** ví.
- **Auto-import**: phát hiện giao dịch on-chain từ ví ngoài → tự gợi ý link.

### 4.3 Gửi token
1. `/wallet` → **Gửi**.
2. Chọn token + nhập địa chỉ (hoặc chọn user).
3. Số tiền tối thiểu: FUN=9, USDT=1, CAMLY=1.000, BNB=0.001, BTC=0.00001.
4. Ký giao dịch trong ví → chờ on-chain confirmation.

> **Bảo vệ chống double-send**: hệ thống chặn gửi cùng (recipient + symbol + amount) trong 30 giây liền nhau. Đợi 30s nếu cần gửi lại.

### 4.4 Nhận token
- **EVM**: chia sẻ địa chỉ 0x… (cùng cho BSC/ETH/Polygon vì BSC dùng EVM).
- **BTC native**: bấm **Nhận BTC** → hiện QR code dạng BIP21.

### 4.5 Mobile Auto Chain Switch
Trên mobile, khi mở Wallet, app tự switch ví về **BSC (chain 56)** để tránh gửi nhầm mạng.

### 4.6 Thêm FUN/CAMLY vào MetaMask
Bấm **"Thêm vào ví"** → `wallet_watchAsset` tự thêm token cho bạn.

### 4.7 Khi gặp lỗi "Gas limit too high (35M)"
- Reset MetaMask: Settings → Advanced → **Clear activity tab data**.
- Hoặc set gas thủ công thấp hơn (xem section [19](#19-cài-đặt--bảo-mật)).

---

## 5. Đăng bài (Feed)

Trang chính: `/` (Feed).

### 5.1 Composer (FacebookCreatePost)
- Hỗ trợ text + tối đa **12 ảnh** (nút "Thêm ảnh" inline) hoặc 1 video.
- **Draft tự lưu** trong sessionStorage — không mất bài khi vô tình thoát.
- Badge realtime:
  - ✅ ≥ 50 ký tự HOẶC có ảnh/video → đủ điều kiện Light Score.
  - ⚠ < 50 ký tự, text-only → đăng được nhưng **KHÔNG nhận Light Score** (chống spam).

### 5.2 Phản ứng (Reactions)
6 loại reaction kiểu Facebook: ❤️ 👍 😆 😮 😢 😡.
Mỗi reaction = **+1.000 CAMLY** cho người được vinh danh (Honor Board).

### 5.3 Bình luận & Chia sẻ
- Comment có hỗ trợ ảnh + sticker + tag user.
- Share → tạo bản `shared_post` trỏ về bài gốc.
- Nội dung **có thể copy** (text selectable + nút Copy).

### 5.4 Rate limit
- 10 bài/giờ. **Ngoại lệ**: `gift_celebration` post không bị tính.
- Spam (≥80% trùng từ với bài cũ) → bị chặn + có thể bị revoke CAMLY.

---

## 6. Reels

Trang: `/reels` — video dọc, vuốt lên/xuống.

### 6.1 Tính năng
- Thanh progress + tooltip khi hover.
- Nút Tim / Bình luận / Bookmark / Chia sẻ / **Tặng quà** (mở UnifiedGiftSendDialog).
- Comment count realtime.
- Bookmark vào tab "Đã lưu" trong profile.

### 6.2 Đăng Reel
Vào `/reels` → nút **+** → upload video (max ~100MB) → auto compress.

---

## 7. Live Stream

Trang điều phối: `/live` (discovery) — `/live/new` (tạo) — `/live/:id` (xem) — `/live/:id/host` (host).

### 7.1 2 kiểu live
| Kiểu | Cách | Replay |
|---|---|---|
| **Webcam Live** | Camera/Mic ngay trong browser (Agora SDK) | MP4 lưu Cloudflare Stream |
| **RTMP** | Stream từ OBS/phần mềm ngoài | Có |

### 7.2 Bật Live
1. `/live/new` → đặt tiêu đề + chọn camera/mic.
2. Bấm **Bắt đầu live**.
3. Chất lượng audio mặc định: **HQ Stereo 48kHz** + AEC/ANS/AGC + Opus 128kbps.

### 7.3 Tương tác khi xem
- Chat realtime, gửi reaction (bay lên màn hình).
- Bấm 🎁 → **tặng quà on-stream** (FUN/CAMLY/USDT/BTC).
- Co-host: chủ live mời người khác lên cùng.

### 7.4 Replay & Auto-expiry
- Replay tự lưu sau khi live kết thúc → đăng tự động lên feed.
- TTL **30 ngày**:
  - **T-5 ngày**: notification `live_replay_expiring`.
  - **T0**: xoá Cloudflare Stream + scrub URL khỏi post + notif `live_replay_expired`.

### 7.5 Quota & lỗi
- Có quota phút/tháng. Khi vượt → modal hỗ trợ.
- Lỗi Agora hiện thông báo tiếng Việt thân thiện, retry 3 lần.
- Watchdog tự kết thúc session **webcam** nếu mất heartbeat > 8 phút.

---

## 8. Chat & Gọi điện

Trang: `/chat`.

### 8.1 Cuộc trò chuyện
- **1-1** và **Nhóm** (group conversations).
- Gửi: text, ảnh, voice, sticker, GIF, file.
- **Edit message** trong 5 phút sau khi gửi.
- **Block / Report** user trực tiếp.

### 8.2 Gọi audio/video
- Dùng Agora RTC.
- **PreCallSettings** chọn camera/mic trước khi gọi.
- Group call hỗ trợ nhiều người.

### 8.3 Tặng crypto trong chat
- Nút **🎁** trên ChatInput → mở `SendCryptoModal` (lazy load Web3).
- Chọn token + số → ký giao dịch.
- Tin nhắn tự sinh thông báo nhận quà.

### 8.4 Lì xì đỏ (Red Envelope)
- Nút **🧧** → tạo lì xì N phần, M token.
- Người nhận bấm để mở (random share).
- Lì xì hết hạn sau 24h → trả lại số dư còn lại.

### 8.5 Sticker
- Sticker shop có gói miễn phí và CAMLY.
- Sticker "Angel inline" trả lời gợi ý AI.

---

## 9. Tặng quà (Donations / Gifts)

### 9.1 Mở dialog
- Trên Profile / Post / Reel / Live / Chat — bấm 🎁.
- Component: `UnifiedGiftSendDialog` (preset recipient + chọn token).

### 9.2 Token hỗ trợ
FUN / CAMLY / USDT / BTCB / BNB / BTC native.

### 9.3 Gift Celebration Post
Sau khi giao dịch confirmed on-chain, hệ thống **tự đăng 1 post mừng**:
- Có hình FUN coin vàng, badge "Ví ngoài" nếu sender là external wallet.
- Hiển thị 2 đồng xu nhảy nếu là BTC.
- Có nút Reaction → mỗi reaction = +1.000 CAMLY.

### 9.4 Chính sách ví ngoài
- Giao dịch từ **ví không link** vào user trong hệ thống vẫn ghi lịch sử + badge "Ví ngoài".
- **Nhưng KHÔNG** tạo gift celebration post (chống spam).

### 9.5 Sửa lời chúc
Sửa message sau khi gửi → sync sang post + donations + chat.

---

## 10. PPLP v2.5 — Engine Light Score

Đây là trái tim hệ sinh thái. Đọc spec đầy đủ: `/docs/light-score-params` & `/docs/identity-trust-layer`.

### 10.1 5 trụ hành động
| Trụ | Action mẫu |
|---|---|
| **Sám Hối (Inner Work)** | Viết bài về quá trình chữa lành, hành thiền |
| **Biết Ơn (Gratitude)** | Bài cảm ơn, ghi nhận |
| **Phụng Sự (Service)** | Tổ chức Zoom, hỗ trợ cộng đồng |
| **Giúp Đỡ (Helping)** | Trả lời/giúp 1-1 user khác |
| **Trao Tặng (Giving)** | Donation, gift |

### 10.2 Công thức cốt lõi
```
VVU  = B × Q × TC × IIS × IM × AAF × ERP
PLS  = Σ VVU_personal × Consistency × Reliability
NLS  = Σ VVU_network  × QualityNetwork
LLS  = Σ VVU_legacy
TLS  = α·PLS + β·NLS + γ·LLS         (Early phase: α=0.7 β=0.2 γ=0.1)
DisplayLS = 100 × log(1 + RawLS)
```
- **IIS** ∈ [0, 1.5] — Intent Integrity (consistency × (1-farm) × (1-manip))
- **IM** ∈ [0, 3.0] — Impact (helped users + retention + knowledge + referral)

### 10.3 6 Tier ánh sáng
| Tier | Threshold (DisplayLS) | Multiplier |
|---|---|---|
| 🌱 Seed Light | 0+ | ×0.5 |
| ⚪ Pure Light | 100+ | ×1.0 |
| 💡 Guiding Light | 500+ | ×1.5 |
| ✨ Radiant Light | 2.000+ | ×2.0 |
| 🌟 Legacy Light | 10.000+ | ×3.0 |
| 🌌 Cosmic Light | 50.000+ | ×5.0 |

### 10.4 Stability Index & Activation
- 14 event types + 11 multipliers + 4 legacy params + 3 phase configs (DB-driven, có audit log).
- Hành động tính LS khi:
  - User đạt **TC ≥ 0.15** (T1 earn gate).
  - Validation engine PASS.
  - Không bị fraud signal nặng.

### 10.5 Anti-farm
- **Velocity limits** theo trust tier.
- **Sybil detection** dựa marker kỹ thuật (cùng device fingerprint, IP cluster…).
- Spam ≥80% trùng từ → block + revoke CAMLY.

---

## 11. FUN Money & Mint

### 11.1 Monetary v1
- Token uncapped.
- **SoftCeiling 20M FUN/tháng** (Nấc 1 sau khi đăng ký 6 on-chain actions ngày 21/04/2026).
- Tỉ lệ **15% liquid / 85% lock** (vesting).

### 11.2 6 On-chain actions
`INNER_WORK / CHANNELING / GIVING / HELPING / GRATITUDE / SERVICE` — map từ 14 action_type DB; fallback `INNER_WORK`.

### 11.3 Epoch (mỗi tháng)
1. Cuối tháng UTC: chạy `pplp-epoch-snapshot` (kèm Aggregation Completeness Guard).
2. Tạo `mint_allocations` cho mỗi user dựa `raw_light_score × tier_multiplier × consistency`.
3. Notify `epoch_claim_ready` → user mở popup full-screen.
4. User vào `/wallet/fun_money` → bấm **Claim**.

### 11.4 Quy trình Mint (6 bước tự động)
```
[1] Snapshot     →  [2] Allocation     →  [3] Mint Request
       ↓                  ↓                       ↓
[6] Vesting Lock ← [5] On-chain Mint  ← [4] Multisig Sign (3/3)
```
Tham khảo trực quan: tab **Mint** trong `/wallet/fun_money`.

### 11.5 Trần chống revert
- **EPOCH_CAP throttle**: tối đa 950K FUN/action/ngày UTC.
- Khi vượt → mint chuyển trạng thái `signed` chờ ngày kế tiếp.
- Banner cảnh báo backlog hiển thị trong PplpMintTab.

### 11.6 Multisig 3-of-3
Cần 3 chữ ký EIP-712 từ guardian. User chỉ cần bấm Claim — hệ thống tự gọi các bên ký.

### 11.7 Nhận FUN vào MetaMask
Bấm **"Thêm FUN vào MetaMask"** trong wallet.

---

## 12. CAMLY

### 12.1 Đặc tả token
- BSC, decimals = **3** (chú ý không phải 18).
- Contract: `0x0910320181889feFDE0BB1Ca63962b0A8882e413`.

### 12.2 Cách kiếm CAMLY
| Hành động | Phần thưởng |
|---|---|
| Nhận 1 reaction trên post | **+1.000 CAMLY** (Honor Board) |
| Reward Approval của admin | tới 500.000 CAMLY/ngày/user |

### 12.3 Cách dùng CAMLY
- Mua sticker pack.
- Mua cosmetics cho Lumi Pet (on-chain).
- Mua Mystery Box.

### 12.4 Treasury
Khối lượng lớn được chuyển từ ví `funtreasury` chính thức.

---

## 13. Pet Lumi & Game

Trang: `/pet`.

### 13.1 Lumi
- Mỗi user **tự động** có 1 Lumi khi tạo tài khoản.
- Có XP, level, cosmetics, voice line.

### 13.2 Tương tác hằng ngày
- **Cheer** (vỗ tay) bạn khác → cả 2 được XP nhỏ.
- **Quest** hằng ngày: viết bài, đăng nhập, gift.

### 13.3 Pet Shop (CAMLY on-chain)
`/pet/shop`:
- Catalog cosmetics có `price_camly` + `level_required` + `stock`.
- Bấm Mua → ký giao dịch CAMLY về ví treasury → poll 20 lần xác nhận.

### 13.4 Risk Engine (chống farm)
- 4 tier: `safe / watch / restricted / frozen`.
- Tính theo EMA 7 ngày (xp_burst, cheer_loop, shop_velocity, tc_low).
- Bị `restricted` → cấm shop + cheer.
- **Kháng nghị**: `/pet/appeal`.

### 13.5 Buddy Circle
Nhóm 3–5 người làm quest cùng nhau, có Daily Quest riêng.

### 13.6 Pet Battle Season
Đấu Lumi theo mùa, có Leaderboard.

---

## 14. Mystery Box

Trang: `/mystery-box`. Spec: `/docs/mystery-box-spec`.

### 14.1 Cách mua
- Trả bằng **CAMLY** on-chain (treasury verify).
- Có premium grant từ admin.

### 14.2 Mở box
- Random reward (CAMLY / cosmetics / FUN nhỏ / SBT đặc biệt).
- Animation + sound effect.

### 14.3 Anti-abuse
- `mystery_box_risk_log` track hành vi bất thường.
- Daily stats (`mystery_box_stats_daily`).

---

## 15. Connector — First On-chain Giver

Trang: `/connector` & `/connector/given`. Spec: `/docs/connector-spec`.

### 15.1 Khái niệm
Khuyến khích **Người Trao Đầu Tiên** — user A giới thiệu user B vào hệ thống bằng giao dịch on-chain đầu tiên trong cửa sổ 48h.

### 15.2 Điều kiện
- Trao tối thiểu: FUN=9, USDT=1, CAMLY=1.000, BNB=0.001, BTC=0.00001.
- TC ≥ 0.15.
- KHÔNG tính ví ngoài.

### 15.3 Thưởng
- **Base**: +10 Light Score cho người Trao.
- **Growth bonus** 4 mốc (khi người được trao đạt mốc LS sau đó).

### 15.4 Cron
- Hàng giờ: expire window quá 48h.
- 04:30 UTC daily: cộng growth bonus.

### 15.5 Admin revert
Edge `connector-admin-revert` revert link sai (NO-REOPEN) + notify 2 bên.

---

## 16. Lịch sử giao dịch

Trang: `/wallet` → tab **Lịch sử**.

### 16.1 Bộ lọc
- **Token** (dropdown): FUN/CAMLY/USDT/BTC/BNB/BTCB/ETH/POL.
- **Loại**: Gửi / Nhận / Tất cả.
- **User**: tìm theo username/địa chỉ.
- **Ngày**: range.

### 16.2 Sticky filter bar
Cuộn xuống bar lọc vẫn dính trên cùng để dễ thao tác.

### 16.3 Xuất PDF
Nút **Xuất PDF** ở góc → tải PDF có header + tổng kết.

### 16.4 Badge "Ví ngoài"
Giao dịch từ external wallet được đánh dấu rõ.

### 16.5 Click avatar
Bấm avatar đối tác → mở profile (isolated click, không trigger row).

---

## 17. Thông báo

Trang: `/notifications` (full page mobile, dropdown trên desktop).

### 17.1 Realtime
Cập nhật ngay khi có event mới (Supabase realtime).

### 17.2 Loại thông báo
| Loại | Mô tả |
|---|---|
| `epoch_claim_ready` | Có FUN Money để claim → **popup full screen** |
| `gift_received` | Bạn vừa nhận quà |
| `reaction_received` | Có người vào reaction bài của bạn |
| `comment_received` | Có comment mới |
| `live_replay_expiring` | Replay sắp hết hạn (T-5d) |
| `live_replay_expired` | Replay đã bị xoá |
| `live_replay_failed` | Live không lưu được |
| `did_promoted` | DID lên cấp |
| `sbt_issued` | Nhận SBT mới |
| `dispute_resolved` | Khiếu nại đã xử lý |
| `recovery_initiated` | Có recovery được khởi tạo |
| `guardian_invited` | Có người mời bạn làm guardian |
| `connector_backfilled` | Connector backfill 7d |
| `epoch_reset_info` | Thông báo reset epoch (T4/2026) |

### 17.3 Identity hệ thống
Thông báo hệ thống dùng identity **FUN.RICH** + avatar logo.

---

## 18. Tìm kiếm & Khám phá

### 18.1 Search box
Tìm user / post / hashtag.

### 18.2 Bạn bè mới
Khối **New Members** trên feed — search + filter realtime.

### 18.3 Leaderboard
`/leaderboard` — bảng xếp hạng theo Light Score & CAMLY tháng.

### 18.4 Benefactors
`/benefactors` — danh sách người trao tặng nhiều nhất.

### 18.5 Donations
`/donations` — toàn bộ donation public.

---

## 19. Cài đặt & Bảo mật

Trang: `/settings`.

### 19.1 Đổi mật khẩu
Settings → **Security** → đổi password (cần mật khẩu hiện tại).

### 19.2 IP log
Xem lịch sử IP đăng nhập gần đây.

### 19.3 Wallet Security
- Audit log mọi thay đổi ví.
- Cảnh báo bulk update ví.
- Hijack stub cleanup tự chạy.

### 19.4 Mobile auto-chain
Khi mở Wallet trên mobile, app tự switch về BSC (56).

### 19.5 Connected Apps
`/profile/connected-apps` — quản lý OAuth (SSO) cho FUN Play, Angel AI, …

### 19.6 Cảnh báo khi sign tx
- Hiện ẩn overlay khi ký.
- Reset wagmi nếu account mismatch.
- Check chain trước khi gửi.

---

## 20. FAQ

**Q: Sao Light Score của tôi chưa tăng?**
A: Kiểm tra (1) bài có đủ 50 ký tự hoặc có media chưa, (2) TC ≥ 0.15 chưa, (3) chưa bị fraud flag. Action `proof_pending` nội bộ sẽ được auto-attest theo cron.

**Q: Sao tôi gửi gift từ ví ngoài mà không có post mừng?**
A: Đúng chính sách: ví không link vào account → KHÔNG tạo gift celebration post (chống spam). Vẫn ghi vào lịch sử với badge "Ví ngoài".

**Q: Mint FUN bị treo nhiều ngày?**
A: Có thể đụng trần **EPOCH_CAP 950K FUN/action/ngày**. Hệ thống tự retry mỗi 15 phút, đợi ngày kế tiếp sẽ chạy tiếp. Banner backlog hiển thị trong tab Mint.

**Q: Live của tôi mất sau 1 ngày, không có video?**
A: Có thể do thiếu credentials Agora hôm đó (T-event hiếm). Status `failed_no_recording` + notif `live_replay_failed`. Lần sau nếu lỗi sẽ có thông báo ngay.

**Q: Replay live mất sau 30 ngày?**
A: Đúng — TTL 30 ngày. Có notif T-5 ngày để bạn tải về.

**Q: Sao gửi BNB/CAMLY báo "Bị chặn 30s"?**
A: Bảo vệ chống double-send sau sự cố 04/06/2026 (mất 1.5 BNB). Đợi 30s rồi gửi lại.

**Q: Sao MetaMask báo Gas Limit too high (35M)?**
A: Vào MetaMask → Settings → Advanced → **Clear activity tab data** rồi thử lại.

**Q: Post < 50 ký tự không có ảnh thì sao?**
A: Đăng được nhưng KHÔNG tính Light Score. Composer hiện badge ⚠ realtime.

**Q: Tôi có cần KYC không?**
A: Không bắt buộc cho user thường. KYC giúp tăng TC nhanh, mở khoá mint cao và một số gate validator.

**Q: Tôi muốn xoá tài khoản?**
A: Liên hệ admin qua `/settings` → Support. Identity + SBT là non-transferable nên giữ lại theo policy.

**Q: BTC native gửi không thấy?**
A: BTC cần ≥ 1 on-chain confirmation. Auto-refresh số dư mỗi 60s qua Mempool + Blockstream fallback.

**Q: CAMLY decimals là gì?**
A: **3 chữ số thập phân** (không phải 18). 1 CAMLY = 1.000 đơn vị nhỏ nhất.

**Q: Tôi mới tạo account chưa nhận FUN?**
A: FUN Money phát theo **epoch tháng**. Cuối tháng UTC sẽ snapshot + notif claim.

**Q: Có thể nhận thưởng mà không cần verify email?**
A: Có (tích luỹ), nhưng **không rút/claim được** đến khi email verified.

**Q: Tôi link nhiều ví được không?**
A: Được — link nhiều External wallet bằng ký MetaMask. Custodial wallet thì chỉ 1.

**Q: Risk Tier Pet `restricted` thì sao?**
A: Không mua shop / cheer được. Kháng nghị tại `/pet/appeal`.

**Q: Làm sao tăng Trust nhanh?**
A: Vào `/identity/onboarding` → bước "Tăng Trust" → làm TrustBoostMissions (KYC, mời guardian, attestation, hoạt động đều).

**Q: Validator có cần stake không?**
A: Có. Stake bị slash nếu vi phạm (tự ghi identity_event tc_delta -0.10, risk +0.15).

**Q: AI agent có DID không?**
A: Có — `did:fun:ai:UUID`. Cần operator user ≥ L2 đăng ký.

---

## 21. Cheat Sheet

### Hằng số quan trọng
| Tham số | Giá trị |
|---|---|
| Min post cho LS (text-only) | **50 ký tự** |
| Rate limit post | 10 bài/giờ (gift_celebration miễn) |
| CAMLY per reaction | 1.000 |
| Reward daily cap admin | 500.000 CAMLY/user |
| FUN SoftCeiling | 20M/tháng |
| FUN EPOCH_CAP | 950K/action/ngày UTC |
| Vesting | 15% liquid / 85% lock |
| Live replay TTL | 30 ngày (notif T-5) |
| Live webcam watchdog | 8 phút mất heartbeat |
| Duplicate send guard | 30 giây |
| BTC confirmation | ≥ 1 |
| Min gửi: FUN/USDT/CAMLY/BNB/BTC | 9 / 1 / 1.000 / 0.001 / 0.00001 |
| Connector window | 48 giờ |
| TC earn gate (T1) | ≥ 0.15 |
| Trust tier T0–T4 gates | T1 earn / T2 vote / T3 propose / T4 validator |

### Route chính
| Route | Trang |
|---|---|
| `/` | Feed |
| `/profile` | Profile của bạn |
| `/@username` | Profile public |
| `/wallet` | Ví đa chuỗi |
| `/wallet/fun_money` | FUN Money & Mint |
| `/chat` | Chat |
| `/reels` | Reels |
| `/live` | Live discovery |
| `/live/new` | Tạo live |
| `/notifications` | Thông báo |
| `/identity` | DID/Trust (6 tab) |
| `/identity/onboarding` | Trust Wizard 5 bước |
| `/pet` | Lumi |
| `/pet/shop` | Pet cosmetics |
| `/pet/appeal` | Kháng nghị risk |
| `/mystery-box` | Mystery box |
| `/connector` | Connector overview |
| `/connector/given` | Lịch sử trao tặng |
| `/leaderboard` | Bảng xếp hạng |
| `/benefactors` | Top giver |
| `/donations` | Donations public |
| `/settings` | Cài đặt |
| `/docs/light-score-params` | Spec LS Param Table |
| `/docs/identity-trust-layer` | Spec Identity+Trust |
| `/docs/connector-spec` | Spec Connector |
| `/docs/mystery-box-spec` | Spec Mystery Box |

---

## 22. Bảng "Lệnh nhanh" cho Angel AI

Khi user hỏi câu chứa các từ khoá sau, Angel trả lời dựa section tương ứng:

| Từ khoá user hay nói | Section |
|---|---|
| "đăng ký", "đăng nhập", "verify email", "KYC", "Sumsub" | §2, §3 |
| "DID", "Trust Score", "TC", "SBT", "Guardian", "recovery" | §3 |
| "ví", "wallet", "BNB", "BTC", "USDT", "FUN", "CAMLY", "gửi", "nhận", "chain switch" | §4 |
| "đăng bài", "post", "feed", "ảnh", "video", "draft", "rate limit" | §5 |
| "reels", "video ngắn" | §6 |
| "live", "livestream", "replay", "Agora", "webcam", "RTMP" | §7 |
| "chat", "tin nhắn", "group", "gọi", "video call", "lì xì", "sticker" | §8 |
| "tặng quà", "gift", "donation", "ví ngoài" | §9, FAQ |
| "light score", "PPLP", "VVU", "IIS", "IM", "tier", "Pure Light", "Cosmic" | §10 |
| "FUN money", "mint", "epoch", "claim", "SoftCeiling", "EPOCH_CAP", "multisig" | §11, FAQ |
| "CAMLY", "reaction", "1000 camly", "Honor Board" | §12 |
| "pet", "Lumi", "cheer", "cosmetic", "shop pet", "risk", "appeal" | §13 |
| "mystery box", "hộp bí ẩn" | §14 |
| "connector", "người trao đầu tiên", "growth bonus" | §15 |
| "lịch sử", "transaction history", "xuất PDF", "filter" | §16 |
| "thông báo", "notification", "epoch_claim_ready" | §17 |
| "tìm kiếm", "leaderboard", "benefactors" | §18 |
| "cài đặt", "đổi mật khẩu", "bảo mật", "connected apps", "OAuth" | §19 |
| "lỗi", "stuck", "treo", "gas limit", "double send", "30 giây" | FAQ |

### Nguyên tắc trả lời của Angel
1. **Tiếng Việt có dấu**, xưng "bạn".
2. Trích đúng số liệu trong **§21 Cheat Sheet** — không bịa số.
3. Nếu user gặp lỗi → ưu tiên tham chiếu **§20 FAQ**.
4. Khi không chắc → hướng dẫn user vào trang doc tương ứng (`/docs/...`).
5. Không tiết lộ Supabase project ID, service role key, hay đường dẫn admin nội bộ.

---

> 🙏 **Cảm ơn bạn đã dùng FUN Profile** — nơi mỗi hành động tích cực trở thành ánh sáng thật, được ghi lại vĩnh viễn trên blockchain. Mọi đóng góp/đề xuất gửi qua `/settings → Support`.
>
> *Phiên bản tài liệu: 1.0 — 15/06/2026 · Maintainer: Angel AI + Team FUN Profile.*
