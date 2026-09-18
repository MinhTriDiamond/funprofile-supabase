# 💬 Common Prompts - Thư Viện Prompts Cho Angel Lovable

> Copy-paste prompts để giao tiếp hiệu quả với Angel Lovable khi phát triển feature.

---

## 📖 Mục Lục

1. [Setup & Configuration](#1-setup--configuration)
2. [Tạo Components](#2-tạo-components)
3. [Database & Backend](#3-database--backend)
4. [Styling & UI](#4-styling--ui)
5. [Debug & Fix Lỗi](#5-debug--fix-lỗi)
6. [Testing & Review](#6-testing--review)

---

## 1. Setup & Configuration

### Clone PDK từ GitHub

```text
Angel ơi, giúp bé clone PDK từ GitHub repository:
https://github.com/MinhTriDiamond/fun-profile-pdk

Đây là Parallel Development Kit để phát triển tính năng cho Fun Profile.
Bé cần:
1. Tạo folder pdk/ ở root của project
2. Copy toàn bộ structure và files từ repo trên vào folder pdk/
3. Đảm bảo giữ nguyên cấu trúc thư mục
```

### Cài Dependencies

```text
Angel ơi, cài đặt các dependencies cần thiết cho PDK:

@radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-select
@radix-ui/react-checkbox @radix-ui/react-switch @radix-ui/react-progress
@radix-ui/react-scroll-area @radix-ui/react-toast @radix-ui/react-label
@radix-ui/react-separator @radix-ui/react-avatar
class-variance-authority clsx tailwind-merge lucide-react sonner next-themes
```

### Setup Tailwind Config

```text
Angel ơi, update tailwind.config.ts với nội dung từ pdk/config/tailwind.config.ts 
để sử dụng theme colors của Fun Profile.
```

---

## 2. Tạo Components

### Tạo Feature Mới

```text
Angel ơi, giúp bé tạo feature {TEN_FEATURE} với cấu trúc:

features/{ten-feature}/
├── README.md              # Mô tả feature
├── components/
│   ├── {Feature}Card.tsx   # Component card chính
│   └── {Feature}List.tsx   # Component list
├── hooks/
│   └── use{Feature}.ts     # Custom hook
└── database/
    └── migration.sql       # SQL migration

Sử dụng components từ @/pdk/core/components/ui/
Tham khảo ví dụ trong pdk/examples/badges-feature/
```

### Tạo Card Component

```text
Angel ơi, tạo component {Feature}Card.tsx trong features/{feature}/components/

Component cần:
- Import Card, CardHeader, CardTitle, CardContent từ @/pdk/core/components/ui/card
- Props interface với các fields: {liệt kê fields}
- Responsive trên mobile
- Sử dụng semantic colors (text-foreground, bg-card, etc.)
```

### Tạo List Component

```text
Angel ơi, tạo component {Feature}List.tsx:

- Hiển thị danh sách {Feature}Card trong grid responsive
- Grid: 1 cột mobile, 2 cột tablet, 3 cột desktop
- Có loading skeleton khi đang fetch
- Có empty state khi không có data
- Import Skeleton từ @/pdk/core/components/ui/skeleton
```

### Tạo Dialog/Modal

```text
Angel ơi, tạo dialog Create{Feature}Dialog.tsx:

- Import Dialog components từ @/pdk/core/components/ui/dialog
- Form với các fields: {liệt kê fields}
- Có validation cơ bản
- Submit button và Cancel button
- Hiển thị toast khi success/error
```

---

## 3. Database & Backend

### Tạo Database Table

```text
Angel ơi, tạo database table cho feature {feature}:

Table: {feature}_items
Columns:
- id: UUID primary key
- user_id: UUID (references auth.users)
- name: TEXT not null
- description: TEXT
- created_at: TIMESTAMP default now()
- updated_at: TIMESTAMP default now()

Cần:
1. Enable RLS
2. Policy cho users xem/tạo/sửa/xóa data của mình
3. Index cho user_id
```

### Tạo Custom Hook với Supabase

```text
Angel ơi, tạo hook use{Feature}.ts trong features/{feature}/hooks/:

Hook cần:
- Fetch data từ table {feature}_items
- Insert, Update, Delete operations
- Loading và error states
- Sử dụng @tanstack/react-query nếu có
- Import supabase client từ @/integrations/supabase/client
```

### Fix RLS Policy

```text
Angel ơi, fix lỗi RLS policy cho table {table_name}:

Lỗi: "new row violates row-level security policy"

Cần thêm policy cho:
- SELECT: Users có thể xem data của mình (auth.uid() = user_id)
- INSERT: Users có thể tạo data với user_id = auth.uid()
- UPDATE: Users có thể sửa data của mình
- DELETE: Users có thể xóa data của mình
```

---

## 4. Styling & UI

### Responsive Layout

```text
Angel ơi, update component {Component} để responsive hơn:

- Mobile (< 768px): Stack vertical, full width
- Tablet (768px - 1024px): 2 columns
- Desktop (> 1024px): 3 columns

Sử dụng Tailwind classes: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
```

### Dark Mode Support

```text
Angel ơi, update component {Component} để hỗ trợ dark mode:

- Thay tất cả hard-coded colors bằng semantic tokens
- bg-white → bg-background hoặc bg-card
- text-black → text-foreground
- text-gray-500 → text-muted-foreground
- border-gray-200 → border-border
```

### Add Loading State

```text
Angel ơi, thêm loading state cho component {Component}:

Khi loading:
- Hiển thị Skeleton component từ @/pdk/core/components/ui/skeleton
- Disable buttons
- Có loading spinner nếu phù hợp
```

---

## 5. Debug & Fix Lỗi

### Fix Import Error

```text
Angel ơi, fix lỗi import trong {file}:

Lỗi: "Cannot find module '@/components/ui/button'"

Cần đổi import path từ:
@/components/ui/{component}

Thành:
@/pdk/core/components/ui/{component}
```

### Fix TypeScript Error

```text
Angel ơi, fix lỗi TypeScript trong {file}:

Lỗi: "{error message}"

Cần:
- Định nghĩa interface cho props/data
- Hoặc thêm type annotation
- Hoặc check null/undefined
```

### Fix Toast Không Hiện

```text
Angel ơi, fix lỗi toast không hiển thị:

Cần kiểm tra:
1. Đã import Toaster vào App.tsx chưa?
2. Import đúng path: @/pdk/core/components/ui/toaster
3. Đặt <Toaster /> trong return của App component
```

### Debug Database Query

```text
Angel ơi, debug query tới table {table_name}:

Query đang return undefined/empty. Cần kiểm tra:
1. RLS policies có đúng không?
2. User đã login chưa?
3. Data có tồn tại trong database không?
4. Column names có đúng không?
```

---

## 6. Testing & Review

### Test Responsive

```text
Angel ơi, test component {Component} trên các kích thước màn hình:

- Mobile: 375px (iPhone SE)
- Tablet: 768px (iPad)
- Desktop: 1280px

Kiểm tra:
- Layout có bị vỡ không?
- Text có bị overflow không?
- Buttons có đủ lớn để tap trên mobile không?
```

### Review Code Quality

```text
Angel ơi, review code trong features/{feature}/:

Kiểm tra:
1. Tất cả imports đúng từ @/pdk/core/
2. Components có props interface
3. Có error handling với toast
4. Không có console.log thừa
5. Code clean, không có commented code
```

### Chuẩn Bị Submit

```text
Angel ơi, giúp bé kiểm tra feature {feature} trước khi submit:

Checklist:
[ ] Code trong folder features/{feature}/
[ ] Sử dụng components từ @/pdk/core/
[ ] Database tables có prefix {feature}_
[ ] RLS policies đã setup
[ ] Responsive trên mobile
[ ] Error handling với toast
[ ] Có README.md mô tả feature
[ ] Không có console.log thừa
```

---

## 💡 Tips Khi Viết Prompts

1. **Cụ thể**: Nêu rõ tên file, folder, component
2. **Context**: Mô tả vấn đề hoặc yêu cầu rõ ràng
3. **Ví dụ**: Đưa code mẫu nếu có thể
4. **Reference**: Chỉ đến ví dụ trong pdk/examples/
5. **Step by step**: Chia nhỏ yêu cầu nếu phức tạp
