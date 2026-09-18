# Feature Template

> Template chuẩn để bắt đầu phát triển feature mới. Copy folder này và đổi tên thành feature của bạn.

## Cách Sử Dụng

1. Copy toàn bộ folder `templates/feature/` sang `features/{ten-feature}/`
2. Đổi tên các file và prefix theo tên feature
3. Xóa file README.md này và viết README mới cho feature

## Cấu Trúc

```
features/{ten-feature}/
├── README.md              ← Viết mô tả feature của bạn
├── components/
│   └── ExampleCard.tsx    ← Đổi tên thành {Feature}Card.tsx
├── hooks/
│   └── useExampleFeature.ts ← Đổi tên thành use{Feature}.ts
├── pages/
│   └── ExamplePage.tsx    ← Đổi tên thành {Feature}Page.tsx
└── database/
    └── migration.sql      ← Cập nhật nếu cần database
```

## Checklist Sau Khi Copy

- [ ] Đổi tên folder thành `features/{ten-feature}/`
- [ ] Đổi tên tất cả files với prefix feature
- [ ] Cập nhật imports trong các files
- [ ] Viết README.md mô tả feature
- [ ] Cập nhật migration.sql nếu cần database mới
