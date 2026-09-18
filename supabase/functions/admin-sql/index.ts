// Edge function: admin-sql
// Mục đích: cho phép admin chạy SQL từ Codex CLI / terminal mà vẫn giữ Lovable Cloud.
// Bảo mật:
//   - Bắt buộc JWT hợp lệ (verify trong code).
//   - User phải có role 'admin' trong bảng user_roles (qua has_role()).
//   - Mode 'read' chỉ cho SELECT / WITH.
//   - Mode 'write' yêu cầu header x-admin-confirm: yes và ghi audit log.
//   - Rate limit 30 request / phút / user.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, requireUser, createAdminClient, HttpError, normalizeError } from '../_shared/httpAuth.ts'

const READ_ONLY_PREFIX = /^\s*(select|with)\b/i
const FORBIDDEN_KEYWORDS = /\b(drop|truncate|grant|revoke|alter\s+system|create\s+role|create\s+user|copy\s+|pg_read_server_files|pg_write_server_files)\b/i
const WRITE_KEYWORDS = /^\s*(insert|update|delete|alter|create)\b/i

interface Body {
  sql?: string
  mode?: 'read' | 'write'
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function checkRateLimit(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<void> {
  const windowKey = `admin-sql:${userId}:${Math.floor(Date.now() / 60_000)}`
  const { data, error } = await admin
    .from('rate_limit_state')
    .select('counter')
    .eq('key', windowKey)
    .maybeSingle()
  if (error && error.code !== 'PGRST116') {
    // bảng có thể chưa tồn tại trong vài project, bỏ qua silently
    return
  }
  const current = (data?.counter as number | undefined) ?? 0
  if (current >= 30) {
    throw new HttpError(429, 'rate_limit_exceeded', 'Quá 30 request/phút. Đợi 1 phút.')
  }
  await admin.from('rate_limit_state').upsert({
    key: windowKey,
    counter: current + 1,
    updated_at: new Date().toISOString(),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const started = performance.now()
  try {
    const user = await requireUser(req)
    const admin = createAdminClient()

    // 1. Kiểm tra role admin
    const { data: roleRow, error: roleErr } = await admin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    })
    if (roleErr) throw new HttpError(500, 'role_check_failed', roleErr.message)
    if (roleRow !== true) throw new HttpError(403, 'forbidden', 'Tài khoản không có quyền admin.')

    // 2. Rate limit
    await checkRateLimit(admin, user.id)

    // 3. Parse body
    const body = (await req.json().catch(() => ({}))) as Body
    const sql = (body.sql ?? '').trim()
    const mode = body.mode ?? 'read'
    if (!sql) throw new HttpError(400, 'missing_sql', 'Thiếu trường "sql".')
    if (sql.length > 20_000) throw new HttpError(400, 'sql_too_long', 'SQL quá dài (max 20K ký tự).')
    if (FORBIDDEN_KEYWORDS.test(sql)) {
      throw new HttpError(400, 'forbidden_keyword', 'SQL chứa từ khoá bị chặn (drop/truncate/grant/...).')
    }

    if (mode === 'read') {
      if (!READ_ONLY_PREFIX.test(sql)) {
        throw new HttpError(400, 'not_read_only', 'Mode "read" chỉ chấp nhận câu bắt đầu bằng SELECT hoặc WITH.')
      }
    } else if (mode === 'write') {
      const confirm = req.headers.get('x-admin-confirm')
      if (confirm !== 'yes') {
        throw new HttpError(400, 'confirm_required', 'Mode "write" cần header x-admin-confirm: yes.')
      }
      if (!WRITE_KEYWORDS.test(sql) && !READ_ONLY_PREFIX.test(sql)) {
        throw new HttpError(400, 'invalid_write_sql', 'SQL write không hợp lệ.')
      }
    } else {
      throw new HttpError(400, 'invalid_mode', 'mode phải là "read" hoặc "write".')
    }

    // 4. Thực thi qua RPC admin_sql_exec (security definer)
    const { data: rows, error: execErr } = await admin.rpc('admin_sql_exec', { _sql: sql })
    if (execErr) throw new HttpError(400, 'sql_error', execErr.message)

    // 5. Ghi audit (best effort)
    const sqlHash = await sha256(sql)
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? null
    await admin.from('admin_sql_audit').insert({
      admin_id: user.id,
      sql_hash: sqlHash,
      sql_preview: sql.slice(0, 200),
      mode,
      ip,
      row_count: Array.isArray(rows) ? rows.length : null,
    })

    const ms = Math.round(performance.now() - started)
    return json({
      ok: true,
      rows: rows ?? [],
      rowCount: Array.isArray(rows) ? rows.length : 0,
      ms,
    })
  } catch (err) {
    const n = normalizeError(err)
    return json(
      { ok: false, error: n.code ?? 'internal_error', message: n.message },
      n.status ?? 500,
    )
  }
})
