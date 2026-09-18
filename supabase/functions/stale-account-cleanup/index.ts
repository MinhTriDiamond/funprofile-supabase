// Giai đoạn 3 — Ngày 10: quét real-time danh sách đã nhắc, lập Preview và xoá SAU KHI CTO Confirm.
// KHÔNG có cron tự động xoá. mode='preview' để xem; mode='execute' cần confirm=true + danh sách user_ids.
import { corsHeaders, json, createAdminClient, requireUser, normalizeError } from '../_shared/httpAuth.ts';

interface PreviewRow {
  user_id: string;
  email: string | null;
  username: string | null;
  account_created_at: string;
  reminder_sent_at: string;
  batch_number: number;
  post_count: number;
  days_since_reminder: number;
}

const MIN_DAYS_SINCE_REMINDER = 7;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const user = await requireUser(req);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'Admin only' }, 403);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const mode = String(body?.mode ?? 'preview');

    // Luôn quét real-time: RPC tự đánh dấu 'signed' cho người đã hoàn tất ký.
    const { data: rows, error: prevErr } = await admin.rpc('stale_reminder_deletion_preview');
    if (prevErr) throw prevErr;
    const pending = (rows ?? []) as PreviewRow[];

    const withPosts = pending.filter((r) => r.post_count > 0);
    const tooEarly = pending.filter((r) => r.days_since_reminder < MIN_DAYS_SINCE_REMINDER);
    const eligible = pending.filter((r) => r.post_count === 0 && r.days_since_reminder >= MIN_DAYS_SINCE_REMINDER);

    if (mode === 'preview') {
      return json({
        ok: true,
        mode,
        total_pending: pending.length,
        eligible_for_deletion: eligible.length,
        blocked_has_posts: withPosts.length,
        blocked_too_early: tooEarly.length,
        eligible,
        blocked_has_posts_rows: withPosts,
        blocked_too_early_rows: tooEarly,
      });
    }

    if (mode !== 'execute') return json({ error: 'mode phải là preview hoặc execute' }, 400);
    if (body?.confirm !== true) return json({ error: 'Thiếu confirm=true' }, 400);

    const requested = Array.isArray(body?.user_ids) ? (body.user_ids as string[]) : [];
    if (requested.length === 0) return json({ error: 'Thiếu user_ids' }, 400);

    // Guard bắt buộc: mọi UID xoá phải nằm trong danh sách eligible vừa quét real-time.
    const eligibleIds = new Set(eligible.map((r) => r.user_id));
    const invalid = requested.filter((id) => !eligibleIds.has(id));
    if (invalid.length > 0) {
      return json({
        error: 'Có UID không đủ điều kiện xoá (đã ký / có bài viết / chưa đủ 7 ngày)',
        invalid,
      }, 409);
    }

    const results: Array<{ user_id: string; ok: boolean; error?: string }> = [];

    for (const id of requested) {
      try {
        const { error: profErr } = await admin.from('profiles').delete().eq('id', id);
        if (profErr) throw profErr;

        const { error: authErr } = await admin.auth.admin.deleteUser(id);
        if (authErr) throw authErr;

        // Verify sạch cả 2 nơi
        const { data: leftoverProfile } = await admin.from('profiles').select('id').eq('id', id).maybeSingle();
        const { data: leftoverAuth } = await admin.auth.admin.getUserById(id);
        if (leftoverProfile || leftoverAuth?.user) {
          throw new Error('Xoá chưa sạch (còn profile hoặc auth user)');
        }

        await admin.rpc('stale_reminder_finalize', {
          p_user_id: id,
          p_status: 'deleted',
          p_note: `Xoá theo Giai đoạn 3, admin ${user.id}`,
        });
        results.push({ user_id: id, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await admin.rpc('stale_reminder_finalize', {
          p_user_id: id,
          p_status: 'held',
          p_note: `Xoá thất bại: ${msg}`,
        });
        results.push({ user_id: id, ok: false, error: msg });
      }
    }

    return json({
      ok: true,
      mode,
      requested: requested.length,
      deleted: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    const e = normalizeError(err);
    console.error('[stale-account-cleanup]', e.message);
    return json({ error: e.message, code: e.code }, e.status ?? 500);
  }
});
