// Edge function: lấy giá USD lịch sử cho 1 token vào 1 ngày cụ thể (UTC)
// Cache trong bảng public.token_price_history theo (symbol, date)
// FUN không được hỗ trợ (testnet, không có giá thị trường thực)

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
  TON: 'the-open-network',
  TONCOIN: 'the-open-network', // alias của TON
};


function toDateUTC(input: string): Date | null {
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchCoinGeckoHistory(coinId: string, dateDDMMYYYY: string): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${dateDDMMYYYY}&localization=false`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[token-price-at-time] CoinGecko ${coinId} ${dateDDMMYYYY} status=${res.status}`);
    return null;
  }
  const data = await res.json();
  const price = data?.market_data?.current_price?.usd;
  return typeof price === 'number' ? price : null;
}

async function fetchCoinGeckoCurrent(coinId: string): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const price = data?.[coinId]?.usd;
  return typeof price === 'number' ? price : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol || '').toUpperCase().trim();
    const timestamp = String(body.timestamp || '').trim();

    if (!symbol || !timestamp) {
      return new Response(JSON.stringify({ error: 'symbol và timestamp là bắt buộc' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (symbol === 'FUN') {
      return new Response(
        JSON.stringify({ symbol, price_usd: null, source: 'testnet_skip', note: 'FUN testnet, không có giá USD' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const coinId = COINGECKO_IDS[symbol];
    if (!coinId) {
      return new Response(JSON.stringify({ error: `Token ${symbol} không hỗ trợ` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const dateUTC = toDateUTC(timestamp);
    if (!dateUTC) {
      return new Response(JSON.stringify({ error: 'timestamp không hợp lệ' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isoDate = formatDateISO(dateUTC);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    // 1) Cache hit?
    const { data: cached } = await supabase
      .from('token_price_history')
      .select('price_usd, source, fetched_at')
      .eq('symbol', symbol)
      .eq('date', isoDate)
      .maybeSingle();

    if (cached?.price_usd != null) {
      return new Response(
        JSON.stringify({ symbol, date: isoDate, price_usd: Number(cached.price_usd), source: cached.source, cached: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2) Fetch từ CoinGecko history
    const ddmmyyyy = formatDateDDMMYYYY(dateUTC);
    let price = await fetchCoinGeckoHistory(coinId, ddmmyyyy);
    let source = 'coingecko_history';

    // 3) Fallback giá hiện tại nếu history fail (vd ngày quá cũ)
    if (price == null) {
      price = await fetchCoinGeckoCurrent(coinId);
      source = 'coingecko_current_fallback';
    }

    if (price == null) {
      return new Response(JSON.stringify({ error: 'Không lấy được giá', symbol, date: isoDate }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4) Lưu cache (idempotent)
    await supabase
      .from('token_price_history')
      .upsert({ symbol, date: isoDate, price_usd: price, source }, { onConflict: 'symbol,date' });

    return new Response(
      JSON.stringify({ symbol, date: isoDate, price_usd: price, source, cached: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[token-price-at-time] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
