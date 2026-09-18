// Shared helper: grant mystery box from any edge flow (fire-and-forget).
// Idempotent at DB level via (user_id, source, source_ref_id) unique constraint
// trong RPC `mystery_box_grant`.

export interface GrantMysteryBoxArgs {
  user_id: string;
  source:
    | 'daily_login'
    | 'quest_complete'
    | 'streak_7d'
    | 'streak_30d'
    | 'gift_sent'
    | 'invite_t1'
    | 'premium_purchase'
    | 'event_manual';
  source_ref_id?: string | null;
  /** Override box code; nếu bỏ trống RPC tự chọn theo source. */
  box_code?: string | null;
}

/**
 * Gọi edge `mystery-box-grant-hook` qua HTTP nội bộ.
 * Không throw — log lỗi để không phá flow gốc.
 */
export async function grantMysteryBox(args: GrantMysteryBoxArgs): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL');
  const cronSecret = Deno.env.get('CRON_SHARED_SECRET');
  if (!url || !cronSecret) {
    console.warn('[grantMysteryBox] missing env, skip');
    return;
  }

  try {
    const res = await fetch(`${url}/functions/v1/mystery-box-grant-hook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[grantMysteryBox] ${args.source} failed:`, res.status, txt);
    }
  } catch (e) {
    console.warn('[grantMysteryBox] exception:', e instanceof Error ? e.message : e);
  }
}
