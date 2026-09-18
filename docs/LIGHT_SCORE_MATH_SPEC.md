# Light Score Math Specification v2.0

## Overview

Light Score hệ thống FUN Ecosystem kết hợp 2 lớp đánh giá:

1. **Action-level PPLP Scoring** (LS-Math v1.0) — Chấm điểm từng hành động
2. **User-level Dimension Scoring** (Whitepaper v1) — Đánh giá danh tiếng tổng thể user qua 5 trụ cột

---

## Lớp 1: Action-level PPLP (LS-Math v1.0).

### Công thức
```
L = BR × Q × I × K × Ux × M_cons × M_seq × Π
```

| Ký hiệu | Ý nghĩa | Phạm vi |
|----------|---------|---------|
| BR | Base Reward | 10-500 FUN |
| Q | Quality Score | 0.5 – 3.0 |
| I | Impact Score | 0.5 – 5.0 |
| K | Integrity Score | 0 – 1.0 |
| Ux | Unity Multiplier | 0.5 – 2.5 |
| M_cons | Consistency Multiplier | 1.0 – 1.6 |
| M_seq | Sequence Multiplier | 1.0 – 1.5 |
| Π | Integrity Penalty | 0.5 – 1.0 |

### 5 Pillars PPLP (đánh giá nội dung)
- ☀️ Service to Life (Phụng sự sự sống)
- 🔍 Transparent Truth (Chân thật minh bạch)
- 💚 Healing & Love (Chữa lành & yêu thương)
- 🌱 Long-term Value (Đóng góp bền vững)
- 🤝 Unity (Hợp Nhất)

---

## Lớp 2: User-level Dimension Scoring (Whitepaper v1)

### 5 Trụ Cột Danh Tiếng

#### 🪪 Identity Score (max 100)
| Yếu tố | Điểm |
|---------|------|
| display_name | +10 |
| avatar_url | +10 |
| bio | +5 |
| location | +5 |
| wallet_address | +30 |
| law_of_light_accepted | +20 |
| account_age > 30 ngày | +20 |

#### ⚡ Activity Score (max 100)
- Normalize `total_light_score` từ `light_reputation` về 0-100
- Công thức: `log(1 + score) / log(1 + 100000) × 100`
- Áp dụng Time Decay

#### ⛓️ On-Chain Score (max 100)
| Yếu tố | Điểm |
|---------|------|
| wallet linked | +30 |
| has sent donations | +30 |
| has received donations | +20 |
| first donation > 30 ngày | +20 |

#### 🔍 Transparency Score (max 100)
- Bắt đầu: 100
- Trừ per unresolved fraud signal:
  - Severity 1-3: -5
  - Severity 4-6: -15
  - Severity 7-10: -30
- Minimum: 0

#### 🌐 Ecosystem Score (max 100)
| Yếu tố | Điểm |
|---------|------|
| has posts | +15 |
| has comments | +15 |
| donations sent > 0 | +20 |
| donations received > 0 | +15 |
| streak ≥ 7 days | +15 |
| law_of_light_accepted | +20 |

### Công thức tổng
```
Total = (Identity + Activity + OnChain + Transparency + Ecosystem) × (1 + StreakBonus%) - RiskPenalty
```
- Clamp: 0 – 1000

### Risk Penalty
- Tổng severity của tất cả unresolved fraud signals
- Cap: 80

### Streak Bonus
| Streak | Bonus |
|--------|-------|
| ≥ 7 ngày | +2% |
| ≥ 30 ngày | +5% |
| ≥ 90 ngày | +10% |

### Time Decay (áp dụng cho Activity Score)
| Inactive | Multiplier |
|----------|-----------|
| < 30 ngày | ×1.0 |
| 30 ngày | ×0.85 |
| 60 ngày | ×0.6 |
| 90 ngày | ×0.3 |
| ≥ 180 ngày | ×0 |

### Cấp độ (Levels)
| Level | Tên | Điểm | Emoji |
|-------|-----|------|-------|
| 0 | Light Seed | 0-99 | 🌱 |
| 1 | Light Builder | 100-249 | 🔨 |
| 2 | Light Guardian | 250-499 | 🛡️ |
| 3 | Light Leader | 500-799 | 👑 |
| 4 | Cosmic Contributor | 800+ | 🌌 |

---

## Mối quan hệ giữa 2 lớp

- **LS-Math v1.0** đánh giá từng hành động → tích lũy vào `light_reputation.total_light_score`
- **Activity Dimension** lấy `total_light_score` từ `light_reputation` → normalize về 0-100
- Hai lớp **bổ sung cho nhau**, không thay thế nhau
- PPLP pillars (Service/Truth/Healing/Value/Unity) = đánh giá chất lượng nội dung
- Dimension pillars (Identity/Activity/OnChain/Transparency/Ecosystem) = đánh giá uy tín user

---

## Kiến trúc

### Database
- `light_reputation` — Action-level aggregates (giữ nguyên)
- `light_actions` — Log từng hành động (giữ nguyên)
- `user_dimension_scores` — 5 dimension scores (MỚI)

### Edge Functions
- `pplp-evaluate-action` — Chấm điểm hành động (giữ nguyên)
- `pplp-compute-dimensions` — Tính 5 dimension scores (MỚI, cron daily)
- `pplp-get-score` — Trả cả 2 lớp data (cập nhật)

### Frontend
- `useLightScore` — Hook cho action-level data (giữ nguyên)
- `useDimensionScores` — Hook cho 5 dimension data (MỚI)
- `DimensionScoreCard` — UI 5 trụ cột + radar chart (MỚI)
- `LightScoreDashboard` — Tích hợp cả 2 (cập nhật)
