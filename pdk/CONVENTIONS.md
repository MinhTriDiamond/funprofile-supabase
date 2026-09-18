# 📏 Quy Ước Đặt Tên & Coding Style

> Tuân thủ các quy ước này để đảm bảo code tương thích 100% với Fun Profile khi merge.

---

## 📖 Mục Lục

1. [Đặt Tên Files](#-đặt-tên-files)
2. [Đặt Tên Components](#-đặt-tên-components)
3. [Đặt Tên Database](#-đặt-tên-database)
4. [Coding Style](#-coding-style)
5. [Import Rules](#-import-rules)
6. [CSS & Styling](#-css--styling)

---

## 📁 Đặt Tên Files

### Components

```
✅ ĐÚNG                    ❌ SAI
ReferralCard.tsx           referral-card.tsx
ReferralList.tsx           referralList.tsx
InviteFriendDialog.tsx     invite_friend_dialog.tsx
```

**Quy tắc:**
- **PascalCase** cho tất cả component files
- Đuôi `.tsx` cho components có JSX
- Prefix với tên feature: `Referral*`, `Mission*`, `Badge*`

### Hooks

```
✅ ĐÚNG                    ❌ SAI
useReferral.ts             use-referral.ts
useReferralStats.ts        UseReferralStats.ts
useMissionProgress.ts      usemissionprogress.ts
```

**Quy tắc:**
- **camelCase** với prefix `use`
- Đuôi `.ts` (không phải `.tsx` trừ khi return JSX)

### Utilities / Helpers

```
✅ ĐÚNG                    ❌ SAI
formatReward.ts            FormatReward.ts
calculateBonus.ts          calculate-bonus.ts
referralUtils.ts           ReferralUtils.ts
```

**Quy tắc:**
- **camelCase** cho utility files
- Mô tả rõ chức năng

### Pages

```
✅ ĐÚNG                    ❌ SAI
ReferralPage.tsx           referral.tsx
MissionDashboard.tsx       mission-dashboard.tsx
BadgeCollection.tsx        badgeCollection.tsx
```

**Quy tắc:**
- **PascalCase** 
- Suffix `Page` hoặc tên mô tả rõ ràng

---

## 🧩 Đặt Tên Components

### Component Names

```tsx
// ✅ ĐÚNG - Prefix theo feature
export function ReferralCard() { ... }
export function ReferralStats() { ... }
export function ReferralInviteButton() { ... }

// ❌ SAI - Không có prefix
export function Card() { ... }
export function Stats() { ... }
export function InviteButton() { ... }
```

### Props Interface

```tsx
// ✅ ĐÚNG - Suffix Props
interface ReferralCardProps {
  code: string;
  referrals: number;
}

// ❌ SAI
interface ReferralCardData { ... }
interface IReferralCard { ... }
```

### Component Structure

```tsx
// ✅ Cấu trúc chuẩn
import { ... } from "@/pdk/core/components/ui/...";

interface ComponentNameProps {
  // props định nghĩa ở đây
}

export function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  // hooks ở đầu
  const [state, setState] = useState();
  
  // handlers
  const handleClick = () => { ... };
  
  // render
  return (
    <div>...</div>
  );
}
```

---

## 🗄️ Đặt Tên Database

### Tables

```sql
-- ✅ ĐÚNG - Prefix theo feature, snake_case
referral_codes
referral_rewards
referral_stats

mission_progress
mission_rewards
mission_daily

badge_awards
badge_types
badge_requirements

-- ❌ SAI - Không có prefix
codes
rewards
user_data
```

### Columns

```sql
-- ✅ ĐÚNG - snake_case
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID NOT NULL,
referral_code TEXT NOT NULL,
total_referrals INTEGER DEFAULT 0,
created_at TIMESTAMP DEFAULT now(),
updated_at TIMESTAMP DEFAULT now()

-- ❌ SAI - camelCase hoặc PascalCase
userId, referralCode, totalReferrals
UserId, ReferralCode
```

### Indexes

```sql
-- ✅ ĐÚNG - idx_{table}_{column}
CREATE INDEX idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX idx_referral_codes_code ON referral_codes(referral_code);

-- ❌ SAI
CREATE INDEX user_index ON referral_codes(user_id);
```

### RLS Policies

```sql
-- ✅ ĐÚNG - Mô tả rõ ràng
CREATE POLICY "Users can view own referral codes"
  ON referral_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own referral codes"
  ON referral_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ❌ SAI - Tên không rõ ràng
CREATE POLICY "select_policy" ON referral_codes ...
```

---

## 💻 Coding Style

### TypeScript

```tsx
// ✅ ĐÚNG - Explicit types
interface User {
  id: string;
  name: string;
  email: string;
}

const fetchUser = async (id: string): Promise<User> => {
  // ...
};

// ❌ SAI - Implicit any
const fetchUser = async (id) => {
  // ...
};
```

### State Management

```tsx
// ✅ ĐÚNG - useState với type
const [loading, setLoading] = useState<boolean>(false);
const [data, setData] = useState<User | null>(null);
const [items, setItems] = useState<Item[]>([]);

// ❌ SAI - Không có type
const [loading, setLoading] = useState();
```

### Error Handling

```tsx
// ✅ ĐÚNG - Dùng toast
import { useToast } from "@/pdk/core/hooks/use-toast";

const { toast } = useToast();

try {
  await saveData();
  toast({
    title: "Thành công",
    description: "Dữ liệu đã được lưu",
  });
} catch (error) {
  toast({
    title: "Lỗi",
    description: "Không thể lưu dữ liệu",
    variant: "destructive",
  });
}

// ❌ SAI - Dùng alert hoặc console.log
alert("Lỗi!");
console.log(error);
```

### Async/Await

```tsx
// ✅ ĐÚNG - async/await
const handleSubmit = async () => {
  setLoading(true);
  try {
    const result = await submitData();
    setData(result);
  } catch (error) {
    handleError(error);
  } finally {
    setLoading(false);
  }
};

// ❌ SAI - .then chains
const handleSubmit = () => {
  submitData()
    .then(result => setData(result))
    .catch(error => handleError(error));
};
```

---

## 📦 Import Rules

### Import Order

```tsx
// 1. React imports
import { useState, useEffect } from "react";

// 2. Third-party libraries
import { useQuery } from "@tanstack/react-query";

// 3. PDK core imports
import { Button } from "@/pdk/core/components/ui/button";
import { Card } from "@/pdk/core/components/ui/card";
import { useToast } from "@/pdk/core/hooks/use-toast";

// 4. Feature imports (same feature)
import { ReferralCard } from "./ReferralCard";
import { useReferral } from "../hooks/useReferral";

// 5. Types
import type { ReferralData } from "../types";
```

### Path Aliases

```tsx
// ✅ ĐÚNG - Dùng @ alias
import { Button } from "@/pdk/core/components/ui/button";
import { ReferralCard } from "@/features/referral/components/ReferralCard";

// ❌ SAI - Relative paths dài
import { Button } from "../../../pdk/core/components/ui/button";
```

---

## 🎨 CSS & Styling

### Tailwind Only

```tsx
// ✅ ĐÚNG - Tailwind classes
<div className="flex items-center gap-4 p-4 bg-card rounded-lg">
  <span className="text-lg font-semibold text-foreground">
    Hello
  </span>
</div>

// ❌ SAI - Inline styles
<div style={{ display: 'flex', padding: '16px' }}>
  ...
</div>

// ❌ SAI - Custom CSS files
import "./ReferralCard.css";
```

### Semantic Colors

```tsx
// ✅ ĐÚNG - Semantic tokens
className="bg-background text-foreground"
className="bg-card text-card-foreground"
className="bg-primary text-primary-foreground"
className="bg-muted text-muted-foreground"
className="border-border"

// ❌ SAI - Hard-coded colors
className="bg-white text-black"
className="bg-[#166534] text-[#ffffff]"
```

### Responsive Design

```tsx
// ✅ ĐÚNG - Mobile-first
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  ...
</div>

<button className="w-full md:w-auto">
  Submit
</button>

// ❌ SAI - Desktop-first
<div className="grid grid-cols-3 sm:grid-cols-1">
  ...
</div>
```

### Spacing

```tsx
// ✅ ĐÚNG - Consistent spacing
className="p-4"      // 16px
className="p-6"      // 24px
className="gap-2"    // 8px
className="gap-4"    // 16px
className="space-y-4" // 16px vertical

// ❌ SAI - Arbitrary values
className="p-[17px]"
className="gap-[13px]"
```

---

## 📋 Quick Reference

| Loại | Quy ước | Ví dụ |
|------|---------|-------|
| Component file | PascalCase.tsx | `ReferralCard.tsx` |
| Hook file | useCamelCase.ts | `useReferral.ts` |
| Utility file | camelCase.ts | `formatReward.ts` |
| Database table | feature_snake_case | `referral_codes` |
| Database column | snake_case | `user_id` |
| Props interface | ComponentNameProps | `ReferralCardProps` |
| CSS | Tailwind only | `className="..."` |

---

## ✅ Checklist

Trước khi commit, kiểm tra:

```
[ ] Tất cả files đặt tên đúng convention
[ ] Components có prefix feature
[ ] Database tables có prefix feature
[ ] Sử dụng semantic colors (không hard-code)
[ ] Responsive trên mobile
[ ] Error handling với toast
[ ] Không có console.log thừa
[ ] Import đúng thứ tự
```
