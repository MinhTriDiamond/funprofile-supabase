import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Vault, Shield, Award, Heart, GraduationCap, Vote, Coins, ChevronRight } from 'lucide-react';
import { DIBVaultDetailDialog, type VaultKey } from './DIBVaultDetailDialog';

const VAULTS = [
  { key: 'identity_vault_hash', label: 'Identity', icon: Vault, color: 'text-emerald-500' },
  { key: 'trust_vault_hash', label: 'Trust', icon: Shield, color: 'text-sky-500' },
  { key: 'reputation_vault_hash', label: 'Reputation', icon: Award, color: 'text-violet-500' },
  { key: 'contribution_vault_hash', label: 'Contribution', icon: Heart, color: 'text-rose-500' },
  { key: 'credential_vault_hash', label: 'Credential', icon: GraduationCap, color: 'text-amber-500' },
  { key: 'governance_vault_hash', label: 'Governance', icon: Vote, color: 'text-indigo-500' },
  { key: 'economic_access_hash', label: 'Economic Access', icon: Coins, color: 'text-yellow-500' },
] as const;

export function DIBVaultPanel({ dib }: { dib: any }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<typeof VAULTS[number] | null>(null);

  const handleExportAll = () => {
    if (!dib) return;
    const payload = {
      did_id: dib.did_id,
      snapshot_epoch: dib.snapshot_epoch,
      last_snapshot_at: dib.last_snapshot_at,
      exported_at: new Date().toISOString(),
      vaults: VAULTS.reduce((acc, v) => {
        acc[v.label] = dib[v.key] || null;
        return acc;
      }, {} as Record<string, string | null>),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dib-profile-${dib.did_id?.slice(-12) || 'snapshot'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">Bấm vào mỗi vault để xem dữ liệu nguồn</p>
        {dib && (
          <button onClick={handleExportAll} className="text-xs text-primary hover:underline">
            ⬇ Export toàn bộ DIB
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {VAULTS.map((v) => {
          const Icon = v.icon;
          const hash = dib?.[v.key];
          return (
            <Card
              key={v.key}
              className="border-0 shadow-sm cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
              onClick={() => {
                setActive(v);
                setOpen(true);
              }}
            >
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${v.color}`} />
                    <span className="text-xs font-medium">{v.label}</span>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </div>
                <p className="text-[9px] font-mono text-muted-foreground truncate">
                  {hash ? `${hash.slice(0, 16)}…` : 'chưa snapshot'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <DIBVaultDetailDialog
        open={open}
        onOpenChange={setOpen}
        vaultKey={(active?.key as VaultKey) || null}
        vaultLabel={active?.label || ''}
        hash={active ? dib?.[active.key] : null}
        didId={dib?.did_id}
        snapshotAt={dib?.last_snapshot_at}
      />
    </div>
  );
}
