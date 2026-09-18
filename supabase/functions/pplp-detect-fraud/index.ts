import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient } from "../_shared/pplp-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { actor_id } = await req.json();
    if (!actor_id) {
      return new Response(JSON.stringify({ error: 'actor_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[PPLP Fraud] Checking fraud signals for user ${actor_id}`);

    // 1. Bot Detection: >20 actions/hour or uniform timing
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentActions, count: actionCount } = await supabase
      .from('pplp_actions')
      .select('created_at', { count: 'exact' })
      .eq('actor_id', actor_id)
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: true });

    const signals: Array<{
      signal_type: string;
      severity: number;
      details: Record<string, unknown>;
    }> = [];

    if (actionCount && actionCount > 20) {
      signals.push({
        signal_type: 'BOT',
        severity: 3,
        details: { actions_per_hour: actionCount, threshold: 20 },
      });
    }

    // Check uniform timing (actions < 1 min apart)
    if (recentActions && recentActions.length > 3) {
      const intervals: number[] = [];
      for (let i = 1; i < recentActions.length; i++) {
        const diff = new Date(recentActions[i].created_at).getTime() - 
                     new Date(recentActions[i-1].created_at).getTime();
        intervals.push(diff / 1000);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval < 60) {
        signals.push({
          signal_type: 'BOT',
          severity: 2,
          details: { avg_interval_seconds: avgInterval, threshold: 60 },
        });
      }
    }

    // 2. Spam Detection: Short content or hash duplicates
    const { data: scoredActions } = await supabase
      .from('pplp_actions')
      .select('canonical_hash, metadata')
      .eq('actor_id', actor_id)
      .eq('status', 'scored')
      .order('created_at', { ascending: false })
      .limit(50);

    if (scoredActions) {
      const hashCounts = new Map<string, number>();
      for (const a of scoredActions) {
        if (a.canonical_hash) {
          hashCounts.set(a.canonical_hash, (hashCounts.get(a.canonical_hash) || 0) + 1);
        }
      }
      const duplicates = Array.from(hashCounts.entries()).filter(([_, count]) => count > 2);
      if (duplicates.length > 0) {
        signals.push({
          signal_type: 'SPAM',
          severity: 2,
          details: { duplicate_hashes: duplicates.length, total_checked: scoredActions.length },
        });
      }
    }

    // 3. Device fingerprint check
    const { data: devices } = await supabase
      .from('pplp_device_registry')
      .select('device_hash, is_flagged')
      .eq('user_id', actor_id);

    if (devices) {
      for (const d of devices) {
        if (d.is_flagged) {
          signals.push({
            signal_type: 'SYBIL',
            severity: 4,
            details: { flagged_device: d.device_hash },
          });
        }

        // Check if same device used by other users
        const { count: otherUsers } = await supabase
          .from('pplp_device_registry')
          .select('user_id', { count: 'exact' })
          .eq('device_hash', d.device_hash)
          .neq('user_id', actor_id);

        if (otherUsers && otherUsers > 2) {
          signals.push({
            signal_type: 'SYBIL',
            severity: 3,
            details: { shared_device_users: otherUsers + 1, device_hash: d.device_hash },
          });
        }
      }
    }

    // Insert signals
    if (signals.length > 0) {
      const { error: insertErr } = await supabase
        .from('pplp_fraud_signals')
        .insert(signals.map(s => ({
          actor_id,
          signal_type: s.signal_type,
          severity: s.severity,
          details: s.details,
          source: 'pplp-detect-fraud',
        })));

      if (insertErr) console.error('[PPLP Fraud] Insert error:', insertErr);

      // Update user tier fraud flags
      const maxSeverity = Math.max(...signals.map(s => s.severity));
      await supabase
        .from('pplp_user_tiers')
        .upsert({
          user_id: actor_id,
          fraud_flags: signals.length,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }

    const riskScore = signals.reduce((sum, s) => sum + s.severity * 15, 0);

    return new Response(JSON.stringify({
      success: true,
      actor_id,
      signals_count: signals.length,
      risk_score: Math.min(100, riskScore),
      signals,
      mint_blocked: riskScore > 50,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[PPLP Fraud] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
