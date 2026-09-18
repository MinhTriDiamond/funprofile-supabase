/**
 * Treasury Recycle — Route platform fees vào treasury vaults theo policy
 * Có thể gọi từ admin hoặc các edge function khác (record-donation, etc.)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
    if (!authHeader || (authHeader !== `Bearer ${serviceKey}` && authHeader !== `Bearer ${anonKey}`)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey!);
    const body = await req.json().catch(() => ({}));
    const { source, amount, reason, reference_table, reference_id, token_symbol } = body;

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'amount required > 0' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // token_symbol BẮT BUỘC — tránh recycle CAMLY nhưng cộng vào vault FUN
    if (!token_symbol || typeof token_symbol !== 'string') {
      return new Response(JSON.stringify({ error: 'token_symbol required (vd: CAMLY, FUN)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atomic: insert flows + credit vaults trong 1 transaction (RPC SECURITY DEFINER)
    const { data: result, error: rpcErr } = await supabase.rpc('treasury_recycle_atomic', {
      _source: source || 'unknown',
      _token_symbol: token_symbol.toUpperCase(),
      _amount: amount,
      _reason: reason || 'Platform fee recycle',
      _reference_table: reference_table ?? null,
      _reference_id: reference_id ?? null,
    });
    if (rpcErr) {
      return new Response(JSON.stringify({ error: rpcErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, ...(result as Record<string, unknown>) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[TREASURY-RECYCLE] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
