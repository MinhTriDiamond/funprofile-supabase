# 🏆 Badges Feature

> Hệ thống huy hiệu thành tích cho người dùng Fun Profile.

## Mô Tả

Feature này cho phép hiển thị và quản lý các huy hiệu thành tích của người dùng. Bao gồm:
- Hiển thị danh sách huy hiệu đã đạt được
- Hiển thị tiến độ đến huy hiệu tiếp theo
- Animation khi mở khóa huy hiệu mới

## Components

### BadgeCard
Hiển thị một huy hiệu đơn lẻ với icon, tên và mô tả.

```tsx
import { BadgeCard } from "@/features/badges/components/BadgeCard";

<BadgeCard
  id="first-post"
  name="First Post"
  description="Đăng bài viết đầu tiên"
  icon="🎉"
  isUnlocked={true}
  unlockedAt="2025-01-29"
/>
```

### BadgeList
Hiển thị danh sách tất cả huy hiệu với tabs phân loại.

```tsx
import { BadgeList } from "@/features/badges/components/BadgeList";

<BadgeList userId={currentUserId} />
```

## Hooks

### useBadges
Hook để fetch và quản lý huy hiệu của user.

```tsx
import { useBadges } from "@/features/badges/hooks/useBadges";

const { badges, isLoading, unlockedCount, totalCount } = useBadges(userId);
```

## Database

### Table: badge_definitions
Định nghĩa các loại huy hiệu có thể đạt được.

### Table: badge_awards
Lưu trữ huy hiệu đã được trao cho user.

## Screenshots

[Đính kèm screenshots khi hoàn thành]
