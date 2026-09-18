# Hướng dẫn Triển khai Merge User cho Fun Farm

> **Phiên bản**: 2.0  
> **Cập nhật**: Tháng 1/2026  
> **Tác giả**: Fun Profile Team

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Chuẩn bị Database](#2-chuẩn-bị-database)
3. [Edge Function: Gửi Merge Request](#3-edge-function-gửi-merge-request)
4. [Edge Function: Webhook Receiver với Signature Verification](#4-edge-function-webhook-receiver-với-signature-verification)
5. [Xử lý Conflict Resolution](#5-xử-lý-conflict-resolution)
6. [Pending State Handling](#6-pending-state-handling)
7. [Metadata Synchronization](#7-metadata-synchronization)
8. [Cấu hình và Secrets](#8-cấu-hình-và-secrets)
9. [Testing và Troubleshooting](#9-testing-và-troubleshooting)

---

## 1. Tổng quan

### 1.1 Mục tiêu

Hệ thống Merge cho phép Fun Farm:
- Gửi yêu cầu merge user cũ sang Fun Profile
- Nhận webhook khi merge hoàn tất/bị từ chối
- Đồng bộ thông tin user với Fun Profile
- Xử lý conflict khi có xung đột dữ liệu

### 1.2 Flow hoàn chỉnh

```
┌─────────────┐                    ┌──────────────┐                    ┌─────────┐
│  Fun Farm   │                    │ Fun Profile  │                    │  Admin  │
└──────┬──────┘                    └──────┬───────┘                    └────┬────┘
       │                                  │                                 │
       │ 1. POST /sso-merge-request       │                                 │
       │─────────────────────────────────▶│                                 │
       │                                  │                                 │
       │ 2. Response: request_id          │                                 │
       │◀─────────────────────────────────│                                 │
       │                                  │                                 │
       │                                  │  3. Admin Review Request        │
       │                                  │◀────────────────────────────────│
       │                                  │                                 │
       │                                  │  4. Approve/Reject              │
       │                                  │◀────────────────────────────────│
       │                                  │                                 │
       │ 5. Webhook: merge_completed      │                                 │
       │   + X-Fun-Signature header       │                                 │
       │   + profile_data payload         │                                 │
       │◀─────────────────────────────────│                                 │
       │                                  │                                 │
       │ 6. Verify signature              │                                 │
       │ 7. Check conflicts               │                                 │
       │ 8. Update user với fun_profile_id│                                 │
       │ 9. Sync metadata                 │                                 │
       │                                  │                                 │
       │ User có thể login via SSO ✓      │                                 │
       │                                  │                                 │
```

---

## 2. Chuẩn bị Database

### 2.1 Migration: Thêm cột mapping vào bảng users

```sql
-- Migration: Add Fun Profile mapping columns
-- File: supabase/migrations/YYYYMMDD_add_fun_profile_mapping.sql

-- Thêm cột để mapping với Fun Profile
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fun_profile_id UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fun_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_merged BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS merge_request_id UUID;

-- Index cho query hiệu quả
CREATE INDEX IF NOT EXISTS idx_users_fun_profile_id ON public.users(fun_profile_id);
CREATE INDEX IF NOT EXISTS idx_users_is_merged ON public.users(is_merged);
CREATE INDEX IF NOT EXISTS idx_users_fun_id ON public.users(fun_id);

-- Unique constraint để tránh duplicate mapping
ALTER TABLE public.users ADD CONSTRAINT unique_fun_profile_id 
  UNIQUE (fun_profile_id) 
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN public.users.fun_profile_id IS 'UUID của user trên Fun Profile sau khi merge';
COMMENT ON COLUMN public.users.fun_id IS 'Fun ID (username chuẩn hóa) từ Fun Profile';
COMMENT ON COLUMN public.users.is_merged IS 'Trạng thái đã merge thành công hay chưa';
COMMENT ON COLUMN public.users.merged_at IS 'Thời điểm merge hoàn tất';
COMMENT ON COLUMN public.users.merge_request_id IS 'ID của merge request đang pending';
```

### 2.2 Migration: Tạo bảng merge_request_logs

```sql
-- Migration: Create merge request logs table
-- File: supabase/migrations/YYYYMMDD_create_merge_logs.sql

CREATE TABLE IF NOT EXISTS public.merge_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  request_id UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected', 'conflict')),
  fun_profile_id UUID,
  profile_data JSONB,
  webhook_received_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_merge_logs_user_id ON public.merge_request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_merge_logs_status ON public.merge_request_logs(status);
CREATE INDEX IF NOT EXISTS idx_merge_logs_request_id ON public.merge_request_logs(request_id);

-- Enable RLS
ALTER TABLE public.merge_request_logs ENABLE ROW LEVEL SECURITY;

-- Admin only policy
CREATE POLICY "Admin can manage merge logs" ON public.merge_request_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
```

### 2.3 Migration: Tạo bảng merge_conflicts

```sql
-- Migration: Create merge conflicts table
-- File: supabase/migrations/YYYYMMDD_create_merge_conflicts.sql

CREATE TABLE IF NOT EXISTS public.merge_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User gốc (đang cố merge)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  
  -- User đã có fun_profile_id này
  conflicting_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  conflicting_user_email TEXT,
  
  -- Fun Profile data
  fun_profile_id UUID NOT NULL,
  fun_id TEXT,
  
  -- Conflict info
  conflict_type TEXT NOT NULL CHECK (conflict_type IN (
    'duplicate_fun_profile_id',
    'duplicate_fun_id', 
    'duplicate_email'
  )),
  conflict_details JSONB,
  
  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT CHECK (resolution_action IN (
    'keep_existing',
    'replace_existing',
    'manual_merge',
    'dismissed'
  )),
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conflicts_user_id ON public.merge_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_resolved ON public.merge_conflicts(resolved);
CREATE INDEX IF NOT EXISTS idx_conflicts_fun_profile_id ON public.merge_conflicts(fun_profile_id);

-- Enable RLS
ALTER TABLE public.merge_conflicts ENABLE ROW LEVEL SECURITY;

-- Admin only policy
CREATE POLICY "Admin can manage conflicts" ON public.merge_conflicts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
```

---

## 3. Edge Function: Gửi Merge Request

### 3.1 File: `supabase/functions/send-merge-request/index.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fun Profile API URL
const FUN_PROFILE_API = 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1';

// Client ID được cấp bởi Fun Profile Admin
const CLIENT_ID = 'fun_farm_client';

interface MergeResult {
  user_id: string;
  email: string;
  success: boolean;
  request_id?: string;
  merge_type?: string;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientSecret = Deno.env.get('FUN_PROFILE_CLIENT_SECRET')!;
    
    if (!clientSecret) {
      throw new Error('FUN_PROFILE_CLIENT_SECRET not configured');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse request body
    const { user_id, batch_all, limit = 100 } = await req.json();

    let usersToMerge: any[] = [];

    if (batch_all) {
      // Lấy tất cả user chưa merge
      const { data: users, error } = await supabase
        .from('users')
        .select('id, email, username, level, gold, achievements, avatar_url')
        .eq('is_merged', false)
        .is('fun_profile_id', null)
        .is('merge_request_id', null) // Chưa có request pending
        .limit(limit);

      if (error) throw error;
      usersToMerge = users || [];
    } else if (user_id) {
      // Merge 1 user cụ thể
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, username, level, gold, achievements, avatar_url')
        .eq('id', user_id)
        .single();

      if (error) throw error;
      if (user) usersToMerge = [user];
    } else {
      throw new Error('Either user_id or batch_all must be provided');
    }

    console.log(`[send-merge-request] Processing ${usersToMerge.length} users`);

    const results: MergeResult[] = [];

    for (const user of usersToMerge) {
      try {
        // Gọi API Fun Profile
        const response = await fetch(`${FUN_PROFILE_API}/sso-merge-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: clientSecret,
            email: user.email,
            source_user_id: user.id,
            source_username: user.username,
            platform_data: {
              farm_level: user.level,
              gold: user.gold,
              achievements: user.achievements || [],
              avatar_url: user.avatar_url
            }
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `HTTP ${response.status}`);
        }

        // Cập nhật merge_request_id vào user
        if (result.request_id) {
          await supabase
            .from('users')
            .update({ merge_request_id: result.request_id })
            .eq('id', user.id);

          // Log request
          await supabase.from('merge_request_logs').insert({
            user_id: user.id,
            email: user.email,
            request_id: result.request_id,
            status: 'pending'
          });
        }

        results.push({
          user_id: user.id,
          email: user.email,
          success: result.success || false,
          request_id: result.request_id,
          merge_type: result.merge_type
        });

        console.log(`[send-merge-request] Success for ${user.email}: ${result.merge_type}`);

      } catch (err: any) {
        console.error(`[send-merge-request] Error for ${user.email}:`, err.message);
        
        results.push({
          user_id: user.id,
          email: user.email,
          success: false,
          error: err.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[send-merge-request] Completed: ${successCount}/${results.length} successful`);

    return new Response(
      JSON.stringify({
        total: usersToMerge.length,
        success_count: successCount,
        results
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('[send-merge-request] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
```

---

## 4. Edge Function: Webhook Receiver với Signature Verification

### 4.1 File: `supabase/functions/fun-profile-webhook/index.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fun-profile-webhook, x-fun-signature',
};

// ============================================
// SIGNATURE VERIFICATION
// ============================================

async function verifyWebhookSignature(
  payload: string, 
  signature: string, 
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    console.warn('[webhook] Missing signature or secret');
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Convert hex signature to bytes
    const signatureBytes = new Uint8Array(
      signature.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
    );

    return await crypto.subtle.verify(
      'HMAC', 
      key, 
      signatureBytes, 
      encoder.encode(payload)
    );
  } catch (error) {
    console.error('[webhook] Signature verification error:', error);
    return false;
  }
}

// ============================================
// CONFLICT DETECTION
// ============================================

interface ConflictResult {
  hasConflict: boolean;
  conflictType?: string;
  conflictingUser?: any;
}

async function checkForConflicts(
  supabase: any,
  funProfileId: string,
  funId: string | null,
  currentUserId: string
): Promise<ConflictResult> {
  // Check 1: fun_profile_id đã được map cho user khác
  const { data: existingByProfileId } = await supabase
    .from('users')
    .select('id, email, username')
    .eq('fun_profile_id', funProfileId)
    .neq('id', currentUserId)
    .maybeSingle();

  if (existingByProfileId) {
    return {
      hasConflict: true,
      conflictType: 'duplicate_fun_profile_id',
      conflictingUser: existingByProfileId
    };
  }

  // Check 2: fun_id đã được dùng bởi user khác
  if (funId) {
    const { data: existingByFunId } = await supabase
      .from('users')
      .select('id, email, username')
      .eq('fun_id', funId)
      .neq('id', currentUserId)
      .maybeSingle();

    if (existingByFunId) {
      return {
        hasConflict: true,
        conflictType: 'duplicate_fun_id',
        conflictingUser: existingByFunId
      };
    }
  }

  return { hasConflict: false };
}

async function createConflictRecord(
  supabase: any,
  userId: string,
  userEmail: string,
  conflictingUser: any,
  funProfileId: string,
  funId: string | null,
  conflictType: string
) {
  await supabase.from('merge_conflicts').insert({
    user_id: userId,
    user_email: userEmail,
    conflicting_user_id: conflictingUser.id,
    conflicting_user_email: conflictingUser.email,
    fun_profile_id: funProfileId,
    fun_id: funId,
    conflict_type: conflictType,
    conflict_details: {
      current_user: { id: userId, email: userEmail },
      existing_user: conflictingUser
    }
  });

  console.log(`[webhook] Created conflict record: ${conflictType}`);
}

// ============================================
// MAIN HANDLER
// ============================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientSecret = Deno.env.get('FUN_PROFILE_CLIENT_SECRET')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // =========================================
    // STEP 1: VERIFY WEBHOOK SOURCE
    // =========================================
    
    const webhookHeader = req.headers.get('X-Fun-Profile-Webhook');
    if (webhookHeader !== 'true') {
      console.error('[webhook] Missing X-Fun-Profile-Webhook header');
      return new Response(
        JSON.stringify({ error: 'Invalid webhook source' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================
    // STEP 2: VERIFY SIGNATURE
    // =========================================

    const signature = req.headers.get('X-Fun-Signature');
    const rawBody = await req.text();

    if (!signature) {
      console.error('[webhook] Missing X-Fun-Signature header');
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isValidSignature = await verifyWebhookSignature(rawBody, signature, clientSecret);
    
    if (!isValidSignature) {
      console.error('[webhook] Invalid signature');
      return new Response(
        JSON.stringify({ error: 'Invalid webhook signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[webhook] Signature verified successfully');

    // =========================================
    // STEP 3: PARSE PAYLOAD
    // =========================================

    const payload = JSON.parse(rawBody);
    console.log('[webhook] Received event:', payload.event);

    const {
      event,
      request_id,
      email,
      source_user_id,
      fun_profile_id,
      merge_type,
      platform_data_imported,
      timestamp,
      profile_data
    } = payload;

    // =========================================
    // STEP 4: FIND LOCAL USER
    // =========================================

    // Tìm user theo source_user_id (ưu tiên) hoặc email
    let user = null;
    
    if (source_user_id) {
      const { data } = await supabase
        .from('users')
        .select('id, email, username')
        .eq('id', source_user_id)
        .maybeSingle();
      user = data;
    }

    if (!user && email) {
      const { data } = await supabase
        .from('users')
        .select('id, email, username')
        .eq('email', email)
        .maybeSingle();
      user = data;
    }

    if (!user) {
      console.error('[webhook] User not found:', { source_user_id, email });
      return new Response(
        JSON.stringify({ error: 'User not found', source_user_id, email }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[webhook] Found user:', user.id, user.email);

    // =========================================
    // STEP 5: HANDLE EVENT
    // =========================================

    if (event === 'merge_completed') {
      // -----------------------------------
      // 5A: CHECK FOR CONFLICTS
      // -----------------------------------
      
      const conflictResult = await checkForConflicts(
        supabase,
        fun_profile_id,
        profile_data?.fun_id,
        user.id
      );

      if (conflictResult.hasConflict) {
        console.error('[webhook] CONFLICT DETECTED:', conflictResult.conflictType);
        
        // Tạo conflict record để Admin review
        await createConflictRecord(
          supabase,
          user.id,
          email,
          conflictResult.conflictingUser,
          fun_profile_id,
          profile_data?.fun_id,
          conflictResult.conflictType!
        );

        // Update log status
        await supabase
          .from('merge_request_logs')
          .update({ 
            status: 'conflict',
            error_message: `Conflict: ${conflictResult.conflictType}`,
            webhook_received_at: new Date().toISOString()
          })
          .eq('request_id', request_id);

        // KHÔNG tự động ghi đè - chờ Admin xử lý
        return new Response(
          JSON.stringify({ 
            received: true, 
            conflict: true,
            conflict_type: conflictResult.conflictType,
            message: 'Conflict detected - Admin review required'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // -----------------------------------
      // 5B: NO CONFLICT - UPDATE USER
      // -----------------------------------

      const updateData: Record<string, any> = {
        fun_profile_id: fun_profile_id,
        is_merged: true,
        merged_at: timestamp || new Date().toISOString(),
        merge_request_id: null // Clear pending request
      };

      // Sync metadata từ profile_data
      if (profile_data) {
        if (profile_data.username) {
          updateData.username = profile_data.username;
        }
        if (profile_data.avatar_url) {
          updateData.avatar_url = profile_data.avatar_url;
        }
        if (profile_data.full_name) {
          updateData.full_name = profile_data.full_name;
        }
        if (profile_data.fun_id) {
          updateData.fun_id = profile_data.fun_id;
        }
      }

      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

      if (updateError) {
        console.error('[webhook] Update error:', updateError);
        throw updateError;
      }

      console.log('[webhook] User merged successfully:', user.id);

      // Update log
      await supabase
        .from('merge_request_logs')
        .update({
          status: 'completed',
          fun_profile_id: fun_profile_id,
          profile_data: profile_data,
          webhook_received_at: new Date().toISOString()
        })
        .eq('request_id', request_id);

    } else if (event === 'merge_rejected') {
      // -----------------------------------
      // 5C: MERGE REJECTED
      // -----------------------------------

      // Clear pending request
      await supabase
        .from('users')
        .update({ merge_request_id: null })
        .eq('id', user.id);

      // Update log
      await supabase
        .from('merge_request_logs')
        .update({
          status: 'rejected',
          webhook_received_at: new Date().toISOString()
        })
        .eq('request_id', request_id);

      console.log('[webhook] Merge rejected for:', user.id);
    }

    return new Response(
      JSON.stringify({ 
        received: true, 
        user_id: user.id,
        event: event
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## 5. Xử lý Conflict Resolution

### 5.1 Admin API: Lấy danh sách conflicts

```typescript
// File: supabase/functions/admin-get-conflicts/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || '' } }
    });

    // Check admin role
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conflicts
    const { resolved = false } = await req.json().catch(() => ({}));

    const { data: conflicts, error } = await supabase
      .from('merge_conflicts')
      .select(`
        *,
        user:users!merge_conflicts_user_id_fkey(id, email, username, avatar_url),
        conflicting_user:users!merge_conflicts_conflicting_user_id_fkey(id, email, username, avatar_url)
      `)
      .eq('resolved', resolved)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return new Response(
      JSON.stringify({ conflicts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### 5.2 Admin API: Resolve conflict

```typescript
// File: supabase/functions/admin-resolve-conflict/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || '' } }
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Check admin
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      conflict_id, 
      action,  // 'keep_existing' | 'replace_existing' | 'dismissed'
      notes 
    } = await req.json();

    // Get conflict
    const { data: conflict, error: conflictError } = await supabaseAdmin
      .from('merge_conflicts')
      .select('*')
      .eq('id', conflict_id)
      .single();

    if (conflictError || !conflict) {
      return new Response(
        JSON.stringify({ error: 'Conflict not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle based on action
    if (action === 'replace_existing') {
      // Xóa mapping của user cũ
      await supabaseAdmin
        .from('users')
        .update({ 
          fun_profile_id: null,
          fun_id: null,
          is_merged: false,
          merged_at: null
        })
        .eq('id', conflict.conflicting_user_id);

      // Gán cho user mới
      await supabaseAdmin
        .from('users')
        .update({
          fun_profile_id: conflict.fun_profile_id,
          fun_id: conflict.fun_id,
          is_merged: true,
          merged_at: new Date().toISOString(),
          merge_request_id: null
        })
        .eq('id', conflict.user_id);

    } else if (action === 'keep_existing') {
      // Giữ user cũ, reject user mới
      await supabaseAdmin
        .from('users')
        .update({ merge_request_id: null })
        .eq('id', conflict.user_id);
    }
    // 'dismissed' - không làm gì, chỉ đánh dấu resolved

    // Update conflict status
    await supabaseAdmin
      .from('merge_conflicts')
      .update({
        resolved: true,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        resolution_action: action,
        resolution_notes: notes
      })
      .eq('id', conflict_id);

    return new Response(
      JSON.stringify({ success: true, action }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## 6. Pending State Handling

### 6.1 Middleware kiểm tra trạng thái pending

```typescript
// File: src/middleware/pendingMergeCheck.ts

import { supabase } from '@/integrations/supabase/client';

export interface PendingMergeStatus {
  isPending: boolean;
  requestId?: string;
  createdAt?: string;
}

export async function checkPendingMerge(userId: string): Promise<PendingMergeStatus> {
  const { data, error } = await supabase
    .from('users')
    .select('is_merged, merge_request_id')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return { isPending: false };
  }

  // User đang pending nếu: chưa merge VÀ đã có request_id
  const isPending = !data.is_merged && data.merge_request_id !== null;

  if (isPending) {
    // Lấy thêm thông tin từ logs
    const { data: logData } = await supabase
      .from('merge_request_logs')
      .select('created_at')
      .eq('request_id', data.merge_request_id)
      .single();

    return {
      isPending: true,
      requestId: data.merge_request_id,
      createdAt: logData?.created_at
    };
  }

  return { isPending: false };
}

// Hook để sử dụng trong React components
export function usePendingMergeCheck() {
  const [status, setStatus] = useState<PendingMergeStatus>({ isPending: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const result = await checkPendingMerge(user.id);
        setStatus(result);
      }
      setLoading(false);
    };

    checkStatus();
  }, []);

  return { ...status, loading };
}
```

### 6.2 Sử dụng trong API handlers

```typescript
// Trong API đổi email/password
app.put('/api/user/change-email', async (req, res) => {
  const pendingStatus = await checkPendingMerge(req.user.id);
  
  if (pendingStatus.isPending) {
    return res.status(403).json({
      error: 'account_pending_merge',
      message: 'Tài khoản đang chờ hợp nhất với Fun Profile. Vui lòng đợi Admin duyệt trước khi thay đổi thông tin.',
      request_id: pendingStatus.requestId,
      pending_since: pendingStatus.createdAt
    });
  }

  // Tiếp tục xử lý đổi email...
});
```

### 6.3 UI Component thông báo pending

```tsx
// File: src/components/PendingMergeBanner.tsx

import { usePendingMergeCheck } from '@/middleware/pendingMergeCheck';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock } from 'lucide-react';

export function PendingMergeBanner() {
  const { isPending, createdAt, loading } = usePendingMergeCheck();

  if (loading || !isPending) return null;

  return (
    <Alert className="bg-amber-50 border-amber-200">
      <Clock className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-800">
        Tài khoản của bạn đang chờ hợp nhất với Fun Profile. 
        Một số chức năng tạm thời bị giới hạn cho đến khi quá trình hoàn tất.
        {createdAt && (
          <span className="block text-sm mt-1 text-amber-600">
            Yêu cầu gửi lúc: {new Date(createdAt).toLocaleString('vi-VN')}
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
```

### 6.4 Danh sách chức năng cần khóa

| Chức năng | Khóa khi Pending | Lý do |
|-----------|------------------|-------|
| Đổi email | ✅ Yes | Tránh xung đột với Fun Profile |
| Đổi password | ✅ Yes | Fun Profile quản lý auth |
| Đổi username | ✅ Yes | Có thể sync từ Fun Profile |
| Đổi avatar | ⚠️ Optional | Có thể sync từ Fun Profile |
| Gameplay (trồng cây, thu hoạch) | ❌ No | Không ảnh hưởng merge |
| Mua/bán items | ❌ No | Không ảnh hưởng merge |
| Chat/Social | ❌ No | Không ảnh hưởng merge |
| Xem profile | ❌ No | Không ảnh hưởng merge |

---

## 7. Metadata Synchronization

### 7.1 Sync khi nhận webhook

Đã được implement trong webhook receiver (section 4). Khi nhận `merge_completed`, hệ thống tự động sync:

- `username` → Lấy từ `profile_data.username`
- `avatar_url` → Lấy từ `profile_data.avatar_url`
- `full_name` → Lấy từ `profile_data.full_name`
- `fun_id` → Lấy từ `profile_data.fun_id`

### 7.2 Sync định kỳ (Optional)

```typescript
// File: supabase/functions/sync-from-fun-profile/index.ts

// Gọi API Fun Profile để lấy thông tin mới nhất
// Sử dụng access_token của user để authenticate

const response = await fetch(`${FUN_PROFILE_API}/sso-verify`, {
  headers: {
    'Authorization': `Bearer ${userAccessToken}`
  }
});

const { user } = await response.json();

// Update local user
await supabase
  .from('users')
  .update({
    username: user.username,
    avatar_url: user.avatar_url,
    full_name: user.full_name
  })
  .eq('fun_profile_id', user.id);
```

### 7.3 Sử dụng fun_profile_id làm định danh chính

Sau khi merge, Fun Farm nên:

1. **Trong JWT/Session**: Lưu cả `user_id` (local) và `fun_profile_id`
2. **Trong API calls**: Ưu tiên dùng `fun_profile_id` khi giao tiếp với Fun Profile
3. **Trong Database queries**: Vẫn dùng `user_id` local cho các bảng Farm

```typescript
// Example: Session data structure
interface UserSession {
  // Local Farm user ID
  user_id: string;
  
  // Fun Profile ID (after merge)
  fun_profile_id: string | null;
  
  // Fun ID (global username)
  fun_id: string | null;
  
  // Is merged flag
  is_merged: boolean;
}
```

---

## 8. Cấu hình và Secrets

### 8.1 Supabase Secrets cần thiết

Vào **Supabase Dashboard > Project Settings > Edge Functions > Secrets**:

| Secret Name | Mô tả | Giá trị |
|-------------|-------|---------|
| `FUN_PROFILE_CLIENT_SECRET` | Client secret từ Fun Profile | Liên hệ Admin Fun Profile để nhận |

### 8.2 Cấu hình config.toml

```toml
# File: supabase/config.toml

[functions.send-merge-request]
verify_jwt = true

[functions.fun-profile-webhook]
verify_jwt = false  # Webhook verify bằng signature

[functions.admin-get-conflicts]
verify_jwt = true

[functions.admin-resolve-conflict]
verify_jwt = true
```

### 8.3 Đăng ký Webhook URL với Fun Profile

Gửi thông tin sau cho Admin Fun Profile:

```
Platform Name: fun_farm
Webhook URL: https://[YOUR_PROJECT_ID].supabase.co/functions/v1/fun-profile-webhook
```

Admin Fun Profile sẽ cập nhật vào `oauth_clients` table.

---

## 9. Testing và Troubleshooting

### 9.1 Test Signature Verification

```typescript
// Test script
const testPayload = JSON.stringify({ event: 'test' });
const secret = 'your-client-secret';

// Generate signature (như Fun Profile làm)
async function generateSignature(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const signature = await generateSignature(testPayload, secret);
console.log('Signature:', signature);

// Gửi test webhook
fetch('https://your-project.supabase.co/functions/v1/fun-profile-webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Fun-Profile-Webhook': 'true',
    'X-Fun-Signature': signature
  },
  body: testPayload
});
```

### 9.2 Troubleshooting Guide

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `Invalid client credentials` | Client secret sai | Kiểm tra `FUN_PROFILE_CLIENT_SECRET` |
| `Invalid webhook signature` | Signature không khớp | Verify secret giống nhau ở cả 2 bên |
| `Merge request already exists` | User đã có request pending | Check status của request cũ |
| `User not found` | source_user_id không tìm thấy | Đảm bảo gửi đúng user ID |
| `Conflict detected` | fun_profile_id đã được dùng | Admin cần resolve conflict |
| `account_pending_merge` | User đang chờ duyệt | Đợi Admin approve hoặc reject |

### 9.3 Useful Queries

```sql
-- Xem users chưa merge
SELECT id, email, username, is_merged, merge_request_id
FROM users
WHERE is_merged = false;

-- Xem users đang pending
SELECT id, email, username, merge_request_id
FROM users
WHERE is_merged = false AND merge_request_id IS NOT NULL;

-- Xem users đã merge
SELECT id, email, username, fun_profile_id, fun_id, merged_at
FROM users
WHERE is_merged = true;

-- Xem conflicts chưa resolve
SELECT * FROM merge_conflicts WHERE resolved = false;

-- Xem merge logs
SELECT * FROM merge_request_logs ORDER BY created_at DESC LIMIT 50;
```

---

## Checklist Triển khai

### Database
- [ ] Chạy migration thêm cột vào bảng `users`
- [ ] Tạo bảng `merge_request_logs`
- [ ] Tạo bảng `merge_conflicts`

### Edge Functions
- [ ] Deploy `send-merge-request`
- [ ] Deploy `fun-profile-webhook`
- [ ] Deploy `admin-get-conflicts`
- [ ] Deploy `admin-resolve-conflict`

### Secrets & Config
- [ ] Thêm secret `FUN_PROFILE_CLIENT_SECRET`
- [ ] Cập nhật `config.toml`
- [ ] Gửi webhook URL cho Admin Fun Profile

### Frontend
- [ ] Implement `PendingMergeBanner` component
- [ ] Thêm pending state check vào các form nhạy cảm
- [ ] Tạo Admin UI cho conflicts (nếu cần)

### Testing
- [ ] Test merge 1 user
- [ ] Test batch merge
- [ ] Test webhook signature verification
- [ ] Test conflict detection
- [ ] Test pending state blocking
- [ ] Test metadata sync

---

## Liên hệ Hỗ trợ

- **Fun Profile Admin**: Liên hệ để nhận `client_id` và `client_secret`
- **Technical Issues**: Mở issue trên repository hoặc liên hệ team Fun Profile

---

*Tài liệu này được cập nhật bởi Fun Profile Team. Version 2.0 - Tháng 1/2026*
