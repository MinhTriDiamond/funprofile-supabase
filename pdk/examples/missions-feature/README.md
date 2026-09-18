# 🎯 Missions Feature - Ví Dụ Hệ Thống Nhiệm Vụ

> Ví dụ hoàn chỉnh về hệ thống nhiệm vụ hàng ngày cho Fun Profile.

---

## 📖 Mô Tả

Feature cho phép users:
- Xem danh sách nhiệm vụ hàng ngày
- Theo dõi tiến độ hoàn thành
- Nhận thưởng khi hoàn thành nhiệm vụ
- Reset nhiệm vụ mỗi ngày

---

## 📁 Cấu Trúc

```
missions-feature/
├── README.md                    # File này
├── components/
│   ├── MissionCard.tsx          # Card hiển thị 1 nhiệm vụ
│   ├── MissionProgress.tsx      # Progress bar
│   └── MissionList.tsx          # Danh sách nhiệm vụ
├── hooks/
│   └── useMissions.ts           # Logic và data fetching
└── database/
    └── migration.sql            # Database schema
```

---

## 🧩 Components

### MissionCard

Hiển thị thông tin và tiến độ của 1 nhiệm vụ.

**Props:**
```tsx
interface MissionCardProps {
  mission: Mission;
  progress: MissionProgress;
  onClaim: () => void;
}
```

### MissionProgress

Progress bar cho nhiệm vụ.

**Props:**
```tsx
interface MissionProgressProps {
  current: number;
  target: number;
  showLabel?: boolean;
}
```

### MissionList

Danh sách tất cả nhiệm vụ với filter.

**Props:**
```tsx
interface MissionListProps {
  missions: Mission[];
  progresses: MissionProgress[];
  onClaimReward: (missionId: string) => void;
}
```

---

## 🪝 Hook

### useMissions

```tsx
const {
  missions,         // Danh sách nhiệm vụ
  progresses,       // Tiến độ của user
  loading,          // Loading state
  error,            // Error state
  claimReward,      // Claim thưởng
  refreshMissions,  // Refresh data
} = useMissions();
```

---

## 🗄️ Database Schema

### Tables

**mission_definitions**
- `id`: UUID primary key
- `name`: TEXT (tên nhiệm vụ)
- `description`: TEXT (mô tả)
- `reward_amount`: DECIMAL (số thưởng)
- `reward_type`: TEXT (FUN, XP, etc.)
- `target_value`: INTEGER (mục tiêu cần đạt)
- `mission_type`: TEXT (daily, weekly, one_time)
- `is_active`: BOOLEAN
- `created_at`: TIMESTAMP

**mission_progress**
- `id`: UUID primary key
- `user_id`: UUID (references auth.users)
- `mission_id`: UUID (references mission_definitions)
- `current_value`: INTEGER (tiến độ hiện tại)
- `is_completed`: BOOLEAN
- `completed_at`: TIMESTAMP
- `is_claimed`: BOOLEAN
- `claimed_at`: TIMESTAMP
- `reset_at`: TIMESTAMP (thời điểm reset tiếp theo)
- `created_at`: TIMESTAMP

---

## 🔒 RLS Policies

- Tất cả users có thể xem mission_definitions (public)
- Users chỉ xem/sửa mission_progress của mình
- Users có thể claim thưởng khi đủ điều kiện

---

## 🚀 Cách Sử Dụng

### 1. Chạy Migration

Gửi nội dung `database/migration.sql` cho Angel Fun Profile.

### 2. Import Components

```tsx
import { MissionCard } from "@/features/missions/components/MissionCard";
import { MissionList } from "@/features/missions/components/MissionList";
import { useMissions } from "@/features/missions/hooks/useMissions";
```

### 3. Sử Dụng Trong Page

```tsx
function MissionsPage() {
  const { missions, progresses, loading, claimReward } = useMissions();

  if (loading) return <MissionListSkeleton />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nhiệm Vụ Hàng Ngày</h1>
      <MissionList
        missions={missions}
        progresses={progresses}
        onClaimReward={claimReward}
      />
    </div>
  );
}
```

---

## 🎮 Loại Nhiệm Vụ

| Type | Mô tả | Reset |
|------|-------|-------|
| `daily` | Nhiệm vụ hàng ngày | 00:00 UTC |
| `weekly` | Nhiệm vụ hàng tuần | Thứ 2, 00:00 UTC |
| `one_time` | Nhiệm vụ 1 lần | Không reset |

---

## 💡 Ví Dụ Nhiệm Vụ

1. **Đăng nhập hàng ngày** - Target: 1, Reward: 5 FUN
2. **Đăng 3 bài viết** - Target: 3, Reward: 20 FUN
3. **Nhận 10 reactions** - Target: 10, Reward: 15 FUN
4. **Mời 1 bạn bè** - Target: 1, Reward: 50 FUN

---

## ✅ Checklist

- [x] Components sử dụng PDK core UI
- [x] Hook với proper TypeScript types
- [x] Database với RLS policies
- [x] Responsive trên mobile
- [x] Error handling với toast
- [x] Progress animation
