# FUN Profile — Domain Owner

> **Phiên bản:** v2 (Pilot) · **Trạng thái:** Architecture only — không có code sync trong giai đoạn này.
> **Xem thêm:** [FUN-PROFILE-EVENTS.md](./FUN-PROFILE-EVENTS.md) · [FUN-PROFILE-PROJECTIONS.md](./FUN-PROFILE-PROJECTIONS.md)

## 1. Định vị lại FUN Profile

FUN Profile **không** còn là "backend chính" của hệ sinh thái. Trong kiến trúc federation qua **FUN Core**, FUN Profile giữ đồng thời 3 vai trò:

| Vai trò | Phạm vi |
|---|---|
| **Domain Owner** | Sở hữu domain Identity: DID (`did:fun:*`), Trust profile, SBT, profile fields (username, fullName, avatar, language, country), wallet linkage. |
| **Publisher** | Phát events identity/profile lên FUN Core qua envelope chuẩn (xem `FUN-PROFILE-EVENTS.md`). |
| **Consumer** | Đọc projections (LightScore, Badges, Rewards, Ecosystem Summary) từ FUN Core (xem `FUN-PROFILE-PROJECTIONS.md`). |

## 2. Sơ đồ hub-and-spoke

```text
                ┌────────────────┐
                │   FUN Core     │
                │ (event bus +   │
                │  projections + │
                │  sync protocol)│
                └──────┬─────────┘
       ┌───────────────┼───────────────┬────────────────┐
       │               │               │                │
 ┌───────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
 │FUN Profile│  │  LoveHUB   │  │ FUN Academy│  │  FUN Farm  │
 │(Identity) │  │            │  │            │  │            │
 └───────────┘  └────────────┘  └────────────┘  └────────────┘
```

## 3. Quy tắc bất di bất dịch

1. LoveHUB / FUN Academy / FUN Farm **KHÔNG** gọi trực tiếp FUN Profile. Mọi truy vấn xuyên app đi qua FUN Core.
2. FUN Profile **KHÔNG** tự tính LightScore / Badges / Rewards (theo timeline ở §6 của `FUN-PROFILE-PROJECTIONS.md`).
3. Identity / DID / Trust / SBT vẫn do FUN Profile sở hữu — Core chỉ là consumer và relay.
4. Mọi thay đổi identity/profile quan trọng đều phải emit event qua envelope khớp Sync Protocol.

## 4. Boundary table

| Domain | Owner | Publisher | Consumer |
|---|---|---|---|
| Identity / DID / Trust / SBT / Profile fields | **FUN Profile** | FUN Profile | Core (+ apps qua Core) |
| LightScore / VVU | FUN Core | FUN Core | FUN Profile + apps |
| Badges | FUN Core | FUN Core | FUN Profile + apps |
| Rewards (FUN/CAMLY mint) | FUN Core | FUN Core | FUN Profile + apps |
| Ecosystem Summary | FUN Core (aggregator) | FUN Core | FUN Profile + apps |

## 5. Pilot scope

- Chỉ áp dụng cho user trong `app_settings.fun_core_pilot_allowed_user_ids` (cờ hiện có ở `useFunCorePilotFlag`).
- Trong pilot: đọc **song song** (local engine + Core projection) để đối chiếu, **chưa** chuyển UI sang Core projection.
- Sau pilot: theo timeline 3 phase tại `FUN-PROFILE-PROJECTIONS.md` §6.

## 6. Out of scope (giai đoạn này)

- Không thiết kế write sync (Core → Profile ghi ngược).
- Không thay đổi engine LightScore / minting / SBT issuance hiện tại.
- Không tạo bảng outbox, không sửa edge function, không SDK mới.
- Không đụng tới các luồng live/replay/pet/mystery-box.
