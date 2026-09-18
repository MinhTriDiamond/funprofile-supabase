# 🎁 Referral Feature - Ví Dụ Hệ Thống Mời Bạn

> Ví dụ hoàn chỉnh về hệ thống referral cho Fun Profile.

---

## 📖 Mô Tả

Feature cho phép users:
- Tạo mã giới thiệu cá nhân
- Chia sẻ mã với bạn bè
- Nhận thưởng khi bạn bè sử dụng mã
- Xem thống kê số người đã mời

---

## 📁 Cấu Trúc

```
referral-feature/
├── README.md                    # File này
├── components/
│   ├── ReferralCard.tsx         # Hiển thị mã referral
│   ├── ReferralCodeInput.tsx    # Form nhập mã
│   └── ReferralStats.tsx        # Thống kê referrals
├── hooks/
│   └── useReferral.ts           # Logic và data fetching
└── database/
    └── migration.sql            # Database schema
```

---

## 🧩 Components

### ReferralCard

Hiển thị mã referral của user với nút copy.

**Props:**
```tsx
interface ReferralCardProps {
  code: string;
  totalUses: number;
  isActive: boolean;
  onCopy: () => void;
}
```

### ReferralCodeInput

Form để nhập mã referral khi đăng ký.

**Props:**
```tsx
interface ReferralCodeInputProps {
  onSubmit: (code: string) => void;
  loading?: boolean;
  error?: string;
}
```

### ReferralStats

Hiển thị thống kê chi tiết về referrals.

**Props:**
```tsx
interface ReferralStatsProps {
  totalReferrals: number;
  totalRewards: number;
  recentReferrals: ReferralUse[];
}
```

---

## 🪝 Hook

### useReferral

```tsx
const {
  referralCode,    // Mã referral của user
  stats,           // Thống kê
  loading,         // Loading state
  error,           // Error state
  generateCode,    // Tạo mã mới
  applyCode,       // Áp dụng mã referral
} = useReferral();
```

---

## 🗄️ Database Schema

### Tables

**referral_codes**
- `id`: UUID primary key
- `user_id`: UUID (owner của code)
- `code`: TEXT unique (mã 8 ký tự)
- `total_uses`: INTEGER (số lần đã dùng)
- `is_active`: BOOLEAN (còn hiệu lực không)
- `created_at`: TIMESTAMP

**referral_uses**
- `id`: UUID primary key
- `code_id`: UUID (references referral_codes)
- `referrer_id`: UUID (người giới thiệu)
- `referred_id`: UUID (người được giới thiệu)
- `reward_amount`: DECIMAL (số tiền thưởng)
- `created_at`: TIMESTAMP

---

## 🔒 RLS Policies

- Users có thể xem mã referral của mình
- Users có thể tạo 1 mã referral cho mình
- Users có thể xem referral uses mà họ là referrer
- Mã referral là public readable để validate

---

## 🚀 Cách Sử Dụng

### 1. Chạy Migration

Gửi nội dung `database/migration.sql` cho Angel Fun Profile để chạy.

### 2. Import Components

```tsx
import { ReferralCard } from "@/features/referral/components/ReferralCard";
import { ReferralStats } from "@/features/referral/components/ReferralStats";
import { useReferral } from "@/features/referral/hooks/useReferral";
```

### 3. Sử Dụng Trong Page

```tsx
function ReferralPage() {
  const { referralCode, stats, loading, generateCode } = useReferral();

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-6">
      {referralCode ? (
        <>
          <ReferralCard
            code={referralCode.code}
            totalUses={referralCode.total_uses}
            isActive={referralCode.is_active}
            onCopy={() => navigator.clipboard.writeText(referralCode.code)}
          />
          <ReferralStats
            totalReferrals={stats.totalReferrals}
            totalRewards={stats.totalRewards}
            recentReferrals={stats.recentReferrals}
          />
        </>
      ) : (
        <Button onClick={generateCode}>Tạo Mã Giới Thiệu</Button>
      )}
    </div>
  );
}
```

---

## ✅ Checklist

- [x] Components sử dụng PDK core UI
- [x] Hook với proper TypeScript types
- [x] Database với RLS policies
- [x] Responsive trên mobile
- [x] Error handling với toast
