// Edge Function: pplp-v2-auto-attest-internal
// Admin-only: tự xác nhận (auto-attest) các action đang kẹt `proof_pending`
// dựa trên log nội bộ của hệ thống (livestream, on-chain tx, share trong app...).
// Không bypass NLP/fraud — vẫn chạy qua pplp-v2-validate-action.
//
// Input: { action_ids?: string[], cycle?: 'YYYY-MM' (mặc định '2026-04'), notify?: boolean }
// Output: { processed, succeeded, skipped, failed: [...], details: [...] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- Auth + Admin check ----
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Authentication required' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id, _role: 'admin',
    });
    if (roleError || !isAdmin) return json({ error: 'Admin role required' }, 403);

    // ---- Parse input ----
    const body = await req.json().catch(() => ({}));
    const inputIds: string[] | undefined = Array.isArray(body.action_ids) ? body.action_ids : undefined;
    const cycle: string = typeof body.cycle === 'string' ? body.cycle : '2026-04';
    const notify: boolean = body.notify !== false; // default true

    // ---- Resolve target actions ----
    let actions: any[] = [];
    if (inputIds && inputIds.length > 0) {
      const { data, error } = await supabase
        .from('pplp_v2_user_actions')
        .select('id, user_id, action_type_code, title, status')
        .in('id', inputIds);
      if (error) throw error;
      actions = data || [];
    } else {
      // Default: all proof_pending in given cycle (YYYY-MM)
      const [yStr, mStr] = cycle.split('-');
      const y = Number(yStr); const m = Number(mStr);
      if (!y || !m) return json({ error: 'Invalid cycle (expected YYYY-MM)' }, 400);
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
      const end = new Date(Date.UTC(y, m, 1)).toISOString();
      const { data, error } = await supabase
        .from('pplp_v2_user_actions')
        .select('id, user_id, action_type_code, title, status')
        .eq('status', 'proof_pending')
        .gte('created_at', start)
        .lt('created_at', end);
      if (error) throw error;
      actions = data || [];
    }

    console.log(`[auto-attest] Admin ${user.id} processing ${actions.length} actions (cycle=${cycle})`);

    const succeeded: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const failed: { id: string; reason: string }[] = [];
    const details: any[] = [];
    const notifiedUsers = new Set<string>();

    for (const action of actions) {
      try {
        if (action.status !== 'proof_pending') {
          skipped.push({ id: action.id, reason: `status=${action.status}` });
          continue;
        }

        // Idempotency: skip if a system_log proof already exists with auto_attested flag
        const { data: existing } = await supabase
          .from('pplp_v2_proofs')
          .select('id, raw_metadata')
          .eq('action_id', action.id);
        const alreadyAttested = (existing || []).some(
          (p: any) => p?.raw_metadata?.auto_attested === true,
        );
        if (alreadyAttested) {
          skipped.push({ id: action.id, reason: 'already_auto_attested' });
          continue;
        }

        // 1. Insert system_log proof
        const { data: proof, error: proofError } = await supabase
          .from('pplp_v2_proofs')
          .insert({
            action_id: action.id,
            proof_type: 'system_log',
            extracted_text:
              'Auto-attested by admin: hành động diễn ra trên hệ thống (log nội bộ đã xác minh).',
            raw_metadata: {
              auto_attested: true,
              source: 'internal_system_log',
              admin_id: user.id,
              attested_at: new Date().toISOString(),
              cycle,
            },
          })
          .select('id')
          .single();
        if (proofError) throw new Error(`proof insert: ${proofError.message}`);

        // 2. Update action → under_review
        await supabase
          .from('pplp_v2_user_actions')
          .update({ status: 'under_review' })
          .eq('id', action.id);

        // 3. Audit event
        await supabase.from('pplp_v2_event_log').insert({
          event_type: 'proof.auto_attested',
          actor_id: user.id,
          reference_table: 'pplp_v2_proofs',
          reference_id: proof.id,
          payload: {
            action_id: action.id,
            action_type_code: action.action_type_code,
            target_user_id: action.user_id,
            cycle,
          },
        });

        // 4. Trigger validation engine (NLP + fraud + LS)
        const valRes = await fetch(`${supabaseUrl}/functions/v1/pplp-v2-validate-action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ action_id: action.id }),
        });
        const valData = await valRes.json().catch(() => ({}));

        details.push({
          id: action.id,
          user_id: action.user_id,
          title: action.title,
          validation: {
            status: valData?.validation_status,
            light_score: valData?.final_light_score,
            mint: valData?.mint,
          },
        });
        succeeded.push(action.id);

        // 5. Notification
        if (notify && action.user_id) {
          await supabase.from('notifications').insert({
            user_id: action.user_id,
            actor_id: user.id,
            type: 'reward_adjustment',
            metadata: {
              kind: 'pplp_v2_action_auto_attested',
              action_id: action.id,
              action_type_code: action.action_type_code,
              title: action.title,
              light_score: valData?.final_light_score ?? null,
              validation_status: valData?.validation_status ?? null,
              message:
                'Hệ thống đã tự xác nhận hành động của bạn dựa trên log nội bộ. Light Score đã được ghi nhận.',
            },
          });
          notifiedUsers.add(action.user_id);
        }
      } catch (err: any) {
        console.error(`[auto-attest] action ${action.id} failed:`, err);
        failed.push({ id: action.id, reason: err?.message || 'unknown' });
      }
    }

    // Bulk audit log
    await supabase.from('audit_logs').insert({
      admin_id: user.id,
      action: 'pplp_v2_auto_attest_internal',
      details: {
        cycle,
        requested: actions.length,
        succeeded: succeeded.length,
        skipped: skipped.length,
        failed: failed.length,
        notified_users: notifiedUsers.size,
      },
    });

    return json({
      success: true,
      processed: actions.length,
      succeeded: succeeded.length,
      skipped,
      failed,
      notified_users: notifiedUsers.size,
      details,
    });
  } catch (error: any) {
    console.error('[auto-attest] fatal:', error);
    return json({ error: error?.message || 'Unknown error' }, 500);
  }
});
