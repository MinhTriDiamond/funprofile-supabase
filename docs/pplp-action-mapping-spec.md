# PPLP Action Mapping Spec — v1 (21/04/2026)

## Tổng quan

Sau khi bé Trí đăng ký 6 actions on-chain trên contract FUN Money v1.2.1
(`0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6`), hệ thống chuyển từ
hardcode `FUN_REWARD` sang **dynamic mapping** dựa trên `light_actions.action_type`.

## Trần on-chain mới

| Trước | Sau |
|---|---|
| 1 action × 1M/day = **30M FUN/tháng** | 6 actions × 1M/day = **180M FUN/tháng** |

Cap off-chain `epoch_config.soft_ceiling`:
- **Nấc 1 (hiện tại)**: 20M FUN/tháng (~11% trần lý thuyết)
- **Nấc 2 (sau ≥2 tuần ổn định)**: 50M FUN/tháng (~28%)

## 6 Actions on-chain

| Action name | Pillar | Mô tả |
|---|---|---|
| `INNER_WORK` | Sám Hối | Nội tâm, journal, biết ơn |
| `CHANNELING` | Biết Ơn | Sáng tạo, post, livestream |
| `GIVING` | Trao Tặng | Donate, gift |
| `HELPING` | Giúp Đỡ | Comment hỗ trợ, hỏi-đáp |
| `GRATITUDE` | Biết Ơn | Reaction tích cực |
| `SERVICE` | Phụng Sự | Share, friend, new user |

## Mapping `light_actions.action_type` → on-chain action

| action_type (DB) | on-chain action | Khối lượng tháng 4 |
|---|---|---|
| `reaction` | `GRATITUDE` | 79,511 |
| `post` | `CHANNELING` | 22,893 |
| `comment` | `HELPING` | 17,225 |
| `friend` | `SERVICE` | 8,267 |
| `question_ask` | `HELPING` | 2,754 |
| `livestream` | `CHANNELING` | 1,377 |
| `post_create` | `CHANNELING` | 1,010 |
| `share` | `SERVICE` | 922 |
| `new_user_bonus` | `SERVICE` | 417 |
| `comment_create` | `HELPING` | 245 |
| `gratitude_practice` | `INNER_WORK` | 226 |
| `donate_support` | `GIVING` | 180 |
| `journal_write` | `INNER_WORK` | 30 |
| `vision_create` | `CHANNELING` | 4 |

**Fallback**: nếu action_type không nằm trong bảng → dùng `INNER_WORK`
(an toàn nhất vì khối lượng thấp).

**Legacy**: `FUN_REWARD` vẫn còn `allowed=true` nhưng `deprecated=true`,
chỉ dùng cho cleanup giai đoạn chuyển tiếp.

## Auto-split logic (Phase B.3)

Khi user claim 1 allocation:
1. Đọc các `light_actions` thuộc allocation (qua `mint_allocations.allocation_meta`
   hoặc query trực tiếp).
2. Group theo on-chain action (`groupByOnChainAction`).
3. Nếu có ≥2 nhóm hoặc 1 nhóm > 1M FUN → tạo nhiều `pplp_mint_requests` con,
   liên kết qua `parent_request_id`.
4. Mỗi request con bám 1 action, đảm bảo không bao giờ dồn > 1M/action/day.

Hiện tại allocation mặc định mỗi user nhận tối đa rất nhỏ so với 1M, nên
trong giai đoạn đầu **mỗi allocation chỉ tạo 1 mint request** (không split),
nhưng `action_name` được chọn đúng theo activity dominant.

## Files liên quan

- `supabase/functions/_shared/pplp-action-registry.ts` — registry backend
- `src/config/pplp-action-registry.ts` — registry frontend (mirror)
- `supabase/functions/pplp-mint-fun/index.ts` — entry point claim
- `supabase/functions/pplp-remint-stale/index.ts` — recovery 52 stale requests

## Lịch sử thay đổi

- **2026-04-21**: tạo spec, deploy mapping, nâng cap 5M → 20M.
