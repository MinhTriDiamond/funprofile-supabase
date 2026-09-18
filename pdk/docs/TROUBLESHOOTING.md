# 🔧 Troubleshooting - Xử Lý Lỗi Thường Gặp

> Hướng dẫn tự xử lý các lỗi phổ biến khi phát triển feature với PDK.

---

## 📖 Mục Lục

1. [Import & Module Errors](#1-import--module-errors)
2. [TypeScript Errors](#2-typescript-errors)
3. [Database & RLS Errors](#3-database--rls-errors)
4. [UI & Styling Errors](#4-ui--styling-errors)
5. [Build & Runtime Errors](#5-build--runtime-errors)
6. [Supabase Errors](#6-supabase-errors)

---

## 1. Import & Module Errors

### ❌ Cannot find module '@/components/ui/button'

**Nguyên nhân**: Import sai path, không dùng PDK core.

**Cách sửa**:
```tsx
// ❌ SAI
import { Button } from "@/components/ui/button";

// ✅ ĐÚNG
import { Button } from "@/pdk/core/components/ui/button";
```

---

### ❌ Module not found: Can't resolve 'lucide-react'

**Nguyên nhân**: Chưa cài dependency.

**Cách sửa**: Nhờ Angel cài đặt:
```text
Angel ơi, cài đặt package lucide-react
```

---

### ❌ Cannot use import statement outside a module

**Nguyên nhân**: File không phải TypeScript hoặc config sai.

**Cách sửa**:
1. Đảm bảo file có đuôi `.tsx` hoặc `.ts`
2. Kiểm tra `tsconfig.json` có config đúng

---

## 2. TypeScript Errors

### ❌ Property 'X' does not exist on type 'Y'

**Nguyên nhân**: Object không có property đó hoặc thiếu type definition.

**Cách sửa**:
```tsx
// ❌ SAI - Không có interface
function UserCard({ user }) {
  return <div>{user.name}</div>;
}

// ✅ ĐÚNG - Có interface
interface User {
  id: string;
  name: string;
  email: string;
}

interface UserCardProps {
  user: User;
}

function UserCard({ user }: UserCardProps) {
  return <div>{user.name}</div>;
}
```

---

### ❌ Type 'X' is not assignable to type 'Y'

**Nguyên nhân**: Type không khớp.

**Cách sửa**:
```tsx
// ❌ SAI
const [count, setCount] = useState(); // type là undefined
setCount("hello"); // Error!

// ✅ ĐÚNG
const [count, setCount] = useState<number>(0);
setCount(5);
```

---

### ❌ Object is possibly 'undefined'

**Nguyên nhân**: Chưa check null/undefined.

**Cách sửa**:
```tsx
// ❌ SAI
function UserName({ user }: { user?: User }) {
  return <span>{user.name}</span>; // Error!
}

// ✅ ĐÚNG - Optional chaining
function UserName({ user }: { user?: User }) {
  return <span>{user?.name ?? "Unknown"}</span>;
}

// ✅ ĐÚNG - Early return
function UserName({ user }: { user?: User }) {
  if (!user) return null;
  return <span>{user.name}</span>;
}
```

---

## 3. Database & RLS Errors

### ❌ new row violates row-level security policy

**Nguyên nhân**: RLS policy không cho phép insert.

**Cách sửa**:
1. Đảm bảo có policy cho INSERT:
```sql
CREATE POLICY "Users can create own items"
ON feature_items FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

2. Đảm bảo truyền `user_id` khi insert:
```tsx
// ❌ SAI - Thiếu user_id
await supabase.from("feature_items").insert({
  name: "Item 1",
});

// ✅ ĐÚNG
const { data: { user } } = await supabase.auth.getUser();
await supabase.from("feature_items").insert({
  name: "Item 1",
  user_id: user.id,
});
```

---

### ❌ permission denied for table X

**Nguyên nhân**: Chưa enable RLS hoặc thiếu policy.

**Cách sửa**:
```sql
-- Enable RLS
ALTER TABLE feature_items ENABLE ROW LEVEL SECURITY;

-- Thêm policies
CREATE POLICY "Users can view own items"
ON feature_items FOR SELECT
USING (auth.uid() = user_id);
```

---

### ❌ relation "table_name" does not exist

**Nguyên nhân**: Table chưa được tạo trong database.

**Cách sửa**:
1. Nhờ Angel chạy migration:
```text
Angel ơi, chạy migration SQL sau để tạo table:

CREATE TABLE feature_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE feature_items ENABLE ROW LEVEL SECURITY;
```

---

## 4. UI & Styling Errors

### ❌ Toast không hiển thị

**Nguyên nhân**: Chưa thêm Toaster component vào App.

**Cách sửa**:
```tsx
// App.tsx
import { Toaster } from "@/pdk/core/components/ui/toaster";

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster /> {/* Thêm dòng này */}
    </>
  );
}
```

---

### ❌ Dark mode không hoạt động

**Nguyên nhân**: Dùng hard-coded colors.

**Cách sửa**:
```tsx
// ❌ SAI
<div className="bg-white text-black">

// ✅ ĐÚNG
<div className="bg-background text-foreground">
```

Bảng chuyển đổi:
| Hard-coded | Semantic |
|------------|----------|
| `bg-white` | `bg-background` hoặc `bg-card` |
| `text-black` | `text-foreground` |
| `text-gray-500` | `text-muted-foreground` |
| `border-gray-200` | `border-border` |

---

### ❌ Layout bị vỡ trên mobile

**Nguyên nhân**: Không responsive.

**Cách sửa**:
```tsx
// ❌ SAI - Fixed columns
<div className="grid grid-cols-3">

// ✅ ĐÚNG - Responsive
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

---

## 5. Build & Runtime Errors

### ❌ Maximum update depth exceeded

**Nguyên nhân**: Infinite loop trong useEffect.

**Cách sửa**:
```tsx
// ❌ SAI - Missing dependency causes infinite loop
useEffect(() => {
  setItems([...items, newItem]);
}, [items]); // items changes → effect runs → items changes...

// ✅ ĐÚNG - Use callback form
useEffect(() => {
  setItems(prev => [...prev, newItem]);
}, [newItem]);
```

---

### ❌ Cannot read properties of undefined

**Nguyên nhân**: Truy cập property của undefined/null.

**Cách sửa**:
```tsx
// ❌ SAI
const name = data.user.profile.name;

// ✅ ĐÚNG
const name = data?.user?.profile?.name ?? "Default";
```

---

### ❌ Each child in a list should have a unique "key" prop

**Nguyên nhân**: Thiếu key khi map array.

**Cách sửa**:
```tsx
// ❌ SAI
{items.map(item => <ItemCard item={item} />)}

// ✅ ĐÚNG
{items.map(item => <ItemCard key={item.id} item={item} />)}
```

---

## 6. Supabase Errors

### ❌ Invalid API key

**Nguyên nhân**: API key sai hoặc chưa config.

**Cách sửa**: Kiểm tra file `.env`:
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
```

---

### ❌ JWT expired

**Nguyên nhân**: User session hết hạn.

**Cách sửa**:
```tsx
// Refresh session
const { data, error } = await supabase.auth.refreshSession();

// Hoặc logout và login lại
await supabase.auth.signOut();
```

---

### ❌ duplicate key value violates unique constraint

**Nguyên nhân**: Insert data trùng với unique column.

**Cách sửa**:
```tsx
// Dùng upsert thay vì insert
const { error } = await supabase
  .from("feature_items")
  .upsert({ id: existingId, name: "New name" });
```

---

## 🆘 Vẫn Không Giải Quyết Được?

1. **Đọc error message kỹ** - Thường có hint về nguyên nhân
2. **Check console logs** - Có thể có thêm thông tin
3. **Hỏi Angel Lovable** với format:
```text
Angel ơi, bé gặp lỗi sau:

[Paste error message]

Trong file: [tên file]
Khi thực hiện: [mô tả hành động]

Giúp bé fix lỗi này với!
```

4. **Liên hệ Angel Fun Profile** nếu lỗi liên quan đến PDK core
