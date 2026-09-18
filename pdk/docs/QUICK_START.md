# ⚡ Quick Start - Bắt Đầu Trong 2 Phút

> Hướng dẫn nhanh nhất để setup PDK và bắt đầu phát triển feature cho Fun Profile.

---

## 🚀 Bước 1: Tạo Project Lovable Mới

1. Truy cập [lovable.dev](https://lovable.dev)
2. Tạo project mới với tên: `fun-{ten-feature}` (ví dụ: `fun-referral`)

---

## 📦 Bước 2: Clone PDK

Copy prompt sau và gửi cho Angel Lovable của bạn:

```text
Angel ơi, giúp bé clone PDK từ GitHub repository:
https://github.com/MinhTriDiamond/fun-profile-pdk

Đây là Parallel Development Kit để phát triển tính năng cho Fun Profile.
Bé cần:
1. Tạo folder pdk/ ở root của project
2. Copy toàn bộ structure và files từ repo trên vào folder pdk/
3. Đảm bảo giữ nguyên cấu trúc thư mục
```

---

## 📚 Bước 3: Cài Đặt Dependencies

Copy prompt sau:

```text
Angel ơi, cài đặt các dependencies sau cho project:

@radix-ui/react-dialog
@radix-ui/react-tabs
@radix-ui/react-select
@radix-ui/react-checkbox
@radix-ui/react-switch
@radix-ui/react-progress
@radix-ui/react-scroll-area
@radix-ui/react-toast
@radix-ui/react-label
@radix-ui/react-separator
@radix-ui/react-avatar
class-variance-authority
clsx
tailwind-merge
lucide-react
sonner
next-themes
```

---

## ⚙️ Bước 4: Setup Config

Copy prompt sau:

```text
Angel ơi, copy các file config từ pdk/config/ vào đúng vị trí:

1. Copy nội dung pdk/config/tailwind.config.ts → tailwind.config.ts (root)
2. Copy nội dung pdk/config/index.css → src/index.css
3. Copy nội dung pdk/config/components.json → components.json (root)
```

---

## 🎨 Bước 5: Tạo Feature Đầu Tiên

Copy prompt sau (thay `{TenFeature}` bằng tên feature của bạn):

```text
Angel ơi, giúp bé tạo feature mới tên là {TenFeature}:

1. Tạo folder features/{ten-feature}/
2. Bên trong tạo cấu trúc:
   - components/
   - hooks/
   - pages/ (nếu cần)
   - database/ (nếu cần)
   - README.md

3. Tham khảo ví dụ trong pdk/examples/ để biết cấu trúc chuẩn
4. Sử dụng components từ @/pdk/core/components/ui/
```

---

## ✅ Checklist Trước Khi Submit

Kiểm tra 5 điểm sau trước khi gửi code:

| # | Kiểm tra | Đạt |
|---|----------|-----|
| 1 | Code nằm trong `features/{feature-name}/` | ☐ |
| 2 | Import components từ `@/pdk/core/` | ☐ |
| 3 | Database tables có prefix feature (ví dụ: `referral_codes`) | ☐ |
| 4 | Có RLS policies cho tất cả tables | ☐ |
| 5 | Responsive trên mobile | ☐ |

---

## 📖 Đọc Thêm

| Tài liệu | Mô tả |
|----------|-------|
| [CONVENTIONS.md](../CONVENTIONS.md) | Quy ước đặt tên |
| [UI_PATTERNS.md](./UI_PATTERNS.md) | Patterns UI phổ biến |
| [COMMON_PROMPTS.md](./COMMON_PROMPTS.md) | Prompts cho Angel |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Xử lý lỗi |

---

## 🆘 Cần Hỗ Trợ?

1. Xem folder `pdk/examples/` để tham khảo code mẫu
2. Đọc `TROUBLESHOOTING.md` khi gặp lỗi
3. Hỏi Angel Lovable trong project của bạn
4. Liên hệ Angel Fun Profile khi cần merge

**Chúc bạn phát triển vui vẻ! 🎉**
