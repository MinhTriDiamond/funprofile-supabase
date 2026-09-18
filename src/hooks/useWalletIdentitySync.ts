/**
 * useWalletIdentitySync
 * Bảo đảm mọi ví đang gắn với account (custodial + external) được đăng ký
 * như identity_links (link_type='wallet', verification_state='verified').
 *
 * Chiến lược:
 * 1. Đọc profiles.external_wallet_address + custodial_wallets.wallet_address.
 * 2. Đọc identity_links hiện có.
 * 3. Mỗi ví thiếu → gọi edge `identity-link-manage` action='add'
 *    (edge tự auto-verify nếu khớp custodial).
 * 4. invalidate cache identity-links + DID-eligibility.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDID } from '@/hooks/useDID';

export function useWalletIdentitySync(enabled: boolean = true) {
  const { userId } = useCurrentUser();
  const { data: did } = useDID();
  const qc = useQueryClient();
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !userId || !did?.did_id) return;
    const key = `${userId}:${did.did_id}`;
    if (ranFor.current === key) return;
    ranFor.current = key;

    (async () => {
      try {
        const [{ data: profile }, { data: existing }] = await Promise.all([
          (supabase as any).from('profiles')
            .select('external_wallet_address, custodial_wallet_address')
            .eq('id', userId).maybeSingle(),
          (supabase as any).from('identity_links')
            .select('link_value').eq('did_id', did.did_id).eq('link_type', 'wallet'),
        ]);

        const existingSet = new Set(
          (existing ?? []).map((l: any) => String(l.link_value || '').toLowerCase())
        );

        const wanted: string[] = [];
        if (profile?.external_wallet_address) wanted.push(profile.external_wallet_address);
        if (profile?.custodial_wallet_address) wanted.push(profile.custodial_wallet_address);

        const missing = wanted
          .map((a) => a.toLowerCase())
          .filter((a) => a && !existingSet.has(a));

        if (missing.length === 0) return;

        for (const addr of missing) {
          try {
            await supabase.functions.invoke('identity-link-manage', {
              body: { action: 'add', link_type: 'wallet', link_value: addr },
            });
          } catch (e) {
            console.warn('[walletIdentitySync] add fail', addr, e);
          }
        }

        qc.invalidateQueries({ queryKey: ['identity-links', did.did_id] });
        qc.invalidateQueries({ queryKey: ['did-eligibility'] });
        qc.invalidateQueries({ queryKey: ['trust-profile'] });
      } catch (e) {
        console.warn('[walletIdentitySync] failed', e);
      }
    })();
  }, [enabled, userId, did?.did_id, qc]);
}
