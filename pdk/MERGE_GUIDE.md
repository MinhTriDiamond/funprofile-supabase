# 📤 Hướng Dẫn Submit Feature

> Quy trình submit code về Fun Profile main để merge.

---

## 📖 Mục Lục

1. [Trước Khi Submit](#-trước-khi-submit)
2. [Checklist](#-checklist)
3. [Form Submit](#-form-submit)
4. [Quy Trình Review](#-quy-trình-review)
5. [Sau Khi Merge](#-sau-khi-merge)

---

## 🔍 Trước Khi Submit

### 1. Kiểm Tra Cấu Trúc Folder

Đảm bảo code của bạn nằm trong đúng folder:

```
features/{ten-feature}/
├── README.md                 ← BẮT BUỘC
├── components/
│   ├── FeatureCard.tsx
│   └── FeatureList.tsx
├── hooks/
│   └── useFeature.ts
├── pages/                    ← Nếu có
│   └── FeaturePage.tsx
└── database/                 ← Nếu cần DB
    └── migration.sql
```

### 2. Kiểm Tra README.md

Feature README cần có các phần sau:

```markdown
# {Tên Feature}

## Mô Tả
[Mô tả ngắn về feature]

## Cách Sử Dụng
[Hướng dẫn import và sử dụng]

## Components
- `ComponentA` - [Mô tả]
- `ComponentB` - [Mô tả]

## Hooks
- `useFeature` - [Mô tả]

## Database
- Table: `feature_items` - [Mô tả]

## Screenshots
[Đính kèm screenshots nếu có]
```

### 3. Test Trên Mobile

- Mở Lovable preview trên điện thoại
- Kiểm tra layout responsive
- Kiểm tra touch targets đủ lớn (44x44px minimum)
- Kiểm tra scroll hoạt động mượt

### 4. Test Các Scenarios

- ✅ User đã đăng nhập
- ✅ User chưa đăng nhập (nếu applicable)
- ✅ Data rỗng (empty state)
- ✅ Data nhiều (pagination/scroll)
- ✅ Lỗi network
- ✅ Loading states

---

## ✅ Checklist

Copy và điền checklist này trước khi submit:

```
## Pre-Submit Checklist

### Cấu Trúc
[ ] Code trong folder features/{feature-name}/
[ ] Có README.md mô tả feature
[ ] Đặt tên files đúng convention (PascalCase.tsx)

### Code Quality
[ ] Sử dụng components từ @/pdk/core/
[ ] KHÔNG sửa đổi files trong pdk/core/
[ ] KHÔNG có console.log thừa
[ ] KHÔNG có TODO comments còn sót
[ ] Error handling với toast (không dùng alert)

### TypeScript
[ ] Không có type errors
[ ] Props có interface rõ ràng
[ ] Không có `any` types

### Styling
[ ] Sử dụng Tailwind CSS (không custom CSS)
[ ] Sử dụng semantic colors (bg-background, text-foreground)
[ ] Responsive trên mobile (test với iPhone SE)

### Database (nếu có)
[ ] Tables có prefix feature
[ ] RLS enabled
[ ] RLS policies cho SELECT, INSERT, UPDATE, DELETE
[ ] Indexes cho columns query thường xuyên
[ ] Migration file có comments rõ ràng

### Testing
[ ] Test với user đã login
[ ] Test empty states
[ ] Test loading states
[ ] Test error states
```

---

## 📝 Form Submit

Khi đã hoàn thành checklist, gửi thông tin sau:

---

### 📤 FEATURE SUBMISSION FORM

**Thông tin cá nhân**
```
Tên bé: _______________________
Ngày submit: ___________________
```

**Feature info**
```
Feature name: _______________________
Mô tả ngắn (1-2 câu): _______________________
_______________________
```

**Project link**
```
Lovable project URL: _______________________
```

**Files đã tạo** (liệt kê tất cả)
```
features/{feature}/
├── README.md
├── components/
│   ├── _______________________
│   ├── _______________________
│   └── _______________________
├── hooks/
│   └── _______________________
├── pages/
│   └── _______________________
└── database/
    └── _______________________
```

**Database**
```
Cần database mới? [ ] Có  [ ] Không

Nếu có:
- Tên tables: _______________________
- Đã viết migration.sql? [ ] Rồi
- Migration file path: _______________________
```

**Demo**
```
Screenshots: [Link hoặc đính kèm]
Video demo (nếu có): [Link]
```

**Ghi chú thêm**
```
_______________________
_______________________
```

---

## 🔄 Quy Trình Review

### Bước 1: Initial Review (Angel Fun Profile)

Angel sẽ kiểm tra:
- [ ] Cấu trúc folder đúng chuẩn
- [ ] Naming conventions
- [ ] Sử dụng đúng PDK components
- [ ] Code quality

**Thời gian**: 1-2 ngày làm việc

### Bước 2: Code Review

Chi tiết review:
- Logic hoạt động đúng
- Performance
- Security (đặc biệt RLS policies)
- Edge cases handling

**Feedback**: Angel sẽ comment nếu cần sửa đổi

### Bước 3: Database Migration (nếu có)

Angel Fun Profile sẽ:
1. Review migration SQL
2. Test trên môi trường dev
3. Apply migration
4. Verify RLS policies

### Bước 4: Integration

Angel Fun Profile sẽ:
1. Copy folder `features/{feature}/` vào main project
2. Import components cần thiết
3. Add routes (nếu có pages)
4. Test integration

### Bước 5: Merge Complete

- Thông báo cho bé biết đã merge
- Deploy lên staging
- Test cuối cùng
- Deploy production

---

## 📊 Trạng Thái Submission

| Status | Meaning |
|--------|---------|
| 🟡 Pending | Đang chờ review |
| 🔵 In Review | Đang review |
| 🟠 Changes Requested | Cần sửa đổi |
| 🟢 Approved | Đã approve |
| ✅ Merged | Đã merge vào main |

---

## ❌ Lý Do Reject Phổ Biến

### 1. Sai Cấu Trúc Folder

```
❌ SAI
src/components/ReferralCard.tsx

✅ ĐÚNG
features/referral/components/ReferralCard.tsx
```

### 2. Import Sai

```tsx
// ❌ SAI
import { Button } from "@/components/ui/button";

// ✅ ĐÚNG
import { Button } from "@/pdk/core/components/ui/button";
```

### 3. Thiếu RLS Policies

```sql
-- ❌ SAI - Không có RLS
CREATE TABLE referral_codes (...);

-- ✅ ĐÚNG - Có RLS
CREATE TABLE referral_codes (...);
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "..." ON referral_codes ...;
```

### 4. Hard-coded Colors

```tsx
// ❌ SAI
<div className="bg-white text-black">

// ✅ ĐÚNG
<div className="bg-background text-foreground">
```

### 5. Console.log Còn Sót

```tsx
// ❌ SAI
console.log("debug:", data);

// ✅ ĐÚNG - Xóa hoặc dùng proper logging
```

---

## 🎉 Sau Khi Merge

### Bạn sẽ nhận được:

1. **Thông báo merge** - Xác nhận code đã merge
2. **Link preview** - Xem feature trên staging
3. **Credit** - Ghi nhận đóng góp trong changelog

### Tiếp theo:

- Theo dõi bug reports (nếu có)
- Support fix bugs liên quan đến feature của bạn
- Có thể nhận task cải tiến feature

---

## ❓ FAQ

### Q: Mất bao lâu để được review?

A: Thông thường 1-3 ngày làm việc, tùy thuộc vào độ phức tạp của feature.

### Q: Nếu cần sửa đổi thì sao?

A: Angel sẽ comment chi tiết những gì cần sửa. Bạn sửa và reply khi xong.

### Q: Có thể submit nhiều features cùng lúc?

A: Khuyến khích hoàn thành 1 feature trước rồi mới bắt đầu feature tiếp theo.

### Q: Database migration bị reject thì sao?

A: Angel sẽ giải thích lý do và hướng dẫn cách sửa. Thường là thiếu RLS hoặc naming sai.

### Q: Feature của mình cần sửa code core?

A: Liên hệ Angel Fun Profile trước. Không tự ý sửa PDK core.

---

## 📞 Liên Hệ

Nếu có thắc mắc về quy trình submit:

1. Đọc lại documentation trong folder `pdk/`
2. Hỏi Angel Lovable trong project của bạn
3. Liên hệ Angel Fun Profile qua form submit

---

**Cảm ơn bạn đã đóng góp cho Fun Profile! 🎉**
