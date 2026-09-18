// Giai đoạn 2 — Gửi email nhắc hoàn tất ký Luật Ánh Sáng, chia 3 đợt / 3 ngày liên tiếp.
// Quét REAL-TIME trước mỗi đợt: chỉ gửi cho người vẫn còn law_of_light_accepted = false
// và chưa từng nhận nhắc (UNIQUE user_id trong stale_account_reminder_log).
import { corsHeaders, json, createAdminClient, requireUser, normalizeError } from '../_shared/httpAuth.ts';
import { sendBrandedEmail, APP_URL } from '../_shared/resendClient.ts';
import { staleAccountReminderHtml } from '../_shared/emailTemplates.ts';

const BATCH_LIMITS: Record<number, number> = { 1: 36, 2: 36, 3: 500 };
const DEADLINE_DAYS = 7;

interface Candidate {
  user_id: string;
  email: string;
  account_created_at: string;
  days_stale: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const isCron = body?.cron === true;

    // Cron gọi không có JWT; mọi lời gọi thủ công phải là admin.
    if (!isCron) {
      const user = await requireUser(req);
      const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (!isAdmin) return json({ error: 'Admin only' }, 403);
    }

    const dryRun = body?.dry_run === true;

    // Xác định đợt: dùng tham số, hoặc tự chọn đợt kế tiếp chưa gửi.
    let batch = Number(body?.batch_number ?? 0);
    if (!batch) {
      const { data: last } = await admin
        .from('stale_account_reminder_log')
        .select('batch_number')
        .order('batch_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      batch = (last?.batch_number ?? 0) + 1;
    }
    if (batch < 1 || batch > 3) {
      return json({ ok: true, done: true, message: 'Đã gửi đủ 3 đợt, không còn gì để gửi.' });
    }

    const limit = BATCH_LIMITS[batch] ?? 36;

    const { data: candidates, error: pickErr } = await admin.rpc('stale_reminder_pick_batch', {
      p_batch: batch,
      p_limit: limit,
    });
    if (pickErr) throw pickErr;

    const list = (candidates ?? []) as Candidate[];
    const { data: excluded } = await admin.rpc('stale_reminder_excluded_count');

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        batch_number: batch,
        candidates: list.length,
        excluded_signed: excluded ?? 0,
        sample: list.slice(0, 5).map((c) => ({ user_id: c.user_id, days_stale: c.days_stale })),
      });
    }

    const signUrl = `${APP_URL}/auth?redirect=%2Flaw-of-light`;
    let sent = 0;
    const failures: Array<{ user_id: string; error: string }> = [];

    for (const c of list) {
      const res = await sendBrandedEmail({
        to: c.email,
        subject: 'Hoàn tất ký Luật Ánh Sáng để giữ tài khoản FUN Profile',
        html: staleAccountReminderHtml({ email: c.email, url: signUrl, deadlineDays: DEADLINE_DAYS }),
        text: `Bạn đã đăng ký FUN Profile nhưng chưa hoàn tất bước ký Luật Ánh Sáng để kích hoạt tài khoản. Nếu không hoàn tất trong ${DEADLINE_DAYS} ngày kể từ email này, tài khoản sẽ bị XOÁ. Ký ngay: ${signUrl}`,
        emailType: 'stale_account_reminder',
        redirectTo: signUrl,
        metadata: { batch_number: batch, days_stale: c.days_stale },
      });

      if (res.ok) {
        const { error: logErr } = await admin.rpc('stale_reminder_record_sent', {
          p_user_id: c.user_id,
          p_email: c.email,
          p_batch: batch,
          p_message_id: res.messageId ?? null,
        });
        if (logErr) {
          failures.push({ user_id: c.user_id, error: `log: ${logErr.message}` });
        } else {
          sent += 1;
        }
      } else {
        failures.push({ user_id: c.user_id, error: res.error ?? 'unknown' });
      }
    }

    if (typeof body?.self_unschedule === 'string' && body.self_unschedule) {
      await admin.rpc('cron_unschedule_by_name', { job_name: body.self_unschedule });
    }

    return json({
      ok: true,
      batch_number: batch,
      candidates: list.length,
      sent,
      failed: failures.length,
      excluded_signed: excluded ?? 0,
      failures: failures.slice(0, 20),
    });
  } catch (err) {
    const e = normalizeError(err);
    console.error('[stale-account-reminder-send]', e.message);
    return json({ error: e.message, code: e.code }, e.status ?? 500);
  }
});
