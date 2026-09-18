// Auto SBT Evaluator — daily cron, idempotent
// Quét sbt_issuance_rules.is_active=true mode='auto', đánh giá điều kiện cho mọi DID,
// cấp SBT (status='active') vào sbt_registry nếu chưa có.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function listEligibleDids() {
  const { data } = await sb.from('did_registry').select('did_id, owner_user_id, level');
  return data ?? [];
}

async function alreadyIssued(did_id: string, sbt_type: string) {
  const { count } = await sb.from('sbt_registry').select('token_id', { count: 'exact', head: true })
    .eq('did_id', did_id).eq('sbt_type', sbt_type).eq('status', 'active');
  return (count ?? 0) > 0;
}

async function issue(did_id: string, rule: any, evidence: any) {
  await sb.from('sbt_registry').insert({
    did_id,
    sbt_type: rule.sbt_type,
    sbt_category: rule.category,
    status: 'active',
    privacy_level: rule.privacy_level,
    trust_weight: rule.trust_weight,
    issued_at: new Date().toISOString(),
    metadata: { display_name: rule.display_name, description: rule.description, auto: true },
    evidence_hash: evidence?.hash ?? null,
  });
}

async function evalRule(rule: any, dids: any[]) {
  let issued = 0;
  const cond = rule.auto_conditions ?? {};

  for (const d of dids) {
    if (await alreadyIssued(d.did_id, rule.sbt_type)) continue;

    let pass = false;
    let evidence: any = null;

    switch (rule.sbt_type) {
      case 'social_consistent_poster': {
        const minDays = cond.min_consecutive_days ?? 7;
        const { data: posts } = await sb.from('posts').select('created_at')
          .eq('user_id', d.owner_user_id)
          .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString());
        const days = new Set((posts ?? []).map(p => p.created_at.slice(0, 10)));
        // longest consecutive streak
        const sorted = Array.from(days).sort();
        let max = 0, cur = 0, prev: string | null = null;
        for (const day of sorted) {
          if (prev && new Date(day).getTime() - new Date(prev).getTime() === 86400_000) cur++;
          else cur = 1;
          if (cur > max) max = cur;
          prev = day;
        }
        pass = max >= minDays;
        evidence = { streak: max };
        break;
      }
      case 'lovehub_participant': {
        const min = cond.min_lovehub_sessions ?? 3;
        const { count } = await sb.from('live_sessions').select('id', { count: 'exact', head: true })
          .eq('host_user_id', d.owner_user_id);
        pass = (count ?? 0) >= min;
        evidence = { sessions: count };
        break;
      }
      case 'generous_giver': {
        const min = cond.min_internal_donations ?? 10;
        const { count } = await sb.from('donations').select('id', { count: 'exact', head: true })
          .eq('sender_id', d.owner_user_id).eq('is_external', false);
        pass = (count ?? 0) >= min;
        evidence = { donations: count };
        break;
      }
      case 'community_recognized': {
        const min = cond.min_reactions_on_post ?? 50;
        const { data } = await sb.from('posts').select('id, reaction_count')
          .eq('user_id', d.owner_user_id).gte('reaction_count', min).limit(1);
        pass = (data ?? []).length > 0;
        evidence = { post_id: data?.[0]?.id, reactions: data?.[0]?.reaction_count };
        break;
      }
      case 'community_contributor_monthly': {
        // Top 10% Light Score current month — needs ranking, defer to V2
        pass = false;
        break;
      }
      default:
        continue;
    }

    if (pass) {
      await issue(d.did_id, rule, evidence);
      issued++;
    }
  }
  return issued;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { data: rules } = await sb.from('sbt_issuance_rules')
      .select('*').eq('mode', 'auto').eq('is_active', true);
    const dids = await listEligibleDids();
    const summary: Record<string, number> = {};
    for (const rule of (rules ?? [])) {
      summary[rule.sbt_type] = await evalRule(rule, dids);
    }
    return new Response(JSON.stringify({ ok: true, dids_scanned: dids.length, issued: summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
