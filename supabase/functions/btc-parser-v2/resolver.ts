// btc-parser-v2 · resolver
// Load ownership from 3 stores into an immutable OwnershipMap.
// KHÔNG học aux trong runtime — discovery là job riêng (btc-discovery-v2).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { OwnershipMap, OwnershipEntry } from './types.ts';
import { btcNormalizeAddress } from '../_shared/btcAddress.ts';

/**
 * Load ownership for a specific set of addresses (batch).
 * Returns immutable Map<address_lowercase, OwnershipEntry>.
 */
export async function loadOwnershipMap(
  admin: SupabaseClient,
  addresses: string[],
): Promise<OwnershipMap> {
  const map = new Map<string, OwnershipEntry>();
  if (addresses.length === 0) return map;

  const lowered = [...new Set(addresses.map((a) => btcNormalizeAddress(a)).filter(Boolean))];
  if (lowered.length === 0) return map;

  // 1) custodial_wallets — BTC not stored in this table for FUN Profile (chain_id=56 only).
  //    Skip entirely to avoid schema mismatch. Custodial BTC support = future work.


  // 2) profiles.btc_address (primary)
  {
    const { data, error } = await admin
      .from('profiles')
      .select('id, btc_address, username')
      .in('btc_address', lowered);
    if (error) throw new Error(`profiles lookup: ${error.message}`);
    for (const r of data ?? []) {
      const addr = btcNormalizeAddress(r.btc_address);
      if (!map.has(addr)) {
        map.set(addr, {
          user_id: r.id,
          source: 'profile_primary',
          confidence: 1.0,
          integrity: 'ok',
          is_father: r.username === 'angelfather',
        });
      }
    }
  }

  // 3) btc_ownership_snapshot — verified aux
  {
    const { data, error } = await admin
      .from('btc_ownership_snapshot')
      .select('address, user_id, source, confidence, integrity_status')
      .in('address', lowered)
      .in('integrity_status', ['ok', 'needs_review']);
    if (error) throw new Error(`snapshot lookup: ${error.message}`);
    for (const r of data ?? []) {
      const addr = btcNormalizeAddress(r.address);
      if (!map.has(addr)) {
        const src = (r.source ?? '').toLowerCase();
        const confidence = Number(r.confidence ?? (src.includes('manual') ? 0.98 : 0.93));
        map.set(addr, {
          user_id: r.user_id,
          source: 'snapshot',
          confidence,
          integrity: (r.integrity_status ?? 'ok') as OwnershipEntry['integrity'],
        });
      }
    }
  }

  // 4) Treasury tag — best-effort via app_settings key btc_treasury_addresses (optional)
  try {
    const { data } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'btc_treasury_addresses')
      .maybeSingle();
    const list: string[] = Array.isArray(data?.value) ? data!.value.map((x: string) => btcNormalizeAddress(x)) : [];
    for (const addr of list) {
      const cur = map.get(addr);
      if (cur) map.set(addr, { ...cur, is_treasury: true });
    }
  } catch {
    // silently ignore — treasury tag is optional overlay
  }

  // 5) Unknown fill (do NOT store, resolver returns undefined for map.get miss)
  return map;
}

/**
 * Collect unique addresses used by a raw tx (both inputs and outputs).
 */
export function extractAddresses(rawTx: {
  vin: Array<{ prevout?: { scriptpubkey_address?: string } }>;
  vout: Array<{ scriptpubkey_address?: string }>;
}): string[] {
  const set = new Set<string>();
  for (const v of rawTx.vin) {
    const a = btcNormalizeAddress(v.prevout?.scriptpubkey_address);
    if (a) set.add(a);
  }
  for (const v of rawTx.vout) {
    const a = btcNormalizeAddress(v.scriptpubkey_address);
    if (a) set.add(a);
  }
  return [...set];
}
