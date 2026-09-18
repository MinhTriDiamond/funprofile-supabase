import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, if-none-match',
  'Access-Control-Expose-Headers': 'etag, x-cache, x-cache-age',
};

const ON_CHAIN_DAILY_CAP_PER_ACTION = 1_000_000;
const MAX_MINT_PER_USER_PER_MONTH = 1_050_000;
const ON_CHAIN_ACTIONS = ['INNER_WORK', 'CHANNELING', 'GIVING', 'HELPING', 'GRATITUDE', 'SERVICE'];

// In-memory cache 30s, key theo user_id ("__system" nếu không có)
const CACHE_TTL_MS = 30_000;
type CacheEntry = { payload: string; etag: string; expires: number };
const cache = new Map<string, CacheEntry>();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let userId = url.searchParams.get('user_id');
    const walletParam = url.searchParams.get('wallet');
    const now = Date.now();

    // Resolve wallet → user_id (lookup trước khi cache)
    let walletInfo: {
      input: string;
      normalized: string;
      resolved: boolean;
      source: string | null;
      profile: { id: string; username: string | null; display_name: string | null } | null;
    } | null = null;

    if (walletParam && !userId) {
      const supabaseLookup = createClient(
        Deno.env.get('SUPABASE_URL')!,
        (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      );
      const normalized = walletParam.trim().toLowerCase();
      walletInfo = { input: walletParam, normalized, resolved: false, source: null, profile: null };

      // 1) custodial_wallets
      const { data: cw } = await supabaseLookup
        .from('custodial_wallets')
        .select('user_id')
        .eq('wallet_address', normalized)
        .maybeSingle();
      if (cw?.user_id) {
        userId = cw.user_id;
        walletInfo.source = 'custodial_wallets';
      } else {
        // 2) profiles theo nhiều cột wallet
        const cols = [
          'public_wallet_address',
          'external_wallet_address',
          'custodial_wallet_address',
          'login_wallet_address',
          'wallet_address',
        ];
        const orFilter = cols.map((c) => `${c}.ilike.${normalized}`).join(',');
        const { data: prof } = await supabaseLookup
          .from('profiles')
          .select('id, username, display_name')
          .or(orFilter)
          .limit(1)
          .maybeSingle();
        if (prof?.id) {
          userId = prof.id;
          walletInfo.source = 'profiles';
          walletInfo.profile = prof;
        }
      }
      walletInfo.resolved = !!userId;

      if (userId && !walletInfo.profile) {
        const { data: prof } = await supabaseLookup
          .from('profiles')
          .select('id, username, display_name')
          .eq('id', userId)
          .maybeSingle();
        if (prof) walletInfo.profile = prof;
      }
    }

    const cacheKey = userId ?? (walletParam ? `wallet:${walletParam.toLowerCase()}` : '__system');

    // Trả từ cache nếu còn hạn
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > now) {
      const ifNoneMatch = req.headers.get('if-none-match');
      if (ifNoneMatch && ifNoneMatch === hit.etag) {
        return new Response(null, {
          status: 304,
          headers: {
            ...corsHeaders,
            etag: hit.etag,
            'x-cache': 'HIT-304',
            'x-cache-age': String(Math.floor((CACHE_TTL_MS - (hit.expires - now)) / 1000)),
          },
        });
      }
      return new Response(hit.payload, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          etag: hit.etag,
          'Cache-Control': `public, max-age=${Math.max(1, Math.floor((hit.expires - now) / 1000))}`,
          'x-cache': 'HIT',
          'x-cache-age': String(Math.floor((CACHE_TTL_MS - (hit.expires - now)) / 1000)),
        },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const { data: cfg } = await supabase
      .from('epoch_config')
      .select('soft_ceiling, base_rate, system_stage, config_key')
      .eq('config_key', 'default')
      .maybeSingle();

    const softCeiling = Number(cfg?.soft_ceiling ?? 20_000_000);

    const dt = new Date();
    const monthStart = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1)).toISOString();
    const dayStart = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())).toISOString();

    const { data: monthMints } = await supabase
      .from('pplp_mint_requests')
      .select('amount, action_type, status, user_id, created_at')
      .gte('created_at', monthStart)
      .in('status', ['confirmed', 'minted', 'submitted', 'pending_sig', 'signing', 'pending']);

    const totalMintedMonth = (monthMints ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const remainingSoftCeiling = Math.max(0, softCeiling - totalMintedMonth);
    const softCeilingUsedPct = softCeiling > 0 ? (totalMintedMonth / softCeiling) * 100 : 0;

    const { data: dayMints } = await supabase
      .from('pplp_mint_requests')
      .select('amount, action_type, status')
      .gte('created_at', dayStart)
      .in('status', ['confirmed', 'minted', 'submitted', 'pending_sig', 'signing', 'pending']);

    const perAction = ON_CHAIN_ACTIONS.map((act) => {
      const used = (dayMints ?? [])
        .filter((r) => (r.action_type ?? '').toUpperCase() === act)
        .reduce((s, r) => s + Number(r.amount ?? 0), 0);
      return {
        action: act,
        daily_cap: ON_CHAIN_DAILY_CAP_PER_ACTION,
        used_today: used,
        remaining: Math.max(0, ON_CHAIN_DAILY_CAP_PER_ACTION - used),
        used_pct: (used / ON_CHAIN_DAILY_CAP_PER_ACTION) * 100,
      };
    });

    let userStatus: Record<string, unknown> | null = null;
    if (userId) {
      const userMonth = (monthMints ?? []).filter((r) => r.user_id === userId);
      const userMintedMonth = userMonth.reduce((s, r) => s + Number(r.amount ?? 0), 0);
      userStatus = {
        user_id: userId,
        monthly_cap: MAX_MINT_PER_USER_PER_MONTH,
        used_this_month: userMintedMonth,
        remaining: Math.max(0, MAX_MINT_PER_USER_PER_MONTH - userMintedMonth),
        used_pct: (userMintedMonth / MAX_MINT_PER_USER_PER_MONTH) * 100,
        request_count_month: userMonth.length,
      };
    }

    const body = {
      generated_at: new Date(now).toISOString(),
      cache_ttl_seconds: CACHE_TTL_MS / 1000,
      month_window: monthStart,
      day_window: dayStart,
      soft_ceiling: {
        limit: softCeiling,
        used_month: totalMintedMonth,
        remaining: remainingSoftCeiling,
        used_pct: softCeilingUsedPct,
        system_stage: cfg?.system_stage ?? 'unknown',
        base_rate: Number(cfg?.base_rate ?? 0),
      },
      per_action_today: perAction,
      per_user_monthly_cap: MAX_MINT_PER_USER_PER_MONTH,
      user_status: userStatus,
      wallet_lookup: walletInfo,
      constants: {
        ON_CHAIN_DAILY_CAP_PER_ACTION,
        MAX_MINT_PER_USER_PER_MONTH,
        theoretical_monthly_ceiling: ON_CHAIN_ACTIONS.length * ON_CHAIN_DAILY_CAP_PER_ACTION * 30,
      },
    };

    const payload = JSON.stringify(body);
    // ETag tính trên data thật (loại generated_at để không đổi mỗi lần)
    const { generated_at: _g, ...stable } = body as Record<string, unknown>;
    const etag = `W/"${(await sha256Hex(JSON.stringify(stable))).slice(0, 16)}"`;

    cache.set(cacheKey, { payload, etag, expires: now + CACHE_TTL_MS });

    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: { ...corsHeaders, etag, 'x-cache': 'MISS-304' },
      });
    }

    return new Response(payload, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        etag,
        'Cache-Control': `public, max-age=${CACHE_TTL_MS / 1000}`,
        'x-cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('[token-limits-status]', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
