import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Hash, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export type VaultKey =
  | 'identity_vault_hash'
  | 'trust_vault_hash'
  | 'reputation_vault_hash'
  | 'contribution_vault_hash'
  | 'credential_vault_hash'
  | 'governance_vault_hash'
  | 'economic_access_hash';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vaultKey: VaultKey | null;
  vaultLabel: string;
  hash?: string | null;
  didId?: string;
  snapshotAt?: string | null;
}

interface VaultItem {
  type: string;
  ref?: string;
  label: string;
  detail?: string;
  weight?: number;
  at?: string;
  status?: string;
}

async function fetchVaultItems(vaultKey: VaultKey, didId: string): Promise<VaultItem[]> {
  const sb = supabase as any;
  const items: VaultItem[] = [];

  if (vaultKey === 'identity_vault_hash') {
    const { data: did } = await sb.from('did_registry').select('*').eq('did_id', didId).maybeSingle();
    if (did) {
      items.push({
        type: 'did',
        ref: did.did_id,
        label: `DID ${did.did_level} • ${did.entity_type}`,
        detail: `status: ${did.status}`,
        at: did.created_at,
      });
    }
    const { data: links } = await sb.from('identity_links').select('*').eq('did_id', didId);
    (links || []).forEach((l: any) =>
      items.push({
        type: 'link',
        ref: l.id,
        label: `${l.link_type}: ${l.link_value.slice(0, 32)}${l.link_value.length > 32 ? '…' : ''}`,
        detail: `state: ${l.verification_state}`,
        at: l.linked_at,
        status: l.verification_state,
      })
    );
  }

  if (vaultKey === 'trust_vault_hash') {
    const { data: trust } = await sb.from('trust_profile').select('*').eq('did_id', didId).maybeSingle();
    if (trust) {
      items.push({
        type: 'trust_profile',
        label: `TC = ${Number(trust.tc).toFixed(3)} • Tier ${trust.trust_tier}`,
        detail: `VS:${Number(trust.verification_strength).toFixed(2)} BS:${Number(trust.behavior_stability).toFixed(2)} SS:${Number(trust.social_trust).toFixed(2)} OS:${Number(trust.onchain_credibility).toFixed(2)} HS:${Number(trust.historical_cleanliness).toFixed(2)} RF:${Number(trust.risk_factor).toFixed(2)}`,
        at: trust.updated_at,
      });
    }
    const { data: events } = await sb
      .from('identity_events')
      .select('*')
      .eq('did_id', didId)
      .order('created_at', { ascending: false })
      .limit(20);
    (events || []).forEach((e: any) =>
      items.push({
        type: 'event',
        ref: e.id,
        label: e.event_type,
        detail: `Δtc: ${Number(e.tc_delta || 0).toFixed(3)} • Δrisk: ${Number(e.risk_delta || 0).toFixed(3)}`,
        at: e.created_at,
        weight: Number(e.tc_delta || 0),
      })
    );
  }

  if (vaultKey === 'reputation_vault_hash' || vaultKey === 'credential_vault_hash') {
    const credentialCats = ['credential', 'verification'];
    const { data: sbts } = await sb.from('sbt_registry').select('*').eq('owner_did_id', didId);
    (sbts || [])
      .filter((s: any) =>
        vaultKey === 'credential_vault_hash'
          ? credentialCats.includes(s.category)
          : !credentialCats.includes(s.category)
      )
      .forEach((s: any) =>
        items.push({
          type: 'sbt',
          ref: s.sbt_id,
          label: `${s.category} • ${s.title || s.sbt_type}`,
          detail: s.description || `weight: ${s.weight ?? 1}`,
          at: s.issued_at,
          status: s.status,
          weight: Number(s.weight || 1),
        })
      );
  }

  if (vaultKey === 'contribution_vault_hash') {
    const { data: atts } = await sb
      .from('attestation_log')
      .select('*')
      .or(`from_did.eq.${didId},to_did.eq.${didId}`)
      .order('created_at', { ascending: false })
      .limit(30);
    (atts || []).forEach((a: any) =>
      items.push({
        type: 'attestation',
        ref: a.id,
        label: `${a.attestation_type} ${a.from_did === didId ? '→' : '←'} ${(a.from_did === didId ? a.to_did : a.from_did).slice(0, 24)}…`,
        detail: `weight: ${a.weight}`,
        at: a.created_at,
        status: a.status,
        weight: Number(a.weight || 0),
      })
    );
  }

  if (vaultKey === 'governance_vault_hash') {
    const { data: events } = await sb
      .from('identity_events')
      .select('*')
      .eq('did_id', didId)
      .ilike('event_type', '%governance%')
      .order('created_at', { ascending: false })
      .limit(20);
    (events || []).forEach((e: any) =>
      items.push({
        type: 'governance_event',
        ref: e.id,
        label: e.event_type,
        detail: e.source || '—',
        at: e.created_at,
      })
    );
    const { data: voteSbts } = await sb
      .from('sbt_registry')
      .select('*')
      .eq('owner_did_id', didId)
      .eq('category', 'governance');
    (voteSbts || []).forEach((s: any) =>
      items.push({
        type: 'governance_sbt',
        ref: s.sbt_id,
        label: s.title || s.sbt_type,
        detail: s.description,
        at: s.issued_at,
        status: s.status,
      })
    );
  }

  if (vaultKey === 'economic_access_hash') {
    const { data: did } = await sb.from('did_registry').select('owner_user_id').eq('did_id', didId).maybeSingle();
    if (did?.owner_user_id) {
      const { data: wallets } = await sb
        .from('custodial_wallets')
        .select('wallet_address, chain_id, is_active, created_at')
        .eq('user_id', did.owner_user_id);
      (wallets || []).forEach((w: any) =>
        items.push({
          type: 'custodial_wallet',
          ref: w.wallet_address,
          label: `Chain ${w.chain_id}`,
          detail: `${w.wallet_address.slice(0, 20)}…`,
          at: w.created_at,
          status: w.is_active ? 'active' : 'inactive',
        })
      );
    }
    const { data: ecoSbts } = await sb
      .from('sbt_registry')
      .select('*')
      .eq('owner_did_id', didId)
      .in('category', ['economic', 'access']);
    (ecoSbts || []).forEach((s: any) =>
      items.push({
        type: 'access_sbt',
        ref: s.sbt_id,
        label: s.title || s.sbt_type,
        detail: s.description,
        at: s.issued_at,
        status: s.status,
      })
    );
  }

  return items;
}

export function DIBVaultDetailDialog({ open, onOpenChange, vaultKey, vaultLabel, hash, didId, snapshotAt }: Props) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['dib-vault-items', vaultKey, didId],
    enabled: !!vaultKey && !!didId && open,
    queryFn: () => fetchVaultItems(vaultKey!, didId!),
    staleTime: 30_000,
  });

  const handleExport = () => {
    const payload = {
      vault: vaultKey,
      label: vaultLabel,
      did_id: didId,
      hash,
      snapshot_at: snapshotAt,
      exported_at: new Date().toISOString(),
      item_count: items.length,
      items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dib-${vaultKey}-${didId?.slice(-12)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-primary" />
            DIB Vault • {vaultLabel}
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <div className="font-mono text-[10px] break-all">
              hash: {hash || 'chưa snapshot'}
            </div>
            {snapshotAt && (
              <div className="flex items-center gap-1 text-[11px]">
                <Clock className="w-3 h-3" />
                snapshot: {format(new Date(snapshotAt), 'dd/MM/yyyy HH:mm')} UTC
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{items.length} mục dữ liệu nguồn</span>
          <button
            onClick={handleExport}
            disabled={items.length === 0}
            className="text-primary hover:underline disabled:opacity-40 disabled:no-underline"
          >
            ⬇ Export JSON
          </button>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              Vault này chưa có dữ liệu nguồn.
            </p>
          ) : (
            <div className="space-y-2 pb-4">
              {items.map((it, i) => (
                <div key={`${it.type}-${it.ref || i}`} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] capitalize">{it.type.replace(/_/g, ' ')}</Badge>
                        {it.status && (
                          <Badge variant="secondary" className="text-[10px] capitalize">{it.status}</Badge>
                        )}
                        {typeof it.weight === 'number' && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            w={it.weight.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-1 break-words">{it.label}</p>
                      {it.detail && (
                        <p className="text-xs text-muted-foreground break-words">{it.detail}</p>
                      )}
                    </div>
                    {it.at && (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(it.at), 'dd/MM HH:mm')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
