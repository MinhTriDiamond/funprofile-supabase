/**
 * External wallet transaction filter (anti dust/spam/fake).
 * Nguồn cấu hình: bảng public.token_ingest_filters + public.blacklisted_wallets.
 * Log các giao dịch bị chặn vào public.external_tx_filter_log.
 *
 * Sử dụng:
 *   const filter = await getExternalTxFilter();
 *   const verdict = filter.check({ tokenSymbol, amount, senderAddress, chain });
 *   if (!verdict.ok) { await filter.log({ ...ctx, reason: verdict.reason }); continue; }
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TokenFilter {
  token_symbol: string;
  chain: string;
  min_amount: number;
  enabled: boolean;
}

export interface FilterCheckInput {
  tokenSymbol: string;
  amount: number | string;
  senderAddress?: string | null;
  chain?: string;
}

export interface FilterVerdict {
  ok: boolean;
  reason?: string;
}

export interface FilterLogInput {
  tx_hash?: string | null;
  reason: string;
  token_symbol?: string | null;
  amount?: number | string | null;
  sender_address?: string | null;
  recipient_address?: string | null;
  chain?: string | null;
  source?: string | null;
}

interface Cache {
  filters: Map<string, TokenFilter>;
  blacklist: Set<string>;
  expiresAt: number;
}

const TTL_MS = 60_000;
let cache: Cache | null = null;

function keyOf(symbol: string, chain: string) {
  return `${symbol.toUpperCase()}::${chain.toLowerCase()}`;
}

async function loadCache(client: SupabaseClient): Promise<Cache> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  const [filtersRes, blackRes] = await Promise.all([
    client.from("token_ingest_filters").select("token_symbol, chain, min_amount, enabled"),
    client.from("blacklisted_wallets").select("wallet_address"),
  ]);

  const filters = new Map<string, TokenFilter>();
  for (const row of (filtersRes.data || []) as TokenFilter[]) {
    filters.set(keyOf(row.token_symbol, row.chain), {
      token_symbol: row.token_symbol.toUpperCase(),
      chain: row.chain.toLowerCase(),
      min_amount: Number(row.min_amount),
      enabled: !!row.enabled,
    });
  }

  const blacklist = new Set<string>();
  for (const row of (blackRes.data || []) as { wallet_address: string }[]) {
    if (row.wallet_address) blacklist.add(row.wallet_address.toLowerCase());
  }

  cache = { filters, blacklist, expiresAt: now + TTL_MS };
  return cache;
}

function resolveClient(client?: SupabaseClient): SupabaseClient {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key =
    Deno.env.get("SUPABASE_SECRET_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getExternalTxFilter(client?: SupabaseClient) {
  const c = resolveClient(client);
  const cached = await loadCache(c);

  function check(input: FilterCheckInput): FilterVerdict {
    const chain = (input.chain || "bsc").toLowerCase();
    const symbol = (input.tokenSymbol || "").toUpperCase();
    const sender = (input.senderAddress || "").toLowerCase();
    const amount = Number(input.amount);

    if (sender && cached.blacklist.has(sender)) {
      return { ok: false, reason: "sender_blacklisted" };
    }
    if (!symbol) return { ok: false, reason: "missing_symbol" };
    const f = cached.filters.get(keyOf(symbol, chain));
    if (!f) return { ok: false, reason: "unknown_token" };
    if (!f.enabled) return { ok: false, reason: "token_disabled" };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "invalid_amount" };
    if (amount < f.min_amount) return { ok: false, reason: "below_min_amount" };
    return { ok: true };
  }

  async function log(entry: FilterLogInput) {
    try {
      await c.from("external_tx_filter_log").insert({
        tx_hash: entry.tx_hash || null,
        reason: entry.reason,
        token_symbol: entry.token_symbol || null,
        amount: entry.amount != null ? Number(entry.amount) : null,
        sender_address: entry.sender_address?.toLowerCase() || null,
        recipient_address: entry.recipient_address?.toLowerCase() || null,
        chain: entry.chain || null,
        source: entry.source || null,
      });
    } catch (_) {
      // best-effort, không chặn scanner
    }
  }

  return { check, log, filters: cached.filters, blacklist: cached.blacklist };
}

/** Reset cache (test/tool). */
export function __resetExternalTxFilterCache() {
  cache = null;
}
