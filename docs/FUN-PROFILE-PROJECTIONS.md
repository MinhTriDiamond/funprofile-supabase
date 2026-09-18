# FUN Profile — Projection Consumer Contract

> **Phiên bản:** v1 (Pilot · Architecture only).
> **Xem thêm:** [FUN-PROFILE-DOMAIN-OWNER.md](./FUN-PROFILE-DOMAIN-OWNER.md) · [FUN-PROFILE-EVENTS.md](./FUN-PROFILE-EVENTS.md)

FUN Profile là **Consumer** của các projection do FUN Core tính. FUN Profile **không** ghi các giá trị này vào bảng nguồn-sự-thật.

## 1. Projection contracts

### LightScoreProjection

```ts
{
  raw_ls: number,
  display_ls: number,        // 100 * log(1 + raw_ls)
  pls: number, nls: number, lls: number,
  tier: "seed" | "spark" | "flame" | "beacon" | "star" | "cosmic",
  iis: number,               // [0, 1.5]
  im: number,                // [0, 3.0]
  epoch: string,             // ISO month, e.g. "2026-05"
  updated_at: string,        // ISO-8601
  schema_version: "1.0"
}
```

### BadgesProjection

```ts
{
  items: Array<{
    code: string,
    name: string,
    tier?: string,
    awarded_at: string,
    source_app: "fun_profile" | "fun_farm" | "fun_academy" | "lovehub" | "fun_core"
  }>,
  updated_at: string
}
```

### RewardsProjection

```ts
{
  pending_fun: number,
  claimable_fun: number,
  lifetime_minted_fun: number,
  lifetime_camly: number,
  next_epoch_at: string,     // ISO-8601
  updated_at: string
}
```

### EcosystemSummaryProjection

```ts
{
  apps: Array<{
    app_key: "fun_profile" | "fun_farm" | "fun_academy" | "lovehub",
    last_active_at: string,
    contribution_score: number
  }>,
  cross_app_ls: number,
  updated_at: string
}
```

## 2. Envelope đáp

Giữ format hiện tại của `FunCoreResponse`:

```ts
{
  success: boolean,
  meta?: { schemaVersion: string, traceId?: string },
  data?: LightScoreProjection | BadgesProjection | RewardsProjection | EcosystemSummaryProjection,
  error?: { code: string, message: string, upstreamStatus?: number | null, traceId?: string | null }
}
```

## 3. Endpoint reference

- Edge function hiện có: `fun-core-proxy` với endpoints `profile | badges | light-score` (xem `src/hooks/useFunCoreProxy.ts` + `useFunCoreProfileData.ts`).
- Pilot mở rộng thêm: `rewards`, `ecosystem-summary`.
- Auth: proxy đã verify JWT user; service-to-service dùng signed request.

## 4. Caching & no-local-write

- React Query `staleTime` 60s, `gcTime` 5 phút, **không persist**.
- FUN Profile **không** ghi projection vào bảng nguồn-sự-thật.
- Nếu cần offline → bảng `*_cache` read-only, refresh từ Core, **không** dùng làm input cho bất kỳ business logic nào.

## 5. Stale data rule (cứng)

`max_age = 10 phút` cho mọi projection.

| `data_age` | Hành vi UI |
|---|---|
| `≤ 60s` | Hiển thị bình thường. |
| `60s < data_age ≤ 10 phút` | Hiển thị + badge **"Đang đồng bộ"** + timestamp cập nhật cuối. |
| `> 10 phút` hoặc Core trả `error` | **Không** hiển thị số liệu cũ. Thay bằng skeleton + thông báo *"Đang đồng bộ từ FUN Core, vui lòng thử lại sau"*. |

Component chuẩn (đặc tả, **chưa** triển khai trong pilot):

```tsx
<ProjectionStaleGuard maxAgeMs={600_000} updatedAt={data.updated_at} error={error}>
  {/* render projection */}
</ProjectionStaleGuard>
```

Áp dụng cho cả 4 projection.

## 6. Migration timeline

```text
┌──────────────────────┬──────────────────────────────────────────────┐
│ Phase                │ Hành vi FUN Profile                          │
├──────────────────────┼──────────────────────────────────────────────┤
│ Pilot (hiện tại)     │ Read side-by-side: local engine + Core       │
│                      │ projection. UI vẫn dùng local. Compare log.  │
├──────────────────────┼──────────────────────────────────────────────┤
│ Core Projection GA   │ Switch UI sang Core projection. Local engine │
│                      │ chạy shadow để đối chiếu.                    │
├──────────────────────┼──────────────────────────────────────────────┤
│ Deprecation          │ Tắt local LS/Badges/Rewards computation.     │
│                      │ Profile chỉ còn Identity + publisher events. │
└──────────────────────┴──────────────────────────────────────────────┘
```

### Điểm cần deprecate ở Phase 3 (Deprecation)

- `supabase/functions/pplp-v2-light-profile/` — tính LS cục bộ.
- Các hook badge cục bộ (vd `useUserIdentityBadge` chỉ giữ phần Identity, phần Badge ecosystem chuyển sang Core).
- Các tính toán reward / mint preview cục bộ.

> **Quan trọng:** Trong pilot **không xoá** bất kỳ thứ gì ở danh sách trên. Chỉ đánh dấu *"to deprecate after Core projection GA"*.

## 7. Out of scope

- Không thiết kế write sync (Core → Profile ghi ngược).
- Không tạo bảng cache mới, không sửa engine LS hiện tại.
- Không thay đổi UI cụ thể trong pilot.
