# FUN Profile — Event Publishing Contract

> **Phiên bản:** v1 (Pilot · Architecture only) · **Khớp với:** FUN Core Federation & Sync Protocol.
> **Xem thêm:** [FUN-PROFILE-DOMAIN-OWNER.md](./FUN-PROFILE-DOMAIN-OWNER.md) · [FUN-PROFILE-PROJECTIONS.md](./FUN-PROFILE-PROJECTIONS.md)

## 1. Transport

- HTTPS POST tới `fun-core/events/ingest` (endpoint placeholder, do FUN Core cung cấp).
- Service JWT của FUN Profile + HMAC payload signature.
- Semantics: **at-least-once**, idempotent theo `idempotency_key`.
- TLS 1.2+, body JSON UTF-8.

## 2. Envelope chuẩn (khớp FUN Core Sync Protocol)

```json
{
  "event_id": "uuid-v7",
  "event_type": "PROFILE_UPDATED",
  "event_version": "1.0",
  "occurred_at": "2026-05-29T08:42:11.345Z",
  "origin_platform": "fun_profile",
  "source_platform": "fun_profile",
  "causation_id": null,
  "correlation_id": null,
  "hop_count": 0,
  "idempotency_key": "fun_profile:PROFILE_UPDATED:<user_id>:<payload_hash>",
  "privacy_level": "platform_internal",
  "subject": { "user_id": "uuid", "did_id": "did:fun:..." },
  "data": { },
  "trace_id": "uuid"
}
```

### Ý nghĩa các field

| Field | Mô tả |
|---|---|
| `event_id` | UUID v7, duy nhất toàn cầu, do producer sinh. |
| `event_type` | Tên event in HOA (xem catalogue §3). |
| `event_version` | SemVer của schema event (`MAJOR.MINOR`). Bump MAJOR khi breaking. |
| `occurred_at` | Thời điểm event xảy ra ở producer (ISO-8601 UTC). |
| `origin_platform` | Nơi event sinh ra **lần đầu**. Với Profile-domain events luôn là `fun_profile`. |
| `source_platform` | Nơi gửi gói **hiện tại**. Bằng `origin_platform` khi không relay. |
| `causation_id` | `event_id` của event đã gây ra event này (nếu có). |
| `correlation_id` | ID liên kết chuỗi event cùng một use case. |
| `hop_count` | Số chặng đã đi qua. **Reject nếu > 5** để chống loop federation. |
| `idempotency_key` | Khóa idempotency theo producer + type + subject + hash payload. |
| `privacy_level` | `public` · `platform_internal` · `user_private` (xem §4). |
| `subject` | Đối tượng chịu tác động (user + DID). |
| `data` | Payload riêng theo từng `event_type`. |
| `trace_id` | Liên kết log/observability xuyên hệ. |

### Mapping legacy

Tài liệu nội bộ cũ của FUN Profile có thể dùng `producer`. Khi triển khai phải **đổi tên** sang `origin_platform`. `subject` giữ nguyên.

## 3. Catalogue v1

| `event_type` | `privacy_level` | Trigger | `data` (rút gọn) |
|---|---|---|---|
| `PROFILE_UPDATED` | `platform_internal` | Update `profiles` (whitelist field) | `{ changed_fields: string[], before?: {...}, after: {...} }` |
| `AVATAR_UPDATED` | `public` | Đổi avatar | `{ avatar_url, hash }` |
| `LANGUAGE_CHANGED` | `platform_internal` | Đổi ngôn ngữ | `{ previous, current }` (ISO 639-1) |
| `COUNTRY_CHANGED` | `platform_internal` | Đổi quốc gia | `{ previous, current }` (ISO 3166-1 alpha-2) |
| `USERNAME_CHANGED` | `public` | Đổi username | `{ previous, current }` |
| `DID_PROMOTED` | `public` | `did_registry` thăng cấp | `{ did_id, from_level, to_level }` |
| `SBT_ISSUED` | `public` | Insert vào `sbt_registry` | `{ sbt_id, category, evidence_hash }` |
| `WALLET_LINKED` | **`user_private`** | Liên kết ví mới | `{ chain, address (lowercased) }` |
| `WALLET_UNLINKED` | **`user_private`** | Bỏ liên kết ví | `{ chain, address (lowercased) }` |

### 3.1 Activity Events v1 (Phase 6B)

Slug nền tảng thống nhất: `fun-profile`. Mặc định **OFF** tới khi FUN Core 6A PASS — bật từng event qua `app_settings.federation_outbox_event_flags`. Subject xác định **rõ ai được cộng điểm** (Core không phải đoán).

| `event_type` | `privacy_level` | Subject (cộng điểm cho) | Trigger | `data` (rút gọn) |
|---|---|---|---|---|
| `FUN_PROFILE_POST_CREATED` | `public` | tác giả (`posts.user_id`) | INSERT `posts` | `{ post_id, has_media, char_len }` |
| `FUN_PROFILE_POST_UPDATED` | `public` | tác giả | UPDATE `posts` (content/media đổi) | `{ post_id }` |
| `FUN_PROFILE_POST_DELETED` | `public` | tác giả | DELETE `posts` | `{ post_id }` |
| `FUN_PROFILE_POST_LIKED` | `public` | người like (`reactions.user_id`) | INSERT `reactions` (bỏ self-like) | `{ post_id, author_id }` |
| `FUN_PROFILE_POST_SHARED` | `public` | người share (`shared_posts.user_id`) | INSERT `shared_posts` | `{ post_id, author_id }` |
| `FUN_PROFILE_COMMENT_CREATED` | `public` | người bình luận (`comments.user_id`) | INSERT `comments` | `{ post_id, comment_id, author_id, has_media }` |
| `FUN_PROFILE_COMMENT_LIKED` | `public` | người like comment | INSERT `reactions(comment)` (sẵn sàng cho future) | `{ comment_id, post_id }` |
| `FUN_PROFILE_LIVESTREAM_STARTED` | `public` | host (`live_sessions.host_user_id`) | `status → live` | `{ session_id, started_at }` |
| `FUN_PROFILE_LIVESTREAM_COMPLETED` | `public` | host | `status → ended/completed` | `{ session_id, duration_sec, viewers_peak }` |
| `FUN_PROFILE_LIVESTREAM_ATTENDED` | `platform_internal` | viewer (≥60s) | (chưa wire) | `{ session_id, host_id, watch_sec }` |
| `FUN_PROFILE_FOLLOWED_USER` | `public` | follower (`friendships.user_id`) | INSERT `friendships` | `{ target_user_id, status }` |
| `FUN_PROFILE_PROFILE_COMPLETED` | `public` | chính chủ (`profiles.id`) | display_name+avatar+bio đủ lần đầu | `{ fields_completed: [...] }` |
| `FUN_PROFILE_DAILY_ACTIVE` | `platform_internal` | user | piggy-back khi có activity tích cực | `{ date }` (1 lần / user / UTC day) |

Idempotency key: `fun-profile:<EVENT_TYPE>:<user_id>:<sha256(payload)>` — riêng `DAILY_ACTIVE` dùng `…:<YYYY-MM-DD>` để dedupe theo ngày.

> Whitelist các `changed_fields` của `PROFILE_UPDATED`: `display_name`, `bio`, `avatar_url`, `cover_url`, `language`, `country`, `username`, `timezone`. **Không** publish PII nhạy cảm (email, phone, password hash, custodial seed, etc.).


## 4. Quy tắc Privacy Level

| Level | Ai đọc được | Ghi chú |
|---|---|---|
| `public` | Mọi consumer trong federation | Hiển thị công khai trong ecosystem. |
| `platform_internal` | FUN Core + apps trong allow-list | Không expose ra ngoài ecosystem. |
| `user_private` | **Chỉ FUN Core lưu nội bộ**; **không** relay sang LoveHUB/Academy/Farm trừ khi user opt-in. | Dùng cho dữ liệu nhạy cảm như wallet address. |

### Wallet event đặc biệt

`WALLET_LINKED` / `WALLET_UNLINKED` luôn là `user_private`:

- FUN Core lưu để dùng nội bộ (anti-sybil, Trust Engine, on-chain matching).
- **Không** fanout public mặc định.
- Nếu app khác cần biết, phải đi qua Core API có kiểm tra consent + Trust gating.

## 5. Reliability

- **Outbox pattern**: bảng `fun_profile_event_outbox` (đặc tả gợi ý, **chưa** tạo trong pilot):
  - Cột: `id`, `event_id`, `payload jsonb`, `status` (`pending|sent|failed|dlq`), `attempts`, `last_error`, `next_retry_at`, `created_at`.
  - Worker bắn lên Core, mark `sent` khi 2xx + ACK.
- **Retry**: exponential backoff (1s, 5s, 30s, 5min, 30min...), tối đa N lần → DLQ.
- **Replay an toàn** nhờ `idempotency_key`: Core dedupe theo key.
- **Versioning**: bump `event_version` khi breaking. Consumer phải tolerate unknown fields (forward-compatible).

## 6. Trigger points (mô tả, không code)

| Bảng / hành động | Event(s) |
|---|---|
| `UPDATE profiles SET ...` | `PROFILE_UPDATED` + (nếu trùng field) `AVATAR_UPDATED` / `LANGUAGE_CHANGED` / `COUNTRY_CHANGED` / `USERNAME_CHANGED` |
| `did_registry` auto-promote | `DID_PROMOTED` |
| `INSERT INTO sbt_registry` | `SBT_ISSUED` |
| `user_wallets` / custodial linkage thay đổi | `WALLET_LINKED` / `WALLET_UNLINKED` |

## 7. Out of scope

- Không thiết kế write sync Core → Profile.
- Không tạo bảng outbox, không sửa trigger, không sửa edge function trong pilot.
- Không bao gồm event domain Light/Reward/Badge (do FUN Core publish, không phải Profile).
