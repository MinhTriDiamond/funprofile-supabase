// Edge function: Backfill amount_usd cho mọi donation theo giá lịch sử
// - FUN: zero-out (testnet)
// - Token khác: dùng giá CoinGecko theo ngày donate (cache trong token_price_history)
//
// Admin-only. Body: { batch_size?: number = 50, dry_run?: boolean = false }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const COINGECKO_IDS: Record<string, string> = {
  BNB: 'binancecoin',
  BTCB: 'bitcoin',
  BTC: 'bitcoin',
  USDT: 'tether',
  USDC: 'usd-coin',
  CAMLY: 'camly-coin',
  ETH: 'ethereum',
  POL: 'matic-network',
};

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 75;

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

async function fetchCgHistory(coinId: string, ddmmyyyy: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${ddmmyyyy}&localization=false`);
    if (!r.ok) return null;
    const d = await r.json();
    const p = d?.market_data?.current_price?.usd;
    return typeof p === 'number' ? p : null;
  } catch { return null; }
}

// LƯU Ý: fetchCgCurrent() đã bị bỏ hẳn (quyết định Cha + CTO).
// Không được ghi giá HÔM NAY vào một ngày QUÁ KHỨ trong token_price_history.
// Khi CoinGecko không có giá đúng ngày → không ghi gì, giữ pending để cron sau retry.

const FUN_RICH_ACTOR_ID = 'a97cbb6c-0000-0000-0000-000000000000';
const NOTIFY_AFTER_ATTEMPTS = 3;
const NOTIFY_AFTER_MS = 30 * 60_000;


Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth: admin user HOẶC service_role HOẶC cron token (pg_cron mỗi 10')
    const auth = req.headers.get('Authorization') || '';
    const serviceKey =
      Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const cronToken = Deno.env.get('DONATIONS_REPRICING_CRON_TOKEN') ?? '';

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    const isServiceRole = !!serviceKey && auth === `Bearer ${serviceKey}`;
    const isCron = !!cronToken && req.headers.get('x-cron-token') === cronToken;

    if (!isServiceRole && !isCron) {

      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL')!,
        (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
        { global: { headers: { Authorization: auth } } },
      );
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id);
      const isAdmin = (roles || []).some(r => r.role === 'admin');
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    const body = await req.json().catch(() => ({}));
    // Giữ batch nhỏ để không vượt giới hạn thời gian Edge Function khi CoinGecko cần throttle.
    const batchSize = Math.min(Math.max(Number(body.batch_size) || DEFAULT_BATCH_SIZE, 10), MAX_BATCH_SIZE);
    const dryRun = !!body.dry_run;

    const stats: Record<string, number> = {
      fun_zeroed: 0,
      donations_repriced: 0,
      donations_skipped_no_price: 0,
      prices_fetched_from_cg: 0,
      prices_used_from_cache: 0,
      price_fetch_failures: 0,
      admin_alerts_sent: 0,
    };


    // ============================================
    // STEP 1: Zero-out FUN
    // ============================================
    if (!dryRun) {
      const { count } = await supabase
        .from('donations')
        .update({ amount_usd: null, price_usd_at_donation: null, price_source: 'testnet_skip' }, { count: 'exact' })
        .eq('token_symbol', 'FUN');
      stats.fun_zeroed = count || 0;
    } else {
      const { count } = await supabase
        .from('donations').select('id', { count: 'exact', head: true }).eq('token_symbol', 'FUN');
      stats.fun_zeroed = count || 0;
    }

    // ============================================
    // STEP 2: Lấy danh sách (symbol, date) cần re-price
    // ============================================
    const supportedSymbols = Object.keys(COINGECKO_IDS);

    // Lấy donation còn thiếu giá / còn dùng giá tham chiếu / đang pending.
    const { data: needs, error: needsErr } = await supabase
      .from('donations')
      .select('id, token_symbol, amount, created_at')
      .in('token_symbol', supportedSymbols)
      .or('price_source.is.null,price_source.eq.reference,price_source.eq.pending')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (needsErr) throw needsErr;

    // Cache giá theo (symbol, date) trong scope batch
    const priceCache = new Map<string, number | null>();
    const notifyTargets: { symbol: string; date: string; attempts: number; first: string }[] = [];

    /** Ghi nhận 1 lần fetch thất bại cho (symbol, date) và quyết định có cần báo admin. */
    async function recordFailure(symbol: string, dateISO: string) {
      const { data: prev } = await supabase
        .from('token_price_fetch_failures')
        .select('attempts, first_failed_at, notified_at')
        .eq('symbol', symbol).eq('date', dateISO).maybeSingle();

      const attempts = (prev?.attempts ?? 0) + 1;
      const firstFailedAt = prev?.first_failed_at ?? new Date().toISOString();

      if (!dryRun) {
        await supabase.from('token_price_fetch_failures').upsert(
          {
            symbol,
            date: dateISO,
            attempts,
            first_failed_at: firstFailedAt,
            last_failed_at: new Date().toISOString(),
            notified_at: prev?.notified_at ?? null,
          },
          { onConflict: 'symbol,date' },
        );
      }

      const tooOld = Date.now() - new Date(firstFailedAt).getTime() > NOTIFY_AFTER_MS;
      if (!prev?.notified_at && (attempts >= NOTIFY_AFTER_ATTEMPTS || tooOld)) {
        notifyTargets.push({ symbol, date: dateISO, attempts, first: firstFailedAt });
      }
      stats.price_fetch_failures++;
    }

    async function getPrice(symbol: string, dateISO: string): Promise<number | null> {
      const key = `${symbol}|${dateISO}`;
      if (priceCache.has(key)) return priceCache.get(key)!;

      // Cache trong DB?
      const { data: row } = await supabase
        .from('token_price_history')
        .select('price_usd').eq('symbol', symbol).eq('date', dateISO).maybeSingle();

      if (row?.price_usd != null) {
        const p = Number(row.price_usd);
        priceCache.set(key, p);
        stats.prices_used_from_cache++;
        return p;
      }

      // Fetch CoinGecko — CHỈ giá đúng ngày, KHÔNG fallback giá hôm nay.
      const coinId = COINGECKO_IDS[symbol];
      const dt = new Date(dateISO + 'T00:00:00Z');
      const price = await fetchCgHistory(coinId, formatDateDDMMYYYY(dt));

      if (price != null) {
        if (!dryRun) {
          await supabase.from('token_price_history').upsert(
            { symbol, date: dateISO, price_usd: price, source: 'coingecko_history' },
            { onConflict: 'symbol,date' },
          );
        }
        stats.prices_fetched_from_cg++;
      } else {
        // Không ghi gì vào token_price_history — giữ pending cho lần cron sau.
        await recordFailure(symbol, dateISO);
      }

      priceCache.set(key, price);

      // Throttle CoinGecko free tier: ~30 calls/min
      await new Promise(r => setTimeout(r, 1500));

      return price;
    }


    for (const d of needs || []) {
      const sym = (d.token_symbol || '').toUpperCase();
      const dateISO = new Date(d.created_at as string).toISOString().slice(0, 10);
      const price = await getPrice(sym, dateISO);
      if (price == null) {
        stats.donations_skipped_no_price++;
        continue;
      }
      const amount = Number(d.amount);
      if (!isFinite(amount) || amount <= 0) {
        stats.donations_skipped_no_price++;
        continue;
      }
      const amountUsd = amount * price;
      if (!dryRun) {
        await supabase.from('donations').update({
          amount_usd: amountUsd,
          price_usd_at_donation: price,
          price_source: 'historical',
        }).eq('id', d.id);
      }
      stats.donations_repriced++;
    }

    // Báo admin khi CoinGecko liên tục không trả được giá đúng ngày
    if (notifyTargets.length > 0 && !dryRun) {
      const { data: admins } = await supabase
        .from('user_roles').select('user_id').eq('role', 'admin');
      const adminIds = (admins || []).map((a) => a.user_id);
      if (adminIds.length > 0) {
        const list = notifyTargets
          .map((t) => `${t.symbol} ${t.date} (${t.attempts} lần)`)
          .join(', ');
        await supabase.from('notifications').insert(
          adminIds.map((uid) => ({
            user_id: uid,
            actor_id: FUN_RICH_ACTOR_ID,
            type: 'token_price_fetch_failed',
            content: `Không lấy được giá lịch sử cho: ${list}. Donation liên quan đang giữ trạng thái pending.`,
            metadata: { targets: notifyTargets },
          })),
        );
        await supabase
          .from('token_price_fetch_failures')
          .update({ notified_at: new Date().toISOString() })
          .in('symbol', notifyTargets.map((t) => t.symbol))
          .in('date', notifyTargets.map((t) => t.date));
        stats.admin_alerts_sent = notifyTargets.length;
      }
    }

    // Đếm số còn lại để tiếp tục
    const { count: remaining } = await supabase
      .from('donations').select('id', { count: 'exact', head: true })
      .in('token_symbol', supportedSymbols)
      .or('price_source.is.null,price_source.eq.reference,price_source.eq.pending');

    return new Response(JSON.stringify({
      ok: true,
      dry_run: dryRun,
      batch_size: batchSize,
      processed: (needs || []).length,
      remaining_after_batch: remaining || 0,
      stats,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[donations-repricing-backfill] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
