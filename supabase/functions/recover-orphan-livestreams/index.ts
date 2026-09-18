import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    )

    // Verify admin via auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const results = { orphans_recovered: 0, posts_with_video_fixed: 0, posts_marked_failed: 0, details: [] as any[] }

    // === PART A: Recover orphan sessions (post_id IS NULL, has done recording) ===
    const { data: orphanSessions } = await supabase
      .from('live_sessions')
      .select('id, host_user_id, title, channel_name, agora_channel, started_at, ended_at, status')
      .is('post_id', null)

    if (orphanSessions) {
      for (const session of orphanSessions) {
        // Check for done chunked recording
        const { data: recordings } = await supabase
          .from('chunked_recordings')
          .select('id, output_url, total_chunks')
          .eq('live_session_id', session.id)
          .eq('status', 'done')
          .limit(1)

        if (recordings && recordings.length > 0 && recordings[0].output_url) {
          const recording = recordings[0]
          const metadata = {
            live_title: session.title,
            live_status: 'ended',
            channel_name: session.channel_name,
            agora_channel: session.agora_channel,
            live_session_id: session.id,
            playback_url: null,
            playback_type: 'cloudflare_stream_pending',
            fallback_playback_url: recording.output_url,
            allow_chunked_fallback: false,
            ended_at: session.ended_at,
          }

          // Create post
          const { data: newPost, error: postErr } = await supabase
            .from('posts')
            .insert({
              user_id: session.host_user_id,
              content: session.title || 'Phát lại livestream',
              post_type: 'live',
              video_url: null,
              visibility: 'public',
              created_at: session.started_at,
              metadata,
            })
            .select('id')
            .single()

          if (newPost && !postErr) {
            // Link session to post
            await supabase
              .from('live_sessions')
              .update({ post_id: newPost.id })
              .eq('id', session.id)

            results.orphans_recovered++
            results.details.push({
              action: 'recovered',
              session_id: session.id,
              post_id: newPost.id,
              chunks: recording.total_chunks,
            })
          } else {
            results.details.push({
              action: 'error_creating_post',
              session_id: session.id,
              error: postErr?.message,
            })
          }
        }
      }
    }

    // === PART B: Fix live posts without video_url ===
    const { data: emptyPosts } = await supabase
      .from('posts')
      .select('id, metadata')
      .eq('post_type', 'live')
      .is('video_url', null)

    if (emptyPosts) {
      for (const post of emptyPosts) {
        const meta = (post.metadata || {}) as Record<string, any>
        const sessionId = meta.live_session_id

        if (sessionId) {
          // Check if there's a done recording for this session
          const { data: recordings } = await supabase
            .from('chunked_recordings')
            .select('output_url')
            .eq('live_session_id', sessionId)
            .eq('status', 'done')
            .limit(1)

          if (recordings && recordings.length > 0 && recordings[0].output_url) {
            // Keep Cloudflare Stream as the VOD source of truth; chunked is recovery metadata only.
            await supabase
              .from('posts')
              .update({
                video_url: null,
                metadata: {
                  ...meta,
                  playback_url: null,
                  playback_type: 'cloudflare_stream_pending',
                  fallback_playback_url: recordings[0].output_url,
                  allow_chunked_fallback: false,
                },
              })
              .eq('id', post.id)

            results.posts_with_video_fixed++
            results.details.push({ action: 'video_fixed', post_id: post.id })
          } else {
            // Mark as recording_failed
            await supabase
              .from('posts')
              .update({
                metadata: { ...meta, recording_failed: true },
              })
              .eq('id', post.id)

            results.posts_marked_failed++
            results.details.push({ action: 'marked_failed', post_id: post.id })
          }
        } else {
          // No session ID in metadata — mark failed
          await supabase
            .from('posts')
            .update({
              metadata: { ...meta, recording_failed: true },
            })
            .eq('id', post.id)

          results.posts_marked_failed++
          results.details.push({ action: 'marked_failed_no_session', post_id: post.id })
        }
      }
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
