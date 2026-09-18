// token-price-history-daily — B7a (M6E)
// Nạp giá LỊCH SỬ theo ngày vào public.token_price_history cho mọi token đang lưu hành.
//
// Nguyên tắc bất di bất dịch:
//  1. CHỈ ghi giá đúng ngày (endpoint /coins/{id}/history). KHÔNG BAO GIỜ ghi giá
//     hôm nay vào một ngày quá khứ (cùng guard với donations-repricing-backfill).
//  2. Không có giá → không ghi gì, để lượt sau tự chữa (cửa sổ lùi 14 ngày).
//  3. Gặp 429 → DỪNG lượt ngay, không đốt thêm rate limit.
//  4. BTCB dùng giá BTC (proxy 1:1 theo thiết kế BSC pegged) — ghi rõ ở cột source.
//
// Modes:
//  - mode 'fill' (mặc định): quét cửa sổ lùi `days` ngày, nạp ngày còn thiếu.
//  - mode 'gap_alert': KHÔNG gọi CoinGecko, chỉ báo cáo/notify khi còn chuỗi
//    thiếu > MAX_GAP_STREAK ngày liên tiếp.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-token',
};

/** Symbol đang lưu hành → CoinGecko id. TONCOIN là alias của TON. */
const COINGECKO_IDS: Record<string, string> = {
  BNB: 'binancecoin',
  BTC: 'bitcoin',
  BTCB: 'bitcoin', // proxy: BSC-pegged BTC
  USDT: 'tether',
  CAMLY: 'camly-coin',
  TON: 'the-open-network',
  TONCOIN: 'the-open-network', // alias
};

/** Nguồn ghi vào token_price_history.source */
function sourceFor(symbol: string): string {
  if (symbol === 'BTCB') return 'coingecko_market_chart_proxy_btc';
  return 'coingecko_market_chart';
}

const DEFAULT_DAYS = 14;
const DEFAULT_MAX_CALLS = 20;
const THROTTLE_MS = 6000; // CoinGecko free tier: endpoint /history bị 429 rất sớm nếu gọi nhanh
const RETRY_DELAYS = [2000, 4000, 8000];
const MAX_GAP_STREAK = 3;
const FUN_RICH_ACTOR_ID = 'a97cbb6c-0000-0000-0000-000000000000';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ddmmyyyy(dateISO: string): string {
  const [y, m, d] = dateISO.split('-');
  return `${d}-${m}-${y}`;
}

type SeriesResult = { series: [number, number][] | null; rateLimited: boolean };

/**
 * Lấy chuỗi giá theo khoảng (1 call cho cả cửa sổ) — endpoint market_chart/range.
 * Rẻ hơn /coins/{id}/history hàng chục lần về rate limit của CoinGecko free tier.
 */
async function fetchCgRange(coinId: string, fromISO: string, toISO: string): Promise<SeriesResult> {
  const from = Math.floor(new Date(fromISO + 'T00:00:00Z').getTime() / 1000) - 7200;
  const to = Math.floor(new Date(toISO + 'T00:00:00Z').getTime() / 1000) + 7200;
  const url =
    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${to}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) return { series: null, rateLimited: true };
      if (r.ok) {
        const d = await r.json();
        const prices = Array.isArray(d?.prices) ? (d.prices as [number, number][]) : null;
        return { series: prices, rateLimited: false };
      }
    } catch {
      // rơi xuống retry
    }
    if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt]);
  }
  return { series: null, rateLimited: false };
}

/** Chọn mẫu gần 00:00 UTC nhất của `dateISO`, chỉ nhận sai lệch <= 12 giờ. */
function priceAtUtcMidnight(series: [number, number][], dateISO: string): number | null {
  const target = new Date(dateISO + 'T00:00:00Z').getTime();
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const [ms, price] of series) {
    const diff = Math.abs(ms - target);
    if (diff < bestDiff && typeof price === 'number' && price > 0) {
      bestDiff = diff;
      best = price;
    }
  }
  return bestDiff <= 12 * 3600_000 ? best : null;
}


function admin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key =
    Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { url, key };
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = admin();
  return await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // ---- Auth: service_role key HOẶC cron token ----
  const { key: serviceKey } = admin();
  const cronToken = Deno.env.get('TOKEN_PRICE_HISTORY_CRON_TOKEN') ?? '';
  const auth = req.headers.get('Authorization') || '';
  const isServiceRole = !!serviceKey && auth === `Bearer ${serviceKey}`;
  const isCron = !!cronToken && req.headers.get('x-cron-token') === cronToken;
  if (!isServiceRole && !isCron) return json({ error: 'FORBIDDEN' }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const mode = (body.mode as string) === 'gap_alert' ? 'gap_alert' : 'fill';
  const days = Math.min(Math.max(Number(body.days) || DEFAULT_DAYS, 1), 365);
  const maxCalls = Math.min(Math.max(Number(body.max_calls) || DEFAULT_MAX_CALLS, 1), 200);
  const dryRun = !!body.dry_run;
  const symbols: string[] = Array.isArray(body.symbols) && body.symbols.length
    ? (body.symbols as string[]).map((s) => String(s).toUpperCase()).filter((s) => COINGECKO_IDS[s])
    : Object.keys(COINGECKO_IDS).filter((s) => s !== 'TONCOIN'); // TONCOIN chỉ là alias khi gọi tay

  // ---- Ngày trong cửa sổ (bỏ hôm nay: CoinGecko chỉ có giá chốt của ngày đã qua) ----
  const today = new Date();
  const dates: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(isoDate(d));
  }
  const minDate = dates[dates.length - 1];

  // ---- Đọc những gì đã có ----
  const existRes = await rest(
    `token_price_history?select=symbol,date&date=gte.${minDate}&symbol=in.(${symbols.join(',')})&limit=10000`,
  );
  const existing: { symbol: string; date: string }[] = existRes.ok ? await existRes.json() : [];
  const have = new Set(existing.map((r) => `${r.symbol}|${r.date}`));

  const missing: { symbol: string; date: string }[] = [];
  for (const symbol of symbols) {
    for (const date of dates) {
      if (!have.has(`${symbol}|${date}`)) missing.push({ symbol, date });
    }
  }

  // ---- Mode gap_alert: không gọi CoinGecko ----
  if (mode === 'gap_alert') {
    const streaks: Record<string, number> = {};
    for (const symbol of symbols) {
      let cur = 0;
      let worst = 0;
      for (const date of dates) {
        if (have.has(`${symbol}|${date}`)) cur = 0;
        else worst = Math.max(worst, ++cur);
      }
      streaks[symbol] = worst;
    }
    const offenders = Object.entries(streaks).filter(([, s]) => s > MAX_GAP_STREAK);
    if (offenders.length && !dryRun) {
      await rest('notifications', {
        method: 'POST',
        body: JSON.stringify({
          user_id: FUN_RICH_ACTOR_ID,
          actor_id: FUN_RICH_ACTOR_ID,
          type: 'token_price_fetch_failed',
          content:
            'Thiếu giá lịch sử liên tiếp: ' +
            offenders.map(([s, n]) => `${s} (${n} ngày)`).join(', '),
        }),
      });
    }
    return json({ mode, window_days: days, streaks, offenders: offenders.map(([s]) => s), missing_count: missing.length });
  }

  // ---- Mode fill ----
  const stats = {
    window_days: days,
    symbols,
    missing_before: missing.length,
    fetched: 0,
    no_price: 0,
    calls: 0,
    stopped_on_429: false,
    remaining: 0,
  };

  // Gom ngày thiếu theo symbol → 1 call CoinGecko cho cả cửa sổ của symbol đó.
  const bySymbol = new Map<string, string[]>();
  for (const m of missing) {
    if (!bySymbol.has(m.symbol)) bySymbol.set(m.symbol, []);
    bySymbol.get(m.symbol)!.push(m.date);
  }

  // BTC và BTCB cùng coinId 'bitcoin' → chỉ gọi 1 lần, dùng lại chuỗi.
  const seriesCache = new Map<string, [number, number][]>();

  for (const [symbol, symbolDates] of bySymbol) {
    if (stats.calls >= maxCalls) break;
    const coinId = COINGECKO_IDS[symbol];
    let series = seriesCache.get(coinId) ?? null;

    if (!series) {
      const sorted = [...symbolDates].sort();
      const res = await fetchCgRange(coinId, sorted[0], sorted[sorted.length - 1]);
      stats.calls++;
      if (res.rateLimited) {
        stats.stopped_on_429 = true;
        break;
      }
      if (res.series) {
        series = res.series;
        seriesCache.set(coinId, series);
      }
      await sleep(THROTTLE_MS);
    }

    if (!series) {
      stats.no_price += symbolDates.length;
      continue;
    }

    const rows: Record<string, unknown>[] = [];
    for (const date of symbolDates) {
      const price = priceAtUtcMidnight(series, date);
      if (price == null) {
        stats.no_price++;
        continue;
      }
      rows.push({
        symbol,
        date,
        price_usd: price,
        source: sourceFor(symbol),
        fetched_at: new Date().toISOString(),
      });
    }

    if (rows.length && !dryRun) {
      await rest('token_price_history?on_conflict=symbol,date', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(rows),
      });
    }
    stats.fetched += rows.length;
  }


  stats.remaining = stats.missing_before - stats.fetched;
  return json({ mode, dry_run: dryRun, ...stats });
});
