import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { RtcTokenBuilder, RtcRole } from 'npm:agora-token'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function uuidToNumericUid(uuid: string): number {
  let hash = 0
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & 0x7FFFFFFF
  }
  return hash || 1
}

function toAgoraUid(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : ''

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    )

    let userId: string | null = null
    if (token) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
        { global: { headers: { Authorization: authHeader! } } }
      )
      try {
        const { data: claimsData } = await supabase.auth.getClaims(token)
        if (claimsData?.claims?.sub) userId = claimsData.claims.sub as string
      } catch (_) { /* ignore, try getUser */ }
      if (!userId) {
        const { data: userData } = await supabase.auth.getUser(token)
        if (userData?.user?.id) userId = userData.user.id
      }
    }

    if (userId) {
      const { data: banCheck } = await supabaseAdmin
        .from('profiles').select('is_banned').eq('id', userId).single()
      if (banCheck?.is_banned) {
        return new Response(JSON.stringify({ error: 'Tài khoản đã bị cấm vĩnh viễn.' }), { status: 403, headers: corsHeaders })
      }
    }

    const body = await req.json().catch(() => ({}))
    const sessionId = body.session_id || body.sessionId
    const role = body.role || 'audience'
    const requestedUid = body.uid

    if (!sessionId) {
      return jsonResponse({ error: 'session_id required' }, 400)
    }

    // Lookup live session (reuse supabaseAdmin from ban check)

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('live_sessions')
      .select('id, channel_name, agora_channel, status, host_user_id, privacy, agora_uid_host, agora_uid')
      .eq('id', sessionId)
      .maybeSingle()

    if (sessionErr || !session) {
      return jsonResponse({ error: 'Session not found' }, 404)
    }

    if (session.status !== 'live' && session.status !== 'starting') {
      return jsonResponse({ error: 'Session is not live' }, 400)
    }

    if (role === 'host') {
      if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401)
      if (session.host_user_id !== userId) {
        return jsonResponse({ error: 'Only host can get host token' }, 403)
      }
    }

    // Enforce friends-only privacy (yêu cầu đăng nhập)
    if (session.privacy === 'friends' && role !== 'host') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Phiên live này chỉ dành cho bạn bè' }), { status: 403, headers: corsHeaders })
      }
      const { data: friendship } = await supabaseAdmin
        .from('friendships')
        .select('id')
        .or(`and(user_id.eq.${userId},friend_id.eq.${session.host_user_id},status.eq.accepted),and(user_id.eq.${session.host_user_id},friend_id.eq.${userId},status.eq.accepted)`)
        .limit(1)

      if (!friendship || friendship.length === 0) {
        return new Response(JSON.stringify({ error: 'Phiên live này chỉ dành cho bạn bè' }), { status: 403, headers: corsHeaders })
      }
    }

    const channel = session.agora_channel || session.channel_name

    if (role === 'host') {
      const now = new Date()
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
      const { data: quotaRow } = await supabaseAdmin
        .from('agora_usage_config')
        .select('value_numeric')
        .eq('key', 'monthly_quota_minutes')
        .maybeSingle()
      const quotaMinutes = Number(quotaRow?.value_numeric || 0)

      if (quotaMinutes > 0) {
        const { data: usageRows, error: usageErr } = await supabaseAdmin
          .from('agora_usage_sessions')
          .select('started_at, ended_at, total_duration_minutes')
          .gte('started_at', monthStart)
          .lt('started_at', monthEnd)

        if (!usageErr) {
          const usedMinutes = (usageRows || []).reduce((sum: number, row: any) => {
            const stored = Number(row.total_duration_minutes)
            if (Number.isFinite(stored) && stored > 0) return sum + stored
            const started = row.started_at ? new Date(row.started_at).getTime() : Date.now()
            const ended = row.ended_at ? new Date(row.ended_at).getTime() : Date.now()
            return sum + Math.max(0, ended - started) / 60000
          }, 0)

          if (usedMinutes >= quotaMinutes) {
            return new Response(JSON.stringify({
              error: 'AGORA_QUOTA_EXCEEDED',
              message: 'Hiện tại hệ thống livestream đang đạt giới hạn sử dụng trong tháng. FUN Profile sẽ sớm mở lại tính năng LIVE. Cảm ơn bạn đã thông cảm 💚',
            }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          }
        }
      }
    }

    // Generate Agora token directly
    const appId = Deno.env.get('AGORA_APP_ID')
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')

    if (!appId || !appCertificate) {
      return jsonResponse({ error: 'Agora not configured' }, 500)
    }

    const audienceKey = userId || `guest:${crypto.randomUUID()}`
    const hostUid = toAgoraUid(session.agora_uid_host) || toAgoraUid(session.agora_uid) || uuidToNumericUid(session.host_user_id)
    let numericUid = role === 'host'
      ? hostUid
      : toAgoraUid(requestedUid) || uuidToNumericUid(`audience:${audienceKey}:${sessionId}`)

    if (role !== 'host' && numericUid === hostUid) {
      numericUid = uuidToNumericUid(`audience:${audienceKey}:${sessionId}:viewer`)
      if (numericUid === hostUid) {
        numericUid = (hostUid % 2147483000) + 1000
      }
    }

    const agoraRole = role === 'host' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER
    const expirationInSeconds = 86400

    const agoraToken = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      numericUid,
      agoraRole,
      expirationInSeconds,
      expirationInSeconds
    )

    const currentTimestamp = Math.floor(Date.now() / 1000)
    return jsonResponse({
      token: agoraToken,
      channel,
      uid: String(numericUid),
      appId,
      expiresAt: currentTimestamp + expirationInSeconds,
    })
  } catch (err) {
    console.error('live-token error:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
