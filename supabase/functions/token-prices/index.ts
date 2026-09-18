const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// In-memory cache
let cachedPrices: Record<string, { usd: number; usd_24h_change: number }> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60_000; // 5 minutes (was 60s — too aggressive for CoinGecko free tier)
const STALE_MAX_AGE = 60 * 60_000; // Cache cũ vẫn dùng được tối đa 60 phút, có gắn nhãn stale
let backoffUntil = 0; // Don't retry CoinGecko until this timestamp

const OUTAGE_KEY = 'token_price_outage';
const OUTAGE_NOTIFY_AFTER_MS = 15 * 60_000; // Thông báo admin nếu mất giá > 15 phút
const OUTAGE_NOTIFY_COOLDOWN_MS = 60 * 60_000;

const COINGECKO_IDS: Record<string, string> = {
  BNB: 'binancecoin',
  BTCB: 'bitcoin',
  BTC: 'bitcoin',
  USDT: 'tether',
  CAMLY: 'camly-coin',
  TON: 'the-open-network',
};

// KHÔNG có FALLBACK_PRICES: không bao giờ trả giá bịa.
// Không có giá thật và không có cache dùng được → 503 PRICE_SOURCE_UNAVAILABLE.

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return { url, key };
}

async function sbFetch(path: string, init: RequestInit) {
  const c = adminClient();
  if (!c) return null;
  return await fetch(`${c.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

/** Ghi nhận outage; nếu kéo dài > 15 phút thì thông báo admin (cooldown 1 giờ). */
async function trackOutage(reason: string) {
  try {
    const res = await sbFetch(`system_config?key=eq.${OUTAGE_KEY}&select=value`, { method: 'GET' });
    const rows = res ? await res.json() : [];
    const nowIso = new Date().toISOString();
    const prev = Array.isArray(rows) && rows[0]?.value ? rows[0].value : null;
    const since = prev?.since ?? nowIso;
    const lastNotified = prev?.last_notified_at ? Date.parse(prev.last_notified_at) : 0;
    const downMs = Date.now() - Date.parse(since);

    let notifiedAt = prev?.last_notified_at ?? null;
    if (downMs > OUTAGE_NOTIFY_AFTER_MS && Date.now() - lastNotified > OUTAGE_NOTIFY_COOLDOWN_MS) {
      const adminsRes = await sbFetch('user_roles?role=eq.admin&select=user_id', { method: 'GET' });
      const admins = adminsRes ? await adminsRes.json() : [];
      if (Array.isArray(admins) && admins.length) {
        await sbFetch('notifications', {
          method: 'POST',
          body: JSON.stringify(
            admins.map((a: { user_id: string }) => ({
              user_id: a.user_id,
              type: 'token_price_fetch_failed',
              title: '⚠️ Nguồn giá USD đang gián đoạn',
              message: `Không lấy được giá thị trường từ ${Math.round(downMs / 60000)} phút trước. Các số liệu USD đang hiển thị "Chưa có giá".`,
              metadata: { since, reason, down_minutes: Math.round(downMs / 60000) },
            })),
          ),
        });
        notifiedAt = nowIso;
      }
    }

    await sbFetch('system_config?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([
        {
          key: OUTAGE_KEY,
          value: { since, last_seen_at: nowIso, last_notified_at: notifiedAt, reason },
          description: 'Theo dõi gián đoạn nguồn giá USD (token-prices)',
          updated_at: nowIso,
        },
      ]),
    });
  } catch (e) {
    console.error('[token-prices] trackOutage failed:', e);
  }
}

/**
 * SSOT (M6E/B1): ghi giá thật vào public.token_price_current để mọi RPC/DB function
 * đọc qua get_token_price_now() thay vì hardcode. Chỉ ghi giá thật, không bao giờ giá bịa.
 */
async function upsertCurrentPrices(prices: Record<string, { usd: number; usd_24h_change: number }>) {
  try {
    const nowIso = new Date().toISOString();
    const rows = Object.entries(prices)
      .filter(([, v]) => typeof v.usd === 'number' && v.usd > 0)
      .map(([symbol, v]) => ({
        symbol: symbol.toUpperCase(),
        price_usd: v.usd,
        usd_24h_change: v.usd_24h_change ?? null,
        source: 'coingecko',
        fetched_at: nowIso,
        updated_at: nowIso,
      }));
    if (!rows.length) return;
    const res = await sbFetch('token_price_current?on_conflict=symbol', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    if (res && !res.ok) {
      console.error('[token-prices] upsertCurrentPrices failed:', res.status, await res.text());
    }
  } catch (e) {
    console.error('[token-prices] upsertCurrentPrices error:', e);
  }
}

async function clearOutage() {
  try {
    const res = await sbFetch(`system_config?key=eq.${OUTAGE_KEY}&select=value`, { method: 'GET' });
    const rows = res ? await res.json() : [];
    if (Array.isArray(rows) && rows.length) {
      await sbFetch(`system_config?key=eq.${OUTAGE_KEY}`, { method: 'DELETE' });
    }
  } catch (e) {
    console.error('[token-prices] clearOutage failed:', e);
  }
}

async function fetchWithRetry(url: string, maxRetries = 2): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        // Rate limited — exponential backoff: 30s, 60s, 120s
        const waitMs = 30_000 * Math.pow(2, i);
        backoffUntil = Date.now() + waitMs;
        console.warn(`[token-prices] Rate limited (429), backing off ${waitMs / 1000}s`);
        if (i < maxRetries) {
          await new Promise(r => setTimeout(r, Math.min(waitMs, 5000))); // Wait max 5s per retry in-request
          continue;
        }
        throw new Error(`CoinGecko rate limited after ${maxRetries + 1} attempts`);
      }
      if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastError!;
}

function staleResponse(reason: string) {
  const ageMs = Date.now() - cacheTimestamp;
  if (cachedPrices && ageMs < STALE_MAX_AGE) {
    return new Response(
      JSON.stringify({
        prices: cachedPrices,
        cached: true,
        stale: true,
        stale_since: new Date(cacheTimestamp).toISOString(),
        reason,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } },
    );
  }
  return new Response(
    JSON.stringify({ error: 'PRICE_SOURCE_UNAVAILABLE', reason }),
    { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = Date.now();

    // Return cached if fresh
    if (cachedPrices && now - cacheTimestamp < CACHE_TTL) {
      return new Response(JSON.stringify({ prices: cachedPrices, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      });
    }

    // Backoff: dùng cache cũ (gắn nhãn stale) hoặc 503 — không bịa giá
    if (now < backoffUntil) {
      if (!cachedPrices) await trackOutage('backoff_no_cache');
      return staleResponse('backoff');
    }

    // Fetch from CoinGecko with retry
    const ids = Object.values(COINGECKO_IDS).join(',');
    const res = await fetchWithRetry(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    );

    const data = await res.json();

    const prices: Record<string, { usd: number; usd_24h_change: number }> = {};
    for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
      const d = data[geckoId];
      // Chỉ nhận giá thật; thiếu symbol nào thì bỏ symbol đó (FE sẽ hiện "Chưa có giá")
      if (d && typeof d.usd === 'number') {
        prices[symbol] = { usd: d.usd, usd_24h_change: typeof d.usd_24h_change === 'number' ? d.usd_24h_change : 0 };
      }
    }

    if (Object.keys(prices).length === 0) {
      await trackOutage('empty_upstream_payload');
      return staleResponse('empty_upstream_payload');
    }

    // Update cache
    cachedPrices = prices;
    cacheTimestamp = now;
    backoffUntil = 0; // Reset backoff on success
    await clearOutage();
    await upsertCurrentPrices(prices);

    return new Response(JSON.stringify({ prices, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (error) {
    console.error('[token-prices] Error:', error);
    const ageMs = Date.now() - cacheTimestamp;
    if (!cachedPrices || ageMs >= STALE_MAX_AGE) {
      await trackOutage(error instanceof Error ? error.message : String(error));
    }
    return staleResponse('upstream_error');
  }
});
