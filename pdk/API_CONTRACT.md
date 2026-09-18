# 📡 API Contract - Fun Profile

> Database schema và API endpoints có sẵn trong Fun Profile. Đọc kỹ trước khi phát triển feature mới.

---

## 📖 Mục Lục

1. [Database Tables Có Sẵn](#-database-tables-có-sẵn)
2. [Tạo Tables Mới](#-tạo-tables-mới)
3. [Authentication](#-authentication)
4. [Supabase Client](#-supabase-client)
5. [Edge Functions](#-edge-functions)

---

## 📊 Database Tables Có Sẵn

> ⚠️ **QUAN TRỌNG**: Các tables dưới đây là **READ-ONLY**. Không tạo migration để sửa đổi chúng!

### profiles

Thông tin người dùng cơ bản.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | User ID (khớp với auth.users.id) |
| `username` | TEXT | Tên hiển thị |
| `avatar_url` | TEXT \| null | URL ảnh đại diện |
| `cover_url` | TEXT \| null | URL ảnh bìa |
| `bio` | TEXT \| null | Tiểu sử |
| `full_name` | TEXT \| null | Họ tên đầy đủ |
| `pending_reward` | NUMBER | CAMLY đang chờ duyệt |
| `approved_reward` | NUMBER | CAMLY đã duyệt |
| `total_rewards` | NUMBER | Tổng CAMLY đã claim |
| `created_at` | TIMESTAMP | Ngày tạo |

**Ví dụ truy vấn:**

```typescript
// Lấy profile user hiện tại
const { data: profile } = await supabase
  .from('profiles')
  .select('id, username, avatar_url, pending_reward')
  .eq('id', userId)
  .single();

// Tìm kiếm users
const { data: users } = await supabase
  .from('profiles')
  .select('id, username, avatar_url')
  .ilike('username', `%${searchTerm}%`)
  .limit(10);
```

---

### posts

Bài viết của người dùng.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Post ID |
| `user_id` | UUID | ID người đăng |
| `content` | TEXT | Nội dung bài viết |
| `media_urls` | JSON \| null | Mảng URLs media |
| `visibility` | TEXT | 'public', 'friends', 'private' |
| `location` | TEXT \| null | Địa điểm check-in |
| `created_at` | TIMESTAMP | Ngày đăng |
| `updated_at` | TIMESTAMP | Ngày cập nhật |

**Ví dụ truy vấn:**

```typescript
// Lấy posts của user
const { data: posts } = await supabase
  .from('posts')
  .select(`
    id,
    content,
    media_urls,
    created_at,
    profiles:user_id (username, avatar_url)
  `)
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(20);
```

---

### reactions

Reactions trên posts và comments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Reaction ID |
| `user_id` | UUID | ID người react |
| `post_id` | UUID \| null | ID bài viết |
| `comment_id` | UUID \| null | ID comment |
| `type` | TEXT | 'like', 'love', 'haha', 'wow', 'sad', 'angry' |
| `created_at` | TIMESTAMP | Ngày tạo |

**Ví dụ truy vấn:**

```typescript
// Đếm reactions của post
const { count } = await supabase
  .from('reactions')
  .select('*', { count: 'exact', head: true })
  .eq('post_id', postId);

// Kiểm tra user đã react chưa
const { data: myReaction } = await supabase
  .from('reactions')
  .select('type')
  .eq('post_id', postId)
  .eq('user_id', userId)
  .single();
```

---

### comments

Comments trên posts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Comment ID |
| `post_id` | UUID | ID bài viết |
| `user_id` | UUID | ID người comment |
| `content` | TEXT | Nội dung comment |
| `parent_comment_id` | UUID \| null | Reply to comment |
| `image_url` | TEXT \| null | Ảnh đính kèm |
| `created_at` | TIMESTAMP | Ngày tạo |

---

### friendships

Quan hệ bạn bè.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Friendship ID |
| `user_id` | UUID | Người gửi lời mời |
| `friend_id` | UUID | Người nhận lời mời |
| `status` | TEXT | 'pending', 'accepted' |
| `created_at` | TIMESTAMP | Ngày tạo |

**Ví dụ truy vấn:**

```typescript
// Đếm số bạn bè
const { count } = await supabase
  .from('friendships')
  .select('*', { count: 'exact', head: true })
  .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
  .eq('status', 'accepted');

// Kiểm tra có phải bạn bè không
const { data: friendship } = await supabase
  .from('friendships')
  .select('status')
  .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)
  .eq('status', 'accepted')
  .single();
```

---

### notifications

Thông báo.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Notification ID |
| `user_id` | UUID | Người nhận thông báo |
| `actor_id` | UUID | Người tạo thông báo |
| `type` | TEXT | Loại thông báo |
| `post_id` | UUID \| null | Bài viết liên quan |
| `read` | BOOLEAN | Đã đọc chưa |
| `created_at` | TIMESTAMP | Ngày tạo |

---

## 🆕 Tạo Tables Mới

Khi feature của bạn cần database mới, hãy tạo file `migration.sql` trong `features/{feature}/database/`.

### Quy tắc bắt buộc

1. **Prefix table name** với tên feature
2. **Enable RLS** (Row Level Security)
3. **Thêm RLS policies** cho từng operation
4. **Thêm timestamps** (created_at, updated_at)

### Template Migration

```sql
-- ================================================
-- Feature: {Feature Name}
-- Author: {Tên bé}
-- Date: {Ngày}
-- Description: {Mô tả ngắn}
-- ================================================

-- Tạo table
CREATE TABLE public.{feature}_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Thêm columns của bạn ở đây
  name TEXT NOT NULL,
  value INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.{feature}_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own items"
  ON public.{feature}_items
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own items"
  ON public.{feature}_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON public.{feature}_items
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON public.{feature}_items
  FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes (tối ưu performance)
CREATE INDEX idx_{feature}_items_user_id 
  ON public.{feature}_items(user_id);

-- Trigger cập nhật updated_at
CREATE TRIGGER update_{feature}_items_updated_at
  BEFORE UPDATE ON public.{feature}_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

### Ví dụ: Referral System

```sql
-- ================================================
-- Feature: Referral System
-- Author: Bé A
-- Date: 2025-01-29
-- Description: Hệ thống giới thiệu bạn bè
-- ================================================

CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  total_uses INTEGER DEFAULT 0,
  max_uses INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id),
  referred_id UUID NOT NULL REFERENCES auth.users(id),
  code_id UUID REFERENCES public.referral_codes(id),
  reward_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'claimed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- RLS cho referral_codes
CREATE POLICY "Anyone can view active referral codes"
  ON public.referral_codes FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can manage own referral codes"
  ON public.referral_codes FOR ALL
  USING (auth.uid() = user_id);

-- RLS cho referral_rewards
CREATE POLICY "Users can view own rewards"
  ON public.referral_rewards FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Indexes
CREATE INDEX idx_referral_codes_user_id ON public.referral_codes(user_id);
CREATE INDEX idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX idx_referral_rewards_referrer ON public.referral_rewards(referrer_id);
```

---

## 🔐 Authentication

### Lấy User Hiện Tại

```typescript
import { supabase } from "@/integrations/supabase/client";

// Lấy user session
const { data: { user } } = await supabase.auth.getUser();

if (user) {
  console.log('User ID:', user.id);
  console.log('Email:', user.email);
}

// Hoặc dùng trong component
const { data: { session } } = await supabase.auth.getSession();
const userId = session?.user?.id;
```

### Subscribe Auth Changes

```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === 'SIGNED_IN') {
        // User logged in
      }
      if (event === 'SIGNED_OUT') {
        // User logged out
      }
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

---

## 💾 Supabase Client

### Basic CRUD Operations

```typescript
import { supabase } from "@/integrations/supabase/client";

// SELECT
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('user_id', userId);

// INSERT
const { data, error } = await supabase
  .from('table_name')
  .insert({ column: 'value' })
  .select()
  .single();

// UPDATE
const { data, error } = await supabase
  .from('table_name')
  .update({ column: 'new_value' })
  .eq('id', itemId);

// DELETE
const { error } = await supabase
  .from('table_name')
  .delete()
  .eq('id', itemId);
```

### React Query Integration

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Query
const { data, isLoading, error } = useQuery({
  queryKey: ['feature-items', userId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('feature_items')
      .select('*')
      .eq('user_id', userId);
    
    if (error) throw error;
    return data;
  },
});

// Mutation
const queryClient = useQueryClient();

const createItem = useMutation({
  mutationFn: async (newItem: NewItem) => {
    const { data, error } = await supabase
      .from('feature_items')
      .insert(newItem)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['feature-items'] });
  },
});
```

---

## ⚡ Edge Functions

> Edge Functions có sẵn trong Fun Profile. Bạn có thể gọi chúng nhưng **KHÔNG** tạo mới.

### Gọi Edge Function

```typescript
const { data, error } = await supabase.functions.invoke('function-name', {
  body: { param1: 'value1' },
});
```

### Edge Functions Có Sẵn

| Function | Mô tả | Parameters |
|----------|-------|------------|
| `create-post` | Tạo bài viết mới | `{ content, media_urls, visibility }` |
| `claim-reward` | Claim CAMLY reward | `{ amount, wallet_address }` |
| `treasury-balance` | Xem số dư Treasury | None |
| `image-transform` | Resize/optimize ảnh | `{ url, width, height }` |

---

## 📝 Lưu Ý Quan Trọng

### ✅ ĐƯỢC PHÉP

- Đọc data từ các tables có sẵn
- Tạo tables mới với prefix feature
- Join với tables có sẵn (SELECT only)
- Gọi Edge Functions có sẵn

### ❌ KHÔNG ĐƯỢC PHÉP

- Sửa đổi schema của tables có sẵn
- Xóa data từ tables có sẵn (trừ khi thuộc về user hiện tại)
- Tạo Edge Functions mới
- Disable RLS trên bất kỳ table nào

---

## 🆘 Troubleshooting

### "new row violates row-level security policy"

```typescript
// ❌ SAI - Thiếu user_id
await supabase.from('feature_items').insert({ name: 'test' });

// ✅ ĐÚNG - Có user_id
const { data: { user } } = await supabase.auth.getUser();
await supabase.from('feature_items').insert({ 
  name: 'test',
  user_id: user.id  // ← Bắt buộc
});
```

### "relation does not exist"

- Kiểm tra tên table đã đúng chưa
- Kiểm tra migration đã được chạy chưa
- Kiểm tra table có ở schema `public` không

### "permission denied"

- Kiểm tra RLS policies
- Kiểm tra user đã login chưa
- Kiểm tra user có quyền với row đó không
