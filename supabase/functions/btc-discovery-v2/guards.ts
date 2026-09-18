// btc-discovery-v2 · guards
// Anti-RC10: KHÔNG học từ input side. Chỉ từ change-output candidates.
// Father/treasury → review only. Class A blacklist → reject.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { GuardSnapshot } from './types.ts';
import { btcNormalizeAddress, detectBtcAddressType } from '../_shared/btcAddress.ts';

export const MAX_TX_COUNT = 20;
export const MAX_FUNDED_BTC = 1.0;

interface MempoolAddressInfo {
  address: string;
  chain_stats: { tx_count: number; funded_txo_sum: number; spent_txo_sum: number };
  mempool_stats: { tx_count: number; funded_txo_sum: number; spent_txo_sum: number };
}

function detectAddressType(addr: string): string {
  return detectBtcAddressType(addr);
}

export async function fetchGuardSnapshot(address: string, sourceTx: string): Promise<GuardSnapshot> {
  const info = await fetch(`https://mempool.space/api/address/${address}`).then((r) => r.json()) as MempoolAddressInfo;
  const tx_count = info.chain_stats.tx_count + info.mempool_stats.tx_count;
  const funded_sat = info.chain_stats.funded_txo_sum + info.mempool_stats.funded_txo_sum;
  return {
    tx_count,
    funded_btc: funded_sat / 1e8,
    address_type: detectAddressType(address),
    first_seen_tx: sourceTx,
    last_seen_tx: sourceTx,
    first_seen_at: null,
    last_seen_at: new Date().toISOString(),
  };
}

export async function loadBlacklists(admin: SupabaseClient): Promise<{ classA: Set<string>; classB: Set<string> }> {
  const classA = new Set<string>();
  const classB = new Set<string>();
  try {
    const { data } = await admin.from('blacklisted_wallets').select('address, tier').eq('chain', 'bitcoin');
    for (const r of data ?? []) {
      const addr = btcNormalizeAddress(r.address);
      if (String(r.tier) === 'A' || String(r.tier) === 'a' || String(r.tier) === '1') classA.add(addr);
      else classB.add(addr);
    }
  } catch {
    // table might not have chain filter — silently ignore
  }
  return { classA, classB };
}

export async function isFatherOrTreasury(
  admin: SupabaseClient,
  userId: string,
): Promise<{ is_father: boolean; is_treasury: boolean }> {
  const { data } = await admin
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();
  const uname = (data?.username ?? '').toLowerCase();
  return {
    is_father: uname === 'angelfather',
    is_treasury: uname === 'funtreasury',
  };
}

export async function isAddressClaimed(admin: SupabaseClient, address: string): Promise<string | null> {
  const { data } = await admin
    .from('btc_ownership_snapshot')
    .select('user_id')
    .eq('address', address)
    .maybeSingle();
  return data?.user_id ?? null;
}
